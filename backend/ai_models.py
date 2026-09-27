"""
PolarOPS - Multi-Horizon Probabilistic Quantile Forecasting Engine (Phase 3)
Utilizes LightGBM Quantile Regressors (p10, p50, p90) to forecast:
- Station Electrical Load Demand (kWe)
- Building & Life-Support Thermal Demand (kWth)
- Aerodynamic Wind Turbine Potential (kW)
- Bifacial Solar PV Generation Potential (kW)

Features:
- Enforces strict quantile monotonicity: p10 <= p50 <= p90.
- Physical boundary constraints (non-negativity, polar night, gale cut-out feathering).
- Produces strongly-typed ForecastQuantileRecord canonical models.
- Fully backward-compatible with 24-hour and multi-horizon front-end consumers.
"""
import math
import datetime
import random
from typing import Dict, List, Any, Optional, Tuple
import numpy as np

try:
    import lightgbm as lgb
except (ImportError, OSError):
    lgb = None

from backend.config import STATIONS, WIND_CUT_IN_MS, WIND_RATED_MS, WIND_CUT_OUT_MS
from backend.schema.canonical import ForecastQuantileRecord


def compute_pinball_loss(y_true: np.ndarray, y_pred: np.ndarray, alpha: float) -> float:
    """
    Computes pinball (quantile) loss:
    L_alpha(y, y_hat) = max(alpha * (y - y_hat), (1 - alpha) * (y_hat - y))
    """
    diff = y_true - y_pred
    return float(np.mean(np.maximum(alpha * diff, (alpha - 1.0) * diff)))


def evaluate_quantile_calibration(y_true: np.ndarray, p10: np.ndarray, p50: np.ndarray, p90: np.ndarray) -> Dict[str, float]:
    """
    Evaluates empirical coverage probability and pinball losses across quantiles.
    """
    coverage_80 = float(np.mean((y_true >= p10) & (y_true <= p90)))
    below_p10 = float(np.mean(y_true < p10))
    above_p90 = float(np.mean(y_true > p90))
    loss_p10 = compute_pinball_loss(y_true, p10, 0.10)
    loss_p50 = compute_pinball_loss(y_true, p50, 0.50)
    loss_p90 = compute_pinball_loss(y_true, p90, 0.90)

    return {
        "coverage_80_nominal": 0.80,
        "coverage_80_empirical": round(coverage_80, 4),
        "empirical_fraction_below_p10": round(below_p10, 4),
        "empirical_fraction_above_p90": round(above_p90, 4),
        "pinball_loss_p10": round(loss_p10, 4),
        "pinball_loss_p50": round(loss_p50, 4),
        "pinball_loss_p90": round(loss_p90, 4),
    }


