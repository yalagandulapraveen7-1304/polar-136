"""
PolarOPS - Asset Health, Degradation & Multi-Variate Anomaly Detection (Phase 8)
Physics-grounded degradation physics + Machine Learning Anomaly Detection:
- Genset mechanical wear, wet-stacking soot index, injector fouling detection.
- BESS State-of-Health (SoH) fade, equivalent full cycles (EFC), sub-zero freeze damage.
- Wind turbine aerodynamic fatigue accumulation & blade icing detection.
- Multi-variate Isolation Forest anomaly detection across polar sensor telemetry.
"""
import math
import datetime
from typing import Dict, Any, List, Optional, Tuple
import numpy as np

try:
    from sklearn.ensemble import IsolationForest
except (ImportError, OSError):
    IsolationForest = None


class GensetHealthModel:
    """
    Monitors diesel generator running hours, wet-stacking soot index,
    and specific fuel oil consumption (SFOC) anomalous deviation.
    """
    def __init__(self, generator_id: str, rated_kw: float, initial_runtime_hours: float = 1250.0):
        self.generator_id = generator_id
        self.rated_kw = rated_kw
        self.runtime_hours = initial_runtime_hours
        self.overhaul_interval_hours = 8000.0
        self.soot_deposit_index = 0.05  # 0.0 (clean) to 1.0 (severe wet-stacking)
        self.base_sfoc = 0.26

    def update(
        self,
        dt_seconds: float,
        power_output_kw: float,
        fuel_burn_lh: float,
        has_fault: bool
    ) -> Dict[str, Any]:
        is_running = power_output_kw > 1.0
        if is_running:
            self.runtime_hours += dt_seconds / 3600.0
            load_ratio = power_output_kw / self.rated_kw

            # Wet-stacking dynamics
            if load_ratio < 0.30:
                # Soot deposition accumulates at low loads
                self.soot_deposit_index = min(1.0, self.soot_deposit_index + 0.0002 * (dt_seconds / 60.0))
            elif load_ratio >= 0.70:
                # High exhaust temperatures burn off deposits
                self.soot_deposit_index = max(0.0, self.soot_deposit_index - 0.0005 * (dt_seconds / 60.0))

            # SFOC drift check (fouled injectors / turbocharger degradation)
            observed_sfoc = fuel_burn_lh / max(1.0, power_output_kw)
            sfoc_deviation_pct = max(0.0, (observed_sfoc - self.base_sfoc) / self.base_sfoc * 100.0)
        else:
            sfoc_deviation_pct = 0.0

        # Health Calculation:
        # Runtime deduction: 15% across 8000 hours
        runtime_penalty = (self.runtime_hours / self.overhaul_interval_hours) * 15.0
        soot_penalty = self.soot_deposit_index * 25.0
        sfoc_penalty = min(20.0, sfoc_deviation_pct * 0.5)

        if has_fault:
            health_pct = 0.0
            status = "FAULT_TRIPPED"
        else:
            health_pct = max(10.0, min(100.0, 100.0 - runtime_penalty - soot_penalty - sfoc_penalty))
            if self.runtime_hours >= self.overhaul_interval_hours:
                status = "OVERHAUL_DUE"
            elif self.soot_deposit_index > 0.40:
                status = "WET_STACKING_RISK"
            elif is_running:
                status = "RUNNING"
            else:
                status = "WARM_STANDBY"

        return {
            "generator_id": self.generator_id,
            "health_pct": round(health_pct, 1),
            "status": status,
            "runtime_hours": round(self.runtime_hours, 1),
            "soot_deposit_index": round(self.soot_deposit_index, 3),
            "overhaul_due_hours": round(max(0.0, self.overhaul_interval_hours - self.runtime_hours), 1)
        }


class BatteryHealthModel:
    """
    Monitors LiFePO4 battery pack State-of-Health (SoH).
    Models Equivalent Full Cycles (EFC), Coulombic degradation, and sub-zero freeze event penalties.
    """
    def __init__(self, capacity_kwh: float = 350.0, initial_soh_pct: float = 96.5):
        self.capacity_kwh = capacity_kwh
        self.soh_pct = initial_soh_pct
        self.cumulative_throughput_kwh = 14500.0  # Historical base
        self.rated_cycle_life = 4500.0  # 4500 cycles to 80% SoH
        self.freeze_discharge_events = 0

    def update(
        self,
        dt_seconds: float,
        p_charge_kw: float,
        p_discharge_kw: float,
        cell_temp_c: float,
        heater_fault: bool
    ) -> Dict[str, Any]:
        throughput_step = (p_charge_kw + p_discharge_kw) * (dt_seconds / 3600.0)
        self.cumulative_throughput_kwh += throughput_step

        # Equivalent Full Cycles (EFC) = Throughput / (2 * Capacity)
        efc = self.cumulative_throughput_kwh / (2.0 * self.capacity_kwh)

        # Freeze discharge penalty: discharging below -20°C damages crystal lattice
        if cell_temp_c < -20.0 and p_discharge_kw > 2.0:
            self.freeze_discharge_events += 1
            freeze_penalty = 0.001 * (dt_seconds / 60.0)
        else:
            freeze_penalty = 0.0

        # Cycle aging: 20% fade across 4500 rated cycles
        fade_step = (throughput_step / (2.0 * self.capacity_kwh)) * (20.0 / self.rated_cycle_life)
        self.soh_pct = max(60.0, min(100.0, self.soh_pct - fade_step - freeze_penalty))

        # Status determination
        if heater_fault:
            status = "HEATER_FAULT"
        elif cell_temp_c <= -35.0:
            status = "FREEZE_LOCKED_OUT"
        elif cell_temp_c < 0.0:
            status = "SUBZERO_DERATED"
        elif self.soh_pct < 80.0:
            status = "REPLACEMENT_RECOMMENDED"
        else:
            status = "NOMINAL"

        return {
            "soh_pct": round(self.soh_pct, 2),
            "status": status,
            "equivalent_full_cycles": round(efc, 1),
            "cumulative_throughput_kwh": round(self.cumulative_throughput_kwh, 1),
            "freeze_discharge_events": self.freeze_discharge_events
        }


