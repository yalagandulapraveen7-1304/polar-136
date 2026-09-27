"""
PolarOPS - Physics-Faithful Polar Synthetic Data Generator
Digital Twin simulation engine for Antarctic Research Stations (Maitri & Bharati).
Implements:
1. Astronomical solar positioning (24h summer sunlight <-> 24h winter polar night).
2. Katabatic wind speed dynamics with gusts and gale-force braking limits.
3. Habitat thermodynamic building envelope heat loss (UA * Delta T).
4. Sub-zero LiFePO4 electro-thermal impedance & derating physics.
5. Non-linear diesel SFOC fuel burn curves with wet-stacking penalties.
6. Unified output conforming strictly to the Locked V1 Canonical Schema.
"""
import math
import random
import datetime
from typing import Dict, Any, Optional
from backend.schema.canonical import (
    OperatingMode,
    QualityFlag,
    AssetType,
    PriorityTier,
    AlarmSeverity,
    WeatherEnvironmentRecord,
    LoadStateRecord,
    GeneratorStateRecord,
    RenewableStateRecord,
    BatteryStateRecord,
    FuelStateRecord,
    MicrogridBusStateRecord,
    EventAlarmRecord,
    CanonicalTelemetrySnapshot,
)

STATION_PROFILES = {
    "BHARATI": {
        "name": "Bharati Research Station",
        "latitude_deg": -69.407,
        "longitude_deg": 76.194,
        "elevation_m": 35.0,
        "base_load_elec_kw": 110.0,
        "base_thermal_kw": 85.0,
        "building_ua_kw_per_c": 1.25,
        "wind_capacity_kw": 120.0,
        "solar_capacity_kw": 90.0,
        "battery_capacity_kwh": 350.0,
        "fuel_capacity_liters": 60000.0,
        "generator_1_kw": 120.0,
        "generator_2_kw": 120.0,
    },
    "MAITRI": {
        "name": "Maitri Research Station",
        "latitude_deg": -70.766,
        "longitude_deg": 11.733,
        "elevation_m": 117.0,
        "base_load_elec_kw": 179.0,
        "base_thermal_kw": 120.0,
        "building_ua_kw_per_c": 1.45,
        "wind_capacity_kw": 100.0,
        "solar_capacity_kw": 60.0,
        "battery_capacity_kwh": 400.0,
        "fuel_capacity_liters": 60000.0,
        "generator_1_kw": 300.0,
        "generator_2_kw": 200.0,
    }
}


