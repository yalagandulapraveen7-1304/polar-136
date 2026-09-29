"""
PolarOPS - Feature 24: Database Seeding Engine
Provides deterministic baseline data for Maitri & Bharati stations,
device registries, MLOps model registries, configuration versions,
and historical energy benchmarks (clearly tagged as 'SIMULATED').
"""
import json
import time
import datetime
from typing import Dict, Any

from backend.config import STATIONS
from backend.database.connection import DatabaseConnectionManager, db_connection

class DatabaseSeeder:
    def __init__(self, conn_manager: DatabaseConnectionManager = db_connection):
        self.conn_manager = conn_manager

    def seed_all(self) -> Dict[str, Any]:
        """Seeds all core static and baseline historical records if not already populated."""
        seeded = {}
        seeded["stations"] = self.seed_stations()
        seeded["devices"] = self.seed_devices()
        seeded["models"] = self.seed_models()
        seeded["configurations"] = self.seed_configurations()
        seeded["energy_history"] = self.seed_historical_energy()
        seeded["scenarios"] = self.seed_scenarios()
        return {"status": "SUCCESS", "seeded": seeded}

    def seed_stations(self) -> int:
        """Seed Maitri and Bharati station configuration metadata."""
        now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        stations_data = [
            (
                "MAITRI",
                "Maitri Research Station",
                "Schirmacher Oasis, Queen Maud Land, East Antarctica",
                -70.7661,
                11.7358,
                "UTC",
                "OPERATIONAL",
                "v1.0.0",
                now_str,
                now_str
            ),
            (
                "BHARATI",
                "Bharati Research Station",
                "Larsemann Hills, East Antarctica",
                -69.4078,
                76.1872,
                "UTC",
                "OPERATIONAL",
                "v1.0.0",
                now_str,
                now_str
            )
        ]
        sql = """
        INSERT OR IGNORE INTO stations (
            station_id, name, location, latitude, longitude, timezone, status, configuration_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        return self.conn_manager.execute_many(sql, stations_data)

    def seed_devices(self) -> int:
        """Seed SCADA device register for both Maitri and Bharati."""
        now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        devices = [
            # Maitri Hardware
            ("MAITRI-DG-1", "MAITRI", "DIESEL_GENERATOR", "Primary Diesel Generator 1 (Volvo Penta D16)", None, 300.0, "RUNNING", json.dumps({"min_loading_pct": 35.0, "fuel_rate_curve": "0.00012x^2 + 0.215x + 4.5"}), now_str, now_str),
            ("MAITRI-DG-2", "MAITRI", "DIESEL_GENERATOR", "Standby Diesel Generator 2 (Volvo Penta D13)", None, 200.0, "STANDBY", json.dumps({"min_loading_pct": 35.0, "prewarm_target_c": 40.0}), now_str, now_str),
            ("MAITRI-WT-1", "MAITRI", "WIND_TURBINE", "Polar Katabatic Turbine 1", None, 50.0, "ONLINE", json.dumps({"cut_in_ms": 3.2, "cut_out_ms": 25.0}), now_str, now_str),
            ("MAITRI-WT-2", "MAITRI", "WIND_TURBINE", "Polar Katabatic Turbine 2", None, 50.0, "ONLINE", json.dumps({"cut_in_ms": 3.2, "cut_out_ms": 25.0}), now_str, now_str),
            ("MAITRI-PV-1", "MAITRI", "SOLAR_PV", "Bifacial High-Albedo Solar Array", None, 60.0, "ONLINE", json.dumps({"tilt_deg": 65, "albedo_factor": 0.85}), now_str, now_str),
            ("MAITRI-BESS-1", "MAITRI", "BATTERY", "LiFePO4 Polar Thermal Enclosure", None, 80.0, "ONLINE", json.dumps({"capacity_kwh": 400.0, "nominal_v": 480.0, "reserve_floor_pct": 20.0}), now_str, now_str),
            ("MAITRI-CHP-1", "MAITRI", "CHP", "Combined Heat & Power Water Loop", None, 120.0, "ONLINE", json.dumps({"thermal_ratio": 1.20, "flow_rate_lpm": 85.0}), now_str, now_str),
            ("MAITRI-LOAD-LIFE", "MAITRI", "LOAD", "Critical Life Support & Habitat Bus", None, 100.0, "ONLINE", json.dumps({"priority": "TIER_1_INVIOLABLE"}), now_str, now_str),
            ("MAITRI-LOAD-SCI", "MAITRI", "LOAD", "Scientific Equipment & Ice Drilling", None, 79.0, "ONLINE", json.dumps({"priority": "TIER_3_SHEDDABLE"}), now_str, now_str),

            # Bharati Hardware
            ("BHARATI-DG-1", "BHARATI", "DIESEL_GENERATOR", "Primary Marine Genset 1", None, 120.0, "RUNNING", json.dumps({"min_loading_pct": 35.0}), now_str, now_str),
            ("BHARATI-DG-2", "BHARATI", "DIESEL_GENERATOR", "Auxiliary Marine Genset 2", None, 120.0, "STANDBY", json.dumps({"min_loading_pct": 35.0}), now_str, now_str),
            ("BHARATI-WT-1", "BHARATI", "WIND_TURBINE", "Coastal Antarctic Turbine", None, 120.0, "ONLINE", json.dumps({"cut_in_ms": 3.0, "cut_out_ms": 25.0}), now_str, now_str),
            ("BHARATI-PV-1", "BHARATI", "SOLAR_PV", "Tracking Rooftop Solar PV", None, 90.0, "ONLINE", json.dumps({"tracking_axis": "single"}), now_str, now_str),
            ("BHARATI-BESS-1", "BHARATI", "BATTERY", "Coastal Battery Storage System", None, 70.0, "ONLINE", json.dumps({"capacity_kwh": 350.0, "reserve_floor_pct": 20.0}), now_str, now_str),
            ("BHARATI-CHP-1", "BHARATI", "CHP", "Central Facility Heating Loop", None, 85.0, "ONLINE", json.dumps({"thermal_ratio": 1.15}), now_str, now_str)
        ]
        sql = """
        INSERT OR IGNORE INTO devices (
            device_id, station_id, device_type, device_name, parent_device_id, rated_power_kw, status, configuration_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        return self.conn_manager.execute_many(sql, devices)

    def seed_models(self) -> int:
        """Seed MLOps Champion/Challenger model registry."""
        now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        models = [
            (
                "MDL-LGBM-QNT-241",
                "LightGBM Probabilistic Quantile Forecaster",
                "LIGHTGBM_QUANTILE",
                "v2.4.1",
                now_str,
                "Antarctic-Winter-2026-v4",
                json.dumps(["ambient_temp_c", "wind_speed_ms", "solar_irradiance_wm2", "heating_surge_pct"]),
                "station_load_kwe",
                json.dumps({"pinball_loss_p50": 0.24, "mae_kw": 3.14, "coverage_p10_p90_pct": 81.2}),
                "CHAMPION",
                "STABLE",
                1,
                now_str
            ),
            (
                "MDL-ISOFOREST-130",
                "Multivariate SCADA Isolation Forest",
                "ISOLATION_FOREST",
                "v1.3.0",
                now_str,
                "Antarctic-Winter-2026-v4",
                json.dumps(["vibration_mms", "frequency_hz", "coolant_temp_c", "generator_rpm"]),
                "anomaly_score",
                json.dumps({"f1_score": 0.94, "precision": 0.96, "false_alarm_rate_pct": 0.8}),
                "CHAMPION",
                "STABLE",
                1,
                now_str
            ),
            (
                "MDL-PHYSICS-TWIN-112",
                "Coupled Electro-Thermal Digital Twin",
                "PHYSICS_DIGITAL_TWIN",
                "v1.1.2",
                now_str,
                "Physics-Derating-Empirical-v2",
                json.dumps(["battery_temp_c", "chp_heat_kwth", "cell_voltage_delta"]),
                "twin_residuals",
                json.dumps({"temp_mae_c": 0.42, "fuel_mae_lh": 0.18, "voltage_mae_mv": 12.0}),
                "CHAMPION",
                "STABLE",
                1,
                now_str
            ),
            (
                "MDL-HIGHS-MILP-150",
                "HiGHS Mathematical Linear Programming Solver",
                "MILP_OPTIMIZER",
                "v1.5.0",
                now_str,
                "MILP-Constraints-Winter-2026",
                json.dumps(["288_decision_variables", "anti_wet_stacking_floor", "reserve_floor_soc"]),
                "optimal_dispatch_vector",
                json.dumps({"average_solve_time_ms": 18.4, "mip_gap_pct": 0.00, "annual_fuel_saved_l": 118994}),
                "CHAMPION",
                "STABLE",
                1,
                now_str
            )
        ]
        sql = """
        INSERT OR IGNORE INTO model_registry (
            model_id, model_name, model_type, version, training_timestamp, dataset_version, features_json, target, metrics_json, status, drift_status, is_champion, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        return self.conn_manager.execute_many(sql, models)

    def seed_configurations(self) -> int:
        """Seed initial configuration version for tracking."""
        now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        configs = [
            (
                "MAITRI",
                "v1.0.0",
                now_str,
                "Chief Expedition Engineer",
                "Baseline Antarctic summer commissioning profile",
                json.dumps(STATIONS.get("MAITRI", {}))
            ),
            (
                "BHARATI",
                "v1.0.0",
                now_str,
                "Chief Expedition Engineer",
                "Baseline coastal Antarctic commissioning profile",
                json.dumps(STATIONS.get("BHARATI", {}))
            )
        ]
        sql = """
        INSERT OR IGNORE INTO configuration_versions (
            station_id, configuration_version, changed_at, changed_by, change_reason, configuration_snapshot_json
        ) VALUES (?, ?, ?, ?, ?, ?);
        """
        return self.conn_manager.execute_many(sql, configs)

    def seed_historical_energy(self) -> int:
        """Seed 7 days of historical energy data (clearly tagged SIMULATED)."""
        now = datetime.datetime.now(datetime.timezone.utc)
        records = []
        for i in range(168, 0, -4):  # 7 days in 4-hour intervals
            ts = (now - datetime.timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M:%SZ")
            records.append((
                "MAITRI",
                ts,
                140.0 + (i % 24) * 5.0,  # solar
                280.0 + (i % 12) * 12.0, # wind
                320.0 + (i % 6) * 10.0,  # diesel
                45.0,                    # battery charge
                52.0,                    # battery discharge
                680.0 + (i % 8) * 15.0,  # load
                18.0,                    # curtailed
                0.0,                     # unserved
                740.0,                   # total generation
                "SIMULATED"
            ))
        sql = """
        INSERT OR IGNORE INTO energy_history (
            station_id, timestamp, solar_kwh, wind_kwh, diesel_kwh, battery_charge_kwh, battery_discharge_kwh, load_kwh, curtailed_kwh, unserved_kwh, total_generation_kwh, data_quality
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        return self.conn_manager.execute_many(sql, records)

    def seed_scenarios(self) -> int:
        """Seed standard stress scenarios."""
        now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        scenarios = [
            ("SC-EXTREME-COLD", "MAITRI", "Polar Vortex (-44°C)", "EXTREME_COLD", json.dumps({"ambient_temp_c": -44.0, "heating_surge_pct": 42.0}), "Nominal v1.0", now_str, now_str, "COMPLETED", "v1.1.2", json.dumps({"unserved_kwh": 0.0, "status": "SURVIVABLE"})),
            ("SC-GENSET-FAIL", "MAITRI", "Genset 1 Sudden Mechanical Trip", "GENERATOR_FAILURE", json.dumps({"genset_1_kw": 0.0}), "Nominal v1.0", now_str, now_str, "COMPLETED", "v1.1.2", json.dumps({"unserved_kwh": 0.0, "status": "RECOVERED_VIA_G2"}))
        ]
        sql = """
        INSERT OR IGNORE INTO scenarios (
            scenario_id, station_id, scenario_name, scenario_type, parameters_json, baseline_reference, started_at, completed_at, status, model_version, results_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        return self.conn_manager.execute_many(sql, scenarios)

database_seeder = DatabaseSeeder()
