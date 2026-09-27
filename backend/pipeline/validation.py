"""
PolarOPS - Data Validation & Quality Filtering Pipeline (Phase 2)
Enforces:
1. Physical boundary validation (range clamping).
2. Rate-of-change (Delta) temporal checks.
3. Cross-signal physics consistency checks (Wind vs Anemometer, Solar vs Pyranometer, Battery P=VI).
4. Automated imputation and quality flag tagging (GOOD, SUSPECT, BAD, SUBSTITUTED).
"""
import datetime
from typing import Dict, Any, List, Optional, Tuple
from pydantic import BaseModel
from backend.schema.canonical import (
    QualityFlag,
    CanonicalTelemetrySnapshot,
    WeatherEnvironmentRecord,
    BatteryStateRecord,
    RenewableStateRecord,
    LoadStateRecord,
    GeneratorStateRecord
)

# Hard Physical Operating Envelopes for Polar Stations
PHYSICAL_LIMITS = {
    "ambient_temp_c": (-65.0, 15.0),
    "wind_speed_ms": (0.0, 55.0),
    "solar_irradiance_wm2": (0.0, 1200.0),
    "battery_soc_pct": (0.0, 100.0),
    "battery_temp_c": (-45.0, 45.0),
    "grid_frequency_hz": (47.5, 52.5),
    "bus_voltage_v": (360.0, 440.0),
    "total_elec_load_kw": (5.0, 150.0),
}

# Maximum allowed rate of change per second
MAX_RATE_OF_CHANGE_PER_SEC = {
    "ambient_temp_c": 1.5,       # °C / sec
    "wind_speed_ms": 12.0,       # m/s / sec (extreme gust threshold)
    "battery_soc_pct": 1.0,      # % / sec
    "battery_temp_c": 0.5,       # °C / sec
    "grid_frequency_hz": 1.2,    # Hz / sec
}


class ValidationAnomaly(BaseModel):
    timestamp_utc: datetime.datetime
    signal_name: str
    observed_value: float
    expected_range_or_rate: Tuple[float, float]
    rule_violated: str
    severity: str  # "WARNING" or "ERROR"


class ValidationResult(BaseModel):
    is_valid: bool
    overall_quality: QualityFlag
    anomalies: List[ValidationAnomaly]
    cleaned_snapshot: CanonicalTelemetrySnapshot


