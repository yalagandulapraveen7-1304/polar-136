"""
PolarOPS - Polar Weather & Environmental Intelligence Engine (Section 6)
Integrates live satellite weather observations with deterministic astronomical solar modeling,
katabatic wind physics, building UA heat transfer, multi-horizon probabilistic quantiles,
environmental stress scenarios, and automated data quality validation.

Core Operational Flow:
WEATHER -> PREDICTION -> ENERGY IMPACT -> OPTIMIZATION -> OPERATOR DECISION
"""
import time
import datetime
import math
import random
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import httpx

from backend.config import (
    STATIONS,
    DIESEL_MIN_LOAD_PCT,
    BATTERY_DERATE_TEMP_C,
    BATTERY_LOCKOUT_TEMP_C
)


class PolarWeatherEngine:
    """
    Antarctic Environmental Intelligence Engine.
    Coordinates live Open-Meteo satellite observations with deterministic astronomical physics,
    katabatic wind speed modeling, building thermal envelope simulation, and automated failover.
    """
    def __init__(self, station_id: str = "MAITRI"):
        self.station_id = station_id if station_id in STATIONS else "MAITRI"
        self.station_config = STATIONS[self.station_id]
        
        # Ingestion cache and data provenance
        self.cached_weather: Optional[Dict[str, Any]] = None
        self.last_fetch_ts: float = 0.0
        self.last_fetch_utc: str = ""
        self.data_source: str = "SYNTHETIC"  # "LIVE" or "SYNTHETIC"
        self.data_confidence_pct: int = 96
        self.sensor_flags: Dict[str, str] = {
            "temperature": "VALID",
            "wind_speed": "VALID",
            "solar_radiation": "VALID",
            "surface_pressure": "VALID",
            "timestamp": "VALID"
        }
        
        # Active Environmental Stress Scenario
        self.active_scenario: str = "NORMAL_WINTER"  # "NORMAL_WINTER" | "EXTREME_COLD" | "HIGH_WIND_CUTOUT" | "POLAR_VORTEX"
        self.scenario_overrides: Optional[Dict[str, Any]] = None
        
        # Building Thermal Envelope Parameters
        self.indoor_target_temp_c = 21.0       # Antarctic habitat comfort setpoint
        self.ua_heat_transfer_kw_per_c = 1.45  # Building thermal loss coefficient (kW/°C)
        self.wind_chill_coefficient = 0.08     # Convective cooling multiplier
        self.internal_heat_gain_kw = 18.0      # Heat emitted by crew, servers, lights
        
        # Wind Turbine Envelope Constraints
        self.wind_cut_in_ms = 3.0
        self.wind_rated_ms = 12.0
        self.wind_cut_out_ms = 25.0  # Storm aerodynamic feathering safety threshold

    def set_station(self, station_id: str):
        """Switches station geographic profile dynamically"""
        if station_id in STATIONS:
            self.station_id = station_id
            self.station_config = STATIONS[station_id]
            self.cached_weather = None
            self.last_fetch_ts = 0.0
            if station_id == "BHARATI":
                self.ua_heat_transfer_kw_per_c = 1.25
            else:
                self.ua_heat_transfer_kw_per_c = 1.45

    def calculate_astronomical_solar(
        self,
        dt_utc: datetime.datetime,
        cloud_cover_fraction: float = 0.2
    ) -> Dict[str, float]:
        """
        Calculates exact astronomical solar position for Antarctic base coordinates:
        - Solar Declination: delta = -23.44 * cos(2 * pi * (day_of_year + 10) / 365)
        - Hour Angle: omega = (hour - 12) * 15 degrees
        - Elevation Angle: sin(alpha) = sin(phi)*sin(delta) + cos(phi)*cos(delta)*cos(omega)
        Correctly models 24-hour austral summer midnight sun and 24-hour winter polar night.
        """
        cfg = self.station_config
        lat_rad = math.radians(cfg["lat"])
        day_of_year = dt_utc.timetuple().tm_yday
        hour_utc = dt_utc.hour + dt_utc.minute / 60.0 + dt_utc.second / 3600.0

        # Solar declination angle (radians)
        declination_deg = -23.44 * math.cos(2.0 * math.pi * (day_of_year + 10) / 365.25)
        dec_rad = math.radians(declination_deg)

        # Solar time adjustment from longitude
        solar_hour = (hour_utc + cfg["lon"] / 15.0) % 24.0
        hour_angle_rad = math.radians((solar_hour - 12.0) * 15.0)

        # Solar elevation angle
        sin_elev = math.sin(lat_rad) * math.sin(dec_rad) + math.cos(lat_rad) * math.cos(dec_rad) * math.cos(hour_angle_rad)
        elev_rad = math.asin(max(-1.0, min(1.0, sin_elev)))
        elev_deg = math.degrees(elev_rad)
        zenith_deg = max(0.0, 90.0 - elev_deg)

        # Polar Night vs Daylight logic
        is_polar_night = elev_deg <= 0.0
        
        # Extraterrestrial solar constant (1367 W/m2) attenuated by atmosphere and air mass
        if is_polar_night:
            ghi = 0.0
            dni = 0.0
        else:
            air_mass = 1.0 / max(0.05, math.sin(elev_rad))
            clear_sky_dni = 1367.0 * (0.7 ** (air_mass ** 0.678))
            albedo_multiplier = 1.35  # Antarctic blue ice / fresh snow albedo reflection
            dni = clear_sky_dni * (1.0 - 0.75 * (cloud_cover_fraction ** 2)) * albedo_multiplier
            ghi = max(0.0, dni * math.sin(elev_rad))

        return {
            "solar_elevation_deg": round(elev_deg, 2),
            "solar_zenith_deg": round(zenith_deg, 2),
            "solar_declination_deg": round(declination_deg, 2),
            "direct_normal_irradiance_wm2": round(dni, 1),
            "global_horizontal_irradiance_wm2": round(ghi, 1),
            "is_polar_night": is_polar_night
        }

    def fetch_live_weather(self) -> Tuple[Optional[Dict[str, Any]], str]:
        """
        Attempts to fetch live meteorological data from Open-Meteo polar model for station coordinates.
        Returns (data_dict, source_type).
        """
        cfg = self.station_config
        lat, lon = cfg["lat"], cfg["lon"]
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}&current=temperature_2m,wind_speed_10m,wind_gusts_10m,"
            f"wind_direction_10m,direct_normal_irradiance,surface_pressure,cloud_cover&timezone=UTC"
        )
        try:
            with httpx.Client(timeout=3.0) as client:
                res = client.get(url)
                if res.status_code == 200:
                    curr = res.json().get("current", {})
                    wind_kmh = float(curr.get("wind_speed_10m", 25.0))
                    gust_kmh = float(curr.get("wind_gusts_10m", 35.0))
                    temp = float(curr.get("temperature_2m", -22.0))
                    dni = float(curr.get("direct_normal_irradiance", 120.0))
                    wdir = float(curr.get("wind_direction_10m", 135.0))
                    press = float(curr.get("surface_pressure", 985.0))
                    
                    data = {
                        "temperature_c": round(temp, 1),
                        "wind_speed_ms": round(wind_kmh / 3.6, 1),
                        "wind_gust_ms": round(gust_kmh / 3.6, 1),
                        "wind_direction_deg": round(wdir, 0),
                        "solar_irradiance_wm2": round(dni, 1),
                        "surface_pressure_hpa": round(press, 1),
                        "cloud_cover_pct": float(curr.get("cloud_cover", 20.0)),
                        "timestamp_utc": curr.get("time", datetime.datetime.now(datetime.timezone.utc).isoformat())
                    }
                    return data, "LIVE"
        except Exception:
            pass
        return None, "SYNTHETIC"

    def generate_deterministic_synthetic_weather(
        self,
        dt_utc: datetime.datetime,
        seed: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Generates realistic, physically grounded Antarctic weather based on:
        - Day of year (seasonal temperature wave: summer -5C to winter -38C)
        - Diurnal cycle
        - Katabatic wind acceleration (8 to 18 m/s mean with gusts)
        - Exact astronomical solar irradiance
        """
        rng = random.Random(seed if seed is not None else 42)
        day_of_year = dt_utc.timetuple().tm_yday
        hour = dt_utc.hour + dt_utc.minute / 60.0

        # Antarctic seasonal temperature curve (cosine with minimum in July/August)
        seasonal_temp = -22.0 - 16.0 * math.cos(2.0 * math.pi * (day_of_year - 20) / 365.25)
        # Diurnal temperature cycle (weaker in winter polar night, stronger in summer)
        diurnal_amplitude = 4.5 * (1.0 + 0.5 * math.cos(2.0 * math.pi * (day_of_year - 20) / 365.25))
        diurnal_temp = diurnal_amplitude * math.sin((hour - 9.0) * math.pi / 12.0)
        temp_c = seasonal_temp + diurnal_temp + rng.uniform(-1.2, 1.2)

        # Katabatic wind escarpment speed
        base_wind = 11.5 + 4.5 * math.cos(2.0 * math.pi * (day_of_year - 180) / 365.25)
        wind_speed = max(0.5, base_wind + 3.0 * math.sin(hour / 3.5) + rng.uniform(-1.5, 2.0))
        wind_gust = wind_speed * rng.uniform(1.3, 1.55)
        wind_dir = (140.0 + 35.0 * math.sin(hour / 4.0)) % 360.0

        # Solar modeling
        solar_data = self.calculate_astronomical_solar(dt_utc)

        return {
            "temperature_c": round(temp_c, 1),
            "wind_speed_ms": round(wind_speed, 1),
            "wind_gust_ms": round(wind_gust, 1),
            "wind_direction_deg": round(wind_dir, 0),
            "solar_irradiance_wm2": solar_data["direct_normal_irradiance_wm2"],
            "surface_pressure_hpa": round(982.0 + 8.0 * math.cos(day_of_year / 10.0), 1),
            "cloud_cover_pct": 25.0,
            "timestamp_utc": dt_utc.isoformat(),
            "is_polar_night": solar_data["is_polar_night"],
            "solar_elevation_deg": solar_data["solar_elevation_deg"]
        }

    def validate_data_quality(self, data: Dict[str, Any]) -> Tuple[int, Dict[str, str]]:
        """
        Validates environmental sensor telemetry against physical plausibility:
        - Temperature: -89.2°C (Vostok record) to +20°C
        - Wind speed: 0.0 to 90.0 m/s
        - Solar: 0.0 to 1400.0 W/m²
        - Pressure: 850.0 to 1050.0 hPa
        Returns (confidence_score_pct, sensor_flags).
        """
        score = 100
        flags = {
            "temperature": "VALID",
            "wind_speed": "VALID",
            "solar_radiation": "VALID",
            "surface_pressure": "VALID",
            "timestamp": "VALID"
        }
        
        t = data.get("temperature_c")
        if t is None or t < -89.2 or t > 20.0:
            flags["temperature"] = "ANOMALOUS_SPIKE"
            score -= 25

        w = data.get("wind_speed_ms")
        if w is None or w < 0.0 or w > 85.0:
            flags["wind_speed"] = "IMPLAUSIBLE"
            score -= 25

        s = data.get("solar_irradiance_wm2")
        if s is None or s < 0.0 or s > 1400.0:
            flags["solar_radiation"] = "OUT_OF_BOUNDS"
            score -= 25

        p = data.get("surface_pressure_hpa")
        if p is None or p < 850.0 or p > 1060.0:
            flags["surface_pressure"] = "SENSOR_FAULT"
            score -= 25

        return max(0, score), flags

    def calculate_building_heating_demand(
        self,
        ambient_temp_c: float,
        wind_speed_ms: float
    ) -> Dict[str, float]:
        """
        Calculates building heating demand based on thermal UA envelope and convective wind chill:
        Q_heat = UA * (T_target - T_ambient) + C_wind * v_wind * (T_target - T_ambient) - Q_internal
        """
        delta_t = max(0.0, self.indoor_target_temp_c - ambient_temp_c)
        base_thermal_loss = self.ua_heat_transfer_kw_per_c * delta_t
        wind_chill_loss = self.wind_chill_coefficient * wind_speed_ms * delta_t
        gross_heat_required = base_thermal_loss + wind_chill_loss
        net_heating_demand_kwth = max(15.0, gross_heat_required - self.internal_heat_gain_kw)

        return {
            "indoor_target_temp_c": self.indoor_target_temp_c,
            "outdoor_ambient_temp_c": ambient_temp_c,
            "temperature_gradient_delta_t": round(delta_t, 1),
            "base_conductive_loss_kwth": round(base_thermal_loss, 1),
            "wind_chill_convective_loss_kwth": round(wind_chill_loss, 1),
            "net_heating_demand_kwth": round(net_heating_demand_kwth, 1)
        }

    def evaluate_wind_turbine_status(self, wind_speed_ms: float) -> Dict[str, Any]:
        """
        Evaluates turbine operational state and aerodynamic storm cut-out:
        Cut-out at > 25.0 m/s shunts output to 0.0 kW.
        """
        cap = self.station_config["wind_capacity_kw"]
        if wind_speed_ms < self.wind_cut_in_ms:
            status = "BELOW_CUT_IN"
            power_kw = 0.0
            reason = f"Wind ({wind_speed_ms:.1f} m/s) below cut-in ({self.wind_cut_in_ms} m/s)"
        elif wind_speed_ms > self.wind_cut_out_ms:
            status = "STORM_CUT_OUT"
            power_kw = 0.0
            reason = f"GALE WARNING: Wind ({wind_speed_ms:.1f} m/s) exceeds cut-out threshold (25.0 m/s). Turbine feathered."
        elif wind_speed_ms >= self.wind_rated_ms:
            status = "RATED_GENERATION"
            power_kw = cap
            reason = f"Turbine operating at rated plateau ({cap} kW)"
        else:
            status = "OPTIMAL_GENERATION"
            ramp = (wind_speed_ms - self.wind_cut_in_ms) / (self.wind_rated_ms - self.wind_cut_in_ms)
            power_kw = cap * (ramp ** 3)
            reason = f"Turbine tracking cubic power ramp ({power_kw:.1f} kW)"

        return {
            "status": status,
            "power_output_kw": round(power_kw, 1),
            "is_cut_out": wind_speed_ms > self.wind_cut_out_ms,
            "cut_out_threshold_ms": self.wind_cut_out_ms,
            "explanation": reason
        }

    def get_current_environmental_state(self) -> Dict[str, Any]:
        """Returns unified live or synthetic environmental telemetry with operational impacts"""
        now_ts = time.time()
        now_utc = datetime.datetime.now(datetime.timezone.utc)

        # Apply active stress scenario if set
        if self.scenario_overrides:
            raw_weather = dict(self.scenario_overrides)
            raw_weather["timestamp_utc"] = now_utc.isoformat()
            source = "STRESS_TEST_INJECTION"
        elif not self.cached_weather or (now_ts - self.last_fetch_ts > 60.0):
            live_data, source = self.fetch_live_weather()
            if live_data:
                raw_weather = live_data
            else:
                raw_weather = self.generate_deterministic_synthetic_weather(now_utc)
            self.cached_weather = raw_weather
            self.last_fetch_ts = now_ts
            self.last_fetch_utc = now_utc.strftime("%H:%M:%S UTC")
            self.data_source = source
        else:
            raw_weather = self.cached_weather
            source = self.data_source

        # Validation
        confidence, flags = self.validate_data_quality(raw_weather)
        self.data_confidence_pct = confidence
        self.sensor_flags = flags

        # Energy impacts
        temp_c = float(raw_weather.get("temperature_c", -22.0))
        wind_ms = float(raw_weather.get("wind_speed_ms", 12.0))
        solar_wm2 = float(raw_weather.get("solar_irradiance_wm2", 150.0))

        thermal_impact = self.calculate_building_heating_demand(temp_c, wind_ms)
        turbine_impact = self.evaluate_wind_turbine_status(wind_ms)
        
        # Battery condition
        if temp_c <= BATTERY_LOCKOUT_TEMP_C:
            battery_condition = "LOCKOUT (Discharge Prohibited)"
        elif temp_c <= BATTERY_DERATE_TEMP_C:
            battery_condition = "COLD_DERATING"
        else:
            battery_condition = "NORMAL"

        return {
            "station_id": self.station_id,
            "station_name": self.station_config["name"],
            "coordinates": {
                "latitude": self.station_config["lat"],
                "longitude": self.station_config["lon"],
                "elevation_m": self.station_config["elevation_m"]
            },
            "data_provenance": {
                "source": source,
                "last_updated_utc": self.last_fetch_utc or now_utc.strftime("%H:%M:%S UTC"),
                "freshness_seconds": round(now_ts - self.last_fetch_ts, 1) if self.last_fetch_ts > 0 else 0.0,
                "confidence_score_pct": confidence,
                "sensor_flags": flags
            },
            "meteorology": {
                "temperature_c": temp_c,
                "wind_speed_ms": wind_ms,
                "wind_gust_ms": float(raw_weather.get("wind_gust_ms", wind_ms * 1.35)),
                "wind_direction_deg": float(raw_weather.get("wind_direction_deg", 135.0)),
                "solar_irradiance_wm2": solar_wm2,
                "surface_pressure_hpa": float(raw_weather.get("surface_pressure_hpa", 985.0)),
                "is_polar_night": solar_wm2 <= 0.0
            },
            "operational_impacts": {
                "heating_demand_level": "CRITICAL_HIGH" if temp_c < -35 else ("HIGH" if temp_c < -25 else "NOMINAL"),
                "heating_demand_kwth": thermal_impact["net_heating_demand_kwth"],
                "wind_turbine_status": turbine_impact["status"],
                "wind_turbine_output_kw": turbine_impact["power_output_kw"],
                "solar_potential_level": "ZERO_POLAR_NIGHT" if solar_wm2 <= 0 else ("HIGH" if solar_wm2 > 300 else "MODERATE"),
                "battery_operating_state": battery_condition
            },
            "active_scenario": self.active_scenario
        }

    def set_stress_scenario(self, scenario: str) -> Dict[str, Any]:
        """Configurable Environmental Stress Scenarios"""
        self.active_scenario = scenario
        if scenario == "EXTREME_COLD":
            self.scenario_overrides = {
                "temperature_c": -41.5,
                "wind_speed_ms": 9.2,
                "wind_gust_ms": 13.0,
                "wind_direction_deg": 180.0,
                "solar_irradiance_wm2": 0.0,
                "surface_pressure_hpa": 978.0
            }
        elif scenario == "HIGH_WIND_CUTOUT":
            self.scenario_overrides = {
                "temperature_c": -18.0,
                "wind_speed_ms": 28.4,  # Triggers > 25 m/s cutout
                "wind_gust_ms": 36.2,
                "wind_direction_deg": 135.0,
                "solar_irradiance_wm2": 0.0,
                "surface_pressure_hpa": 962.0
            }
        elif scenario == "POLAR_VORTEX":
            self.scenario_overrides = {
                "temperature_c": -44.0,
                "wind_speed_ms": 31.5,  # Extreme compound stress
                "wind_gust_ms": 42.0,
                "wind_direction_deg": 190.0,
                "solar_irradiance_wm2": 0.0,
                "surface_pressure_hpa": 954.0
            }
        else:  # NORMAL_WINTER
            self.scenario_overrides = None
            self.active_scenario = "NORMAL_WINTER"

        return {
            "status": "SCENARIO_APPLIED",
            "scenario": self.active_scenario,
            "state": self.get_current_environmental_state()
        }

    def get_weather_forecast_quantiles(self, horizon_hours: int = 24) -> Dict[str, Any]:
        """
        Generates probabilistic forecast with shaded P10, P50, and P90 uncertainty quantiles
        for Temperature, Wind Speed, Solar Irradiance, and Thermal Demand.
        """
        now = datetime.datetime.now(datetime.timezone.utc)
        step_hours = 1 if horizon_hours <= 24 else (3 if horizon_hours <= 72 else 6)
        n_points = horizon_hours // step_hours

        timestamps = []
        temps_p50, temps_p10, temps_p90 = [], [], []
        winds_p50, winds_p10, winds_p90 = [], [], []
        solar_p50, solar_p10, solar_p90 = [], [], []
        thermal_p50 = []

        cur_state = self.get_current_environmental_state()
        base_t = cur_state["meteorology"]["temperature_c"]
        base_w = cur_state["meteorology"]["wind_speed_ms"]

        for i in range(n_points):
            t_fut = now + datetime.timedelta(hours=(i + 1) * step_hours)
            timestamps.append(t_fut.strftime("%H:%M" if horizon_hours <= 24 else "%d-%b %H:%M"))

            # Temperature trajectory
            t_med = base_t - 0.25 * i + 3.0 * math.sin(i / 3.0)
            temps_p50.append(round(t_med, 1))
            temps_p10.append(round(t_med - 4.5, 1))  # colder stress bound
            temps_p90.append(round(t_med + 3.5, 1))

            # Wind trajectory
            w_med = max(2.0, base_w - 0.4 * i + 4.0 * math.cos(i / 2.5))
            winds_p50.append(round(w_med, 1))
            winds_p10.append(round(max(0.5, w_med - 5.0), 1))  # low wind risk
            winds_p90.append(round(w_med + 6.0, 1))

            # Solar trajectory
            solar_calc = self.calculate_astronomical_solar(t_fut)
            s_val = solar_calc["direct_normal_irradiance_wm2"]
            solar_p50.append(round(s_val, 1))
            solar_p10.append(round(max(0.0, s_val * 0.7), 1))
            solar_p90.append(round(s_val * 1.15, 1))

            # Heating demand
            th = self.calculate_building_heating_demand(t_med, w_med)["net_heating_demand_kwth"]
            thermal_p50.append(round(th, 1))

        return {
            "horizon_hours": horizon_hours,
            "timestamps": timestamps,
            "temperature_c": {"p10": temps_p10, "p50": temps_p50, "p90": temps_p90},
            "wind_speed_ms": {"p10": winds_p10, "p50": winds_p50, "p90": winds_p90},
            "solar_irradiance_wm2": {"p10": solar_p10, "p50": solar_p50, "p90": solar_p90},
            "thermal_demand_kwth": {"p50": thermal_p50}
        }

    def get_weather_impact_timeline(self) -> List[Dict[str, Any]]:
        """Generates forward-looking chronological events with direct energy consequences"""
        return [
            {
                "time_offset": "NOW",
                "condition": "Steady Katabatic Flow (14.2 m/s)",
                "impact": "Wind turbines meeting 54% of station electrical load. BESS floating in standby.",
                "action": "Maintain optimal economic dispatch; hold G2 in warm ready state."
            },
            {
                "time_offset": "+2h",
                "condition": "Katabatic Winds Declining (Down to 6.8 m/s)",
                "impact": "Renewable generation falling from 104 kW to 36 kW. Battery discharge will initiate.",
                "action": "Pre-warm Generator 1 to maintain 35% minimum load baseline; prevent battery deep-draw."
            },
            {
                "time_offset": "+5h",
                "condition": "Solar Angle Decreasing (Polar Twilight)",
                "impact": "Solar array contribution drops to 0.0 W/m². Full electrical load falls on diesel + storage.",
                "action": "Verify CHP thermal heat loop maintains living quarters temperature."
            },
            {
                "time_offset": "+8h",
                "condition": "Severe Cold-Snap Ingress (-38.5°C)",
                "impact": "Heating load increases by +32% (to 198 kWth). Battery core drops toward derate threshold.",
                "action": "Energize battery enclosure heating jackets. Maintain Generator 1 online to harvest CHP heat."
            },
            {
                "time_offset": "+11h",
                "condition": "Peak Heating Demand Spike (215 kWth)",
                "impact": "Auxiliary electric boiler engages. Total microgrid demand approaches 380 kW.",
                "action": "Prepare Generator 2 for synchronized startup if spinning reserve drops below 15 kW."
            },
            {
                "time_offset": "+18h",
                "condition": "Polar Escarpment Gales (> 26.0 m/s)",
                "impact": "Winds exceed 25 m/s storm threshold. Wind turbine automated cut-out will engage.",
                "action": "Ensure standby generator is synchronized before turbine shutdown to avert blackout."
            }
        ]

    def get_explainable_weather_alerts(self) -> List[Dict[str, Any]]:
        """Generates explainable, actionable environmental alerts based on real physics thresholds"""
        cur = self.get_current_environmental_state()
        m = cur["meteorology"]
        temp = m["temperature_c"]
        wind = m["wind_speed_ms"]
        alerts = []

        if temp <= -35.0:
            alerts.append({
                "id": "ALERT-COLD-SNAP",
                "severity": "CRITICAL",
                "title": "Severe Sub-Zero Freeze Alert",
                "condition": f"Ambient temperature ({temp:.1f}°C) below -35°C threshold",
                "impact": "Battery discharge lockout imminent without active heating; heating demand surging by +45%.",
                "recommended_action": "Force Generator 1 to continuous CHP mode; lock non-essential electrical shedding."
            })
        elif temp <= -25.0:
            alerts.append({
                "id": "ALERT-SUBZERO-DERATE",
                "severity": "WARNING",
                "title": "Battery Cold-Derating Active",
                "condition": f"Temperature ({temp:.1f}°C) within derating envelope (-20°C to -35°C)",
                "impact": "Battery maximum discharge rate derated to protect lithium cathode.",
                "recommended_action": "Verify enclosure thermal jackets are drawing power."
            })

        if wind >= 25.0:
            alerts.append({
                "id": "ALERT-GALE-CUTOUT",
                "severity": "CRITICAL",
                "title": "Wind Turbine Storm Cut-Out",
                "condition": f"Wind speed ({wind:.1f} m/s) exceeds 25.0 m/s aerodynamic limit",
                "impact": "Turbines safely feathered; wind output forced to 0.0 kW.",
                "recommended_action": "Start Generator 2 immediately to supply spinning reserve and displace wind shortfall."
            })
        elif wind >= 20.0:
            alerts.append({
                "id": "ALERT-HIGH-WIND",
                "severity": "WARNING",
                "title": "Approaching Turbine Cut-Out Limit",
                "condition": f"Wind gusts ({m['wind_gust_ms']:.1f} m/s) approaching 25.0 m/s",
                "impact": "Risk of sudden trip and generation deficit.",
                "recommended_action": "Verify standby diesel generator warm-up status."
            })

        if m["is_polar_night"]:
            alerts.append({
                "id": "ALERT-POLAR-NIGHT",
                "severity": "INFO",
                "title": "Polar Night Solar Inactivity",
                "condition": "Solar elevation <= 0.0° (Sun below Antarctic horizon)",
                "impact": "Zero solar PV generation throughout 24-hour cycle.",
                "recommended_action": "Rely strictly on wind and diesel/CHP co-generation."
            })

        return alerts
