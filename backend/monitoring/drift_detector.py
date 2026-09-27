"""
PolarOPS - Model Performance Monitoring & Drift Detection (Phase 9)
Implements:
1. Population Stability Index (PSI) to detect statistical covariate shift in polar environments.
2. Residual error tracking: Mean Forecast Error (MFE / bias) and Root Mean Squared Error (RMSE).
3. Continuous Pinball Loss validation across quantile horizons.
"""
import math
import datetime
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
from pydantic import BaseModel, Field


def calculate_psi(reference: np.ndarray, current: np.ndarray, num_bins: int = 10) -> float:
    """
    Calculates the Population Stability Index (PSI) between a baseline reference distribution
    and a recently observed operational sample distribution.

    Interpretation:
    - PSI < 0.10: No significant distribution change (Model Stable).
    - 0.10 <= PSI < 0.25: Moderate distribution shift (Monitor Closely).
    - PSI >= 0.25: Significant covariate drift (Retraining Triggered).
    """
    if len(reference) == 0 or len(current) == 0:
        return 0.0

    # Scale bin count gracefully if operational sample is small
    effective_bins = min(num_bins, max(4, len(current) // 10))
    quantiles = np.linspace(0.0, 100.0, effective_bins + 1)
    bin_edges = np.unique(np.percentile(reference, quantiles))
    if len(bin_edges) < 2:
        return 0.0
    bin_edges[0] = -np.inf
    bin_edges[-1] = np.inf

    # Compute observed bin counts
    ref_counts, _ = np.histogram(reference, bins=bin_edges)
    curr_counts, _ = np.histogram(current, bins=bin_edges)

    # Convert to proportions with smoothing epsilon
    num_actual_bins = len(ref_counts)
    eps = 1e-5
    ref_props = (ref_counts + eps) / (len(reference) + eps * num_actual_bins)
    curr_props = (curr_counts + eps) / (len(current) + eps * num_actual_bins)

    # PSI = sum((Actual - Expected) * ln(Actual / Expected))
    psi_val = np.sum((curr_props - ref_props) * np.log(curr_props / ref_props))
    return float(round(max(0.0, psi_val), 4))


class DriftReport(BaseModel):
    timestamp_utc: datetime.datetime
    feature_psi: Dict[str, float]
    max_psi: float
    drift_detected: bool
    drift_severity: str  # "NONE", "MODERATE", "SIGNIFICANT"
    rolling_mfe: float
    rolling_rmse: float
    pinball_losses: Dict[str, float]
    recommendation: str


class ModelDriftMonitor:
    """
    Stateful monitor for LightGBM Quantile Forecasters.
    Maintains baseline reference distributions and continuously evaluates live streaming telemetry.
    """
    def __init__(self, buffer_size: int = 500):
        self.buffer_size = buffer_size
        self.baseline_distributions: Dict[str, np.ndarray] = {}
        self.operational_buffers: Dict[str, List[float]] = {
            "ambient_temp_c": [],
            "wind_speed_ms": [],
            "solar_irradiance_wm2": [],
            "station_load_kwe": []
        }
        self.forecast_errors: List[float] = []
        self.pinball_history: Dict[float, List[float]] = {0.10: [], 0.50: [], 0.90: []}
        self._init_baseline_distributions()

    def _init_baseline_distributions(self):
        """Pre-seeds baseline reference distribution (e.g. historical summer season baseline)."""
        np.random.seed(42)
        n = 1000
        self.baseline_distributions["ambient_temp_c"] = np.random.uniform(-35.0, -5.0, n)
        self.baseline_distributions["wind_speed_ms"] = np.random.weibull(2.0, n) * 11.0
        self.baseline_distributions["solar_irradiance_wm2"] = np.maximum(0.0, np.random.uniform(-20.0, 300.0, n))
        self.baseline_distributions["station_load_kwe"] = np.random.normal(50.0, 6.0, n)

    def ingest_observation(
        self,
        features: Dict[str, float],
        y_true: float,
        p10: float,
        p50: float,
        p90: float
    ):
        """Ingests 1 operational telemetry snapshot and associated forecast performance."""
        for feat_name, val in features.items():
            if feat_name in self.operational_buffers:
                self.operational_buffers[feat_name].append(val)
                if len(self.operational_buffers[feat_name]) > self.buffer_size:
                    self.operational_buffers[feat_name].pop(0)

        # Record forecast residuals (observed - predicted median)
        err = y_true - p50
        self.forecast_errors.append(err)
        if len(self.forecast_errors) > self.buffer_size:
            self.forecast_errors.pop(0)

        # Record Pinball Loss across quantiles
        for q, pred in [(0.10, p10), (0.50, p50), (0.90, p90)]:
            diff = y_true - pred
            loss = max(q * diff, (q - 1.0) * diff)
            self.pinball_history[q].append(loss)
            if len(self.pinball_history[q]) > self.buffer_size:
                self.pinball_history[q].pop(0)

    def evaluate_drift(self) -> DriftReport:
        """Computes comprehensive feature PSI and forecast accuracy drift report."""
        now = datetime.datetime.now(datetime.timezone.utc)
        feature_psi = {}
        max_psi = 0.0

        for feat_name, ref_arr in self.baseline_distributions.items():
            curr_vals = self.operational_buffers[feat_name]
            if len(curr_vals) >= 30:
                psi = calculate_psi(ref_arr, np.array(curr_vals))
            else:
                psi = 0.0
            feature_psi[feat_name] = psi
            if psi > max_psi:
                max_psi = psi

        # Residual metrics
        if len(self.forecast_errors) >= 10:
            err_arr = np.array(self.forecast_errors)
            mfe = float(np.mean(err_arr))
            rmse = float(np.sqrt(np.mean(err_arr ** 2)))
        else:
            mfe = 0.0
            rmse = 1.5

        # Pinball loss averages
        avg_losses = {}
        for q in [0.10, 0.50, 0.90]:
            if len(self.pinball_history[q]) >= 10:
                avg_losses[f"p{int(q*100)}"] = round(float(np.mean(self.pinball_history[q])), 3)
            else:
                avg_losses[f"p{int(q*100)}"] = 0.85

        if max_psi >= 0.25 or rmse > 10.0:
            severity = "SIGNIFICANT"
            recommendation = "RETRAIN_RECOMMENDED"
            drift_detected = True
        elif max_psi >= 0.10 or rmse > 6.0:
            severity = "MODERATE"
            recommendation = "MONITOR_CLOSELY"
            drift_detected = False
        else:
            severity = "NONE"
            recommendation = "MODEL_STABLE"
            drift_detected = False

        return DriftReport(
            timestamp_utc=now,
            feature_psi=feature_psi,
            max_psi=round(max_psi, 4),
            drift_detected=drift_detected,
            drift_severity=severity,
            rolling_mfe=round(mfe, 3),
            rolling_rmse=round(rmse, 3),
            pinball_losses=avg_losses,
            recommendation=recommendation
        )
