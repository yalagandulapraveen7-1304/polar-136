import sys
import os
import datetime

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.policy.constraint_engine import PolarPolicyEngine, ConstraintTier
from backend.guardrail import SafetyGuardrailEngine
from backend.schema.canonical import AlarmSeverity


def test_hard_constraint_bess_freeze_lockout():
    """Verify BESS sub-zero freeze lockout blocks discharge and raises CRITICAL alarm."""
    engine = SafetyGuardrailEngine()
    telemetry = {
        "station_id": "BHARATI",
        "station_load_kwe": 45.0,
        "thermal_load_kwth": 60.0,
        "battery_temp_c": -36.5,  # <= -35°C freeze lockout threshold
        "battery_soc_pct": 70.0,
        "wind_speed_ms": 10.0
    }
    dispatch = {
        "p_diesel_1_kw": 15.0,
        "p_diesel_2_kw": 0.0,
        "p_wind_kw": 10.0,
        "p_solar_kw": 0.0,
        "p_battery_discharge_kw": 20.0,  # Violates freeze lockout!
        "p_battery_charge_kw": 0.0,
        "q_aux_thermal_kwth": 10.0
    }

    res = engine.enforce_safety(telemetry, dispatch)
    assert res["is_overridden"] is True
    assert res["safe_dispatch"]["p_battery_discharge_kw"] == 0.0
    assert any("FREEZE" in inv["rule_id"] for inv in res["interventions"])
    assert any(a["severity"] == AlarmSeverity.CRITICAL for a in res["alarms"])


def test_hard_constraint_bess_reserve_floor():
    """Verify BESS reserve floor blocks discharge when SoC <= reserve limit."""
    engine = SafetyGuardrailEngine()
    telemetry = {
        "station_id": "BHARATI",
        "station_load_kwe": 45.0,
        "thermal_load_kwth": 60.0,
        "battery_temp_c": 5.0,
        "battery_soc_pct": 20.0,
        "battery_reserve_pct": 20.0,
        "wind_speed_ms": 10.0
    }
    dispatch = {
        "p_diesel_1_kw": 20.0,
        "p_diesel_2_kw": 0.0,
        "p_wind_kw": 10.0,
        "p_solar_kw": 0.0,
        "p_battery_discharge_kw": 15.0,  # Violates reserve floor!
        "p_battery_charge_kw": 0.0,
        "q_aux_thermal_kwth": 10.0
    }

    res = engine.enforce_safety(telemetry, dispatch)
    assert res["is_overridden"] is True
    assert res["safe_dispatch"]["p_battery_discharge_kw"] == 0.0
    assert any("RESERVE" in inv["rule_id"] for inv in res["interventions"])


def test_hard_constraint_wind_gale_brake():
    """Verify wind speed > 25 m/s triggers turbine aerodynamic cut-out feathering."""
    engine = SafetyGuardrailEngine()
    telemetry = {
        "station_id": "MAITRI",
        "station_load_kwe": 50.0,
        "thermal_load_kwth": 65.0,
        "battery_temp_c": 0.0,
        "battery_soc_pct": 50.0,
        "wind_speed_ms": 28.5  # Katabatic gale storm!
    }
    dispatch = {
        "p_diesel_1_kw": 20.0,
        "p_diesel_2_kw": 0.0,
        "p_wind_kw": 30.0,  # Unsafe to generate in 28.5 m/s gale
        "p_solar_kw": 0.0,
        "p_battery_discharge_kw": 0.0,
        "p_battery_charge_kw": 0.0,
        "q_aux_thermal_kwth": 10.0
    }

    res = engine.enforce_safety(telemetry, dispatch)
    assert res["safe_dispatch"]["p_wind_kw"] == 0.0
    assert any("GALE" in inv["rule_id"] for inv in res["interventions"])


def test_hard_constraint_min_diesel_runtime():
    """Verify generator shutdown is blocked before 60-minute minimum runtime."""
    engine = SafetyGuardrailEngine()
    engine.policy_engine.gen1_run_seconds = 1200.0  # Only 20 minutes running!

    telemetry = {
        "station_id": "BHARATI",
        "station_load_kwe": 40.0,
        "thermal_load_kwth": 50.0,
        "battery_temp_c": 5.0,
        "battery_soc_pct": 80.0,
        "wind_speed_ms": 15.0,
        "genset_1_fault": False
    }
    dispatch = {
        "p_diesel_1_kw": 0.0,  # Optimizer tries to prematurely shut down Gen 1
        "p_diesel_2_kw": 0.0,
        "p_wind_kw": 30.0,
        "p_solar_kw": 10.0,
        "p_battery_discharge_kw": 0.0,
        "p_battery_charge_kw": 0.0,
        "q_aux_thermal_kwth": 10.0
    }

    res = engine.enforce_safety(telemetry, dispatch)
    assert res["is_overridden"] is True
    # Must be clamped to minimum loading (25 kW)
    assert res["safe_dispatch"]["p_diesel_1_kw"] >= 25.0
    assert any("RUNTIME" in inv["rule_id"] for inv in res["interventions"])


