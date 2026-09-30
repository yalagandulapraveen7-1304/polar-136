import sys
import os
import datetime

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.schema.canonical import (
    OperatingMode,
    QualityFlag,
    AlarmSeverity,
    CanonicalTelemetrySnapshot,
    WeatherEnvironmentRecord,
    LoadStateRecord,
    GeneratorStateRecord,
    RenewableStateRecord,
    BatteryStateRecord,
    FuelStateRecord,
    MicrogridBusStateRecord
)
from backend.simulation.polar_synth import PolarPhysicsSimulator, STATION_PROFILES


def test_station_profiles_loaded():
    assert "BHARATI" in STATION_PROFILES
    assert "MAITRI" in STATION_PROFILES
    assert STATION_PROFILES["BHARATI"]["battery_capacity_kwh"] == 350.0
    assert STATION_PROFILES["MAITRI"]["battery_capacity_kwh"] in [300.0, 400.0]


def test_simulator_generates_valid_canonical_snapshot():
    sim = PolarPhysicsSimulator(station_id="BHARATI", mode=OperatingMode.SIMULATION)
    snapshot = sim.generate_snapshot()

    assert isinstance(snapshot, CanonicalTelemetrySnapshot)
    assert snapshot.station_id == "BHARATI"
    assert snapshot.mode == OperatingMode.SIMULATION
    assert snapshot.schema_version == "1.0.0"

    # Weather checks
    assert snapshot.weather.quality_flag == QualityFlag.GOOD
    assert snapshot.weather.wind_speed_ms >= 0.0
    assert snapshot.weather.ambient_temp_c <= 10.0

    # Load checks
    assert snapshot.load.total_elec_load_kw > 0.0
    assert snapshot.load.total_thermal_load_kw > 0.0
    # Priority circuit balance
    assert abs(snapshot.load.total_elec_load_kw - (
        snapshot.load.tier_1_life_support_kw +
        snapshot.load.tier_2_science_labs_kw +
        snapshot.load.tier_3_auxiliary_kw
    )) < 0.2

    # Battery checks
    assert 0.0 <= snapshot.battery.soc_pct <= 100.0
    assert 0.05 <= snapshot.battery.temp_derating_factor <= 1.0

    # Fuel checks
    assert snapshot.fuel.remaining_liters > 0.0
    assert 0.0 <= snapshot.fuel.reserve_pct <= 100.0

    # Generators checks
    assert "GEN-1" in snapshot.generators
    assert "GEN-2" in snapshot.generators


def test_solar_polar_night_vs_midnight_sun():
    sim = PolarPhysicsSimulator(station_id="BHARATI")

    # Antarctic Winter: July 15 (Day 196) at Bharati -> Polar Night (should be 0.0 W/m²)
    winter_date = datetime.datetime(2026, 7, 15, 12, 0, 0, tzinfo=datetime.timezone.utc)
    solar_winter = sim.calculate_solar_irradiance(winter_date)
    assert solar_winter == 0.0, f"Expected 0.0 W/m² during Antarctic polar night, got {solar_winter}"

    # Antarctic Summer: December 21 (Solstice) at Bharati -> Midnight Sun (positive irradiance)
    summer_noon = datetime.datetime(2026, 12, 21, 7, 0, 0, tzinfo=datetime.timezone.utc)
    solar_summer = sim.calculate_solar_irradiance(summer_noon)
    assert solar_summer > 100.0, f"Expected > 100 W/m² during summer solstice, got {solar_summer}"


def test_wind_gale_force_braking():
    sim = PolarPhysicsSimulator(station_id="BHARATI")

    # Inject storm wind velocity of 32 m/s (> 25 m/s cutout)
    sim.set_overrides({"wind_speed_ms": 32.0})
    snapshot = sim.generate_snapshot()

    assert snapshot.renewables.wind_status == "FEATHERED_BRAKED"
    assert snapshot.renewables.wind_power_generated_kw == 0.0
    assert any(a.alarm_code == "WARN_WIND_GALE_BRAKE" for a in snapshot.active_alarms)


def test_battery_subzero_derating_and_lockout():
    sim = PolarPhysicsSimulator(station_id="MAITRI")

    # Case 1: Moderate cold (-10°C) -> derating factor is 1.0
    sim.battery_temp_c = -10.0
    snapshot = sim.generate_snapshot()
    assert snapshot.battery.temp_derating_factor == 1.0
    assert not snapshot.battery.lockout_active

    # Case 2: Deep freeze lockout (-36°C) -> derating factor is 0.05, lockout active
    sim.battery_temp_c = -36.0
    snapshot = sim.generate_snapshot()
    assert snapshot.battery.temp_derating_factor == 0.05
    assert snapshot.battery.lockout_active


def test_genset_fault_injection_and_transfer():
    sim = PolarPhysicsSimulator(station_id="BHARATI")

    # Inject Gen-1 trip
    sim.set_overrides({"fault_genset_1": True})
    snapshot = sim.generate_snapshot()

    assert snapshot.generators["GEN-1"].has_fault is True
    assert snapshot.generators["GEN-1"].power_output_kw == 0.0
    assert any(a.alarm_code == "ERR_GENSET_1_TRIP" for a in snapshot.active_alarms)


def test_backward_compatibility_payload():
    sim = PolarPhysicsSimulator(station_id="BHARATI")
    snapshot = sim.generate_snapshot()
    legacy = snapshot.to_legacy_dict()

    assert "telemetry" in legacy
    assert "dispatch" in legacy
    assert "guardrail" in legacy
    assert "hardware_health" in legacy
    assert legacy["telemetry"]["station_id"] == "BHARATI"
    assert "load_elec_kw" in legacy["telemetry"]
    assert "battery_soc_pct" in legacy["telemetry"]


def test_data_ingestion_driver_canonical():
    from backend.data_ingestion import DataIngestionDriver
    driver = DataIngestionDriver(station_id="BHARATI", mode="DEMO_MODE")
    snap = driver.ingest_canonical()
    assert isinstance(snap, CanonicalTelemetrySnapshot)
    assert snap.station_id == "BHARATI"
    assert snap.weather.wind_speed_ms >= 0.0

    # Test SCADA mode switch
    driver.set_mode("SCADA_MODE")
    snap_scada = driver.ingest_canonical()
    assert snap_scada.mode == OperatingMode.LIVE


if __name__ == "__main__":
    print("Running Phase 1 Canonical Schema & Polar Simulator Unit Tests...")
    test_station_profiles_loaded()
    print("[PASS] test_station_profiles_loaded")
    test_simulator_generates_valid_canonical_snapshot()
    print("[PASS] test_simulator_generates_valid_canonical_snapshot")
    test_solar_polar_night_vs_midnight_sun()
    print("[PASS] test_solar_polar_night_vs_midnight_sun")
    test_wind_gale_force_braking()
    print("[PASS] test_wind_gale_force_braking")
    test_battery_subzero_derating_and_lockout()
    print("[PASS] test_battery_subzero_derating_and_lockout")
    test_genset_fault_injection_and_transfer()
    print("[PASS] test_genset_fault_injection_and_transfer")
    test_backward_compatibility_payload()
    print("[PASS] test_backward_compatibility_payload")
    test_data_ingestion_driver_canonical()
    print("[PASS] test_data_ingestion_driver_canonical")
    print("\n" + "="*60)
    print("ALL 8 PHASE 1 TESTS PASSED SUCCESSFULLY!")
    print("="*60)


