"""
PolarOPS - Feature Engineering Pipeline (Phase 2)
Computes physics-informed features from Canonical Telemetry Snapshots:
- Cyclic astronomical hour & seasonal transformations.
- Thermal inertia, cooling degree gradients, and building UA envelope lag.
- Polar air kinetic power density (0.5 * rho * V^3 with sub-zero air density).
- Solar elevation geometry and polar night detection.
- Microgrid dispatch state, battery temperature derating, and electrical load lags.
"""
import math
import datetime
from typing import Dict, Any, List, Optional
import numpy as np
from backend.schema.canonical import CanonicalTelemetrySnapshot

# Polar air density correction: rho = P / (R_spec * T_kelvin)
# At -25°C (248.15 K) and 985 hPa: rho ≈ 1.383 kg/m³
AIR_GAS_CONSTANT = 287.058


class PolarFeatureEngineer:
    """
    Stateful feature engineering pipeline.
    Maintains a rolling historical buffer to calculate rolling averages, lags, and trends.
    """
    def __init__(self, station_id: str = "BHARATI", buffer_size: int = 2880):
        self.station_id = station_id
        self.buffer_size = buffer_size  # Up to 48 hours of 1-minute or 1-second snapshots
        self.history: List[Dict[str, Any]] = []

    def clear(self):
        self.history = []

    def push_snapshot(self, snapshot: CanonicalTelemetrySnapshot):
        """Add latest canonical snapshot into rolling feature buffer"""
        t = snapshot.timestamp_utc
        entry = {
            "timestamp_utc": t,
            "ambient_temp_c": snapshot.weather.ambient_temp_c,
            "wind_speed_ms": snapshot.weather.wind_speed_ms,
            "solar_irradiance_wm2": snapshot.weather.solar_irradiance_wm2,
            "pressure_hpa": snapshot.weather.atmospheric_pressure_hpa,
            "load_elec_kw": snapshot.load.total_elec_load_kw,
            "load_thermal_kw": snapshot.load.total_thermal_load_kw,
            "battery_soc_pct": snapshot.battery.soc_pct,
            "battery_temp_c": snapshot.battery.cell_temp_c,
        }
        self.history.append(entry)
        if len(self.history) > self.buffer_size:
            self.history.pop(0)

    def extract_features(self, snapshot: CanonicalTelemetrySnapshot) -> Dict[str, float]:
        """
        Extracts a flat, strongly-typed feature dictionary for ML models and Digital Twin.
        """
        now = snapshot.timestamp_utc
        self.push_snapshot(snapshot)

        # -------------------------------------------------------------
        # 1. Temporal & Astronomical Cyclic Features
        # -------------------------------------------------------------
        hour = now.hour + now.minute / 60.0 + now.second / 3600.0
        hour_sin = math.sin(2.0 * math.pi * hour / 24.0)
        hour_cos = math.cos(2.0 * math.pi * hour / 24.0)

        day_of_year = now.timetuple().tm_yday
        seasonal_sin = math.sin(2.0 * math.pi * day_of_year / 365.25)
        seasonal_cos = math.cos(2.0 * math.pi * day_of_year / 365.25)

        day_of_week = float(now.weekday())
        is_weekend = 1.0 if day_of_week >= 5 else 0.0

        # -------------------------------------------------------------
        # 2. Weather & Polar Aerodynamics Features
        # -------------------------------------------------------------
        temp_c = snapshot.weather.ambient_temp_c
        temp_k = max(180.0, temp_c + 273.15)
        press_pa = snapshot.weather.atmospheric_pressure_hpa * 100.0

        # Dynamic sub-zero air density (kg/m3)
        air_density = press_pa / (AIR_GAS_CONSTANT * temp_k)

        wind_ms = snapshot.weather.wind_speed_ms
        # Physical wind kinetic power density: 0.5 * rho * V^3 (W/m2)
        wind_power_density = 0.5 * air_density * (wind_ms ** 3)

        # Heating demand gradient: Delta T to maintain +18°C indoor habitat
        delta_t_heating = max(0.0, 18.0 - temp_c)
        wind_chill_c = snapshot.weather.wind_chill_c

        # -------------------------------------------------------------
        # 3. Solar Elevation & Geometry Features
        # -------------------------------------------------------------
        solar_wm2 = snapshot.weather.solar_irradiance_wm2
        is_polar_night = 1.0 if (120 <= day_of_year <= 245 and solar_wm2 < 5.0) else 0.0

        # -------------------------------------------------------------
        # 4. Rolling Lags, Moving Averages & Gradients
        # -------------------------------------------------------------
        if len(self.history) >= 2:
            temps = [h["ambient_temp_c"] for h in self.history]
            winds = [h["wind_speed_ms"] for h in self.history]
            loads_e = [h["load_elec_kw"] for h in self.history]

            # Short rolling window (last 60 entries or available)
            short_w = min(60, len(temps))
            temp_rolling_mean_short = float(np.mean(temps[-short_w:]))
            wind_rolling_mean_short = float(np.mean(winds[-short_w:]))
            wind_rolling_std_short = float(np.std(winds[-short_w:]))

            # Temperature gradient (cooling / warming velocity per hour)
            dt_hours = max(0.01, (now - self.history[0]["timestamp_utc"]).total_seconds() / 3600.0)
            temp_gradient_per_hour = (temps[-1] - temps[0]) / dt_hours
            load_elec_lag = loads_e[-min(60, len(loads_e))]
        else:
            temp_rolling_mean_short = temp_c
            wind_rolling_mean_short = wind_ms
            wind_rolling_std_short = 0.0
            temp_gradient_per_hour = 0.0
            load_elec_lag = snapshot.load.total_elec_load_kw

        # -------------------------------------------------------------
        # 5. Microgrid State & Asset Limits Features
        # -------------------------------------------------------------
        b = snapshot.battery
        gen1 = snapshot.generators.get("GEN-1")
        gen2 = snapshot.generators.get("GEN-2")

        gen_available_kw = 0.0
        if gen1 and not gen1.has_fault:
            gen_available_kw += 60.0
        if gen2 and not gen2.has_fault:
            gen_available_kw += 60.0

        return {
            # Time & Season
            "feat_hour_sin": round(hour_sin, 4),
            "feat_hour_cos": round(hour_cos, 4),
            "feat_seasonal_sin": round(seasonal_sin, 4),
            "feat_seasonal_cos": round(seasonal_cos, 4),
            "feat_day_of_week": day_of_week,
            "feat_is_weekend": is_weekend,
            # Thermal & Weather
            "feat_ambient_temp_c": round(temp_c, 2),
            "feat_wind_chill_c": round(wind_chill_c, 2),
            "feat_delta_t_heating": round(delta_t_heating, 2),
            "feat_temp_rolling_mean": round(temp_rolling_mean_short, 2),
            "feat_temp_gradient_per_hour": round(temp_gradient_per_hour, 3),
            "feat_air_density_kg_m3": round(air_density, 3),
            # Wind Aerodynamics
            "feat_wind_speed_ms": round(wind_ms, 2),
            "feat_wind_power_density_w_m2": round(wind_power_density, 2),
            "feat_wind_rolling_mean": round(wind_rolling_mean_short, 2),
            "feat_wind_rolling_std": round(wind_rolling_std_short, 3),
            # Solar
            "feat_solar_irradiance_wm2": round(solar_wm2, 2),
            "feat_is_polar_night": is_polar_night,
            # Loads & Lags
            "feat_load_elec_current_kw": round(snapshot.load.total_elec_load_kw, 2),
            "feat_load_thermal_current_kw": round(snapshot.load.total_thermal_load_kw, 2),
            "feat_load_elec_lag": round(load_elec_lag, 2),
            # Battery Electro-Thermal
            "feat_battery_soc_pct": round(b.soc_pct, 2),
            "feat_battery_temp_c": round(b.cell_temp_c, 2),
            "feat_battery_derating_factor": round(b.temp_derating_factor, 2),
            "feat_battery_reserve_floor": round(b.protected_reserve_floor_pct, 2),
            # Grid / Gen
            "feat_gen_available_kw": gen_available_kw,
            "feat_fuel_reserve_pct": round(snapshot.fuel.reserve_pct, 2)
        }
