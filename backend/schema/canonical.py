"""
PolarOPS - Locked Canonical Data Architecture (V1)
Stable contract between data sources (Mode A: Simulation, Mode B: Live SCADA)
and downstream EMS services (Forecaster, Digital Twin, Optimizer, MPC, Safety).
Universal Principles:
- snake_case naming
- Strict UTC timestamps
- Explicit units in field names or metadata
- Mode-aware (SIMULATION / LIVE)
- Quality-aware (GOOD / SUSPECT / BAD / SUBSTITUTED / TEST)
- Asset-aware and protocol-agnostic
"""
import datetime
from enum import Enum
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field, ConfigDict


class OperatingMode(str, Enum):
    SIMULATION = "SIMULATION"  # Mode A: Digital Twin, Synthetic, Replay, Stress Test
    LIVE = "LIVE"              # Mode B: SCADA, PLC, RTU, Modbus, MQTT, IoT


class QualityFlag(str, Enum):
    GOOD = "GOOD"                    # Validated within physical range & physics plausibility
    SUSPECT = "SUSPECT"              # Rate-of-change or consistency anomaly detected
    BAD = "BAD"                      # Sensor failure, NaN, timeout, or out-of-physical-bounds
    SUBSTITUTED = "SUBSTITUTED"      # Missing value estimated or filled by Digital Twin
    TEST = "TEST"                    # Test/calibration injection signal


class AssetType(str, Enum):
    GENERATOR_DIESEL = "GENERATOR_DIESEL"
    WIND_TURBINE = "WIND_TURBINE"
    SOLAR_PV = "SOLAR_PV"
    BATTERY_STORAGE = "BATTERY_STORAGE"
    INVERTER_BUS = "INVERTER_BUS"
    THERMAL_CHP = "THERMAL_CHP"
    CRITICAL_LOAD = "CRITICAL_LOAD"


class PriorityTier(str, Enum):
    TIER_1_LIFE_SUPPORT = "TIER_1_LIFE_SUPPORT"  # Non-curtailable (HVAC, O2/water, medical)
    TIER_2_SCIENCE_LABS = "TIER_2_SCIENCE_LABS"  # Sheddable (LIDAR, drills, mass specs)
    TIER_3_AUXILIARY = "TIER_3_AUXILIARY"        # Curtailable (runway beacon, perimeter lights)


class AlarmSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
    EMERGENCY = "EMERGENCY"


class CommandSource(str, Enum):
    OPTIMIZER_MILP = "OPTIMIZER_MILP"
    CONTROLLER_MPC = "CONTROLLER_MPC"
    GUARDRAIL_DETERMINISTIC = "GUARDRAIL_DETERMINISTIC"
    COMMANDER_MANUAL = "COMMANDER_MANUAL"
    FAILSAFE_FALLBACK = "FAILSAFE_FALLBACK"


# -------------------------------------------------------------
# 1. Asset Master Record
# -------------------------------------------------------------
class AssetMasterRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    asset_id: str
    station_id: str
    asset_type: AssetType
    name: str
    rated_capacity_kw: float
    rated_storage_kwh: Optional[float] = None
    min_operating_limit_kw: float = 0.0
    max_operating_limit_kw: float = 0.0
    ramp_rate_kw_per_sec: Optional[float] = None
    min_runtime_minutes: Optional[float] = None
    min_downtime_minutes: Optional[float] = None
    commission_date_utc: Optional[datetime.datetime] = None


# -------------------------------------------------------------
# 2. Weather & Environment Record
# -------------------------------------------------------------
class WeatherEnvironmentRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    timestamp_utc: datetime.datetime
    station_id: str
    source_mode: OperatingMode = OperatingMode.SIMULATION
    quality_flag: QualityFlag = QualityFlag.GOOD

    ambient_temp_c: float = Field(..., description="Ambient air temperature in Celsius")
    wind_speed_ms: float = Field(..., description="Wind speed at hub height in m/s")
    wind_direction_deg: float = Field(default=0.0, description="Wind azimuth angle 0-360 degrees")
    wind_chill_c: float = Field(..., description="Calculated wind chill temperature in Celsius")
    solar_irradiance_wm2: float = Field(..., description="Global Horizontal Irradiance in W/m²")
    atmospheric_pressure_hpa: float = Field(default=985.0, description="Barometric surface pressure in hPa")
    relative_humidity_pct: float = Field(default=65.0, description="Relative humidity 0-100%")
    snow_accumulation_cm: float = Field(default=0.0, description="Fresh snow depth on panels in cm")
    icing_risk_index: float = Field(default=0.0, description="Atmospheric icing severity index 0.0 to 1.0")


