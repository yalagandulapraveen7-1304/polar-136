"""
PolarOPS - Offline Batch SQLite Database Logger
Persists all system state telemetry, MPC optimizer decisions, guardrail safety interventions,
and Groq AI natural language explanations into local sems_logs.db.
"""
import sqlite3
import json
import threading
from typing import Dict, Any, List
from backend.config import DB_PATH

class SystemEventLogger:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    def _get_connection(self):
        try:
            conn = sqlite3.connect(self.db_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            return conn
        except Exception:
            conn = sqlite3.connect(":memory:", check_same_thread=False)
            conn.row_factory = sqlite3.Row
            return conn

    def _init_db(self):
        try:
            with self._lock:
                with self._get_connection() as conn:
                    cursor = conn.cursor()
                    # 1. Telemetry table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS telemetry_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        station_id TEXT NOT NULL,
                        mode TEXT NOT NULL,
                        ambient_temp_c REAL,
                        wind_speed_ms REAL,
                        solar_irradiance_wm2 REAL,
                        station_load_kwe REAL,
                        thermal_load_kwth REAL,
                        battery_soc_pct REAL,
                        battery_temp_c REAL,
                        diesel_reserve_liters REAL
                    )
                """)

                # 2. Dispatch actions table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS dispatch_actions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        p_diesel_1_kw REAL,
                        p_diesel_2_kw REAL,
                        p_wind_kw REAL,
                        p_solar_kw REAL,
                        p_battery_discharge_kw REAL,
                        p_battery_charge_kw REAL,
                        q_chp_thermal_kwth REAL,
                        q_aux_thermal_kwth REAL,
                        cumulative_diesel_saved_liters REAL,
                        is_guardrail_overridden INTEGER
                    )
                """)

                # 3. Guardrail safety interventions
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS guardrail_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        rule_id TEXT NOT NULL,
                        severity TEXT NOT NULL,
                        title TEXT NOT NULL,
                        original_val TEXT,
                        clamped_val TEXT,
                        reason TEXT
                    )
                """)

                # 4. AI explanations & chat history
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS ai_explanations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        category TEXT NOT NULL,
                        query_or_trigger TEXT,
                        explanation TEXT
                    )
                """)
                conn.commit()
        except Exception as e:
            print(f"[Logger Init Warning]: {e}")

    def log_telemetry_and_dispatch(
        self,
        telemetry: Dict[str, Any],
        safe_dispatch: Dict[str, Any],
        guardrail_result: Dict[str, Any],
        explanation: str
    ):
        ts = telemetry.get("timestamp")
        with self._lock:
            try:
                with self._get_connection() as conn:
                    cursor = conn.cursor()
                    
                    # Log telemetry
                    cursor.execute("""
                        INSERT INTO telemetry_logs (
                            timestamp, station_id, mode, ambient_temp_c, wind_speed_ms,
                            solar_irradiance_wm2, station_load_kwe, thermal_load_kwth,
                            battery_soc_pct, battery_temp_c, diesel_reserve_liters
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        ts,
                        telemetry.get("station_id"),
                        telemetry.get("mode"),
                        telemetry.get("ambient_temp_c"),
                        telemetry.get("wind_speed_ms"),
                        telemetry.get("solar_irradiance_wm2"),
                        telemetry.get("station_load_kwe"),
                        telemetry.get("thermal_load_kwth"),
                        telemetry.get("battery_soc_pct"),
                        telemetry.get("battery_temp_c"),
                        telemetry.get("diesel_reserve_liters")
                    ))
                    
                    # Log dispatch action
                    is_overridden = 1 if guardrail_result.get("is_overridden") else 0
                    cursor.execute("""
                        INSERT INTO dispatch_actions (
                            timestamp, p_diesel_1_kw, p_diesel_2_kw, p_wind_kw, p_solar_kw,
                            p_battery_discharge_kw, p_battery_charge_kw, q_chp_thermal_kwth,
                            q_aux_thermal_kwth, cumulative_diesel_saved_liters, is_guardrail_overridden
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        ts,
                        safe_dispatch.get("p_diesel_1_kw"),
                        safe_dispatch.get("p_diesel_2_kw"),
                        safe_dispatch.get("p_wind_kw"),
                        safe_dispatch.get("p_solar_kw"),
                        safe_dispatch.get("p_battery_discharge_kw"),
                        safe_dispatch.get("p_battery_charge_kw"),
                        safe_dispatch.get("q_chp_thermal_kwth"),
                        safe_dispatch.get("q_aux_thermal_kwth"),
                        safe_dispatch.get("cumulative_diesel_saved_liters"),
                        is_overridden
                    ))

                    # Log any guardrail interventions
                    for inv in guardrail_result.get("interventions", []):
                        cursor.execute("""
                            INSERT INTO guardrail_events (
                                timestamp, rule_id, severity, title, original_val, clamped_val, reason
                            ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, (
                            ts,
                            inv.get("rule_id", "RULE-OVERRIDE"),
                            inv.get("severity") or inv.get("tier") or "WARNING",
                            inv.get("title", "Guardrail Intervention"),
                            inv.get("original_val", ""),
                            inv.get("clamped_val", ""),
                            inv.get("reason", "")
                        ))

                    # Log AI explanation
                    if explanation:
                        cursor.execute("""
                            INSERT INTO ai_explanations (
                                timestamp, category, query_or_trigger, explanation
                            ) VALUES (?, ?, ?, ?)
                        """, (
                            ts,
                            "DISPATCH_EXPLANATION" if not is_overridden else "GUARDRAIL_EXPLANATION",
                            "AUTO_TELEMETRY_STEP",
                            explanation
                        ))

                    conn.commit()
            except Exception as e:
                print(f"[Logger Error] Failed to commit logs: {e}")

    def log_chat_interaction(self, query: str, answer: str):
        import datetime
        ts = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._lock:
            try:
                with self._get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        INSERT INTO ai_explanations (timestamp, category, query_or_trigger, explanation)
                        VALUES (?, ?, ?, ?)
                    """, (ts, "COMMANDER_CHAT", query, answer))
                    conn.commit()
            except Exception as e:
                print(f"[Logger Error] Failed to log chat: {e}")

    def get_recent_history(self, limit: int = 30) -> Dict[str, Any]:
        with self._lock:
            try:
                with self._get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT * FROM telemetry_logs ORDER BY id DESC LIMIT ?", (limit,))
                    telemetry_rows = [dict(row) for row in cursor.fetchall()]
                    
                    cursor.execute("""
                        SELECT g.*, COALESCE(t.station_id, 'BHARATI') as station_id 
                        FROM guardrail_events g 
                        LEFT JOIN telemetry_logs t ON g.timestamp = t.timestamp 
                        ORDER BY g.id DESC LIMIT ?
                    """, (limit,))
                    guardrail_rows = [dict(row) for row in cursor.fetchall()]

                    cursor.execute("SELECT * FROM ai_explanations ORDER BY id DESC LIMIT ?", (limit,))
                    ai_rows = [dict(row) for row in cursor.fetchall()]

                    cursor.execute("""
                        SELECT d.*, COALESCE(t.station_id, 'BHARATI') as station_id 
                        FROM dispatch_actions d 
                        LEFT JOIN telemetry_logs t ON d.timestamp = t.timestamp 
                        ORDER BY d.id DESC LIMIT ?
                    """, (limit,))
                    dispatch_rows = [dict(row) for row in cursor.fetchall()]

                    # Construct unified audit log list
                    audit_logs = []
                    # 1. Guardrail intervention events
                    for gr in guardrail_rows:
                        ts = gr.get("timestamp", "")
                        time_str = ts.split("T")[-1][:8] if "T" in ts else ts
                        audit_logs.append({
                            "timestamp": ts,
                            "time": time_str,
                            "station": gr.get("station_id", "BHARATI").capitalize(),
                            "action": gr.get("title") or f"Guardrail: {gr.get('rule_id', 'SAFETY')}",
                            "event": gr.get("title", "Safety Interlock"),
                            "reason": gr.get("reason", "Autonomous safety interlock applied"),
                            "safety_reasoning": gr.get("reason", "Autonomous safety interlock applied"),
                            "tier": gr.get("severity", "EMERGENCY")
                        })

                    # 2. Key dispatch decisions
                    for i, act in enumerate(dispatch_rows):
                        ts = act.get("timestamp", "")
                        time_str = ts.split("T")[-1][:8] if "T" in ts else ts
                        station = act.get("station_id", "BHARATI").capitalize()
                        is_over = act.get("is_guardrail_overridden")
                        p_d1 = act.get("p_diesel_1_kw", 0.0) or 0.0
                        p_w = act.get("p_wind_kw", 0.0) or 0.0
                        p_b = act.get("p_battery_discharge_kw", 0.0) or 0.0
                        p_c = act.get("p_battery_charge_kw", 0.0) or 0.0

                        if is_over:
                            action = "Safety Override Clamped"
                            reason = f"Safety interlock overridden LP output. Diesel: {p_d1:.1f}kW, Wind: {p_w:.1f}kW"
                            tier = "CONSERVATIVE"
                        elif p_d1 > 0:
                            action = f"Genset Support ({p_d1:.1f} kW)"
                            reason = f"Renewable shortfall detected; diesel generator online with CHP heat capture."
                            tier = "CONSERVATIVE"
                        elif p_c > 0.5:
                            action = f"Renewable Surplus Storage (+{p_c:.1f} kW)"
                            reason = f"Wind ({p_w:.1f} kW) surplus directed into LiFePO4 battery bank buffer."
                            tier = "NORMAL"
                        elif p_b > 0.5:
                            action = f"BESS Discharge Support (-{p_b:.1f} kW)"
                            reason = f"LiFePO4 battery buffering electrical demand to reduce fuel consumption."
                            tier = "NORMAL"
                        else:
                            action = "Optimal LP Renewable Dispatch"
                            reason = f"Meeting station electrical load 100% from renewable generation."
                            tier = "NORMAL"

                        audit_logs.append({
                            "timestamp": ts,
                            "time": time_str,
                            "station": station,
                            "action": action,
                            "event": action,
                            "reason": reason,
                            "safety_reasoning": reason,
                            "tier": tier
                        })

                    # Sort by timestamp descending
                    audit_logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
                    audit_logs = audit_logs[:limit]

                    return {
                        "telemetry": list(reversed(telemetry_rows)),
                        "guardrail_events": guardrail_rows,
                        "ai_explanations": ai_rows,
                        "dispatch_actions": dispatch_rows,
                        "audit_logs": audit_logs
                    }
            except Exception as e:
                print(f"[Logger Error] Fetch failed: {e}")
                return {"telemetry": [], "guardrail_events": [], "ai_explanations": [], "audit_logs": []}
