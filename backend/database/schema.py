"""
PolarOPS - Feature 24: Database Schema Definitions
Defines all table structures, constraints, foreign keys, and compound indexes.
Strictly separates Real-Time, Operational, Safety, ML, Analytical, and Audit data.
"""

DDL_STATEMENTS = [
    # 0. Migrations Registry
    """
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
    );
    """,

    # 1. Station Registry
    """
    CREATE TABLE IF NOT EXISTS stations (
        station_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        location TEXT,
        latitude REAL,
        longitude REAL,
        timezone TEXT DEFAULT 'UTC',
        status TEXT DEFAULT 'OPERATIONAL',
        configuration_version TEXT DEFAULT 'v1.0.0',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """,

    # 2. SCADA / Hardware Device Registry
    """
    CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        station_id TEXT NOT NULL,
        device_type TEXT NOT NULL,
        device_name TEXT NOT NULL,
        parent_device_id TEXT,
        rated_power_kw REAL NOT NULL,
        status TEXT DEFAULT 'ONLINE',
        configuration_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(station_id) REFERENCES stations(station_id)
    );
    """,

    # 3. Real-Time Telemetry History
    """
    CREATE TABLE IF NOT EXISTS telemetry_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id TEXT NOT NULL,
        device_id TEXT,
        timestamp TEXT NOT NULL,
        power_kw REAL,
        voltage_v REAL,
        current_a REAL,
        frequency_hz REAL,
        temperature_c REAL,
        rpm REAL,
        pressure REAL,
        vibration REAL,
        soc_percent REAL,
        soh_percent REAL,
        fuel_rate_lph REAL,
        data_quality TEXT DEFAULT 'VALID',
        simulation_mode TEXT DEFAULT 'DEMO_MODE'
    );
    """,

    # 4. Multi-Resolution Telemetry Aggregates (1m, 5m, 1h, 1d, 1m)
    """
    CREATE TABLE IF NOT EXISTS telemetry_aggregates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id TEXT NOT NULL,
        device_id TEXT,
        resolution TEXT NOT NULL,
        window_start TEXT NOT NULL,
        window_end TEXT NOT NULL,
        avg_power_kw REAL,
        min_power_kw REAL,
        max_power_kw REAL,
        energy_kwh REAL,
        runtime_hours REAL,
        fuel_consumed_l REAL,
        availability_percent REAL DEFAULT 100.0,
        data_quality TEXT DEFAULT 'VALID'
    );
    """,

    # 5. Energy Generation & Consumption History
    """
    CREATE TABLE IF NOT EXISTS energy_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        solar_kwh REAL DEFAULT 0.0,
        wind_kwh REAL DEFAULT 0.0,
        diesel_kwh REAL DEFAULT 0.0,
        battery_charge_kwh REAL DEFAULT 0.0,
        battery_discharge_kwh REAL DEFAULT 0.0,
        load_kwh REAL DEFAULT 0.0,
        curtailed_kwh REAL DEFAULT 0.0,
        unserved_kwh REAL DEFAULT 0.0,
        total_generation_kwh REAL DEFAULT 0.0,
        data_quality TEXT DEFAULT 'SIMULATED'
    );
    """,

    # 6. Dispatch Decisions History
    """
    CREATE TABLE IF NOT EXISTS dispatch_history (
        dispatch_id TEXT PRIMARY KEY,
        station_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        solar_kw REAL DEFAULT 0.0,
        wind_kw REAL DEFAULT 0.0,
        battery_kw REAL DEFAULT 0.0,
        diesel_g1_kw REAL DEFAULT 0.0,
        diesel_g2_kw REAL DEFAULT 0.0,
        chp_electric_kw REAL DEFAULT 0.0,
        chp_thermal_kw REAL DEFAULT 0.0,
        load_kw REAL DEFAULT 0.0,
        curtailed_kw REAL DEFAULT 0.0,
        unserved_kw REAL DEFAULT 0.0,
        optimization_status TEXT DEFAULT 'OPTIMAL',
        solver_runtime_ms REAL DEFAULT 18.0,
        optimization_version TEXT DEFAULT 'HiGHS-MILP-v1.5'
    );
    """,

    # 7. Optimization Runs Registry
    """
    CREATE TABLE IF NOT EXISTS optimization_runs (
        run_id TEXT PRIMARY KEY,
        station_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        horizon TEXT NOT NULL,
        solver TEXT DEFAULT 'HiGHS',
        solver_status TEXT NOT NULL,
        objective_value REAL,
        runtime_ms REAL,
        model_version TEXT,
        configuration_version TEXT,
        scenario_id TEXT,
        created_at TEXT NOT NULL
    );
    """,

    # 8. Probabilistic Forecast Records
    """
    CREATE TABLE IF NOT EXISTS forecast_records (
        forecast_id TEXT PRIMARY KEY,
        station_id TEXT NOT NULL,
        model_version TEXT NOT NULL,
        target TEXT NOT NULL,
        forecast_timestamp TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        horizon TEXT NOT NULL,
        p10 REAL,
        p50 REAL,
        p90 REAL,
        actual_value REAL,
        error REAL,
        status TEXT DEFAULT 'VALIDATED'
    );
    """,

    # 9. Forecast Evaluations & Pinball Loss MLOps
    """
    CREATE TABLE IF NOT EXISTS forecast_evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id TEXT NOT NULL,
        model_version TEXT NOT NULL,
        target TEXT NOT NULL,
        evaluation_window TEXT NOT NULL,
        pinball_loss_p10 REAL,
        pinball_loss_p50 REAL,
        pinball_loss_p90 REAL,
        mae REAL,
        rmse REAL,
        coverage_pct REAL,
        calculated_at TEXT NOT NULL
    );
    """,

    # 10. Alert Lifecycle Registry
    """
    CREATE TABLE IF NOT EXISTS alerts (
        alert_id TEXT PRIMARY KEY,
        station_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        source TEXT,
        device_id TEXT,
        evidence_json TEXT,
        status TEXT NOT NULL,
        acknowledged_at TEXT,
        resolved_at TEXT,
        model_version TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """,

    # 11. Recommendations Persistence (Feature 18)
    """
    CREATE TABLE IF NOT EXISTS recommendations (
        recommendation_id TEXT PRIMARY KEY,
        station_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        recommendation TEXT NOT NULL,
        reason TEXT,
        evidence_json TEXT,
        expected_impact TEXT,
        horizon TEXT,
        confidence TEXT,
        status TEXT NOT NULL,
        expires_at TEXT,
        source_models_json TEXT,
        optimization_reference TEXT,
        digital_twin_reference TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """,

    # 12. Anomaly Detection Records
    """
    CREATE TABLE IF NOT EXISTS anomalies (
        anomaly_id TEXT PRIMARY KEY,
        station_id TEXT NOT NULL,
        device_id TEXT,
        timestamp TEXT NOT NULL,
        feature_set_json TEXT,
        anomaly_score REAL,
        threshold REAL,
        severity TEXT,
        detected_condition TEXT,
        model_version TEXT,
        status TEXT DEFAULT 'ACTIVE'
    );
    """,

    # 13. MLOps Model Registry
    """
    CREATE TABLE IF NOT EXISTS model_registry (
        model_id TEXT PRIMARY KEY,
        model_name TEXT NOT NULL,
        model_type TEXT NOT NULL,
        version TEXT NOT NULL,
        training_timestamp TEXT NOT NULL,
        dataset_version TEXT NOT NULL,
        features_json TEXT,
        target TEXT,
        metrics_json TEXT,
        status TEXT NOT NULL,
        drift_status TEXT DEFAULT 'STABLE',
        is_champion INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
    );
    """,

    # 14. Digital Twin Scenarios
    """
    CREATE TABLE IF NOT EXISTS scenarios (
        scenario_id TEXT PRIMARY KEY,
        station_id TEXT NOT NULL,
        scenario_name TEXT NOT NULL,
        scenario_type TEXT NOT NULL,
        parameters_json TEXT,
        baseline_reference TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT DEFAULT 'COMPLETED',
        model_version TEXT,
        results_json TEXT
    );
    """,

    # 15. Scenario Detailed Results
    """
    CREATE TABLE IF NOT EXISTS scenario_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scenario_id TEXT NOT NULL,
        station_id TEXT NOT NULL,
        load_served_kwh REAL,
        unserved_energy_kwh REAL,
        fuel_consumed_l REAL,
        renewable_generated_kwh REAL,
        curtailed_kwh REAL,
        battery_min_soc REAL,
        peak_load_kw REAL,
        peak_deficit_kw REAL,
        reserve_margin REAL,
        recovery_time REAL,
        FOREIGN KEY(scenario_id) REFERENCES scenarios(scenario_id)
    );
    """,

    # 16. Unified Audit Log
    """
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        station_id TEXT NOT NULL,
        actor_type TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        previous_state_json TEXT,
        new_state_json TEXT,
        metadata_json TEXT,
        result TEXT DEFAULT 'SUCCESS'
    );
    """,

    # 17. AI Copilot Interaction Audit
    """
    CREATE TABLE IF NOT EXISTS copilot_audit (
        request_id TEXT PRIMARY KEY,
        station_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        intent TEXT,
        tools_used_json TEXT,
        data_references_json TEXT,
        model TEXT,
        model_version TEXT,
        response_status TEXT DEFAULT 'SUCCESS',
        latency_ms REAL
    );
    """,

    # 18. Station Configuration Versioning
    """
    CREATE TABLE IF NOT EXISTS configuration_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id TEXT NOT NULL,
        configuration_version TEXT NOT NULL,
        changed_at TEXT NOT NULL,
        changed_by TEXT NOT NULL,
        change_reason TEXT NOT NULL,
        configuration_snapshot_json TEXT NOT NULL
    );
    """
]

