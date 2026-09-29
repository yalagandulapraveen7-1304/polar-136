"""
PolarOPS - Feature 24: Database Service Layer
Decouples FastAPI endpoints and the core simulation loop from direct database access.
Provides thread-safe initialization, telemetry ingestion, historical analytics,
backup orchestration, and health monitoring.
"""
import os
import time
from typing import Dict, Any, List, Optional

from backend.database.connection import db_connection, DatabaseConnectionManager
from backend.database.migrations import migration_runner
from backend.database.seeding import database_seeder
from backend.database.repository import data_repository, PolarDataRepository

class PolarDatabaseService:
    def __init__(
        self,
        conn_manager: DatabaseConnectionManager = db_connection,
        repository: PolarDataRepository = data_repository
    ):
        self.conn_manager = conn_manager
        self.repository = repository
        self._initialized = False
        self.initialize()

    def initialize(self):
        """Initializes database schema, executes migrations, and seeds baseline data."""
        if not self._initialized:
            try:
                # 1. Run migrations
                mig_res = migration_runner.run_migrations()
                # 2. Seed baseline stations, devices, and models
                seed_res = database_seeder.seed_all()
                self._initialized = True
                print(f"[Database Service]: Initialized successfully. Migrations: {mig_res['latest_version']}, Stations & Devices seeded.")
            except Exception as e:
                print(f"[Database Service Warning]: Initialization encountered: {e}")

    # ----------------- Real-Time Integration -----------------
    def ingest_snapshot(self, snapshot: Dict[str, Any]):
        """
        Receives 1-second system snapshot and ingests telemetry, dispatch, and safety state.
        Buffers asynchronously so real-time WebSocket loop NEVER waits.
        """
        if not snapshot:
            return

        telemetry = snapshot.get("telemetry", {})
        dispatch = snapshot.get("dispatch", {})
        station_id = telemetry.get("station_id") or snapshot.get("station_id") or "MAITRI"
        mode = snapshot.get("simulation_mode", "DEMO_MODE")

        # 1. Ingest telemetry async to memory buffer
        self.repository.ingest_telemetry_async(telemetry, simulation_mode=mode)

        # 2. Record dispatch decision
        if dispatch:
            self.repository.save_dispatch(station_id, dispatch, telemetry)

        # 3. Synchronize active alerts
        alerts_data = snapshot.get("alert_intelligence", {}).get("active_alerts", [])
        for alt in alerts_data:
            self.repository.save_or_update_alert(station_id, alt)

        # 4. Synchronize recommendations
        recs_data = snapshot.get("recommendations", {}).get("items", [])
        for rec in recs_data:
            self.repository.save_or_update_recommendation(station_id, rec)

    # ----------------- Historical Queries -----------------
    def get_telemetry_history(
        self,
        station_id: str = "MAITRI",
        device_id: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        limit: int = 100,
        page: int = 1
    ) -> Dict[str, Any]:
        return self.repository.get_telemetry_history(station_id, device_id, start_time, end_time, limit, page)

    def get_energy_history(
        self,
        station_id: str = "MAITRI",
        time_range: str = "7D",
        resolution: str = "hour",
        limit: int = 200
    ) -> Dict[str, Any]:
        return self.repository.get_energy_history(station_id, time_range, resolution, limit)

    def get_dispatch_history(self, station_id: str = "MAITRI", limit: int = 50) -> List[Dict[str, Any]]:
        return self.repository.get_dispatch_history(station_id, limit)

    def get_alerts_history(self, station_id: str = "MAITRI", status: Optional[str] = None, severity: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        return self.repository.get_alerts_history(station_id, status, severity, limit)

    def get_recommendations_history(self, station_id: str = "MAITRI", limit: int = 50) -> List[Dict[str, Any]]:
        return self.repository.get_recommendations_history(station_id, limit)

    def get_audit_logs(self, station_id: str = "MAITRI", actor_type: Optional[str] = None, limit: int = 50, page: int = 1) -> Dict[str, Any]:
        return self.repository.get_audit_logs(station_id, actor_type, limit, page)

    def get_model_registry(self, station_id: Optional[str] = None) -> List[Dict[str, Any]]:
        return self.repository.get_model_registry(station_id)

    def save_forecast_records(
        self,
        station_id: str,
        model_version: str,
        target: str,
        horizon: str,
        timestamps: List[str],
        p10: List[float],
        p50: List[float],
        p90: List[float]
    ) -> int:
        return self.repository.save_forecast_records(station_id, model_version, target, horizon, timestamps, p10, p50, p90)

    def get_forecast_history(
        self,
        station_id: str = "MAITRI",
        target: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        return self.repository.get_forecast_history(station_id, target, limit)

    # ----------------- Audit & Actions -----------------
    def record_audit(
        self,
        station_id: str,
        actor_type: str,
        actor_id: str,
        action: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        previous_state: Optional[Dict[str, Any]] = None,
        new_state: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        result: str = "SUCCESS"
    ) -> int:
        return self.repository.record_audit_event(
            station_id, actor_type, actor_id, action, resource_type,
            resource_id, previous_state, new_state, metadata, result
        )

    def record_copilot(
        self,
        station_id: str,
        request_id: str,
        intent: str,
        tools_used: List[str],
        model: str,
        response_status: str = "SUCCESS",
        latency_ms: float = 0.0
    ) -> int:
        return self.repository.record_copilot_audit(
            station_id, request_id, intent, tools_used, model, response_status, latency_ms
        )

    # ----------------- Operations & Backup -----------------
    def backup_database(self, custom_path: Optional[str] = None) -> Dict[str, Any]:
        """Performs non-locking online backup of current database file."""
        if not custom_path:
            timestamp = time.strftime("%Y%m%d_%H%M%S", time.gmtime())
            custom_path = os.path.join(os.path.dirname(self.conn_manager.db_path), f"backup_polarops_{timestamp}.db")
        return self.conn_manager.safe_backup(custom_path)

    def cleanup_retention(self, raw_telemetry_days: int = 7) -> Dict[str, Any]:
        """Prunes raw telemetry beyond retention period while preserving aggregates."""
        return self.repository.cleanup_old_records(raw_telemetry_days)

    def get_health(self) -> Dict[str, Any]:
        """Detailed database diagnostic and table record counts."""
        health = self.conn_manager.check_health()
        stats = self.repository.get_database_stats()
        health["engine"] = f"SQLite 3 ({self.conn_manager.db_type.upper()})"
        health["journal_mode"] = "WAL"
        health["synchronous"] = "NORMAL"
        health["foreign_keys"] = "ON"
        health["tables_count"] = stats.get("tables_count", 15)
        health["tables"] = stats.get("tables", {})
        health["total_records"] = stats.get("total_records", 0)
        health["size_bytes"] = health.get("db_file_bytes", 0)
        health["size_mb"] = round(health.get("db_file_bytes", 0) / (1024 * 1024), 2)
        health["active_buffer_count"] = self.repository.get_buffer_size()
        health["retention_policy"] = "Raw telemetry: 7 days | Aggregates & Audit: 365 days"
        return health

# Global service instance
db_service = PolarDatabaseService()