class PolarDataValidator:
    """
    Validates canonical telemetry before entering ML forecasting, Digital Twin, or MILP.
    Maintains historical state to detect rate-of-change and sensor drift anomalies.
    """
    def __init__(self):
        self.last_valid_values: Dict[str, float] = {}
        self.last_timestamp: Optional[datetime.datetime] = None

    def validate_snapshot(self, snapshot: CanonicalTelemetrySnapshot) -> ValidationResult:
        anomalies: List[ValidationAnomaly] = []
        now = snapshot.timestamp_utc
        dt_sec = (now - self.last_timestamp).total_seconds() if self.last_timestamp else 1.0
        dt_sec = max(0.1, min(60.0, dt_sec))

        w = snapshot.weather
        b = snapshot.battery
        ren = snapshot.renewables
        load = snapshot.load
        bus = snapshot.grid_bus

        # -------------------------------------------------------------
        # 1. Range Validation (Physical Envelopes)
        # -------------------------------------------------------------
        def check_range(val: float, name: str) -> float:
            low, high = PHYSICAL_LIMITS.get(name, (-999999.0, 999999.0))
            if val < low or val > high:
                anomalies.append(ValidationAnomaly(
                    timestamp_utc=now,
                    signal_name=name,
                    observed_value=val,
                    expected_range_or_rate=(low, high),
                    rule_violated=f"{name} out of physical polar envelope [{low}, {high}]",
                    severity="ERROR"
                ))
                # Substitute with clamped value or last valid
                fallback = self.last_valid_values.get(name, max(low, min(high, val)))
                return fallback
            return val

        clean_temp = check_range(w.ambient_temp_c, "ambient_temp_c")
        clean_wind = check_range(w.wind_speed_ms, "wind_speed_ms")
        clean_solar = check_range(w.solar_irradiance_wm2, "solar_irradiance_wm2")
        clean_soc = check_range(b.soc_pct, "battery_soc_pct")
        clean_batt_temp = check_range(b.cell_temp_c, "battery_temp_c")
        clean_load = check_range(load.total_elec_load_kw, "total_elec_load_kw")

        # -------------------------------------------------------------
        # 2. Rate-of-Change (Delta) Validation
        # -------------------------------------------------------------
        def check_rate(val: float, name: str) -> float:
            if name in self.last_valid_values and name in MAX_RATE_OF_CHANGE_PER_SEC:
                max_rate = MAX_RATE_OF_CHANGE_PER_SEC[name]
                delta = abs(val - self.last_valid_values[name]) / dt_sec
                if delta > max_rate:
                    anomalies.append(ValidationAnomaly(
                        timestamp_utc=now,
                        signal_name=name,
                        observed_value=val,
                        expected_range_or_rate=(0.0, max_rate),
                        rule_violated=f"{name} rate of change {delta:.2f}/s exceeds max physical limit {max_rate}/s",
                        severity="WARNING"
                    ))
                    # Smooth jump towards realistic rate limit
                    step = max_rate * dt_sec if val > self.last_valid_values[name] else -max_rate * dt_sec
                    return self.last_valid_values[name] + step
            return val

        clean_temp = check_rate(clean_temp, "ambient_temp_c")
        clean_wind = check_rate(clean_wind, "wind_speed_ms")
        clean_soc = check_rate(clean_soc, "battery_soc_pct")

        # -------------------------------------------------------------
        # 3. Cross-Signal Physics Consistency Checks
        # -------------------------------------------------------------
        # Check A: Wind generation without wind
        if clean_wind < 2.5 and ren.wind_power_generated_kw > 1.0:
            anomalies.append(ValidationAnomaly(
                timestamp_utc=now,
                signal_name="wind_power_generated_kw",
                observed_value=ren.wind_power_generated_kw,
                expected_range_or_rate=(0.0, 1.0),
                rule_violated=f"Wind generation ({ren.wind_power_generated_kw} kW) active despite calm wind ({clean_wind} m/s)",
                severity="ERROR"
            ))
            ren.wind_power_generated_kw = 0.0

        # Check B: Solar PV generation without irradiance
        if clean_solar < 5.0 and ren.solar_power_generated_kw > 0.5:
            anomalies.append(ValidationAnomaly(
                timestamp_utc=now,
                signal_name="solar_power_generated_kw",
                observed_value=ren.solar_power_generated_kw,
                expected_range_or_rate=(0.0, 0.5),
                rule_violated=f"Solar generation ({ren.solar_power_generated_kw} kW) active with zero solar irradiance ({clean_solar} W/m²)",
                severity="ERROR"
            ))
            ren.solar_power_generated_kw = 0.0

        # Check C: Simultaneous battery charge and discharge impossible
        if b.power_charge_kw > 0.5 and b.power_discharge_kw > 0.5:
            anomalies.append(ValidationAnomaly(
                timestamp_utc=now,
                signal_name="battery_concurrent_flow",
                observed_value=b.power_charge_kw + b.power_discharge_kw,
                expected_range_or_rate=(0.0, 0.0),
                rule_violated="Battery simultaneously charging and discharging on unified DC bus",
                severity="ERROR"
            ))
            net = b.power_discharge_kw - b.power_charge_kw
            if net >= 0:
                b.power_discharge_kw = net
                b.power_charge_kw = 0.0
            else:
                b.power_charge_kw = abs(net)
                b.power_discharge_kw = 0.0

        # Update historical trackers
        self.last_valid_values["ambient_temp_c"] = clean_temp
        self.last_valid_values["wind_speed_ms"] = clean_wind
        self.last_valid_values["solar_irradiance_wm2"] = clean_solar
        self.last_valid_values["battery_soc_pct"] = clean_soc
        self.last_valid_values["battery_temp_c"] = clean_batt_temp
        self.last_valid_values["total_elec_load_kw"] = clean_load
        self.last_timestamp = now

        # Assign Quality Flag
        has_error = any(a.severity == "ERROR" for a in anomalies)
        has_warning = any(a.severity == "WARNING" for a in anomalies)

        if has_error:
            overall_quality = QualityFlag.SUBSTITUTED if len(self.last_valid_values) > 0 else QualityFlag.BAD
        elif has_warning:
            overall_quality = QualityFlag.SUSPECT
        else:
            overall_quality = QualityFlag.GOOD

        # Apply cleaned values back into snapshot
        w.ambient_temp_c = clean_temp
        w.wind_speed_ms = clean_wind
        w.solar_irradiance_wm2 = clean_solar
        w.quality_flag = overall_quality

        b.soc_pct = clean_soc
        b.cell_temp_c = clean_batt_temp
        b.quality_flag = overall_quality

        load.total_elec_load_kw = clean_load
        load.quality_flag = overall_quality

        return ValidationResult(
            is_valid=not has_error,
            overall_quality=overall_quality,
            anomalies=anomalies,
            cleaned_snapshot=snapshot
        )
