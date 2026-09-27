import sys
import os
import datetime

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.schema.canonical import (
    OperatingMode,
    QualityFlag,
    CanonicalTelemetrySnapshot
)
from backend.simulation.polar_synth import PolarPhysicsSimulator
from backend.pipeline.validation import PolarDataValidator, PHYSICAL_LIMITS, MAX_RATE_OF_CHANGE_PER_SEC
from backend.pipeline.features import PolarFeatureEngineer, AIR_GAS_CONSTANT


def test_normal_snapshot_validation_passes():
    """Verify that a standard physics simulator snapshot passes validation with GOOD quality."""
    sim = PolarPhysicsSimulator(station_id="BHARATI")
    validator = PolarDataValidator()

    snap = sim.generate_snapshot()
    res = validator.validate_snapshot(snap)

    assert res.is_valid is True
    assert res.overall_quality == QualityFlag.GOOD
    assert len(res.anomalies) == 0
    assert res.cleaned_snapshot.weather.quality_flag == QualityFlag.GOOD


def test_physical_boundary_clamping():
    """Verify that out-of-envelope values are detected, recorded as anomalies, and clamped/substituted."""
    sim = PolarPhysicsSimulator(station_id="BHARATI")
    validator = PolarDataValidator()

    # Step 1: Prime validator with a normal snapshot
    snap1 = sim.generate_snapshot()
    res1 = validator.validate_snapshot(snap1)
    assert res1.is_valid is True

    # Step 2: Inject physically impossible values (e.g. ambient temp -120°C, solar 5000 W/m2)
    snap2 = sim.generate_snapshot()
    snap2.weather.ambient_temp_c = -120.0  # Below polar limit (-65.0)
    snap2.weather.solar_irradiance_wm2 = 5000.0  # Far above solar envelope (1200.0)
    snap2.battery.soc_pct = 140.0  # Over 100%

    res2 = validator.validate_snapshot(snap2)

    assert res2.is_valid is False
    assert res2.overall_quality in (QualityFlag.SUBSTITUTED, QualityFlag.BAD)
    assert len(res2.anomalies) >= 3

    # Verify substitution with previous valid values
    assert -65.0 <= res2.cleaned_snapshot.weather.ambient_temp_c <= 15.0
    assert 0.0 <= res2.cleaned_snapshot.battery.soc_pct <= 100.0
    assert 0.0 <= res2.cleaned_snapshot.weather.solar_irradiance_wm2 <= 1200.0


def test_rate_of_change_delta_clamping():
    """Verify that sudden non-physical jumps in temperature or SoC trigger rate-of-change warnings."""
    sim = PolarPhysicsSimulator(station_id="BHARATI")
    validator = PolarDataValidator()

    t0 = datetime.datetime.now(datetime.timezone.utc)
    snap1 = sim.generate_snapshot(dt_utc=t0)
    validator.validate_snapshot(snap1)

    # 1 second later, temperature spikes by 20°C (impossible rate of change)
    t1 = t0 + datetime.timedelta(seconds=1)
    snap2 = sim.generate_snapshot(dt_utc=t1)
    snap2.weather.ambient_temp_c = snap1.weather.ambient_temp_c + 20.0

    res2 = validator.validate_snapshot(snap2)
    # Check rate of change anomaly was caught
    roc_anomalies = [a for a in res2.anomalies if "rate of change" in a.rule_violated]
    assert len(roc_anomalies) > 0
    # Cleaned value should be clamped according to max rate
    max_rate = MAX_RATE_OF_CHANGE_PER_SEC["ambient_temp_c"]
    assert abs(res2.cleaned_snapshot.weather.ambient_temp_c - snap1.weather.ambient_temp_c) <= (max_rate * 1.0 + 0.1)


def test_cross_signal_physics_wind():
    """Verify that wind power generation with calm wind (< 2.5 m/s) is detected and zeroed out."""
    sim = PolarPhysicsSimulator(station_id="BHARATI")
    validator = PolarDataValidator()

    snap = sim.generate_snapshot()
    snap.weather.wind_speed_ms = 0.5  # Calm
    snap.renewables.wind_power_generated_kw = 25.0  # Contradiction: 25kW produced with no wind

    res = validator.validate_snapshot(snap)
    assert res.is_valid is False
    contradiction = [a for a in res.anomalies if "Wind generation" in a.rule_violated]
    assert len(contradiction) == 1
    # Check that wind power was zeroed out to preserve grid model stability
    assert res.cleaned_snapshot.renewables.wind_power_generated_kw == 0.0


