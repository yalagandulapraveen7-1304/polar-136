import sys
import os
import datetime
import numpy as np

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.digital_twin.components import (
    GeneratorPhysicsModel,
    BatteryElectroThermalModel,
    HabitatThermalModel
)
from backend.digital_twin.twin_engine import PolarDigitalTwinEngine


def test_generator_physics_sfoc_curve():
    """Verify non-linear SFOC curve: higher at low load (<30%) and optimal around 70-80%."""
    gen = GeneratorPhysicsModel(rated_kw=100.0)

    # Low load: 15 kW (15% load ratio)
    burn_low, chp_low, _, _ = gen.step(p_kw=15.0, dt_sec=3600.0, ambient_c=-20.0)
    sfoc_low = burn_low / 15.0

    # Optimal load: 75 kW (75% load ratio)
    burn_opt, chp_opt, _, _ = gen.step(p_kw=75.0, dt_sec=3600.0, ambient_c=-20.0)
    sfoc_opt = burn_opt / 75.0

    assert sfoc_low > sfoc_opt, f"Low load SFOC ({sfoc_low}) should be higher than optimal ({sfoc_opt})"
    assert sfoc_opt < 0.28, f"Optimal SFOC ({sfoc_opt}) should be under 0.28 L/kWh"
    assert chp_opt == round(75.0 * 1.20, 2)


def test_generator_wet_stacking_accumulation_and_burnoff():
    """Verify wet stacking soot accumulation at <30% load and burn-off at high load."""
    gen = GeneratorPhysicsModel(rated_kw=100.0)

    # Run at 20 kW for 60 seconds -> accumulates wet stacking
    _, _, _, wet_sec = gen.step(p_kw=20.0, dt_sec=60.0, ambient_c=-20.0)
    assert wet_sec == 60.0

    # Run at 85 kW for 30 seconds -> burns off at 2.0x rate (reduces by 60s)
    _, _, _, wet_sec_after = gen.step(p_kw=85.0, dt_sec=30.0, ambient_c=-20.0)
    assert wet_sec_after == 0.0


def test_battery_electrothermal_arrhenius_impedance():
    """Verify Arrhenius temperature dependency: resistance increases dramatically in deep sub-zero conditions."""
    bess = BatteryElectroThermalModel()

    r_warm = bess.compute_internal_resistance(25.0)
    r_cold = bess.compute_internal_resistance(0.0)
    r_subzero = bess.compute_internal_resistance(-25.0)

    assert r_warm < r_cold < r_subzero
    # Resistance at -25°C should be at least double that of room temperature
    assert r_subzero >= 2.0 * r_warm


def test_battery_freeze_lockout():
    """Verify freeze lockout is triggered below -35°C, inhibiting discharge."""
    bess = BatteryElectroThermalModel(initial_temp_c=-38.0)
    res = bess.step(net_power_kw=50.0, dt_sec=10.0, ambient_c=-40.0, heater_active=False)

    assert res["battery_is_locked_out"] is True
    # Actual discharge power must be zeroed to protect frozen cells
    assert res["actual_power_kw"] == 0.0


def test_battery_joule_and_jacket_heating():
    """Verify internal Joule heating during discharge and active jacket heating."""
    bess = BatteryElectroThermalModel(initial_temp_c=2.0)
    res = bess.step(net_power_kw=60.0, dt_sec=10.0, ambient_c=-20.0, heater_active=True)

    assert res["battery_joule_heat_w"] > 0.0
    assert res["battery_cell_temp_c"] >= 2.0  # Cell warms from Joule + heater


def test_habitat_thermal_ua_and_katabatic_loss():
    """Verify building envelope heat loss increases with Delta T and katabatic wind."""
    habitat = HabitatThermalModel(ua_kw_per_c=2.0, target_temp_c=18.0)

    # Calm wind (2 m/s) at -10°C (Delta T = 28°C)
    t_in, loss_calm, _ = habitat.step(chp_heat_kw=0.0, aux_heat_kw=0.0, ambient_c=-10.0, wind_ms=2.0, dt_sec=60.0)

    # High gale wind (30 m/s) at -10°C (same Delta T, higher infiltration)
    habitat_gale = HabitatThermalModel(ua_kw_per_c=2.0, target_temp_c=18.0)
    _, loss_gale, _ = habitat_gale.step(chp_heat_kw=0.0, aux_heat_kw=0.0, ambient_c=-10.0, wind_ms=30.0, dt_sec=60.0)

    assert loss_gale > loss_calm


def test_hybrid_residual_correction_adaptation():
    """Verify ML residual learning loop fits residuals and enforces physical envelope clipping."""
    twin = PolarDigitalTwinEngine(station_id="BHARATI")

    # Record 150 synthetic operational residuals
    for _ in range(150):
        feats = np.random.randn(6)
        residuals = {
            "fuel_burn_lh": 0.35,
            "battery_cell_temp_c": 0.45,
            "indoor_temp_c": -0.20
        }
        twin.record_ground_truth_for_learning(feats, residuals)

    # Run step and verify hybrid state
    state = twin.step(
        dt_sec=10.0,
        p_gen1_kw=50.0,
        p_gen2_kw=0.0,
        p_batt_net_kw=10.0,
        ambient_temp_c=-25.0,
        wind_speed_ms=15.0,
        solar_wm2=100.0
    )

    assert state["hybrid_fuel_burn_lh"] >= 0.0
    assert abs(state["hybrid_fuel_burn_lh"] - state["physics_fuel_burn_lh"]) <= 5.0
    assert state["indoor_temp_c"] > -10.0


def test_twin_engine_step_execution():
    """Verify end-to-end multi-step simulation of the microgrid digital twin."""
    twin = PolarDigitalTwinEngine(station_id="BHARATI")

    # 10 steps of 1-second simulation
    for i in range(10):
        state = twin.step(
            dt_sec=1.0,
            p_gen1_kw=45.0,
            p_gen2_kw=0.0,
            p_batt_net_kw=-15.0,  # Charging
            ambient_temp_c=-22.0,
            wind_speed_ms=12.0,
            solar_wm2=50.0
        )

    assert state["station_id"] == "BHARATI"
    assert state["gen1_output_kw"] == 45.0
    assert state["battery_soc_pct"] > 0.0
    assert state["battery_internal_r_ohm"] > 0.0


if __name__ == "__main__":
    tests = [
        test_generator_physics_sfoc_curve,
        test_generator_wet_stacking_accumulation_and_burnoff,
        test_battery_electrothermal_arrhenius_impedance,
        test_battery_freeze_lockout,
        test_battery_joule_and_jacket_heating,
        test_habitat_thermal_ua_and_katabatic_loss,
        test_hybrid_residual_correction_adaptation,
        test_twin_engine_step_execution,
    ]
    passed = 0
    print(f"=== RUNNING PHASE 4 DIGITAL TWIN & RESIDUAL TESTS ({len(tests)} total) ===")
    for t in tests:
        try:
            t()
            print(f"  [PASS] {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  [FAIL] {t.__name__}: {e}")
            import traceback
            traceback.print_exc()

    print(f"\nPhase 4 Test Results: {passed}/{len(tests)} passed.")
    if passed == len(tests):
        print("ALL PHASE 4 UNIT TESTS PASSED SUCCESSFULLY.")
    else:
        sys.exit(1)