# -------------------------------------------------------------
# 3. Electrical & Thermal Load State Record
# -------------------------------------------------------------
class LoadStateRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    timestamp_utc: datetime.datetime
    station_id: str
    source_mode: OperatingMode = OperatingMode.SIMULATION
    quality_flag: QualityFlag = QualityFlag.GOOD

    total_elec_load_kw: float = Field(..., description="Total active station electrical demand in kWe")
    total_thermal_load_kw: float = Field(..., description="Total station heating / CHP demand in kWth")

    # Circuit priority breakdown
    tier_1_life_support_kw: float = Field(..., description="Non-curtailable life support load in kW")
    tier_2_science_labs_kw: float = Field(..., description="Sheddable scientific mission load in kW")
    tier_3_auxiliary_kw: float = Field(..., description="Curtailable lighting and utility load in kW")


# -------------------------------------------------------------
# 4. Generator State Record
# -------------------------------------------------------------
class GeneratorStateRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    timestamp_utc: datetime.datetime
    station_id: str
    generator_id: str
    source_mode: OperatingMode = OperatingMode.SIMULATION
    quality_flag: QualityFlag = QualityFlag.GOOD

    power_output_kw: float = Field(..., description="Current active power generation in kW")
    is_running: bool = Field(..., description="True if generator is running and synchronized")
    runtime_seconds_continuous: float = Field(..., description="Continuous run duration in seconds")
    downtime_seconds_continuous: float = Field(default=0.0, description="Continuous off duration in seconds")
    fuel_burn_rate_lh: float = Field(..., description="Instantaneous diesel consumption in Liters/hour")
    coolant_temp_c: float = Field(default=82.0, description="Engine block coolant temperature in Celsius")
    oil_pressure_bar: float = Field(default=4.2, description="Lube oil pressure in bar")
    has_fault: bool = Field(default=False, description="True if trip / electrical fault is active")
    wet_stacking_risk: bool = Field(default=False, description="True if run below minimum 30% load")


# -------------------------------------------------------------
# 5. Renewable Generation State Record
# -------------------------------------------------------------
class RenewableStateRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    timestamp_utc: datetime.datetime
    station_id: str
    source_mode: OperatingMode = OperatingMode.SIMULATION
    quality_flag: QualityFlag = QualityFlag.GOOD

    wind_power_generated_kw: float = Field(..., description="Realized wind generation in kW")
    wind_power_potential_kw: float = Field(..., description="Theoretical maximum available wind power in kW")
    wind_curtailed_kw: float = Field(default=0.0, description="Wind power curtailed due to brake / grid limits")
    wind_status: str = Field(default="GENERATING", description="GENERATING, FEATHERED, or BRAKED")

    solar_power_generated_kw: float = Field(..., description="Realized solar bifacial generation in kW")
    solar_power_potential_kw: float = Field(..., description="Theoretical maximum available solar power in kW")
    solar_curtailed_kw: float = Field(default=0.0, description="Solar power curtailed in kW")


# -------------------------------------------------------------
# 6. Battery Energy Storage System (BESS) State Record
# -------------------------------------------------------------
class BatteryStateRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    timestamp_utc: datetime.datetime
    station_id: str
    battery_bank_id: str
    source_mode: OperatingMode = OperatingMode.SIMULATION
    quality_flag: QualityFlag = QualityFlag.GOOD

    soc_pct: float = Field(..., description="State of Charge in % (0-100)")
    soh_pct: float = Field(default=98.5, description="State of Health in % (0-100)")
    pack_voltage_v: float = Field(default=400.0, description="DC Bus Voltage in Volts")
    cell_temp_c: float = Field(..., description="Core LiFePO4 internal cell temperature in Celsius")
    temp_derating_factor: float = Field(default=1.0, description="Throughput derating multiplier 0.05 to 1.0")

    power_charge_kw: float = Field(default=0.0, description="Active charging rate into battery in kW")
    power_discharge_kw: float = Field(default=0.0, description="Active discharging rate from battery in kW")
    net_power_kw: float = Field(default=0.0, description="Net power: +discharge, -charge in kW")

    protected_reserve_floor_pct: float = Field(default=20.0, description="Non-dischargeable reserve floor in %")
    heating_jacket_active: bool = Field(default=True, description="True if LiFePO4 pre-heater is energized")
    lockout_active: bool = Field(default=False, description="True if discharge is locked out (freeze / low SoC)")


