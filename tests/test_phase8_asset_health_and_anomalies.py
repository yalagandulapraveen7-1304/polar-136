import sys
import os
import numpy as np

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.health.asset_monitor import (
    GensetHealthModel,
    BatteryHealthModel,
    WindTurbineHealthModel,
    IsolationForestAnomalyDetector,
    AssetHealthSupervisor
)


def test_genset_health_wet_stacking_accumulation_and_burnoff():
    """Verify wet-stacking soot index increases under low load and burns off under high load."""
    model = GensetHealthModel("GEN-1", rated_kw=100.0)
    initial_soot = model.soot_deposit_index

    # Run at 15 kW (15% load) for 1 hour (3600 seconds) -> accumulates soot
    res_low = model.update(dt_seconds=3600.0, power_output_kw=15.0, fuel_burn_lh=5.0, has_fault=False)
    assert res_low["soot_deposit_index"] > initial_soot

    # Run at 85 kW (85% load) for 1 hour -> exhaust burns off soot
    res_high = model.update(dt_seconds=3600.0, power_output_kw=85.0, fuel_burn_lh=22.0, has_fault=False)
    assert res_high["soot_deposit_index"] < res_low["soot_deposit_index"]


def test_genset_fault_trip_health_zero():
    """Verify genset trip drops health to 0% and sets status to FAULT_TRIPPED."""
    model = GensetHealthModel("GEN-1", rated_kw=100.0)
    res = model.update(dt_seconds=10.0, power_output_kw=0.0, fuel_burn_lh=0.0, has_fault=True)

    assert res["health_pct"] == 0.0
    assert res["status"] == "FAULT_TRIPPED"


def test_battery_efc_and_soh_fade():
    """Verify Equivalent Full Cycles (EFC) and Coulombic aging accumulate from throughput."""
    bess = BatteryHealthModel(capacity_kwh=300.0, initial_soh_pct=98.0)
    initial_efc = bess.cumulative_throughput_kwh / (2.0 * bess.capacity_kwh)

    # 10 hours of 50 kW cycling (500 kWh throughput)
    res = bess.update(dt_seconds=36000.0, p_charge_kw=50.0, p_discharge_kw=0.0, cell_temp_c=10.0, heater_fault=False)

    assert res["equivalent_full_cycles"] > initial_efc
    assert res["soh_pct"] <= 98.0
    assert res["status"] == "NOMINAL"


def test_battery_freeze_discharge_event_penalty():
    """Verify that discharging sub-zero cells (< -20°C) triggers freeze damage penalty."""
    bess = BatteryHealthModel(capacity_kwh=300.0, initial_soh_pct=95.0)
    res = bess.update(dt_seconds=600.0, p_charge_kw=0.0, p_discharge_kw=35.0, cell_temp_c=-24.0, heater_fault=False)

    assert res["freeze_discharge_events"] > 0
    assert res["status"] == "SUBZERO_DERATED"


def test_wind_turbine_blade_icing_detection():
    """Verify blade icing detection when wind is high and temp is low but power output stalls."""
    wind = WindTurbineHealthModel(rated_kw=100.0)

    # Ambient -15°C, 15 m/s wind (rated expected ~100 kW), but only 10 kW produced -> Blade icing!
    for _ in range(30):
        res = wind.update(dt_seconds=60.0, wind_speed_ms=15.0, power_output_kw=10.0, ambient_temp_c=-15.0)

    assert res["icing_risk_score"] > 0.40
    assert res["status"] == "BLADE_ICING_RISK"


def test_isolation_forest_nominal_vs_extreme_anomaly():
    """Verify Isolation Forest accurately separates nominal operational telemetry from anomalies."""
    detector = IsolationForestAnomalyDetector()

    # Nominal Antarctic operational sample: -25°C, 12 m/s, 0 solar, 48 kW load, 25 kW gen, 23 kW wind, 75% SoC
    nominal_feats = np.array([-25.0, 12.0, 0.0, 48.0, 25.0, 23.0, 75.0])
    score_nom, status_nom = detector.score(nominal_feats)
    assert score_nom < 0.55
    assert status_nom in ["NOMINAL", "SUSPECT"]

    # Extreme physically impossible anomaly: +85°C in Antarctica, 500 kW load, 0 kW gen, -200% SoC
    anomalous_feats = np.array([85.0, 95.0, 2500.0, 500.0, 0.0, 0.0, -50.0])
    score_anom, status_anom = detector.score(anomalous_feats)
    assert score_anom > 0.60
    assert status_anom in ["ANOMALOUS_DRIFT", "SUSPECT"]


def test_asset_health_supervisor_backward_compatibility():
    """Verify AssetHealthSupervisor produces complete backward-compatible hardware_health dictionary."""
    supervisor = AssetHealthSupervisor("BHARATI")
    telemetry = {
        "ambient_temp_c": -22.0,
        "wind_speed_ms": 11.5,
        "solar_irradiance_wm2": 50.0,
        "battery_temp_c": 5.0,
        "battery_soc_pct": 72.0,
        "genset_1_fault": False,
        "genset_2_fault": False,
        "battery_heater_fault": False,
        "station_load_kwe": 48.0
    }
    safe_dispatch = {
        "p_diesel_1_kw": 30.0,
        "p_diesel_2_kw": 0.0,
        "p_wind_kw": 18.0,
        "p_solar_kw": 2.0,
        "p_battery_discharge_kw": 0.0,
        "p_battery_charge_kw": 2.0,
        "fuel_rate_liters_per_hour": 7.8,
        "battery_derating_factor": 1.0
    }

    res = supervisor.evaluate(dt_seconds=1.0, telemetry=telemetry, safe_dispatch=safe_dispatch)
    hh = res["hardware_health"]

    # Mandatory React UI keys
    assert "genset_1_health_pct" in hh
    assert "genset_1_status" in hh
    assert "genset_2_health_pct" in hh
    assert "genset_2_status" in hh
    assert "wind_turbine_health_pct" in hh
    assert "wind_turbine_status" in hh
    assert "bess_thermal_health_pct" in hh
    assert "bess_status" in hh
    assert "multivariate_anomaly_score" in hh


if __name__ == "__main__":
    tests = [
        test_genset_health_wet_stacking_accumulation_and_burnoff,
        test_genset_fault_trip_health_zero,
        test_battery_efc_and_soh_fade,
        test_battery_freeze_discharge_event_penalty,
        test_wind_turbine_blade_icing_detection,
        test_isolation_forest_nominal_vs_extreme_anomaly,
        test_asset_health_supervisor_backward_compatibility,
    ]
    passed = 0
    print(f"=== RUNNING PHASE 8 ASSET HEALTH & ANOMALY TESTS ({len(tests)} total) ===")
    for t in tests:
        try:
            t()
            print(f"  [PASS] {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  [FAIL] {t.__name__}: {e}")
            import traceback
            traceback.print_exc()

    print(f"\nPhase 8 Test Results: {passed}/{len(tests)} passed.")
    if passed == len(tests):
        print("ALL PHASE 8 UNIT TESTS PASSED SUCCESSFULLY.")
    else:
        sys.exit(1)
