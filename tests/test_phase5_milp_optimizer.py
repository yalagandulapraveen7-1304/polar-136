import sys
import os
import datetime
import numpy as np

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.optimizer import PolarEnergyOptimizer
from backend.ai_models import PolarDemandForecaster
from backend.schema.canonical import OptimizationRecord


def test_milp_solver_initialization():
    """Verify PolarEnergyOptimizer initializes with HiGHS MILP solver."""
    opt = PolarEnergyOptimizer()
    assert "MILP" in opt.solver_name


def test_zero_emission_mode():
    """Verify MILP achieves 100% renewable penetration when wind and solar are abundant."""
    opt = PolarEnergyOptimizer()
    telemetry = {
        "station_id": "BHARATI",
        "station_load_kwe": 45.0,
        "thermal_load_kwth": 60.0,
        "battery_temp_c": 10.0,
        "battery_soc_pct": 80.0,
        "battery_reserve_pct": 20.0,
        "genset_1_fault": False
    }

    # High wind (60 kW) and high solar (30 kW) -> total 90 kW available for 45 kW load
    res = opt.optimize_dispatch(telemetry, wind_avail_kw=60.0, solar_avail_kw=30.0)

    assert res["solve_status"] == "OPTIMAL"
    assert res["p_diesel_1_kw"] == 0.0
    assert res["p_diesel_2_kw"] == 0.0
    assert res["fuel_rate_liters_per_hour"] == 0.0
    # Excess power should charge the battery
    assert res["p_battery_charge_kw"] > 0.0
    assert res["p_battery_discharge_kw"] == 0.0


def test_battery_mutual_exclusivity():
    """Verify that battery never charges and discharges simultaneously (u_dis + u_chg <= 1)."""
    opt = PolarEnergyOptimizer()
    telemetry = {
        "station_id": "MAITRI",
        "station_load_kwe": 55.0,
        "thermal_load_kwth": 70.0,
        "battery_temp_c": 5.0,
        "battery_soc_pct": 65.0,
        "battery_reserve_pct": 20.0,
        "genset_1_fault": False
    }

    # Test across various renewable availability levels
    for wind_kw in [0.0, 20.0, 55.0, 90.0]:
        res = opt.optimize_dispatch(telemetry, wind_avail_kw=wind_kw, solar_avail_kw=10.0)
        assert res["solve_status"] == "OPTIMAL"
        dis = res["p_battery_discharge_kw"]
        chg = res["p_battery_charge_kw"]
        # Exactly one or none can be active
        assert not (dis > 0.1 and chg > 0.1), f"Concurrent battery flow detected: dis={dis}, chg={chg}"


def test_semi_continuous_generator_limits():
    """Verify generator respects semi-continuous minimum load (>= 25% of rated) when committed on."""
    opt = PolarEnergyOptimizer()
    telemetry = {
        "station_id": "BHARATI",
        "station_load_kwe": 35.0,
        "thermal_load_kwth": 50.0,
        "battery_temp_c": -10.0,
        "battery_soc_pct": 20.0,  # Battery at reserve floor, cannot discharge
        "battery_reserve_pct": 20.0,
        "genset_1_fault": False
    }

    # No renewables -> Generator 1 must carry load
    res = opt.optimize_dispatch(telemetry, wind_avail_kw=0.0, solar_avail_kw=0.0)

    assert res["solve_status"] == "OPTIMAL"
    p_gen = res["p_diesel_1_kw"] + res["p_diesel_2_kw"]
    assert p_gen >= 30.0  # Combined active generator operating at or above minimum stable load


def test_genset_fault_transfer():
    """Verify MILP automatically transfers load to secondary Gen 2 when Gen 1 has a trip fault."""
    opt = PolarEnergyOptimizer()
    telemetry = {
        "station_id": "BHARATI",
        "station_load_kwe": 55.0,
        "thermal_load_kwth": 70.0,
        "battery_temp_c": -15.0,
        "battery_soc_pct": 20.0,
        "battery_reserve_pct": 20.0,
        "genset_1_fault": True  # Primary tripped!
    }

    res = opt.optimize_dispatch(telemetry, wind_avail_kw=0.0, solar_avail_kw=0.0)

    assert res["solve_status"] == "OPTIMAL"
    assert res["p_diesel_1_kw"] == 0.0
    assert res["p_diesel_2_kw"] >= 55.0


