"""
PolarOPS - Feature 24: Database Migrations Engine
Applies versioned migrations, tracks schema state, and ensures repeatable deployments.
"""
import time
from typing import Dict, Any, List
from backend.database.connection import DatabaseConnectionManager, db_connection
from backend.database.schema import DDL_STATEMENTS, INDEX_STATEMENTS

MIGRATIONS = [
    {
        "version": 1,
        "name": "001_initial_core_schema",
        "description": "Create all 18 core entities for telemetry, devices, dispatch, ML, alerts, and audit.",
        "statements": DDL_STATEMENTS
    },
    {
        "version": 2,
        "name": "002_compound_performance_indexes",
        "description": "Create compound indices for high-frequency queries and multi-station isolation.",
        "statements": INDEX_STATEMENTS
    }
]

class MigrationRunner:
    def __init__(self, conn_manager: DatabaseConnectionManager = db_connection):
        self.conn_manager = conn_manager

    def _ensure_migration_table(self):
        """Creates schema_migrations table if not already existing."""
        ddl = """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        );
        """
        self.conn_manager.execute_write(ddl)

    def get_applied_versions(self) -> List[int]:
        """Returns list of already applied migration version numbers."""
        self._ensure_migration_table()
        rows = self.conn_manager.execute_query("SELECT version FROM schema_migrations ORDER BY version ASC;")
        return [r["version"] for r in rows]

    def run_migrations(self) -> Dict[str, Any]:
        """Runs all pending migrations in order within transactions."""
        applied_versions = self.get_applied_versions()
        applied_now = []

        for m in MIGRATIONS:
            v = m["version"]
            if v not in applied_versions:
                now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                with self.conn_manager.transaction() as cursor:
                    for stmt in m["statements"]:
                        clean_stmt = stmt.strip()
                        if clean_stmt:
                            cursor.execute(clean_stmt)
                    cursor.execute(
                        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?);",
                        (v, m["name"], now_str)
                    )
                applied_now.append(m["name"])
                print(f"[Database Migration]: Applied {m['name']} (v{v}) successfully.")

        current_applied = self.get_applied_versions()
        return {
            "status": "SUCCESS",
            "applied_now": applied_now,
            "total_applied": len(current_applied),
            "latest_version": max(current_applied) if current_applied else 0
        }

migration_runner = MigrationRunner()
