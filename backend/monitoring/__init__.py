"""
PolarOPS - Model Monitoring, Drift Detection & Self-Learning Package (Phase 9 & 10)
Provides:
1. Population Stability Index (PSI) feature drift monitoring.
2. Residual error tracking (MFE, RMSE, Pinball loss).
3. Champion / Challenger shadow evaluation and gated promotion governance.
"""
from backend.monitoring.drift_detector import (
    calculate_psi,
    ModelDriftMonitor,
    DriftReport
)
from backend.monitoring.champion_challenger import (
    ChampionChallengerSupervisor,
    ModelEvaluationCard
)

__all__ = [
    "calculate_psi",
    "ModelDriftMonitor",
    "DriftReport",
    "ChampionChallengerSupervisor",
    "ModelEvaluationCard"
]