# Compound Indexes matched to actual production query patterns
INDEX_STATEMENTS = [
    # Multi-station time-series queries
    "CREATE INDEX IF NOT EXISTS idx_telemetry_station_ts ON telemetry_history(station_id, timestamp);",
    "CREATE INDEX IF NOT EXISTS idx_telemetry_device_ts ON telemetry_history(device_id, timestamp);",
    "CREATE INDEX IF NOT EXISTS idx_aggregates_lookup ON telemetry_aggregates(station_id, resolution, window_start);",
    "CREATE INDEX IF NOT EXISTS idx_energy_station_ts ON energy_history(station_id, timestamp);",
    "CREATE INDEX IF NOT EXISTS idx_dispatch_station_ts ON dispatch_history(station_id, timestamp);",
    
    # Forecast evaluations
    "CREATE INDEX IF NOT EXISTS idx_forecast_station_ts ON forecast_records(station_id, forecast_timestamp);",
    "CREATE INDEX IF NOT EXISTS idx_forecast_target ON forecast_records(target, generated_at);",
    
    # Safety and Alert life cycles
    "CREATE INDEX IF NOT EXISTS idx_alerts_station_status ON alerts(station_id, status);",
    "CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(station_id, severity);",
    "CREATE INDEX IF NOT EXISTS idx_recommendations_station_status ON recommendations(station_id, status);",
    
    # Audit trail & MLOps
    "CREATE INDEX IF NOT EXISTS idx_audit_station_ts ON audit_logs(station_id, timestamp);",
    "CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_type, action);",
    "CREATE INDEX IF NOT EXISTS idx_copilot_ts ON copilot_audit(station_id, timestamp);",
    "CREATE INDEX IF NOT EXISTS idx_scenarios_station ON scenarios(station_id, started_at);",
    "CREATE INDEX IF NOT EXISTS idx_models_champion ON model_registry(model_name, is_champion);"
]