# -------------------------------------------------------------
# 7. Fuel Inventory & Autonomy State Record
# -------------------------------------------------------------
class FuelStateRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    timestamp_utc: datetime.datetime
    station_id: str
    source_mode: OperatingMode = OperatingMode.SIMULATION
    quality_flag: QualityFlag = QualityFlag.GOOD

    remaining_liters: float = Field(..., description="Current usable diesel fuel remaining in Liters")
    tank_capacity_liters: float = Field(..., description="Total fuel storage capacity in Liters")
    reserve_pct: float = Field(..., description="Remaining fuel as percentage of capacity (0-100%)")
    burn_rate_lh: float = Field(..., description="Aggregate fuel burn rate in Liters/hour")
    autonomy_days: float = Field(..., description="Projected operational autonomy in Days at current burn")
    minimum_critical_reserve_liters: float = Field(default=5000.0, description="Mandatory life-support reserve")


# -------------------------------------------------------------
# 8. Microgrid Bus & Grid Balance Record
# -------------------------------------------------------------
class MicrogridBusStateRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    timestamp_utc: datetime.datetime
    station_id: str
    source_mode: OperatingMode = OperatingMode.SIMULATION
    quality_flag: QualityFlag = QualityFlag.GOOD

    bus_voltage_v: float = Field(default=400.0, description="AC 3-phase line voltage in Volts")
    grid_frequency_hz: float = Field(default=50.0, description="AC grid frequency in Hz")
    total_generation_kw: float = Field(..., description="Total generation dispatched across all sources in kW")
    total_load_kw: float = Field(..., description="Total station electrical load in kW")
    power_imbalance_kw: float = Field(default=0.0, description="Generation minus Load balance in kW")
    is_balanced: bool = Field(default=True, description="True if bus meets tolerance within ±0.5 kW")
    spinning_reserve_kw: float = Field(..., description="Immediately available online reserve headroom in kW")


# -------------------------------------------------------------
# 9. Event, Alarm & Safety Interlock Record
# -------------------------------------------------------------
class EventAlarmRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    timestamp_utc: datetime.datetime
    station_id: str
    alarm_code: str
    title: str
    severity: AlarmSeverity
    reason: str
    intervened_by: CommandSource = CommandSource.GUARDRAIL_DETERMINISTIC
    acknowledged: bool = False


# -------------------------------------------------------------
# 10. Forecast Quantile Record (LightGBM Quantile Regression)
# -------------------------------------------------------------
class ForecastQuantileRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    issued_at_utc: datetime.datetime
    target_timestamp_utc: datetime.datetime
    horizon_minutes: int
    station_id: str
    variable_name: str  # e.g., "elec_load_kw", "thermal_load_kw", "wind_power_kw", "solar_power_kw"

    p10: float = Field(..., description="10th percentile forecast (conservative lower bound)")
    p50: float = Field(..., description="50th percentile forecast (median expected value)")
    p90: float = Field(..., description="90th percentile forecast (conservative upper bound)")
    confidence_score: float = Field(default=0.95, description="Model reliability index 0.0 to 1.0")


# -------------------------------------------------------------
# 11. Optimization Plan Record (MILP / OR-Tools)
# -------------------------------------------------------------
class OptimizationRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    timestamp_utc: datetime.datetime
    station_id: str
    solver_name: str = "Google OR-Tools MILP"
    solve_status: str = "OPTIMAL"
    solve_time_ms: float = 0.0

    p_diesel_1_kw: float = 0.0
    p_diesel_2_kw: float = 0.0
    p_wind_kw: float = 0.0
    p_solar_kw: float = 0.0
    p_battery_discharge_kw: float = 0.0
    p_battery_charge_kw: float = 0.0

    projected_fuel_liters: float = 0.0
    projected_fuel_saved_liters: float = 0.0
    objective_cost: float = 0.0
    explanation: str = ""


