"""
PolarOPS - Deterministic Safety Guardrail & Policy Enforcement Layer (Phase 6 & 7)
Integrates:
- PolarPolicyEngine: Explicit HARD, SOFT, and OBJECTIVE multi-tier constraint evaluations.
- Hierarchical Emergency Load Shedding (Tier 3 -> Tier 2 -> NEVER Tier 1).
- Canonical EventAlarmRecord emission and deterministic overrides.
- 100% backward-compatible with legacy main.py consumers.
"""
import time
from typing import Dict, Any, List
from backend.policy.constraint_engine import (
    PolarPolicyEngine,
    PolicyEvaluationResult,
    ConstraintTier
)


class SafetyGuardrailEngine:
    """
    Backward-compatible wrapper around PolarPolicyEngine.
    Enforces physical station safety constraints and deterministic overrides.
    """
    def __init__(self):
        self.policy_engine = PolarPolicyEngine()
        self.last_eval_time = time.time()
        self.last_policy_result: PolicyEvaluationResult = None

    def update_clock(self, dt_seconds: float = 1.0):
        # Clock is updated during enforce_safety or explicitly
        pass

    @property
    def gen1_active(self) -> bool:
        return self.policy_engine.gen1_run_seconds > 0.0

    @property
    def gen2_active(self) -> bool:
        return self.policy_engine.gen2_run_seconds > 0.0

    @property
    def gen1_run_seconds(self) -> float:
        return self.policy_engine.gen1_run_seconds

    @property
    def gen2_run_seconds(self) -> float:
        return self.policy_engine.gen2_run_seconds

    def enforce_safety(self, telemetry: Dict[str, Any], optimizer_dispatch: Dict[str, Any]) -> Dict[str, Any]:
        """
        Deterministic safety check. Overrides optimizer setpoints if safety rules are violated.
        Returns safe dispatch setpoints and an audit trail of any interventions.
        """
        eval_result = self.policy_engine.evaluate_and_enforce(telemetry, optimizer_dispatch)
        self.last_policy_result = eval_result

        # Recalculate dispatch split with safe setpoints
        safe_dispatch = eval_result.safe_dispatch
        tot = (
            safe_dispatch.get("p_diesel_1_kw", 0.0) +
            safe_dispatch.get("p_diesel_2_kw", 0.0) +
            safe_dispatch.get("p_wind_kw", 0.0) +
            safe_dispatch.get("p_solar_kw", 0.0) +
            safe_dispatch.get("p_battery_discharge_kw", 0.0)
        )
        if tot > 0:
            safe_dispatch["dispatch_split"] = {
                "wind_pct": round((safe_dispatch.get("p_wind_kw", 0.0) / tot) * 100.0, 1),
                "solar_pct": round((safe_dispatch.get("p_solar_kw", 0.0) / tot) * 100.0, 1),
                "diesel_pct": round(((safe_dispatch.get("p_diesel_1_kw", 0.0) + safe_dispatch.get("p_diesel_2_kw", 0.0)) / tot) * 100.0, 1),
                "battery_pct": round((safe_dispatch.get("p_battery_discharge_kw", 0.0) / tot) * 100.0, 1)
            }

        safe_dispatch["p_battery_kw"] = round(safe_dispatch.get("p_battery_discharge_kw", 0.0) - safe_dispatch.get("p_battery_charge_kw", 0.0), 1)

        return {
            "is_overridden": eval_result.is_overridden,
            "interventions": eval_result.interventions,
            "safe_dispatch": safe_dispatch,
            "gen1_runtime_minutes": round(self.policy_engine.gen1_run_seconds / 60.0, 1),
            "gen2_runtime_minutes": round(self.policy_engine.gen2_run_seconds / 60.0, 1),
            "load_shedding_active": eval_result.load_shedding_active,
            "tier_3_shed_kw": eval_result.tier_3_shed_kw,
            "tier_2_shed_kw": eval_result.tier_2_shed_kw,
            "tier_1_shed_kw": 0.0,
            "alarms": [a.model_dump() for a in eval_result.alarms],
            "hard_violations_count": eval_result.hard_violations_count,
            "soft_violations_count": eval_result.soft_violations_count
        }
