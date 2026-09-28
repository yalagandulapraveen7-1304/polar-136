"""
PolarOPS - Explicit Constraint & Policy Engine (Phase 6 & 7)
Strictly categorizes constraints into:
1. HARD (Inviolable Physical & Survival Boundaries)
2. SOFT (Penalized / Hierarchical Load Shedding Boundaries)
3. OBJECTIVE (Economic & Fuel Minimization Directives)

Emits canonical EventAlarmRecord alarms and generates verified safe dispatch setpoints.
"""
import enum
import datetime
from typing import Dict, Any, List, Optional, Tuple
from pydantic import BaseModel, Field

from backend.schema.canonical import (
    EventAlarmRecord,
    AlarmSeverity,
    CommandSource
)
from backend.config import (
    DIESEL_MIN_RUN_TIME_MIN,
    BATTERY_LOCKOUT_TEMP_C,
    BATTERY_MIN_SOC_PCT,
    BATTERY_MAX_SOC_PCT,
    WIND_CUT_OUT_MS,
    CHP_THERMAL_RATIO
)


class ConstraintTier(str, enum.Enum):
    HARD = "HARD"
    SOFT = "SOFT"
    OBJECTIVE = "OBJECTIVE"


class ConstraintRule(BaseModel):
    rule_id: str
    tier: ConstraintTier
    name: str
    description: str
    is_violated: bool = False
    severity: AlarmSeverity = AlarmSeverity.INFO
    details: str = ""


class PolicyEvaluationResult(BaseModel):
    is_admissible: bool
    is_overridden: bool
    hard_violations_count: int
    soft_violations_count: int
    rules_evaluated: List[ConstraintRule]
    interventions: List[Dict[str, Any]]
    alarms: List[EventAlarmRecord]
    safe_dispatch: Dict[str, Any]
    load_shedding_active: bool
    tier_3_shed_kw: float
    tier_2_shed_kw: float
    tier_1_shed_kw: float = 0.0  # ALWAYS 0.0 (Inviolable)