class PolarPhysicsSimulator:
    """
    Continuous physical state simulator for polar microgrids.
    Produces strictly validated CanonicalTelemetrySnapshot instances.
    """
    def __init__(self, station_id: str = "BHARATI", mode: OperatingMode = OperatingMode.SIMULATION):
        self.station_id = station_id if station_id in STATION_PROFILES else "BHARATI"
        self.mode = mode
        self.profile = STATION_PROFILES[self.station_id]

        # Internal state tracking
        self.battery_soc_pct = 76.5
        self.battery_soh_pct = 98.5
        self.battery_temp_c = -8.6
        self.battery_heater_active = True
        self.fuel_remaining_liters = self.profile["fuel_capacity_liters"] * 0.75

        # Generator continuous runtime tracking
        self.gen1_active = True
        self.gen1_runtime_sec = 2100.0
        self.gen1_fault = False
        self.gen2_active = False
        self.gen2_runtime_sec = 0.0
        self.gen2_fault = False

        # Injected Commander Overrides
        self.override_temp_c: Optional[float] = None
        self.override_wind_ms: Optional[float] = None
        self.override_solar_wm2: Optional[float] = None
        self.override_load_mult: float = 1.0
        self.override_battery_soc: Optional[float] = None
        self.override_reserve_pct: float = 20.0

    def set_station(self, station_id: str):
        if station_id in STATION_PROFILES:
            self.station_id = station_id
            self.profile = STATION_PROFILES[station_id]

    def set_overrides(self, overrides: Dict[str, Any]):
        if "ambient_temp_c" in overrides:
            self.override_temp_c = overrides["ambient_temp_c"]
        if "wind_speed_ms" in overrides:
            self.override_wind_ms = overrides["wind_speed_ms"]
        if "solar_irradiance_wm2" in overrides:
            self.override_solar_wm2 = overrides["solar_irradiance_wm2"]
        if "load_multiplier" in overrides and overrides["load_multiplier"] is not None:
            self.override_load_mult = float(overrides["load_multiplier"])
        if "battery_soc_pct" in overrides:
            self.override_battery_soc = overrides["battery_soc_pct"]
            if self.override_battery_soc is not None:
                self.battery_soc_pct = float(self.override_battery_soc)
        if "battery_reserve_pct" in overrides and overrides["battery_reserve_pct"] is not None:
            self.override_reserve_pct = float(overrides["battery_reserve_pct"])
        if "fault_genset_1" in overrides:
            self.gen1_fault = bool(overrides["fault_genset_1"])
        if "fault_battery_heater" in overrides:
            self.battery_heater_active = not bool(overrides["fault_battery_heater"])

    def reset_overrides(self):
        self.override_temp_c = None
        self.override_wind_ms = None
        self.override_solar_wm2 = None
        self.override_load_mult = 1.0
        self.override_battery_soc = None
        self.override_reserve_pct = 20.0
        self.gen1_fault = False
        self.battery_heater_active = True

    # -------------------------------------------------------------
    # 1. Solar Astronomy Physics
    # -------------------------------------------------------------
    def calculate_solar_irradiance(self, dt_utc: datetime.datetime) -> float:
        """
        Computes Global Horizontal Irradiance (GHI) based on solar elevation angle.
        Supports 24h polar night (May-Aug) and continuous midnight sun (Nov-Jan).
        """
        if self.override_solar_wm2 is not None:
            return max(0.0, float(self.override_solar_wm2))

        day_of_year = dt_utc.timetuple().tm_yday
        hour = dt_utc.hour + dt_utc.minute / 60.0 + dt_utc.second / 3600.0

        # Solar declination angle in radians
        declination = 23.45 * math.sin(math.radians((360.0 / 365.0) * (284 + day_of_year)))
        dec_rad = math.radians(declination)

        # Latitude in radians
        lat_rad = math.radians(self.profile["latitude_deg"])

        # Local solar time approximation (UTC + lon/15)
        local_hour = (hour + (self.profile["longitude_deg"] / 15.0)) % 24.0
        hour_angle_rad = math.radians((local_hour - 12.0) * 15.0)

        # Solar zenith angle / elevation angle
        sin_elevation = (math.sin(lat_rad) * math.sin(dec_rad) +
                         math.cos(lat_rad) * math.cos(dec_rad) * math.cos(hour_angle_rad))

        if sin_elevation <= 0.02:
            # Below horizon (polar night or nighttime)
            return 0.0

        solar_constant = 1361.0  # W/m2 extra-terrestrial
        air_mass = 1.0 / max(0.05, sin_elevation)
        # Clear Antarctic dry atmosphere transmission coefficient
        transmittance = 0.75 ** (air_mass ** 0.678)
        direct_normal = solar_constant * transmittance
        ghi = direct_normal * sin_elevation

        # Modulate with polar atmospheric albedo reflection
        bifacial_gain = 1.18  # Snow surface albedo reflection
        return round(float(min(850.0, max(0.0, ghi * bifacial_gain))), 1)

    # -------------------------------------------------------------
    # 2. Katabatic Wind Speed Physics
    # -------------------------------------------------------------
    def calculate_wind_speed(self, dt_utc: datetime.datetime) -> float:
        """
        Simulates dense Antarctic gravity-drainage katabatic winds with gust noise.
        Cut-in: 3.0 m/s, Rated: 12.0 m/s, Storm Cut-out: > 25.0 m/s.
        """
        if self.override_wind_ms is not None:
            return max(0.0, float(self.override_wind_ms))

        # Katabatic winds peak in early morning local time
        hour = (dt_utc.hour + int(self.profile["longitude_deg"] / 15.0)) % 24
        diurnal_wind = 4.0 * math.cos(math.radians((hour - 4) * 15.0))

        # Seasonal wind baseline (winter storms vs summer calmer windows)
        day_of_year = dt_utc.timetuple().tm_yday
        seasonal_base = 16.0 + 6.0 * math.cos(math.radians((day_of_year - 190) * (360.0 / 365.0)))

        # Gust turbulence noise
        gust = random.gauss(0.0, 1.8)
        wind = max(0.0, seasonal_base + diurnal_wind + gust)
        return round(float(wind), 1)

    # -------------------------------------------------------------
    # 3. Ambient Temperature & Wind Chill
    # -------------------------------------------------------------
    def calculate_ambient_temperature(self, dt_utc: datetime.datetime, wind_speed_ms: float) -> (float, float):
        """
        Simulates extreme sub-zero ambient temp with Environment Canada Wind Chill formula.
        """
        if self.override_temp_c is not None:
            temp_c = float(self.override_temp_c)
        else:
            day_of_year = dt_utc.timetuple().tm_yday
            # Deep polar winter (July = day 200) vs polar summer (Jan = day 15)
            seasonal_temp = -26.0 - 18.0 * math.cos(math.radians((day_of_year - 15) * (360.0 / 365.0)))
            hour = (dt_utc.hour + int(self.profile["longitude_deg"] / 15.0)) % 24
            diurnal = 3.5 * math.sin(math.radians((hour - 10) * 15.0))
            noise = random.gauss(0.0, 0.4)
            temp_c = round(float(seasonal_temp + diurnal + noise), 1)

        # Standard Wind Chill Index
        v_kmh = wind_speed_ms * 3.6
        if v_kmh > 4.8:
            wind_chill = 13.12 + 0.6215 * temp_c - 11.37 * (v_kmh ** 0.16) + 0.3965 * temp_c * (v_kmh ** 0.16)
        else:
            wind_chill = temp_c
        return temp_c, round(float(wind_chill), 1)

    # -------------------------------------------------------------
    # 4. Battery Electro-Thermal Pack Evolution
    # -------------------------------------------------------------
    def step_battery_pack(self, dt_seconds: float, net_p_kw: float, ambient_c: float):
        """
        Advances LiFePO4 internal pack temperature and state of charge.
        Accounts for heating jacket status and sub-zero impedance.
        """
        cap_kwh = self.profile["battery_capacity_kwh"]

        # SoC update (dt in hours)
        dt_hours = dt_seconds / 3600.0
        delta_soc = (net_p_kw * dt_hours / cap_kwh) * 100.0
        # If discharging (net_p_kw > 0): SoC decreases
        self.battery_soc_pct = max(5.0, min(100.0, self.battery_soc_pct - delta_soc))

        # Core temperature update
        # If heating jacket is active, drive pack towards nominal +5°C
        if self.battery_heater_active:
            target_t = 5.0
            tau_seconds = 7200.0  # 2-hour thermal time constant with active insulation
        else:
            # Without heater jacket, thermal envelope bleeds to ambient
            target_t = ambient_c
            tau_seconds = 14400.0  # 4-hour insulation cooldown

        cooling_rate = (target_t - self.battery_temp_c) / tau_seconds
        self.battery_temp_c = round(float(self.battery_temp_c + cooling_rate * dt_seconds), 1)

    # -------------------------------------------------------------
    # 5. Non-linear Diesel Specific Fuel Consumption (SFOC)
    # -------------------------------------------------------------
    def calculate_fuel_burn_rate(self, p_kw: float, rated_kw: float) -> float:
        """
        Computes accurate specific fuel consumption curve:
        - Optimal 70-85% load: ~0.24 L/kWh
        - Low load < 30%: ~0.38 L/kWh with wet-stacking penalty
        """
        if p_kw <= 0.1:
            return 0.0

        load_ratio = max(0.05, min(1.1, p_kw / rated_kw))
        if load_ratio < 0.30:
            sfoc_l_per_kwh = 0.36 + 0.12 * (0.30 - load_ratio)
        elif load_ratio < 0.70:
            sfoc_l_per_kwh = 0.28 - 0.05 * (load_ratio - 0.30)
        else:
            sfoc_l_per_kwh = 0.24 + 0.04 * (load_ratio - 0.70)

        burn_lh = p_kw * sfoc_l_per_kwh
        return round(float(burn_lh), 2)

    # -------------------------------------------------------------
    # 6. Generate Complete Canonical Snapshot
    # -------------------------------------------------------------
    def generate_snapshot(self, dt_utc: Optional[datetime.datetime] = None, dt_seconds: float = 1.0) -> CanonicalTelemetrySnapshot:
        """
        Assembles a complete, strictly compliant CanonicalTelemetrySnapshot.
        """
        now = dt_utc or datetime.datetime.now(datetime.timezone.utc)

        # 1. Environment
        wind_ms = self.calculate_wind_speed(now)
        temp_c, chill_c = self.calculate_ambient_temperature(now, wind_ms)
        solar_wm2 = self.calculate_solar_irradiance(now)

        weather_rec = WeatherEnvironmentRecord(
            timestamp_utc=now,
            station_id=self.station_id,
            source_mode=self.mode,
            quality_flag=QualityFlag.GOOD,
            ambient_temp_c=temp_c,
            wind_speed_ms=wind_ms,
            wind_direction_deg=145.0,
            wind_chill_c=chill_c,
            solar_irradiance_wm2=solar_wm2,
            atmospheric_pressure_hpa=982.5,
            relative_humidity_pct=68.0,
            snow_accumulation_cm=1.2,
            icing_risk_index=0.15 if temp_c < -25.0 and wind_ms > 15.0 else 0.02
        )

        # 2. Station Loads
        base_e = self.profile["base_load_elec_kw"] * self.override_load_mult
        # Cold temperature heating surge: UA * Delta T
        delta_t = max(0.0, 18.0 - temp_c)
        base_th = self.profile["base_thermal_kw"] + (self.profile["building_ua_kw_per_c"] * delta_t)

        load_rec = LoadStateRecord(
            timestamp_utc=now,
            station_id=self.station_id,
            source_mode=self.mode,
            quality_flag=QualityFlag.GOOD,
            total_elec_load_kw=round(float(base_e), 1),
            total_thermal_load_kw=round(float(base_th), 1),
            tier_1_life_support_kw=round(float(base_e * 0.65), 1),
            tier_2_science_labs_kw=round(float(base_e * 0.28), 1),
            tier_3_auxiliary_kw=round(float(base_e * 0.07), 1)
        )

        # 3. Renewables Physics
        wind_cap = self.profile["wind_capacity_kw"]
        solar_cap = self.profile["solar_capacity_kw"]

        # Wind Power Curve
        if wind_ms < 3.0:
            p_wind_avail = 0.0
            wind_status = "CALM_STANDBY"
        elif wind_ms > 25.0:
            # Gale-force storm brake
            p_wind_avail = 0.0
            wind_status = "FEATHERED_BRAKED"
        elif wind_ms >= 12.0:
            p_wind_avail = wind_cap
            wind_status = "GENERATING_RATED"
        else:
            # Cubic power region
            p_wind_avail = wind_cap * (((wind_ms - 3.0) / (12.0 - 3.0)) ** 3)
            wind_status = "GENERATING"

        # Solar PV output with sub-zero efficiency coefficient (+0.04%/°C below 25°C)
        temp_eff_boost = 1.0 + max(0.0, (25.0 - temp_c) * 0.004)
        p_solar_avail = (solar_wm2 / 1000.0) * solar_cap * min(1.15, temp_eff_boost)

        renewable_rec = RenewableStateRecord(
            timestamp_utc=now,
            station_id=self.station_id,
            source_mode=self.mode,
            quality_flag=QualityFlag.GOOD,
            wind_power_generated_kw=round(float(p_wind_avail), 2),
            wind_power_potential_kw=round(float(p_wind_avail), 2),
            wind_curtailed_kw=0.0,
            wind_status=wind_status,
            solar_power_generated_kw=round(float(p_solar_avail), 2),
            solar_power_potential_kw=round(float(p_solar_avail), 2),
            solar_curtailed_kw=0.0
        )

        # 4. Battery State
        # Calculate Derating factor
        if self.battery_temp_c >= -10.0:
            derating = 1.0
        elif self.battery_temp_c <= -35.0:
            derating = 0.05
        else:
            derating = 0.05 + 0.95 * ((self.battery_temp_c - (-35.0)) / (-10.0 - (-35.0)))

        is_locked_out = (self.battery_temp_c <= -35.0) or (self.battery_soc_pct <= self.override_reserve_pct)

        # Dynamic battery flow to balance renewables vs load
        total_ren_kw = p_wind_avail + p_solar_avail
        surplus_kw = total_ren_kw - base_e
        if surplus_kw > 0.5 and not is_locked_out:
            p_batt_chg = min(surplus_kw, self.profile["battery_capacity_kwh"] * 0.5 * derating)
            p_batt_dis = 0.0
        elif surplus_kw < -0.5 and not is_locked_out:
            p_batt_chg = 0.0
            p_batt_dis = min(abs(surplus_kw), self.profile["battery_capacity_kwh"] * 0.7 * derating)
        else:
            p_batt_chg = 0.0
            p_batt_dis = 0.0

        net_batt_kw = p_batt_dis - p_batt_chg
        self.step_battery_pack(dt_seconds, net_batt_kw, temp_c)

        battery_rec = BatteryStateRecord(
            timestamp_utc=now,
            station_id=self.station_id,
            battery_bank_id="BESS-LIFEPO4-01",
            source_mode=self.mode,
            quality_flag=QualityFlag.GOOD,
            soc_pct=round(float(self.battery_soc_pct), 1),
            soh_pct=self.battery_soh_pct,
            pack_voltage_v=400.0,
            cell_temp_c=self.battery_temp_c,
            temp_derating_factor=round(float(derating), 2),
            power_charge_kw=round(float(p_batt_chg), 2),
            power_discharge_kw=round(float(p_batt_dis), 2),
            net_power_kw=round(float(net_batt_kw), 2),
            protected_reserve_floor_pct=self.override_reserve_pct,
            heating_jacket_active=self.battery_heater_active,
            lockout_active=is_locked_out
        )

        # 5. Generators (Gen 1 & Gen 2)
        # Residual load required after renewables + battery
        deficit_kw = max(0.0, base_e - total_ren_kw - p_batt_dis)
        if self.gen1_fault:
            gen1_output_kw = 0.0
            self.gen1_active = False
            gen2_output_kw = min(self.profile["generator_2_kw"], deficit_kw)
            self.gen2_active = gen2_output_kw > 0.1
        else:
            gen1_output_kw = min(self.profile["generator_1_kw"], deficit_kw)
            self.gen1_active = gen1_output_kw > 0.1
            gen2_output_kw = max(0.0, deficit_kw - gen1_output_kw)
            self.gen2_active = gen2_output_kw > 0.1

        if self.gen1_active:
            self.gen1_runtime_sec += dt_seconds
        else:
            self.gen1_runtime_sec = 0.0

        burn_g1 = self.calculate_fuel_burn_rate(gen1_output_kw, self.profile["generator_1_kw"])
        burn_g2 = self.calculate_fuel_burn_rate(gen2_output_kw, self.profile["generator_2_kw"])
        total_burn_lh = burn_g1 + burn_g2

        # Fuel decrement
        fuel_used_liters = total_burn_lh * (dt_seconds / 3600.0)
        self.fuel_remaining_liters = max(0.0, self.fuel_remaining_liters - fuel_used_liters)

        gen_records = {
            "GEN-1": GeneratorStateRecord(
                timestamp_utc=now,
                station_id=self.station_id,
                generator_id="GEN-1",
                source_mode=self.mode,
                power_output_kw=round(float(gen1_output_kw), 2),
                is_running=self.gen1_active,
                runtime_seconds_continuous=self.gen1_runtime_sec,
                fuel_burn_rate_lh=burn_g1,
                has_fault=self.gen1_fault,
                wet_stacking_risk=self.gen1_active and (gen1_output_kw / self.profile["generator_1_kw"]) < 0.30
            ),
            "GEN-2": GeneratorStateRecord(
                timestamp_utc=now,
                station_id=self.station_id,
                generator_id="GEN-2",
                source_mode=self.mode,
                power_output_kw=round(float(gen2_output_kw), 2),
                is_running=self.gen2_active,
                runtime_seconds_continuous=self.gen2_runtime_sec,
                fuel_burn_rate_lh=burn_g2,
                has_fault=self.gen2_fault,
                wet_stacking_risk=self.gen2_active and (gen2_output_kw / self.profile["generator_2_kw"]) < 0.30
            )
        }

        # 6. Fuel State
        total_capacity_liters = self.profile["fuel_capacity_liters"]
        fuel_reserve_pct = (self.fuel_remaining_liters / total_capacity_liters) * 100.0
        autonomy_days = (self.fuel_remaining_liters / (total_burn_lh * 24.0)) if total_burn_lh > 0.05 else 35.0

        fuel_rec = FuelStateRecord(
            timestamp_utc=now,
            station_id=self.station_id,
            source_mode=self.mode,
            remaining_liters=round(float(self.fuel_remaining_liters), 1),
            tank_capacity_liters=total_capacity_liters,
            reserve_pct=round(float(fuel_reserve_pct), 1),
            burn_rate_lh=round(float(total_burn_lh), 2),
            autonomy_days=round(float(min(60.0, autonomy_days)), 1)
        )

        # 7. Microgrid Bus Balance
        total_gen_kw = p_wind_avail + p_solar_avail + p_batt_dis + gen1_output_kw + gen2_output_kw
        total_served_kw = base_e + p_batt_chg
        spinning_headroom = max(0.0, (self.profile["generator_1_kw"] - gen1_output_kw) if self.gen1_active else 0.0)

        bus_rec = MicrogridBusStateRecord(
            timestamp_utc=now,
            station_id=self.station_id,
            source_mode=self.mode,
            total_generation_kw=round(float(total_gen_kw), 2),
            total_load_kw=round(float(total_served_kw), 2),
            power_imbalance_kw=round(float(total_gen_kw - total_served_kw), 2),
            is_balanced=abs(total_gen_kw - total_served_kw) < 0.5,
            spinning_reserve_kw=round(float(spinning_headroom), 1)
        )

        # 8. Deterministic Alarms
        alarms = []
        if self.gen1_fault:
            alarms.append(EventAlarmRecord(
                timestamp_utc=now,
                station_id=self.station_id,
                alarm_code="ERR_GENSET_1_TRIP",
                title="Gen-Set 1 Trip Fault",
                severity=AlarmSeverity.CRITICAL,
                reason="Primary diesel generator tripped; spinning reserve taking over."
            ))
        if not self.battery_heater_active:
            alarms.append(EventAlarmRecord(
                timestamp_utc=now,
                station_id=self.station_id,
                alarm_code="ERR_BESS_HEATER_OFF",
                title="BESS Heating Jacket Inactive",
                severity=AlarmSeverity.WARNING,
                reason="Battery pack heating jacket is de-energized; risking freeze lockout."
            ))
        if wind_ms > 25.0:
            alarms.append(EventAlarmRecord(
                timestamp_utc=now,
                station_id=self.station_id,
                alarm_code="WARN_WIND_GALE_BRAKE",
                title="Turbine Aerodynamic Brake Engaged",
                severity=AlarmSeverity.WARNING,
                reason=f"Katabatic wind speed ({wind_ms} m/s) exceeds 25 m/s safety cut-out limit."
            ))

        return CanonicalTelemetrySnapshot(
            snapshot_id=f"SNAP-{self.station_id}-{int(now.timestamp())}",
            timestamp_utc=now,
            station_id=self.station_id,
            mode=self.mode,
            weather=weather_rec,
            load=load_rec,
            generators=gen_records,
            renewables=renewable_rec,
            battery=battery_rec,
            fuel=fuel_rec,
            grid_bus=bus_rec,
            active_alarms=alarms
        )