class WindTurbineHealthModel:
    """
    Monitors polar wind turbine aerodynamic fatigue, katabatic storm damage,
    and detects blade icing buildup.
    """
    def __init__(self, rated_kw: float = 100.0, initial_fatigue_index: float = 0.08):
        self.rated_kw = rated_kw
        self.fatigue_index = initial_fatigue_index  # 0.0 (mint) to 1.0 (fatigued)
        self.icing_risk_score = 0.0

    def update(
        self,
        dt_seconds: float,
        wind_speed_ms: float,
        power_output_kw: float,
        ambient_temp_c: float
    ) -> Dict[str, Any]:
        # Fatigue accumulation: high turbulence katabatic winds (> 18 m/s) stress rotor root
        if wind_speed_ms > 18.0:
            stress_factor = ((wind_speed_ms - 18.0) / 10.0) ** 2
            self.fatigue_index = min(1.0, self.fatigue_index + stress_factor * 0.0001 * (dt_seconds / 60.0))

        # Blade Icing Detection:
        # Conditions: Temp < -5°C, high wind speed, but output is significantly below expected power curve
        if ambient_temp_c < -5.0 and 6.0 <= wind_speed_ms <= 22.0:
            expected_power = min(self.rated_kw, self.rated_kw * ((wind_speed_ms - 3.2) / 8.8) ** 3)
            if power_output_kw < 0.40 * expected_power:
                # Aerodynamic stalling caused by ice rime on leading edge
                self.icing_risk_score = min(1.0, self.icing_risk_score + 0.02 * (dt_seconds / 60.0))
            else:
                self.icing_risk_score = max(0.0, self.icing_risk_score - 0.01 * (dt_seconds / 60.0))
        else:
            self.icing_risk_score = max(0.0, self.icing_risk_score - 0.005 * (dt_seconds / 60.0))

        health_pct = max(15.0, min(100.0, 100.0 - (self.fatigue_index * 30.0) - (self.icing_risk_score * 40.0)))

        if wind_speed_ms > 25.0:
            status = "FEATHERED_BRAKED"
        elif self.icing_risk_score > 0.45:
            status = "BLADE_ICING_RISK"
        elif self.fatigue_index > 0.70:
            status = "FATIGUE_INSPECT"
        else:
            status = "GENERATING"

        return {
            "health_pct": round(health_pct, 1),
            "status": status,
            "fatigue_index": round(self.fatigue_index, 3),
            "icing_risk_score": round(self.icing_risk_score, 2)
        }


class IsolationForestAnomalyDetector:
    """
    Multi-variate non-linear anomaly detection using Scikit-Learn Isolation Forest.
    Detects subtle anomalies across electrical, thermal, and mechanical signals before hard trip alarms.
    """
    def __init__(self, n_estimators: int = 35):
        self.model: Optional[Any] = None
        self.is_fitted = False
        self._init_and_fit(n_estimators)

    def _init_and_fit(self, n_estimators: int):
        if IsolationForest is None:
            return

        try:
            np.random.seed(42)
            n_samples = 1200
            # Features: [temp_c, wind_ms, solar_wm2, load_elec, p_diesel, p_wind, batt_soc]
            temps = np.random.uniform(-45.0, 0.0, n_samples)
            winds = np.random.uniform(2.0, 22.0, n_samples)
            solars = np.maximum(0.0, np.random.uniform(-50.0, 350.0, n_samples))
            loads = 45.0 + 8.0 * np.sin(np.random.uniform(0, 2*np.pi, n_samples)) + np.maximum(0, (-20 - temps)*0.3)
            p_diesel = np.maximum(0.0, loads - winds * 1.5)
            p_wind = np.clip(winds * 2.5, 0.0, 80.0)
            soc = np.random.uniform(30.0, 95.0, n_samples)

            X_nominal = np.column_stack([temps, winds, solars, loads, p_diesel, p_wind, soc])

            self.model = IsolationForest(
                n_estimators=n_estimators,
                contamination=0.03,
                random_state=42
            )
            self.model.fit(X_nominal)
            self.is_fitted = True
        except Exception:
            self.model = None
            self.is_fitted = False

    def score(self, feature_vector: np.ndarray) -> Tuple[float, str]:
        """
        Computes anomaly score between 0.0 (nominal) and 1.0 (highly anomalous).
        Returns: (anomaly_score, status_label)
        """
        if not self.is_fitted or self.model is None:
            return 0.05, "NOMINAL"

        try:
            raw_score = float(self.model.decision_function(feature_vector.reshape(1, -1))[0])
            # raw_score is positive for inliers, negative for outliers
            # Transform to [0, 1] anomaly index where 1 is anomalous
            anomaly_score = float(np.clip(0.5 - raw_score * 2.0, 0.0, 1.0))
            status = "ANOMALOUS_DRIFT" if anomaly_score > 0.65 else ("SUSPECT" if anomaly_score > 0.45 else "NOMINAL")
            return round(anomaly_score, 3), status
        except Exception:
            return 0.05, "NOMINAL"