def test_cross_signal_physics_solar():
    """Verify that solar power generation at zero irradiance is detected and zeroed out."""
    sim = PolarPhysicsSimulator(station_id="BHARATI")
    validator = PolarDataValidator()

    snap = sim.generate_snapshot()
    snap.weather.solar_irradiance_wm2 = 0.0  # Polar night / darkness
    snap.renewables.solar_power_generated_kw = 15.0  # Contradiction

    res = validator.validate_snapshot(snap)
    assert res.is_valid is False
    solar_contradiction = [a for a in res.anomalies if "Solar generation" in a.rule_violated]
    assert len(solar_contradiction) == 1
    assert res.cleaned_snapshot.renewables.solar_power_generated_kw == 0.0


def test_cross_signal_concurrent_battery_flow():
    """Verify that concurrent charging and discharging is resolved to net DC flow."""
    sim = PolarPhysicsSimulator(station_id="BHARATI")
    validator = PolarDataValidator()

    snap = sim.generate_snapshot()
    snap.battery.power_charge_kw = 10.0
    snap.battery.power_discharge_kw = 25.0  # Net should be 15 kW discharge, 0 charge

    res = validator.validate_snapshot(snap)
    assert res.is_valid is False
    battery_anomalies = [a for a in res.anomalies if "Battery simultaneously" in a.rule_violated]
    assert len(battery_anomalies) == 1
    assert res.cleaned_snapshot.battery.power_discharge_kw == 15.0
    assert res.cleaned_snapshot.battery.power_charge_kw == 0.0


def test_feature_engineering_astronomical_and_weather():
    """Verify cyclic temporal, air density, wind power density, and thermal features."""
    fe = PolarFeatureEngineer(station_id="BHARATI")
    sim = PolarPhysicsSimulator(station_id="BHARATI")

    now = datetime.datetime(2026, 6, 21, 12, 0, 0, tzinfo=datetime.timezone.utc)
    snap = sim.generate_snapshot(dt_utc=now)

    feats = fe.extract_features(snap)

    # Astronomical features
    assert -1.0 <= feats["feat_hour_sin"] <= 1.0
    assert -1.0 <= feats["feat_hour_cos"] <= 1.0
    assert -1.0 <= feats["feat_seasonal_sin"] <= 1.0
    assert -1.0 <= feats["feat_seasonal_cos"] <= 1.0

    # Dynamic polar air density (sub-zero air is denser than standard 1.225 kg/m3)
    assert feats["feat_air_density_kg_m3"] > 1.25

    # Kinetic wind power density: 0.5 * rho * V^3
    v = snap.weather.wind_speed_ms
    expected_wpd = 0.5 * feats["feat_air_density_kg_m3"] * (v ** 3)
    # Account for slight air_density decimal rounding when v^3 is large
    assert abs(feats["feat_wind_power_density_w_m2"] - expected_wpd) < 2.0

    # Thermal gradient
    assert feats["feat_delta_t_heating"] == round(max(0.0, 18.0 - snap.weather.ambient_temp_c), 2)


def test_feature_engineering_rolling_buffer():
    """Verify rolling history buffer calculations for rolling mean and trend velocity."""
    fe = PolarFeatureEngineer(station_id="BHARATI")
    sim = PolarPhysicsSimulator(station_id="BHARATI")

    base_time = datetime.datetime(2026, 1, 15, 8, 0, 0, tzinfo=datetime.timezone.utc)

    # Push 10 sequential snapshots, 1 minute apart, with cooling ambient temperature
    for i in range(10):
        t = base_time + datetime.timedelta(minutes=i)
        snap = sim.generate_snapshot(dt_utc=t)
        snap.weather.ambient_temp_c = -20.0 - (i * 0.5)  # Cooling by 0.5 deg C per min
        feats = fe.extract_features(snap)

    assert len(fe.history) == 10
    # Rolling mean should reflect the moving window
    assert feats["feat_temp_rolling_mean"] < -20.0
    # Cooling velocity should be negative
    assert feats["feat_temp_gradient_per_hour"] < 0.0


if __name__ == "__main__":
    tests = [
        test_normal_snapshot_validation_passes,
        test_physical_boundary_clamping,
        test_rate_of_change_delta_clamping,
        test_cross_signal_physics_wind,
        test_cross_signal_physics_solar,
        test_cross_signal_concurrent_battery_flow,
        test_feature_engineering_astronomical_and_weather,
        test_feature_engineering_rolling_buffer,
    ]
    passed = 0
    print(f"=== RUNNING PHASE 2 VALIDATION & FEATURE ENGINEERING TESTS ({len(tests)} total) ===")
    for t in tests:
        try:
            t()
            print(f"  [PASS] {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  [FAIL] {t.__name__}: {e}")
            import traceback
            traceback.print_exc()

    print(f"\nPhase 2 Test Results: {passed}/{len(tests)} passed.")
    if passed == len(tests):
        print("ALL PHASE 2 UNIT TESTS PASSED SUCCESSFULLY.")
    else:
        sys.exit(1)