# -------------------------------------------------------------
# 12. Complete Unified Telemetry Snapshot (Canonical Contract)
# -------------------------------------------------------------
class CanonicalTelemetrySnapshot(BaseModel):
    """
    Unified canonical snapshot passed downstream to:
    Data Validation -> ML Predictor -> Digital Twin -> Constraints -> MILP -> MPC -> Safety -> UI.
    """
    model_config = ConfigDict(extra="allow")
    schema_version: str = "1.0.0"
    snapshot_id: str
    timestamp_utc: datetime.datetime
    station_id: str
    mode: OperatingMode

    weather: WeatherEnvironmentRecord
    load: LoadStateRecord
    generators: Dict[str, GeneratorStateRecord]
    renewables: RenewableStateRecord
    battery: BatteryStateRecord
    fuel: FuelStateRecord
    grid_bus: MicrogridBusStateRecord

    active_alarms: List[EventAlarmRecord] = Field(default_factory=list)
    recent_forecasts: List[ForecastQuantileRecord] = Field(default_factory=list)
    latest_optimization: Optional[OptimizationRecord] = None

    def to_legacy_dict(self) -> Dict[str, Any]:
        """
        Maintains 100% backward-compatibility with existing React UI & FastAPI payloads.
        """
        gen1 = self.generators.get("GEN-1")
        gen2 = self.generators.get("GEN-2")
        gen1_kw = gen1.power_output_kw if gen1 else 0.0
        gen2_kw = gen2.power_output_kw if gen2 else 0.0
        gen1_fault = gen1.has_fault if gen1 else False

        opt = self.latest_optimization
        p_d1 = opt.p_diesel_1_kw if opt else gen1_kw
        p_d2 = opt.p_diesel_2_kw if opt else gen2_kw
        p_wind = opt.p_wind_kw if opt else self.renewables.wind_power_generated_kw
        p_solar = opt.p_solar_kw if opt else self.renewables.solar_power_generated_kw
        p_dis = opt.p_battery_discharge_kw if opt else self.battery.power_discharge_kw
        p_chg = opt.p_battery_charge_kw if opt else self.battery.power_charge_kw

        return {
            "telemetry": {
                "station_id": self.station_id,
                "timestamp": self.timestamp_utc.isoformat(),
                "ambient_temp_c": self.weather.ambient_temp_c,
                "wind_chill_c": self.weather.wind_chill_c,
                "wind_speed_ms": self.weather.wind_speed_ms,
                "solar_irradiance_wm2": self.weather.solar_irradiance_wm2,
                "load_elec_kw": self.load.total_elec_load_kw,
                "load_thermal_kw": self.load.total_thermal_load_kw,
                "battery_soc_pct": self.battery.soc_pct,
                "battery_temp_c": self.battery.cell_temp_c,
                "battery_reserve_pct": self.battery.protected_reserve_floor_pct,
                "diesel_fuel_liters": self.fuel.remaining_liters,
                "fuel_burn_rate_lh": self.fuel.burn_rate_lh,
                "genset_1_fault": gen1_fault,
                "battery_heater_fault": not self.battery.heating_jacket_active,
                "mode": self.mode.value
            },
            "dispatch": {
                "p_diesel_1_kw": p_d1,
                "p_diesel_2_kw": p_d2,
                "p_wind_kw": p_wind,
                "p_solar_kw": p_solar,
                "p_battery_discharge_kw": p_dis,
                "p_battery_charge_kw": p_chg,
                "p_battery_kw": p_dis - p_chg,
                "battery_derating_factor": self.battery.temp_derating_factor
            },
            "guardrail": {
                "is_overridden": len(self.active_alarms) > 0,
                "interventions": [
                    {
                        "rule_id": a.alarm_code,
                        "title": a.title,
                        "severity": a.severity.value,
                        "reason": a.reason
                    }
                    for a in self.active_alarms
                ],
                "gen1_runtime_minutes": round(gen1.runtime_seconds_continuous / 60.0, 1) if gen1 else 0.0,
                "gen2_runtime_minutes": round(gen2.runtime_seconds_continuous / 60.0, 1) if gen2 else 0.0
            },
            "hardware_health": {
                "overall_score_pct": int(self.battery.soh_pct * 0.85),
                "degradation_rate_pct_h": -0.03,
                "eta_warning_hours": 724.3,
                "eta_critical_hours": 2150.0
            },
            "explanation": opt.explanation if opt else "Canonical EMS telemetry synchronized with polar physical constraints."
        }