class AssetHealthSupervisor:
    """
    Central Coordinator for Microgrid Asset Health & Anomaly Detection.
    Maintains component health state and feeds hardware_health to main application.
    """
    def __init__(self, station_id: str = "BHARATI"):
        self.station_id = station_id
        self.gen1 = GensetHealthModel("GEN-1", rated_kw=120.0, initial_runtime_hours=1450.0)
        self.gen2 = GensetHealthModel("GEN-2", rated_kw=120.0, initial_runtime_hours=420.0)
        self.bess = BatteryHealthModel(capacity_kwh=350.0, initial_soh_pct=97.2)
        self.wind = WindTurbineHealthModel(rated_kw=100.0, initial_fatigue_index=0.06)
        self.anomaly_detector = IsolationForestAnomalyDetector()

    def evaluate(
        self,
        dt_seconds: float,
        telemetry: Dict[str, Any],
        safe_dispatch: Dict[str, Any]
    ) -> Dict[str, Any]:
        p_g1 = safe_dispatch.get("p_diesel_1_kw", 0.0)
        p_g2 = safe_dispatch.get("p_diesel_2_kw", 0.0)
        burn_lh = safe_dispatch.get("fuel_rate_liters_per_hour", 0.0)
        p_wind = safe_dispatch.get("p_wind_kw", 0.0)
        p_chg = safe_dispatch.get("p_battery_charge_kw", 0.0)
        p_dis = safe_dispatch.get("p_battery_discharge_kw", 0.0)
        derating = safe_dispatch.get("battery_derating_factor", 1.0)

        t_amb = float(telemetry.get("ambient_temp_c", -20.0))
        wind_ms = float(telemetry.get("wind_speed_ms", 10.0))
        solar_wm2 = float(telemetry.get("solar_irradiance_wm2", 0.0))
        t_batt = float(telemetry.get("battery_temp_c", -5.0))
        soc = float(telemetry.get("battery_soc_pct", 75.0))
        g1_fault = bool(telemetry.get("genset_1_fault", False))
        g2_fault = bool(telemetry.get("genset_2_fault", False))
        heater_fault = bool(telemetry.get("battery_heater_fault", False))
        load_e = float(telemetry.get("station_load_kwe", 45.0))

        # Update components
        h_g1 = self.gen1.update(dt_seconds, p_g1, burn_lh * 0.7 if p_g1 > 0 else 0.0, g1_fault)
        h_g2 = self.gen2.update(dt_seconds, p_g2, burn_lh * 0.3 if p_g2 > 0 else 0.0, g2_fault)
        h_bess = self.bess.update(dt_seconds, p_chg, p_dis, t_batt, heater_fault)
        h_wind = self.wind.update(dt_seconds, wind_ms, p_wind, t_amb)

        # Multi-variate anomaly score
        feats = np.array([t_amb, wind_ms, solar_wm2, load_e, p_g1 + p_g2, p_wind, soc])
        anomaly_score, anomaly_status = self.anomaly_detector.score(feats)

        # Backward-compatible hardware_health dictionary
        hardware_health = {
            "genset_1_health_pct": int(h_g1["health_pct"]),
            "genset_1_status": h_g1["status"],
            "genset_2_health_pct": int(h_g2["health_pct"]),
            "genset_2_status": h_g2["status"],
            "wind_turbine_health_pct": int(h_wind["health_pct"]),
            "wind_turbine_status": h_wind["status"],
            "bess_thermal_health_pct": int(h_bess["soh_pct"]),
            "bess_status": h_bess["status"],
            "multivariate_anomaly_score": anomaly_score,
            "multivariate_anomaly_status": anomaly_status
        }

        return {
            "hardware_health": hardware_health,
            "details": {
                "genset_1": h_g1,
                "genset_2": h_g2,
                "bess": h_bess,
                "wind_turbine": h_wind,
                "anomaly": {
                    "score": anomaly_score,
                    "status": anomaly_status
                }
            }
        }
