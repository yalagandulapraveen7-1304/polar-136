"""
Fast Core Invariants and Physics Verification Harness for PolarEMS / NOVARA PolarOPS.
Designed for rapid (<3s) validation during Hackathon / SIH judging sessions.

Verifies:
1. Wind Aerodynamic Cut-Out (>25 m/s and <3 m/s)
2. Diesel Anti-Wet-Stacking Floor (>=35% rated) and Rated Capacity Ceiling
3. Battery Thermal Inverter Derating at Sub-Zero Temperatures (< -30 C)
4. Power Balance Conservation & Unserved Load Accounting
5. Generator Trip & Infeasible Deficit Visibility (unmet load > 0 when oversubscribed)
6. Fuel & CO2 Mass Balance Conservation (2.68 kg CO2 / L diesel)
7. All 7 Scenario Presets Reproducibility
8. Evaluation Engine Horizons (24h, 7d, 21d) Mathematical Consistency
"""

import sys
import os
import unittest

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from backend.scenarios.scenario_engine import ScenarioEngine, PRESET_DEFINITIONS, PARAM_BOUNDS
from backend.microgrid.microgrid_manager import MicrogridManager


class TestPolarEMSInvariants(unittest.TestCase):
    """Core physics and accounting invariant verification suite."""

    def setUp(self):
        self.engine = ScenarioEngine(station_id="MAITRI")
        self.mgr = MicrogridManager(station_id="MAITRI")

    def _eval_overrides(self, overrides: dict) -> dict:
        self.engine.reset_scenario()
        self.engine.apply_scenario(overrides)
        return self.engine.compute_comparative_analysis(nominal_telemetry={})

    def test_01_wind_aerodynamic_cutout(self):
        """Wind turbine output must drop to 0.0 kW when wind > 25 m/s or < 3 m/s."""
        # Baseline check at normal wind (12 m/s)
        res_normal = self._eval_overrides({"wind_speed_ms": 12.0})
        ren_normal = res_normal["scenario_realized"]["ren_kw"]
        self.assertGreater(ren_normal, 0.0, "Wind output should be positive at 12 m/s")

        # High wind storm cut-out (> 25 m/s)
        res_high = self._eval_overrides({"wind_speed_ms": 28.5, "solar_irradiance_wm2": 0.0})
        self.assertEqual(
            res_high["scenario_realized"]["ren_kw"],
            0.0,
            "Wind output must be 0 kW when wind speed exceeds 25 m/s cut-out limit"
        )

        # Low wind calm cut-in (< 3 m/s)
        res_low = self._eval_overrides({"wind_speed_ms": 1.5, "solar_irradiance_wm2": 0.0})
        self.assertEqual(
            res_low["scenario_realized"]["ren_kw"],
            0.0,
            "Wind output must be 0 kW when wind speed is below 3 m/s cut-in limit"
        )

    def test_02_diesel_minimum_loading_floor(self):
        """When running, diesel generator must not operate below 35% to prevent wet stacking."""
        # Load = ~170 kW, Inverter = 150 kW -> needed_from_diesel = ~20 kW (< 56 kW)
        overrides = {
            "load_multiplier": 0.85,
            "wind_speed_ms": 0.0,
            "solar_irradiance_wm2": 0.0,
            "fault_genset_2": True  # Only G1 (160 kW) available -> 35% of 160 kW = 56.0 kW
        }
        res = self._eval_overrides(overrides)
        diesel_kw = res["scenario_realized"]["diesel_gen_kw"]
        g1_min_floor = 160.0 * 0.35
        self.assertGreater(diesel_kw, 0.0, "Diesel should be dispatched when deficit exceeds BESS capacity")
        self.assertGreaterEqual(
            diesel_kw,
            g1_min_floor,
            f"Diesel output ({diesel_kw} kW) must respect 35% minimum loading floor ({g1_min_floor} kW)"
        )

    def test_03_battery_thermal_derating(self):
        """Sub-zero frost (< -30 C) or heater failure must derate inverter capacity by 35%."""
        res_cold = self._eval_overrides({
            "ambient_temp_c": -38.0,
            "load_multiplier": 1.5,
            "wind_speed_ms": 0.0,
            "solar_irradiance_wm2": 0.0
        })
        bess_discharge = res_cold["scenario_realized"]["bess_discharge_kw"]
        # Maitri inverter rating is 150 kW; derated 65% is 97.5 kW
        inverter_rating = 150.0
        expected_derated_max = inverter_rating * 0.65
        self.assertLessEqual(
            bess_discharge,
            expected_derated_max + 0.1,
            f"BESS discharge ({bess_discharge} kW) must not exceed derated ceiling ({expected_derated_max} kW)"
        )

    def test_04_power_balance_and_deficit_conservation(self):
        """Generation + Deficit must cover total electrical demand within tolerance."""
        res = self._eval_overrides({
            "load_multiplier": 1.2,
            "wind_speed_ms": 14.0,
            "solar_irradiance_wm2": 150.0
        })
        scen = res["scenario_realized"]
        total_supply = (
            scen["ren_kw"] +
            scen["diesel_gen_kw"] +
            scen["bess_discharge_kw"] +
            scen["unmet_load_kw"]
        )
        total_demand = scen["load_kw"]
        self.assertGreaterEqual(
            total_supply,
            total_demand - 0.5,
            f"Total supply ({total_supply} kW) must meet total demand ({total_demand} kW)"
        )

    def test_05_generator_trip_unserved_load_visibility(self):
        """When both generators trip and renewables cannot cover demand, unmet load must be explicitly reported."""
        res_trip = self._eval_overrides({
            "load_multiplier": 1.5,
            "wind_speed_ms": 0.0,
            "solar_irradiance_wm2": 0.0,
            "fault_genset_1": True,
            "fault_genset_2": True
        })
        scen = res_trip["scenario_realized"]
        self.assertEqual(scen["diesel_gen_kw"], 0.0, "Tripped generators must produce 0.0 kW")
        self.assertGreater(
            scen["unmet_load_kw"],
            0.0,
            "Unmet load must be strictly positive when generation capacity is insufficient"
        )

    def test_06_fuel_and_co2_mass_balance(self):
        """CO2 emissions must exactly match the 2.68 kg CO2 / L diesel stoichiometric factor."""
        res = self.engine.evaluate_baseline_vs_polarops(horizon="24h")
        metrics = res["metrics"]
        diesel_metrics = metrics["diesel_fuel"]
        co2_metrics = metrics["co2_emissions"]

        base_liters = diesel_metrics["baseline"]
        base_co2 = co2_metrics["baseline"]
        expected_base_co2 = round(base_liters * 2.68, 1)
        self.assertAlmostEqual(
            base_co2,
            expected_base_co2,
            delta=0.5,
            msg=f"Baseline CO2 ({base_co2}) must equal fuel ({base_liters} L) * 2.68 kg/L"
        )

        polar_liters = diesel_metrics["polarops"]
        polar_co2 = co2_metrics["polarops"]
        expected_polar_co2 = round(polar_liters * 2.68, 1)
        self.assertAlmostEqual(
            polar_co2,
            expected_polar_co2,
            delta=0.5,
            msg=f"PolarOPS CO2 ({polar_co2}) must equal fuel ({polar_liters} L) * 2.68 kg/L"
        )

    def test_07_all_presets_reproducibility(self):
        """All predefined scenario presets must evaluate successfully without exceptions."""
        for preset_id in PRESET_DEFINITIONS:
            result = self.engine.load_preset(preset_id)
            self.assertTrue(result.get("success", False), f"Preset {preset_id} should return success=True")
            comp = self.engine.compute_comparative_analysis(nominal_telemetry={})
            self.assertIn("metrics_table", comp)
            self.assertGreaterEqual(len(comp["metrics_table"]), 6)
            self.assertIn("scenario_realized", comp)

    def test_08_evaluation_horizons_consistency(self):
        """24h, 7d, and 21d horizons must compute non-negative, monotonically growing totals."""
        horizons = ["24h", "7d", "21d"]
        fuel_totals = []
        for h in horizons:
            res = self.engine.evaluate_baseline_vs_polarops(horizon=h)
            self.assertEqual(res["status"], "SUCCESS")
            base_fuel = res["metrics"]["diesel_fuel"]["baseline"]
            polar_fuel = res["metrics"]["diesel_fuel"]["polarops"]
            self.assertGreater(base_fuel, 0.0)
            self.assertGreater(polar_fuel, 0.0)
            self.assertGreater(base_fuel, polar_fuel, f"PolarOPS must save fuel over {h}")
            fuel_totals.append(polar_fuel)

        # Longer horizons must consume more fuel than shorter horizons
        self.assertLess(fuel_totals[0], fuel_totals[1], "7d fuel must exceed 24h fuel")
        self.assertLess(fuel_totals[1], fuel_totals[2], "21d fuel must exceed 7d fuel")


def run_checks():
    suite = unittest.TestLoader().loadTestsFromTestCase(TestPolarEMSInvariants)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    if result.wasSuccessful():
        print("\n=======================================================")
        print("ALL 8 CORE POLAREMS INVARIANT CHECKS PASSED [VERIFIED]")
        print("=======================================================")
        sys.exit(0)
    else:
        print("\n[!] CORE INVARIANT CHECKS FAILED")
        sys.exit(1)


if __name__ == "__main__":
    run_checks()