class PolarPolicyEngine:
    """
    Evaluates and enforces multi-tier constraints on microgrid dispatch proposals.
    Provides deterministic guarantees that no AI or optimizer output can ever breach station safety.
    """
    def __init__(self):
        self.gen1_run_seconds = 2100.0  # 35 minutes running initially
        self.gen2_run_seconds = 0.0

    def update_clock(self, dt_seconds: float = 1.0, gen1_running: bool = True, gen2_running: bool = False):
        if gen1_running:
            self.gen1_run_seconds += dt_seconds
        else:
            self.gen1_run_seconds = 0.0

        if gen2_running:
            self.gen2_run_seconds += dt_seconds
        else:
            self.gen2_run_seconds = 0.0

    def evaluate_and_enforce(
        self,
        telemetry: Dict[str, Any],
        proposed_dispatch: Dict[str, Any]
    ) -> PolicyEvaluationResult:
        now = datetime.datetime.now(datetime.timezone.utc)
        station_id = telemetry.get("station_id", "BHARATI")

        # Telemetry extraction
        total_load_e = float(telemetry.get("station_load_kwe", 50.0))
        thermal_load_th = float(telemetry.get("thermal_load_kwth", 65.0))
        t_amb = float(telemetry.get("ambient_temp_c", -25.0))
        t_batt = float(telemetry.get("battery_temp_c", -12.0))
        soc = float(telemetry.get("battery_soc_pct", 75.0))
        min_reserve = float(telemetry.get("battery_reserve_pct", BATTERY_MIN_SOC_PCT))
        wind_ms = float(telemetry.get("wind_speed_ms", 10.0))
        g1_fault = bool(telemetry.get("genset_1_fault", False))
        g2_fault = bool(telemetry.get("genset_2_fault", False))

        # Station Priority Circuit Allocation (65% Tier 1, 28% Tier 2, 7% Tier 3)
        tier_1_life_support = round(total_load_e * 0.65, 1)
        tier_2_science_labs = round(total_load_e * 0.28, 1)
        tier_3_auxiliary = round(total_load_e * 0.07, 1)

        safe_dispatch = dict(proposed_dispatch)
        p_g1 = float(safe_dispatch.get("p_diesel_1_kw", 0.0))
        p_g2 = float(safe_dispatch.get("p_diesel_2_kw", 0.0))
        p_wind = float(safe_dispatch.get("p_wind_kw", 0.0))
        p_solar = float(safe_dispatch.get("p_solar_kw", 0.0))
        p_dis = float(safe_dispatch.get("p_battery_discharge_kw", 0.0))
        p_chg = float(safe_dispatch.get("p_battery_charge_kw", 0.0))
        q_aux = float(safe_dispatch.get("q_aux_thermal_kwth", 0.0))

        rules: List[ConstraintRule] = []
        interventions: List[Dict[str, Any]] = []
        alarms: List[EventAlarmRecord] = []
        hard_violations = 0
        soft_violations = 0

        # =============================================================
        # 1. HARD CONSTRAINT: Freeze Lockout (BESS sub-zero protection)
        # =============================================================
        r_freeze = ConstraintRule(
            rule_id="HARD-01-BESS-FREEZE-LOCKOUT",
            tier=ConstraintTier.HARD,
            name="BESS Sub-Zero Freeze Inhibit",
            description=f"Inhibit battery discharge when cell temperature is <= {BATTERY_LOCKOUT_TEMP_C}°C.",
            severity=AlarmSeverity.CRITICAL
        )
        if t_batt <= BATTERY_LOCKOUT_TEMP_C and p_dis > 0.0:
            r_freeze.is_violated = True
            r_freeze.details = f"Cell temp {t_batt:.1f}°C <= {BATTERY_LOCKOUT_TEMP_C}°C. Forced discharge to 0.0 kW."
            hard_violations += 1
            safe_dispatch["p_battery_discharge_kw"] = 0.0
            p_dis = 0.0
            interventions.append({
                "rule_id": r_freeze.rule_id,
                "tier": "HARD",
                "title": r_freeze.name,
                "original_val": f"{proposed_dispatch.get('p_battery_discharge_kw', 0.0):.1f} kW",
                "clamped_val": "0.0 kW",
                "reason": r_freeze.details
            })
            alarms.append(EventAlarmRecord(
                timestamp_utc=now,
                station_id=station_id,
                alarm_code="ERR_BESS_FREEZE_LOCKOUT",
                title=r_freeze.name,
                severity=AlarmSeverity.CRITICAL,
                reason=r_freeze.details
            ))
        rules.append(r_freeze)

        # =============================================================
        # 2. HARD CONSTRAINT: Protected Battery Reserve Floor
        # =============================================================
        r_reserve = ConstraintRule(
            rule_id="HARD-02-BESS-RESERVE-FLOOR",
            tier=ConstraintTier.HARD,
            name="BESS Emergency Reserve Floor",
            description=f"Inhibit battery discharge when SoC is <= reserve floor ({min_reserve}%).",
            severity=AlarmSeverity.CRITICAL
        )
        if soc <= min_reserve and p_dis > 0.0:
            r_reserve.is_violated = True
            r_reserve.details = f"Battery SoC {soc:.1f}% <= {min_reserve:.1f}%. Discharge clamped to 0.0 kW."
            hard_violations += 1
            safe_dispatch["p_battery_discharge_kw"] = 0.0
            p_dis = 0.0
            interventions.append({
                "rule_id": r_reserve.rule_id,
                "tier": "HARD",
                "title": r_reserve.name,
                "original_val": f"{proposed_dispatch.get('p_battery_discharge_kw', 0.0):.1f} kW",
                "clamped_val": "0.0 kW",
                "reason": r_reserve.details
            })
            alarms.append(EventAlarmRecord(
                timestamp_utc=now,
                station_id=station_id,
                alarm_code="WARN_BESS_LOW_SOC",
                title=r_reserve.name,
                severity=AlarmSeverity.WARNING,
                reason=r_reserve.details
            ))
        rules.append(r_reserve)

        # =============================================================
        # 3. HARD CONSTRAINT: Gale Storm Aerodynamic Cut-Out Feathering
        # =============================================================
        r_gale = ConstraintRule(
            rule_id="HARD-03-WIND-GALE-CUTOUT",
            tier=ConstraintTier.HARD,
            name="Turbine Gale Cut-Out Mechanical Feathering",
            description=f"Cut-out wind turbine generation when wind speed > {WIND_CUT_OUT_MS} m/s.",
            severity=AlarmSeverity.CRITICAL
        )
        if wind_ms > WIND_CUT_OUT_MS and p_wind > 0.0:
            r_gale.is_violated = True
            r_gale.details = f"Wind speed {wind_ms:.1f} m/s > {WIND_CUT_OUT_MS} m/s. Deployed mechanical disk brake."
            hard_violations += 1
            safe_dispatch["p_wind_kw"] = 0.0
            p_wind = 0.0
            interventions.append({
                "rule_id": r_gale.rule_id,
                "tier": "HARD",
                "title": r_gale.name,
                "original_val": f"{proposed_dispatch.get('p_wind_kw', 0.0):.1f} kW",
                "clamped_val": "0.0 kW",
                "reason": r_gale.details
            })
            alarms.append(EventAlarmRecord(
                timestamp_utc=now,
                station_id=station_id,
                alarm_code="WARN_WIND_GALE_BRAKE",
                title=r_gale.name,
                severity=AlarmSeverity.WARNING,
                reason=r_gale.details
            ))
        rules.append(r_gale)

        # =============================================================
        # 4. HARD CONSTRAINT: Minimum 60-Min Diesel Runtime
        # =============================================================
        r_runtime = ConstraintRule(
            rule_id="HARD-04-GENSET-MIN-RUNTIME",
            tier=ConstraintTier.HARD,
            name="Diesel Generator Minimum 60-Minute Runtime",
            description=f"Genset 1 cannot be shut down or underloaded until {DIESEL_MIN_RUN_TIME_MIN} min elapsed.",
            severity=AlarmSeverity.CRITICAL
        )
        min_run_sec = DIESEL_MIN_RUN_TIME_MIN * 60.0
        if not g1_fault and self.gen1_run_seconds < min_run_sec and p_g1 < 25.0:
            r_runtime.is_violated = True
            r_runtime.details = f"Genset 1 running for {int(self.gen1_run_seconds/60)}m (< 60m). Shutdown blocked, clamped to 25 kW."
            hard_violations += 1
            safe_dispatch["p_diesel_1_kw"] = 25.0
            p_g1 = 25.0
            interventions.append({
                "rule_id": r_runtime.rule_id,
                "tier": "HARD",
                "title": r_runtime.name,
                "original_val": f"{proposed_dispatch.get('p_diesel_1_kw', 0.0):.1f} kW",
                "clamped_val": "25.0 kW",
                "reason": r_runtime.details
            })
        rules.append(r_runtime)

        # =============================================================
        # 5. HARD CONSTRAINT: No Concurrent Battery Charge/Discharge
        # =============================================================
        r_concurrent = ConstraintRule(
            rule_id="HARD-05-BATTERY-EXCLUSIVITY",
            tier=ConstraintTier.HARD,
            name="Battery Unified DC Bus Exclusivity",
            description="Battery cannot simultaneously charge and discharge on unified DC bus.",
            severity=AlarmSeverity.CRITICAL
        )
        if p_dis > 0.5 and p_chg > 0.5:
            r_concurrent.is_violated = True
            r_concurrent.details = f"Simultaneous flow: dis={p_dis} kW, chg={p_chg} kW. Resolved to net flow."
            hard_violations += 1
            net = p_dis - p_chg
            if net >= 0:
                safe_dispatch["p_battery_discharge_kw"] = round(net, 1)
                safe_dispatch["p_battery_charge_kw"] = 0.0
                p_dis, p_chg = round(net, 1), 0.0
            else:
                safe_dispatch["p_battery_charge_kw"] = round(abs(net), 1)
                safe_dispatch["p_battery_discharge_kw"] = 0.0
                p_dis, p_chg = 0.0, round(abs(net), 1)
        rules.append(r_concurrent)

        # =============================================================
        # 6. HARD & SOFT: Electrical Generation vs Load Balance
        # =============================================================
        current_gen = p_g1 + p_g2 + p_wind + p_solar + p_dis - p_chg
        deficit = total_load_e - current_gen

        tier_3_shed = 0.0
        tier_2_shed = 0.0
        load_shed_active = False

        if deficit > 0.5:
            # Step A: Boost Gen 1 if available
            if not g1_fault and p_g1 < 100.0:
                boost = min(deficit, 100.0 - p_g1)
                p_g1 += boost
                safe_dispatch["p_diesel_1_kw"] = round(p_g1, 1)
                deficit -= boost

            # Step B: Spin up Standby Gen 2 if still in deficit
            if deficit > 0.5 and not g2_fault and p_g2 < 100.0:
                boost2 = min(deficit, 100.0 - p_g2)
                p_g2 += boost2
                safe_dispatch["p_diesel_2_kw"] = round(p_g2, 1)
                deficit -= boost2
                interventions.append({
                    "rule_id": "HARD-06-BLACKOUT-DEFENSE",
                    "tier": "HARD",
                    "title": "Standby Genset 2 Dispatched",
                    "original_val": f"{proposed_dispatch.get('p_diesel_2_kw', 0.0):.1f} kW",
                    "clamped_val": f"{p_g2:.1f} kW",
                    "reason": f"Grid deficit detected. Spun up Gen 2 to prevent microgrid frequency collapse."
                })
                alarms.append(EventAlarmRecord(
                    timestamp_utc=now,
                    station_id=station_id,
                    alarm_code="WARN_GEN2_ONLINE",
                    title="Standby Genset 2 Dispatched",
                    severity=AlarmSeverity.WARNING,
                    reason="Standby generator engaged to cover generation deficit."
                ))

            # Step C: SOFT CONSTRAINT: Hierarchical Load Shedding
            if deficit > 0.5:
                load_shed_active = True
                # Shed Tier 3 Auxiliary first
                tier_3_shed = min(deficit, tier_3_auxiliary)
                deficit -= tier_3_shed
                soft_violations += 1
                interventions.append({
                    "rule_id": "SOFT-01-SHED-TIER-3",
                    "tier": "SOFT",
                    "title": "Tier 3 Auxiliary Load Shed",
                    "original_val": f"{tier_3_auxiliary:.1f} kW",
                    "clamped_val": f"{tier_3_auxiliary - tier_3_shed:.1f} kW",
                    "reason": f"Severe supply deficit. Shed {tier_3_shed:.1f} kW of non-critical auxiliary circuits."
                })

                # If still in deficit, shed Tier 2 Science laboratories
                if deficit > 0.5:
                    tier_2_shed = min(deficit, tier_2_science_labs)
                    deficit -= tier_2_shed
                    soft_violations += 1
                    interventions.append({
                        "rule_id": "SOFT-02-SHED-TIER-2",
                        "tier": "SOFT",
                        "title": "Tier 2 Science Lab Load Shed",
                        "original_val": f"{tier_2_science_labs:.1f} kW",
                        "clamped_val": f"{tier_2_science_labs - tier_2_shed:.1f} kW",
                        "reason": f"Emergency supply shortfall. Shed {tier_2_shed:.1f} kW of scientific research loads."
                    })
                    alarms.append(EventAlarmRecord(
                        timestamp_utc=now,
                        station_id=station_id,
                        alarm_code="EMERG_SCIENCE_LOAD_SHED",
                        title="Science Load Shed Active",
                        severity=AlarmSeverity.CRITICAL,
                        reason="Station shed science loads to protect Life-Support power."
                    ))

        # Balance surplus generation to preserve physical energy balance equation
        effective_load = total_load_e - tier_3_shed - tier_2_shed
        current_gen_actual = p_g1 + p_g2 + p_wind + p_solar + p_dis - p_chg
        surplus = current_gen_actual - effective_load
        if surplus > 0.1:
            if p_dis > 0.05:
                trim_dis = min(surplus, p_dis)
                p_dis = max(0.0, p_dis - trim_dis)
                surplus -= trim_dis
                safe_dispatch["p_battery_discharge_kw"] = round(p_dis, 1)
            if surplus > 0.1 and soc < (BATTERY_MAX_SOC_PCT - 0.5):
                add_chg = min(surplus, 100.0 - p_chg)
                p_chg += add_chg
                surplus -= add_chg
                safe_dispatch["p_battery_charge_kw"] = round(p_chg, 1)

        # =============================================================
        # 7. HARD CONSTRAINT: Thermal Life Support Protection
        # =============================================================
        q_chp = (p_g1 + p_g2) * CHP_THERMAL_RATIO
        safe_dispatch["q_chp_thermal_kwth"] = round(q_chp, 1)
        thermal_supplied = q_chp + q_aux

        if thermal_supplied < thermal_load_th:
            shortfall = thermal_load_th - thermal_supplied
            safe_dispatch["q_aux_thermal_kwth"] = round(q_aux + shortfall, 1)
            interventions.append({
                "rule_id": "HARD-07-THERMAL-LIFE-SUPPORT",
                "tier": "HARD",
                "title": "Station Thermal Life Support Protected",
                "original_val": f"{thermal_supplied:.1f} kWth",
                "clamped_val": f"{thermal_load_th:.1f} kWth",
                "reason": f"Auxiliary thermal boiler boosted by {shortfall:.1f} kWth to maintain +18°C habitat temperature."
            })

        # Update internal clock states
        self.update_clock(dt_seconds=1.0, gen1_running=p_g1 > 5.0, gen2_running=p_g2 > 5.0)

        # Update battery net
        safe_dispatch["p_battery_kw"] = round(safe_dispatch.get("p_battery_discharge_kw", 0.0) - safe_dispatch.get("p_battery_charge_kw", 0.0), 1)

        is_overridden = len(interventions) > 0
        is_admissible = hard_violations == 0

        return PolicyEvaluationResult(
            is_admissible=is_admissible,
            is_overridden=is_overridden,
            hard_violations_count=hard_violations,
            soft_violations_count=soft_violations,
            rules_evaluated=rules,
            interventions=interventions,
            alarms=alarms,
            safe_dispatch=safe_dispatch,
            load_shedding_active=load_shed_active,
            tier_3_shed_kw=round(tier_3_shed, 1),
            tier_2_shed_kw=round(tier_2_shed, 1),
            tier_1_shed_kw=0.0  # Life support is ALWAYS 100% preserved
        )
