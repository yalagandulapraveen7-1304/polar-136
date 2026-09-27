"""
PolarOPS - Champion / Challenger Model Governance & Self-Learning (Phase 10)
Provides:
1. Shadow evaluation pipeline: Challenger model runs concurrently in shadow mode.
2. Multi-criterion validation gate (pinball loss improvement, monotonicity compliance, non-negativity).
3. Safe atomic model promotion.
4. Instant rollback to golden baseline Champion if performance degrades.
"""
import datetime
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
from pydantic import BaseModel, Field


class ModelEvaluationCard(BaseModel):
    model_id: str
    role: str  # "CHAMPION" or "CHALLENGER"
    version: str
    pinball_loss_composite: float
    rmse: float
    monotonicity_compliance_pct: float
    non_negative_compliance_pct: float
    is_promotable: bool
    evaluation_notes: str


class ChampionChallengerSupervisor:
    """
    Manages safe promotion and shadow evaluation of AI forecasting models.
    Prevents unverified models from directly taking control of polar life-support microgrid dispatch.
    """
    def __init__(self):
        self.champion_id = "LGBM-QUANTILE-V1-BASE"
        self.challenger_id: Optional[str] = None
        self.champion_history: List[str] = [self.champion_id]
        self.active_role = "CHAMPION"

    def register_challenger(self, challenger_id: str):
        """Registers a newly trained model to enter shadow evaluation."""
        self.challenger_id = challenger_id

    def evaluate_models(
        self,
        y_true: np.ndarray,
        champ_preds: Dict[str, np.ndarray],  # {"p10": ..., "p50": ..., "p90": ...}
        chall_preds: Optional[Dict[str, np.ndarray]] = None
    ) -> Tuple[ModelEvaluationCard, Optional[ModelEvaluationCard]]:
        """
        Evaluates both models against identical ground-truth validation arrays.
        """
        def eval_card(m_id: str, role: str, preds: Dict[str, np.ndarray]) -> ModelEvaluationCard:
            p10 = preds["p10"]
            p50 = preds["p50"]
            p90 = preds["p90"]

            # 1. Monotonicity compliance: p10 <= p50 <= p90
            monotonic_count = np.sum((p10 <= p50 + 1e-4) & (p50 <= p90 + 1e-4))
            monotonic_pct = float(round((monotonic_count / len(y_true)) * 100.0, 2))

            # 2. Non-negativity compliance
            non_neg_count = np.sum((p10 >= -1e-4) & (p50 >= -1e-4) & (p90 >= -1e-4))
            non_neg_pct = float(round((non_neg_count / len(y_true)) * 100.0, 2))

            # 3. Pinball loss
            def pinball(y, p, q):
                d = y - p
                return float(np.mean(np.maximum(q * d, (q - 1.0) * d)))

            l10 = pinball(y_true, p10, 0.10)
            l50 = pinball(y_true, p50, 0.50)
            l90 = pinball(y_true, p90, 0.90)
            composite_loss = float(round((l10 + 2.0 * l50 + l90) / 4.0, 4))

            # 4. RMSE on median
            rmse = float(round(np.sqrt(np.mean((y_true - p50) ** 2)), 3))

            is_promotable = (monotonic_pct >= 99.9) and (non_neg_pct >= 99.9)

            return ModelEvaluationCard(
                model_id=m_id,
                role=role,
                version="1.0.0",
                pinball_loss_composite=composite_loss,
                rmse=rmse,
                monotonicity_compliance_pct=monotonic_pct,
                non_negative_compliance_pct=non_neg_pct,
                is_promotable=is_promotable,
                evaluation_notes=f"Evaluated on {len(y_true)} samples. Composite Pinball: {composite_loss:.3f}, RMSE: {rmse:.2f}."
            )

        champ_card = eval_card(self.champion_id, "CHAMPION", champ_preds)

        if chall_preds is not None and self.challenger_id is not None:
            chall_card = eval_card(self.challenger_id, "CHALLENGER", chall_preds)
            # Challenger must improve composite pinball loss by at least 2.5% and be 100% compliant
            improvement_pct = (champ_card.pinball_loss_composite - chall_card.pinball_loss_composite) / max(0.01, champ_card.pinball_loss_composite) * 100.0
            if improvement_pct < 2.5 or not chall_card.is_promotable:
                chall_card.is_promotable = False
                chall_card.evaluation_notes += f" Promotion denied: improvement was {improvement_pct:.1f}% (required >= 2.5%)."
            else:
                chall_card.is_promotable = True
                chall_card.evaluation_notes += f" Promotion approved: {improvement_pct:.1f}% improvement over Champion."
            return champ_card, chall_card

        return champ_card, None

    def promote_challenger(self, challenger_card: ModelEvaluationCard) -> Dict[str, Any]:
        """Promotes an approved challenger model to active Champion status."""
        if not challenger_card.is_promotable:
            return {
                "status": "REJECTED",
                "message": f"Challenger {challenger_card.model_id} does not meet promotion gates."
            }

        prev_champ = self.champion_id
        self.champion_id = challenger_card.model_id
        self.champion_history.append(self.champion_id)
        self.challenger_id = None

        return {
            "status": "PROMOTED",
            "previous_champion": prev_champ,
            "new_champion": self.champion_id,
            "promotion_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

    def rollback_to_previous_champion(self) -> Dict[str, Any]:
        """Rolls back to the prior stable Champion model if an anomaly is detected."""
        if len(self.champion_history) <= 1:
            return {"status": "NO_PREVIOUS_VERSION", "champion": self.champion_id}

        discarded = self.champion_history.pop()
        self.champion_id = self.champion_history[-1]

        return {
            "status": "ROLLED_BACK",
            "rolled_back_from": discarded,
            "active_champion": self.champion_id,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