def test_battery_protected_reserve_floor():
    """Verify that battery cannot discharge when SoC is at or below the reserve floor."""
    opt = PolarEnergyOptimizer()
    telemetry = {
        "station_id": "MAITRI",
        "station_load_kwe": 50.0,
        "thermal_load_kwth": 65.0,
        "battery_temp_c": 5.0,
        "battery_soc_pct": 25.0,
        "battery_reserve_pct": 25.0,  # Equal to reserve floor
        "genset_1_fault": False
    }

    res = opt.optimize_dispatch(telemetry, wind_avail_kw=0.0, solar_avail_kw=0.0)
    assert res["p_battery_discharge_kw"] == 0.0


def test_rolling_horizon_optimization():
    """Verify multi-step rolling horizon planning tracks battery SoC trajectory."""
    opt = PolarEnergyOptimizer()
    forecaster = PolarDemandForecaster()

    telemetry = {
        "station_id": "BHARATI",
        "timestamp": datetime.datetime(2026, 2, 10, 8, 0, 0, tzinfo=datetime.timezone.utc).isoformat(),
        "ambient_temp_c": -18.0,
        "wind_speed_ms": 11.0,
        "solar_irradiance_wm2": 150.0,
        "battery_soc_pct": 70.0,
        "battery_reserve_pct": 25.0,
        "genset_1_fault": False
    }

    forecast = forecaster.predict_horizon(telemetry, "24 Hours")

    rolling_res = opt.optimize_rolling_horizon(telemetry, forecast, steps=8, risk_mode="P50")

    assert rolling_res["status"] == "OPTIMAL"
    assert len(rolling_res["steps"]) == 8
    assert len(rolling_res["projected_soc_trajectory"]) == 9  # initial + 8 steps
    # Verify SoC never drops below reserve floor (25%)
    for soc in rolling_res["projected_soc_trajectory"]:
        assert soc >= 24.9


def test_canonical_optimization_record():
    """Verify that OptimizationRecord in the dispatch response complies with the canonical schema."""
    opt = PolarEnergyOptimizer()
    telemetry = {
        "station_id": "BHARATI",
        "station_load_kwe": 45.0,
        "thermal_load_kwth": 60.0,
        "battery_temp_c": 8.0,
        "battery_soc_pct": 60.0,
        "battery_reserve_pct": 20.0,
        "genset_1_fault": False
    }

    res = opt.optimize_dispatch(telemetry, wind_avail_kw=25.0, solar_avail_kw=15.0)

    assert "optimization_record" in res
    rec_dict = res["optimization_record"]
    rec = OptimizationRecord(**rec_dict)

    assert rec.station_id in ["BHARATI", "MAITRI"]
    assert rec.solve_status == "OPTIMAL"
    assert rec.solve_time_ms > 0.0
    assert rec.p_diesel_1_kw >= 0.0


if __name__ == "__main__":
    tests = [
        test_milp_solver_initialization,
        test_zero_emission_mode,
        test_battery_mutual_exclusivity,
        test_semi_continuous_generator_limits,
        test_genset_fault_transfer,
        test_battery_protected_reserve_floor,
        test_rolling_horizon_optimization,
        test_canonical_optimization_record,
    ]
    passed = 0
    print(f"=== RUNNING PHASE 5 MILP OPTIMIZER TESTS ({len(tests)} total) ===")
    for t in tests:
        try:
            t()
            print(f"  [PASS] {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  [FAIL] {t.__name__}: {e}")
            import traceback
            traceback.print_exc()

    print(f"\nPhase 5 Test Results: {passed}/{len(tests)} passed.")
    if passed == len(tests):
        print("ALL PHASE 5 UNIT TESTS PASSED SUCCESSFULLY.")
    else:
        sys.exit(1)