def test_hard_constraint_battery_exclusivity():
    """Verify concurrent battery charge and discharge is resolved to net flow."""
    engine = SafetyGuardrailEngine()
    telemetry = {
        "station_id": "BHARATI",
        "station_load_kwe": 45.0,
        "thermal_load_kwth": 55.0,
        "battery_temp_c": 10.0,
        "battery_soc_pct": 50.0,
        "wind_speed_ms": 10.0
    }
    dispatch = {
        "p_diesel_1_kw": 30.0,
        "p_diesel_2_kw": 0.0,
        "p_wind_kw": 15.0,
        "p_solar_kw": 0.0,
        "p_battery_discharge_kw": 10.0,
        "p_battery_charge_kw": 25.0,  # Contradiction on DC bus
        "q_aux_thermal_kwth": 0.0
    }

    res = engine.enforce_safety(telemetry, dispatch)
    safe = res["safe_dispatch"]
    # Net should be 15 kW charge, 0 kW discharge
    assert safe["p_battery_discharge_kw"] == 0.0
    assert safe["p_battery_charge_kw"] == 15.0


def test_blackout_defense_spinning_reserve():
    """Verify automatic spin-up of Standby Gen 2 during power deficit."""
    engine = SafetyGuardrailEngine()
    telemetry = {
        "station_id": "BHARATI",
        "station_load_kwe": 110.0,  # High station load
        "thermal_load_kwth": 90.0,
        "battery_temp_c": 5.0,
        "battery_soc_pct": 20.0,  # Battery empty
        "battery_reserve_pct": 20.0,
        "wind_speed_ms": 0.0,
        "genset_1_fault": False,
        "genset_2_fault": False
    }
    dispatch = {
        "p_diesel_1_kw": 70.0,  # Only 70 kW provided against 110 kW load
        "p_diesel_2_kw": 0.0,
        "p_wind_kw": 0.0,
        "p_solar_kw": 0.0,
        "p_battery_discharge_kw": 0.0,
        "p_battery_charge_kw": 0.0,
        "q_aux_thermal_kwth": 10.0
    }

    res = engine.enforce_safety(telemetry, dispatch)
    # Gen 1 should be boosted and Gen 2 spun up to cover the 110 kW demand
    total_gen = res["safe_dispatch"]["p_diesel_1_kw"] + res["safe_dispatch"]["p_diesel_2_kw"]
    assert total_gen >= 109.5


def test_hierarchical_load_shedding_tier3_and_tier2():
    """Verify hierarchical load shedding: Tier 3 first, Tier 2 second, Tier 1 NEVER shed."""
    engine = SafetyGuardrailEngine()
    # Station load 200 kW (extreme emergency, both gensets capped at 100 kW each)
    telemetry = {
        "station_id": "MAITRI",
        "station_load_kwe": 220.0,
        "thermal_load_kwth": 120.0,
        "battery_temp_c": 5.0,
        "battery_soc_pct": 20.0,
        "battery_reserve_pct": 20.0,
        "wind_speed_ms": 0.0,
        "genset_1_fault": False,
        "genset_2_fault": False
    }
    dispatch = {
        "p_diesel_1_kw": 100.0,
        "p_diesel_2_kw": 100.0,
        "p_wind_kw": 0.0,
        "p_solar_kw": 0.0,
        "p_battery_discharge_kw": 0.0,
        "p_battery_charge_kw": 0.0,
        "q_aux_thermal_kwth": 10.0
    }

    res = engine.enforce_safety(telemetry, dispatch)
    assert res["load_shedding_active"] is True
    assert res["tier_3_shed_kw"] > 0.0
    # Tier 1 (Life support) must NEVER be shed (0.0 kW)
    assert res["tier_1_shed_kw"] == 0.0


def test_thermal_life_support_protection():
    """Verify auxiliary thermal boiler is boosted when CHP waste heat is insufficient."""
    engine = SafetyGuardrailEngine()
    telemetry = {
        "station_id": "BHARATI",
        "station_load_kwe": 40.0,
        "thermal_load_kwth": 85.0,  # Cold blizzard requires 85 kWth
        "battery_temp_c": 5.0,
        "battery_soc_pct": 60.0,
        "wind_speed_ms": 10.0
    }
    dispatch = {
        "p_diesel_1_kw": 25.0,  # 25 kW * 1.20 = 30 kWth CHP
        "p_diesel_2_kw": 0.0,
        "p_wind_kw": 15.0,
        "p_solar_kw": 0.0,
        "p_battery_discharge_kw": 0.0,
        "p_battery_charge_kw": 0.0,
        "q_aux_thermal_kwth": 10.0  # Total 40 kWth < 85 kWth required
    }

    res = engine.enforce_safety(telemetry, dispatch)
    # Aux thermal must be boosted to cover the remaining 45 kWth
    total_thermal = res["safe_dispatch"]["q_chp_thermal_kwth"] + res["safe_dispatch"]["q_aux_thermal_kwth"]
    assert total_thermal >= 85.0


if __name__ == "__main__":
    tests = [
        test_hard_constraint_bess_freeze_lockout,
        test_hard_constraint_bess_reserve_floor,
        test_hard_constraint_wind_gale_brake,
        test_hard_constraint_min_diesel_runtime,
        test_hard_constraint_battery_exclusivity,
        test_blackout_defense_spinning_reserve,
        test_hierarchical_load_shedding_tier3_and_tier2,
        test_thermal_life_support_protection,
    ]
    passed = 0
    print(f"=== RUNNING PHASE 6 & 7 CONSTRAINTS & GUARDRAIL TESTS ({len(tests)} total) ===")
    for t in tests:
        try:
            t()
            print(f"  [PASS] {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  [FAIL] {t.__name__}: {e}")
            import traceback
            traceback.print_exc()

    print(f"\nPhase 6 & 7 Test Results: {passed}/{len(tests)} passed.")
    if passed == len(tests):
        print("ALL PHASE 6 & 7 UNIT TESTS PASSED SUCCESSFULLY.")
    else:
        sys.exit(1)
