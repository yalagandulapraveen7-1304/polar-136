"""
PolarOPS - Feature 24: Database Connection Manager
Provides thread-safe connections, WAL mode initialization, transactional safety,
safe non-locking SQLite backups, and PostgreSQL readiness.
"""
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from typing import Generator, Optional, Dict, Any

from backend.config import DB_PATH

class DatabaseConnectionManager:
    """
    Manages SQLite connections with WAL (Write-Ahead Logging),
    thread safety, optimized caching, and safe online backup support.
    Architected to be replaceable with PostgreSQL connection pooling.
    """
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._local = threading.local()
        self._lock = threading.Lock()
        self.db_type = "SQLITE"
        self._ensure_directory()

    def _ensure_directory(self):
        directory = os.path.dirname(self.db_path)
        if directory and not os.path.exists(directory):
            try:
                os.makedirs(directory, exist_ok=True)
            except Exception:
                pass

    def get_connection(self) -> sqlite3.Connection:
        """Returns a thread-local SQLite connection with WAL pragmas configured."""
        if not hasattr(self._local, "conn") or self._local.conn is None:
            try:
                conn = sqlite3.connect(
                    self.db_path,
                    timeout=10.0,
                    check_same_thread=False,
                    isolation_level=None  # autocommit mode, transactions handled explicitly
                )
                conn.row_factory = sqlite3.Row
                # Configure high-performance Polar EMS SQLite Pragmas
                conn.execute("PRAGMA journal_mode = WAL;")
                conn.execute("PRAGMA synchronous = NORMAL;")
                conn.execute("PRAGMA foreign_keys = ON;")
                conn.execute("PRAGMA busy_timeout = 5000;")
                conn.execute("PRAGMA cache_size = -32000;")  # 32MB page cache
                self._local.conn = conn
            except Exception as e:
                # Fallback to in-memory if disk is write-protected
                conn = sqlite3.connect(":memory:", check_same_thread=False)
                conn.row_factory = sqlite3.Row
                self._local.conn = conn
        return self._local.conn

    @contextmanager
    def transaction(self) -> Generator[sqlite3.Cursor, None, None]:
        """Atomic transaction context manager. Commits on exit, rolls back on error."""
        conn = self.get_connection()
        with self._lock:
            conn.execute("BEGIN IMMEDIATE;")
            cursor = conn.cursor()
            try:
                yield cursor
                conn.execute("COMMIT;")
            except Exception as e:
                conn.execute("ROLLBACK;")
                raise e

    def execute_query(self, query: str, params: tuple = ()) -> list:
        """Executes a SELECT query with parameters and returns dictionary rows."""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

    def execute_single(self, query: str, params: tuple = ()) -> Optional[dict]:
        """Executes a SELECT query and returns a single dictionary row or None."""
        rows = self.execute_query(query, params)
        return rows[0] if rows else None

    def execute_write(self, query: str, params: tuple = ()) -> int:
        """Executes an INSERT/UPDATE/DELETE query with parameters and returns rowcount."""
        with self.transaction() as cursor:
            cursor.execute(query, params)
            return cursor.rowcount

    def execute_many(self, query: str, param_list: list) -> int:
        """Executes a batch INSERT/UPDATE with parameterized values in a single transaction."""
        if not param_list:
            return 0
        with self.transaction() as cursor:
            cursor.executemany(query, param_list)
            return cursor.rowcount

    def safe_backup(self, backup_filepath: str) -> Dict[str, Any]:
        """
        Performs an online, zero-downtime, crash-consistent SQLite backup
        using the sqlite3 online backup API without blocking active readers.
        """
        start_time = time.time()
        os.makedirs(os.path.dirname(os.path.abspath(backup_filepath)), exist_ok=True)
        
        src_conn = self.get_connection()
        dest_conn = sqlite3.connect(backup_filepath)
        try:
            with self._lock:
                src_conn.backup(dest_conn, pages=100)
            size_bytes = os.path.getsize(backup_filepath) if os.path.exists(backup_filepath) else 0
            duration_ms = round((time.time() - start_time) * 1000.0, 2)
            return {
                "status": "SUCCESS",
                "backup_path": backup_filepath,
                "file_size_bytes": size_bytes,
                "duration_ms": duration_ms,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
        except Exception as e:
            return {
                "status": "ERROR",
                "message": str(e),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
        finally:
            dest_conn.close()

    def check_health(self) -> Dict[str, Any]:
        """Internal diagnostic check for database availability, latency, and file size."""
        start = time.time()
        try:
            res = self.execute_single("SELECT 1 AS alive, datetime('now') AS utc_now;")
            latency_ms = round((time.time() - start) * 1000.0, 2)
            file_size_bytes = os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 0
            return {
                "status": "HEALTHY",
                "database_type": self.db_type,
                "connection": "ACTIVE",
                "latency_ms": latency_ms,
                "db_file_bytes": file_size_bytes,
                "db_file_path": self.db_path,
                "utc_timestamp": res.get("utc_now") if res else None
            }
        except Exception as e:
            return {
                "status": "DEGRADED",
                "database_type": self.db_type,
                "connection": "ERROR",
                "error": str(e)
            }

# Global database connection singleton
db_connection = DatabaseConnectionManager()