class PolarDemandForecaster:
    """
    Probabilistic LightGBM Quantile Forecaster for Polar Microgrids.
    Trains and dispatches models for Electrical, Thermal, Wind, and Solar trajectories.
    """
    QUANTILES = [0.10, 0.50, 0.90]

    def __init__(self):
        self.is_trained = False
        self.models: Dict[str, Dict[float, Any]] = {
            "elec": {},
            "therm": {},
            "wind": {},
            "solar": {}
        }
        self._initialize_and_train_models()

    def _initialize_and_train_models(self):
        """
        Trains LightGBM quantile regressors on physics-informed synthetic polar datasets.
        Features: [hour_sin, hour_cos, seasonal_sin, seasonal_cos, temp_c, wind_ms, solar_wm2, delta_t, base_e, base_th, wind_cap, solar_cap]
        """
        if lgb is None:
            self.is_trained = True
            return

        try:
            np.random.seed(42)
            n_samples = 3200

            # 1. Feature Synthesis
            hours = np.random.uniform(0.0, 24.0, n_samples)
            hour_sin = np.sin(2.0 * np.pi * hours / 24.0)
            hour_cos = np.cos(2.0 * np.pi * hours / 24.0)

            days = np.random.uniform(1.0, 365.25, n_samples)
            seasonal_sin = np.sin(2.0 * np.pi * days / 365.25)
            seasonal_cos = np.cos(2.0 * np.pi * days / 365.25)

            # Ambient temperature varies with season and hour (-55°C to 0°C)
            temps = -25.0 + 15.0 * seasonal_cos + 4.0 * hour_sin + np.random.normal(0, 3.0, n_samples)
            temps = np.clip(temps, -60.0, 10.0)

            # Winds: 0 to 45 m/s with katabatic distribution
            winds = np.random.weibull(2.1, n_samples) * 12.0
            winds = np.clip(winds, 0.0, 45.0)

            # Solar irradiance: zero in polar winter (days 120-250) or night
            is_winter = (days >= 115) & (days <= 250)
            daytime = (hours >= 5.0) & (hours <= 19.0)
            solar_raw = 450.0 * np.maximum(0.0, np.sin((hours - 5.0) / 14.0 * np.pi)) * np.maximum(0.0, seasonal_cos + 0.3)
            solar_wm2 = np.where(is_winter | (~daytime), 0.0, solar_raw)

            # Station parameters (randomized between Bharati and Maitri)
            station_choices = np.random.choice([0, 1], n_samples)
            base_e = np.where(station_choices == 0, 48.0, 56.0)
            base_th = np.where(station_choices == 0, 62.0, 72.0)
            wind_cap = np.where(station_choices == 0, 120.0, 100.0)
            solar_cap = np.where(station_choices == 0, 75.0, 90.0)

            delta_t_heating = np.maximum(0.0, 18.0 - temps)

            # 2. Physics-grounded Ground Truth Targets
            # Electrical Load: base + diurnal activity + cold heating spike + noise
            diurnal_elec = 10.0 * np.sin(np.maximum(0.0, (hours - 6.5) / 12.0 * np.pi))
            cold_elec_boost = np.maximum(0.0, (-15.0 - temps) * 0.35)
            y_elec = base_e + diurnal_elec + cold_elec_boost + np.random.normal(0, 2.5, n_samples)
            y_elec = np.maximum(10.0, y_elec)

            # Thermal Load: base + building envelope heat loss UA*delta_t + wind convection + noise
            wind_conv = winds * 0.85
            y_therm = base_th + (delta_t_heating * 1.35) + wind_conv + np.random.normal(0, 3.5, n_samples)
            y_therm = np.maximum(15.0, y_therm)

            # Wind Power: cut-in, rated, cut-out with cold air density boost
            air_density = 1.38
            wind_p_list = []
            for w_val, cap in zip(winds, wind_cap):
                if w_val < WIND_CUT_IN_MS or w_val > WIND_CUT_OUT_MS:
                    p = 0.0
                elif w_val >= WIND_RATED_MS:
                    p = cap
                else:
                    frac = ((w_val - WIND_CUT_IN_MS) / (WIND_RATED_MS - WIND_CUT_IN_MS)) ** 3
                    p = cap * frac * (air_density / 1.225)
                wind_p_list.append(p)
            y_wind = np.array(wind_p_list) + np.random.normal(0, 1.8, n_samples)
            y_wind = np.clip(y_wind, 0.0, 150.0)

            # Solar Power: GHI * albedo factor * efficiency with cloud noise
            albedo_factor = 1.20
            solar_eff = np.clip(solar_wm2 / 1000.0 * albedo_factor, 0.0, 1.0)
            y_solar = solar_cap * solar_eff + np.where(solar_wm2 > 5.0, np.random.normal(0, 1.2, n_samples), 0.0)
            y_solar = np.maximum(0.0, y_solar)

            # Assembly of Feature Matrix X
            X = np.column_stack([
                hour_sin, hour_cos, seasonal_sin, seasonal_cos,
                temps, winds, solar_wm2, delta_t_heating,
                base_e, base_th, wind_cap, solar_cap
            ])

            # Train Quantile Regressors (p10, p50, p90)
            targets = {
                "elec": y_elec,
                "therm": y_therm,
                "wind": y_wind,
                "solar": y_solar
            }

            for target_name, y_data in targets.items():
                for q in self.QUANTILES:
                    reg = lgb.LGBMRegressor(
                        objective='quantile',
                        alpha=q,
                        num_leaves=31,
                        learning_rate=0.06,
                        n_estimators=50,
                        min_child_samples=15,
                        verbose=-1,
                        random_state=42
                    )
                    reg.fit(X, y_data)
                    self.models[target_name][q] = reg

            self.is_trained = True
        except Exception:
            self.models = {"elec": {}, "therm": {}, "wind": {}, "solar": {}}
            self.is_trained = True

    def _build_feature_vector(
        self,
        dt_utc: datetime.datetime,
        temp_c: float,
        wind_ms: float,
        solar_wm2: float,
        station_profile: Dict[str, Any]
    ) -> np.ndarray:
        hour = dt_utc.hour + dt_utc.minute / 60.0
        hour_sin = math.sin(2.0 * math.pi * hour / 24.0)
        hour_cos = math.cos(2.0 * math.pi * hour / 24.0)

        day_of_year = dt_utc.timetuple().tm_yday
        seasonal_sin = math.sin(2.0 * math.pi * day_of_year / 365.25)
        seasonal_cos = math.cos(2.0 * math.pi * day_of_year / 365.25)

        delta_t_heating = max(0.0, 18.0 - temp_c)
        base_e = float(station_profile.get("base_load_kwe", 50.0))
        base_th = float(station_profile.get("base_thermal_kwth", 65.0))
        wind_cap = float(station_profile.get("wind_capacity_kw", 100.0))
        solar_cap = float(station_profile.get("solar_capacity_kw", 80.0))

        return np.array([[
            hour_sin, hour_cos, seasonal_sin, seasonal_cos,
            temp_c, wind_ms, solar_wm2, delta_t_heating,
            base_e, base_th, wind_cap, solar_cap
        ]])

    def _predict_quantiles(self, target_name: str, feat_vec: np.ndarray, deterministic_fallback: float) -> Tuple[float, float, float]:
        """
        Infers (p10, p50, p90) with guaranteed non-crossing monotonicity: p10 <= p50 <= p90.
        """
        if (
            self.is_trained and
            target_name in self.models and
            0.10 in self.models[target_name] and
            0.50 in self.models[target_name] and
            0.90 in self.models[target_name]
        ):
            try:
                p10_raw = float(self.models[target_name][0.10].predict(feat_vec)[0])
                p50_raw = float(self.models[target_name][0.50].predict(feat_vec)[0])
                p90_raw = float(self.models[target_name][0.90].predict(feat_vec)[0])
            except Exception:
                p50_raw = deterministic_fallback
                p10_raw = deterministic_fallback * 0.88
                p90_raw = deterministic_fallback * 1.15
        else:
            p50_raw = deterministic_fallback
            p10_raw = deterministic_fallback * 0.88
            p90_raw = deterministic_fallback * 1.15

        # Enforce non-negativity for physical loads and power
        p50 = max(0.0, p50_raw)
        # Non-crossing post-processing: p10 <= p50 <= p90
        p10 = max(0.0, min(p10_raw, p50))
        p90 = max(p50, p90_raw)

        return round(p10, 1), round(p50, 1), round(p90, 1)

    def calculate_wind_power(self, wind_speed: float, capacity_kw: float) -> float:
        """Aerodynamic polar wind turbine power curve with storm cut-out feathering"""
        if wind_speed < WIND_CUT_IN_MS or wind_speed > WIND_CUT_OUT_MS:
            return 0.0
        elif wind_speed >= WIND_RATED_MS:
            return float(capacity_kw)
        else:
            fraction = ((wind_speed - WIND_CUT_IN_MS) / (WIND_RATED_MS - WIND_CUT_IN_MS)) ** 3
            return float(round(capacity_kw * fraction, 1))

    def calculate_solar_irradiance_astronomy(self, dt_utc: datetime.datetime, lat: float = -69.4078, lon: float = 76.1872) -> float:
        """
        Astronomical Global Horizontal Irradiance calculation with polar night & midnight sun physics.
        """
        day_of_year = dt_utc.timetuple().tm_yday
        declination_rad = math.radians(-23.44 * math.cos(2.0 * math.pi * (day_of_year + 10.0) / 365.25))
        lat_rad = math.radians(lat)

        utc_hours = dt_utc.hour + dt_utc.minute / 60.0 + dt_utc.second / 3600.0
        local_solar_time = (utc_hours + lon / 15.0) % 24.0
        hour_angle_rad = math.radians((local_solar_time - 12.0) * 15.0)

        sin_elev = math.sin(lat_rad) * math.sin(declination_rad) + math.cos(lat_rad) * math.cos(declination_rad) * math.cos(hour_angle_rad)
        if sin_elev <= 0.02:
            return 0.0
        return round(float(1050.0 * sin_elev), 1)

    def calculate_solar_power(self, irradiance_wm2: float, capacity_kw: float) -> float:
        """Bifacial polar solar generation accounting for snow blue-ice albedo (1.20x factor)"""
        if irradiance_wm2 < 2.0:
            return 0.0
        albedo_factor = 1.20
        eff = min(1.0, (irradiance_wm2 / 1000.0) * albedo_factor)
        return float(round(capacity_kw * eff, 1))

    def predict_horizon(self, telemetry: Dict[str, Any], horizon: str = "24 Hours") -> Dict[str, Any]:
        """
        Produces lookahead projection with LightGBM Quantiles (p10, p50, p90)
        across all supported horizons:
        ['24 Hours', 'Tomorrow', 'Current Week', 'Next 2-3 Weeks', '1 Month', '3 Months', '6 Months', '12 Months']
        """
        station_id = telemetry.get("station_id", "MAITRI")
        station = STATIONS.get(station_id, STATIONS["MAITRI"])
        lat = station.get("lat", -69.4078)
        lon = station.get("lon", 76.1872)
        base_temp = float(telemetry.get("ambient_temp_c", -20.0))
        base_wind = float(telemetry.get("wind_speed_ms", 10.0))

        try:
            current_time = datetime.datetime.fromisoformat(telemetry.get("timestamp", ""))
        except Exception:
            current_time = datetime.datetime.now(datetime.timezone.utc)

        h_clean = horizon.strip()

        # Generate forecast step definitions: (label, target_dt, temp_est, wind_est, solar_est)
        steps: List[Tuple[str, datetime.datetime, float, float, float]] = []

        if h_clean == "Tomorrow":
            start_tomorrow = current_time + datetime.timedelta(days=1)
            for h in range(24):
                ft = start_tomorrow.replace(hour=h, minute=0, second=0, microsecond=0)
                temp_h = base_temp + 3.5 * np.sin((h - 8) * np.pi / 12)
                wind_h = max(0.5, base_wind + 3.0 * np.cos((h - 5) * np.pi / 12))
                solar_h = self.calculate_solar_irradiance_astronomy(ft, lat, lon)
                steps.append((f"{h:02d}:00", ft, temp_h, wind_h, solar_h))

        elif h_clean == "Current Week":
            for d in range(7):
                ft = current_time + datetime.timedelta(days=d)
                day_temp = base_temp + 2.0 * np.sin(d * 0.8)
                day_wind = max(2.0, base_wind + 3.0 * np.cos(d * 1.1))
                solar_h = self.calculate_solar_irradiance_astronomy(ft.replace(hour=12), lat, lon)
                steps.append((ft.strftime("%a %d"), ft, day_temp, day_wind, solar_h))

        elif h_clean == "Next 2-3 Weeks":
            for d in range(21):
                ft = current_time + datetime.timedelta(days=d)
                lbl = ft.strftime("%d %b") if d % 3 == 0 or d == 20 else ""
                day_temp = base_temp - 0.15 * d + 3.0 * np.sin(d * 0.6)
                day_wind = max(1.5, base_wind + 3.5 * np.cos(d * 0.45))
                solar_h = self.calculate_solar_irradiance_astronomy(ft.replace(hour=12), lat, lon)
                steps.append((lbl, ft, day_temp, day_wind, solar_h))

        elif h_clean == "1 Month":
            for d in range(30):
                ft = current_time + datetime.timedelta(days=d)
                lbl = f"Day {d+1}" if d % 5 == 0 or d == 29 else ""
                day_temp = base_temp - 0.2 * d + 2.5 * np.sin(d * 0.4)
                day_wind = max(2.0, base_wind + 4.0 * np.cos(d * 0.35))
                solar_h = self.calculate_solar_irradiance_astronomy(ft.replace(hour=12), lat, lon)
                steps.append((lbl, ft, day_temp, day_wind, solar_h))

        elif h_clean == "3 Months":
            for w in range(12):
                ft = current_time + datetime.timedelta(weeks=w)
                week_temp = base_temp - 1.2 * w + 2.0 * np.sin(w)
                week_wind = max(3.0, base_wind + 3.0 * np.cos(w * 0.8))
                solar_h = self.calculate_solar_irradiance_astronomy(ft.replace(hour=12), lat, lon)
                steps.append((f"Wk {w+1}", ft, week_temp, week_wind, solar_h))

        elif h_clean == "6 Months":
            for m in range(6):
                ft = current_time + datetime.timedelta(days=m * 30)
                m_temp = base_temp - 3.5 * m + 3.0 * np.sin(m)
                m_wind = max(4.0, base_wind + 4.0 * np.cos(m * 0.9))
                solar_h = self.calculate_solar_irradiance_astronomy(ft.replace(hour=12), lat, lon)
                steps.append((ft.strftime("%b"), ft, m_temp, m_wind, solar_h))

        elif h_clean == "12 Months":
            months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            for m_idx, m_name in enumerate(months):
                ft = current_time + datetime.timedelta(days=m_idx * 30)
                solstice_angle = (m_idx / 12.0) * 2 * np.pi
                m_temp = -28.0 + 16.0 * np.cos(solstice_angle)
                m_wind = 12.0 - 3.0 * np.cos(solstice_angle)
                solar_h = self.calculate_solar_irradiance_astronomy(ft.replace(hour=12), lat, lon)
                steps.append((m_name, ft, m_temp, m_wind, solar_h))

        else:
            # Default: 24 Hours
            h_clean = "24 Hours"
            for h in range(24):
                ft = current_time + datetime.timedelta(hours=h)
                th = ft.hour
                temp_h = base_temp + 4.0 * np.sin((th - 9) * np.pi / 12)
                wind_h = max(0.5, base_wind + 2.5 * np.cos((th - 4) * np.pi / 12))
                solar_h = self.calculate_solar_irradiance_astronomy(ft, lat, lon)
                steps.append((f"{th:02d}:00", ft, temp_h, wind_h, solar_h))

        # Prediction Accumulators
        labels: List[str] = []
        timestamps: List[str] = []

        elec_p10_list: List[float] = []
        elec_p50_list: List[float] = []
        elec_p90_list: List[float] = []

        therm_p10_list: List[float] = []
        therm_p50_list: List[float] = []
        therm_p90_list: List[float] = []

        wind_p10_list: List[float] = []
        wind_p50_list: List[float] = []
        wind_p90_list: List[float] = []

        solar_p10_list: List[float] = []
        solar_p50_list: List[float] = []
        solar_p90_list: List[float] = []

        quantile_records: List[Dict[str, Any]] = []

        for lbl, ft, t_est, w_est, s_est in steps:
            labels.append(lbl)
            timestamps.append(ft.isoformat())

            # Physics baselines for deterministic fallback
            det_wind = self.calculate_wind_power(w_est, station["wind_capacity_kw"])
            det_solar = self.calculate_solar_power(s_est, station["solar_capacity_kw"])
            det_elec = station["base_load_kwe"] + 8.0 * np.sin(max(0.0, (ft.hour - 7) / 11.0 * np.pi))
            det_therm = station["base_thermal_kwth"] + max(0.0, (18.0 - t_est) * 1.35) + (w_est * 0.75)

            feat = self._build_feature_vector(ft, t_est, w_est, s_est, station)

            # Infer quantiles
            e10, e50, e90 = self._predict_quantiles("elec", feat, det_elec)
            th10, th50, th90 = self._predict_quantiles("therm", feat, det_therm)
            w10, w50, w90 = self._predict_quantiles("wind", feat, det_wind)
            s10, s50, s90 = self._predict_quantiles("solar", feat, det_solar)

            # Special Physical Boundary Overrides:
            # 1. High wind cut-out feathering (above 25 m/s, turbine mechanically stops)
            if w_est > WIND_CUT_OUT_MS:
                w10, w50, w90 = 0.0, 0.0, 0.0

            # 2. Polar night or zero irradiance
            if s_est <= 2.0:
                s10, s50, s90 = 0.0, 0.0, 0.0

            elec_p10_list.append(e10)
            elec_p50_list.append(e50)
            elec_p90_list.append(e90)

            therm_p10_list.append(th10)
            therm_p50_list.append(th50)
            therm_p90_list.append(th90)

            wind_p10_list.append(w10)
            wind_p50_list.append(w50)
            wind_p90_list.append(w90)

            solar_p10_list.append(s10)
            solar_p50_list.append(s50)
            solar_p90_list.append(s90)

            # Build canonical quantile records
            horizon_mins = int((ft - current_time).total_seconds() / 60.0)
            for var_name, (q10, q50, q90) in [
                ("elec_load_kw", (e10, e50, e90)),
                ("thermal_load_kw", (th10, th50, th90)),
                ("wind_power_kw", (w10, w50, w90)),
                ("solar_power_kw", (s10, s50, s90))
            ]:
                rec = ForecastQuantileRecord(
                    issued_at_utc=current_time,
                    target_timestamp_utc=ft,
                    horizon_minutes=max(0, horizon_mins),
                    station_id=station_id,
                    variable_name=var_name,
                    p10=q10,
                    p50=q50,
                    p90=q90,
                    confidence_score=0.95
                )
                quantile_records.append(rec.model_dump())

        # Calculate net load: p50 electric - (p50 wind + p50 solar)
        net_elec_p50 = [
            round(max(0.0, elec_p50_list[i] - (wind_p50_list[i] + solar_p50_list[i])), 1)
            for i in range(len(elec_p50_list))
        ]
        # Conservative net load upper bound: high load (p90) with low renewables (p10)
        net_elec_p90 = [
            round(max(0.0, elec_p90_list[i] - (wind_p10_list[i] + solar_p10_list[i])), 1)
            for i in range(len(elec_p90_list))
        ]
        # Favorable net load lower bound: low load (p10) with high renewables (p90)
        net_elec_p10 = [
            round(max(0.0, elec_p10_list[i] - (wind_p90_list[i] + solar_p90_list[i])), 1)
            for i in range(len(elec_p10_list))
        ]

        return {
            # Backward-compatible keys (p50 median values for existing UI charts)
            "horizon": h_clean,
            "hours": labels,
            "timestamps": timestamps,
            "electrical_kwe": elec_p50_list,
            "thermal_kwth": therm_p50_list,
            "wind_available_kw": wind_p50_list,
            "solar_available_kw": solar_p50_list,
            "net_electrical_kwe": net_elec_p50,

            # Full Quantile Bands
            "electrical_kwe_p10": elec_p10_list,
            "electrical_kwe_p50": elec_p50_list,
            "electrical_kwe_p90": elec_p90_list,

            "thermal_kwth_p10": therm_p10_list,
            "thermal_kwth_p50": therm_p50_list,
            "thermal_kwth_p90": therm_p90_list,

            "wind_kw_p10": wind_p10_list,
            "wind_kw_p50": wind_p50_list,
            "wind_kw_p90": wind_p90_list,

            "solar_kw_p10": solar_p10_list,
            "solar_kw_p50": solar_p50_list,
            "solar_kw_p90": solar_p90_list,

            "net_electrical_p10": net_elec_p10,
            "net_electrical_p50": net_elec_p50,
            "net_electrical_p90": net_elec_p90,

            # Canonical records for downstream MILP and monitoring
            "quantile_records": quantile_records
        }

    def predict_24h(self, telemetry: Dict[str, Any]) -> Dict[str, Any]:
        """Backward-compatible helper for 24-hour horizon"""
        return self.predict_horizon(telemetry, "24 Hours")
