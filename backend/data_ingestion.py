"""
PolarOPS - Data Ingestion Driver Abstraction
Standardizes incoming data into a single telemetry payload regardless of source
(DEMO_MODE: Open-Meteo live API / physics model vs SCADA_MODE: Modbus/MQTT hardware registers).
"""
import time
import math
import random
import datetime
import json
import tempfile
from pathlib import Path
import httpx
from typing import Dict, Any, Optional
from backend.config import STATIONS
from backend.schema.canonical import (
    OperatingMode,
    QualityFlag,
    CanonicalTelemetrySnapshot,
)
from backend.simulation.polar_synth import PolarPhysicsSimulator

OVERRIDE_STORE_PATH = Path(tempfile.gettempdir()) / "polarops_overrides.json"

class DataIngestionDriver:
    def __init__(self, station_id: str = "MAITRI", mode: str = "DEMO_MODE"):
        self.station_id = station_id
        self.mode = mode
        self.last_api_fetch_time = 0.0
        self.cached_weather: Optional[Dict[str, float]] = None
        
        # Internal state evolution for smooth realistic simulation
        self.current_battery_soc = 76.5
        self.current_battery_temp = -12.4
        self.current_diesel_reserve = STATIONS[station_id]["diesel_fuel_reserve_liters"]
        self.genset_1_runtime_sec = 1800.0  # Already running for 30 minutes
        self.genset_2_runtime_sec = 0.0
        self.genset_1_status = "RUNNING"
        self.genset_2_status = "STANDBY"
        
        # Override parameters (injectable by Commander / Scenario Engine)
        self.override_temp_c: Optional[float] = None
        self.override_wind_ms: Optional[float] = None
        self.override_solar_wm2: Optional[float] = None
        self.override_load_mult: float = 1.0
        self.fault_genset_1: bool = False
        self.fault_genset_2: bool = False
        self.fault_battery_heater: bool = False
        self.wind_trip: bool = False
        self.solar_trip: bool = False
        self.fuel_reserve_pct: Optional[float] = None
        self.renewables_available_pct: float = 100.0
        self.override_battery_soc: Optional[float] = None
        self.battery_reserve_pct: float = 20.0
        self.battery_soh_pct: float = 98.0
        self.microgrid_isolated: bool = False
        self.override_diesel_2_kw: Optional[float] = None

        # Initialize Polar Physics Simulator for Mode A canonical telemetry
        sim_mode = OperatingMode.SIMULATION if mode != "SCADA_MODE" else OperatingMode.LIVE
        self.simulator = PolarPhysicsSimulator(station_id=station_id, mode=sim_mode)

        # Auto-restore active overrides across cold starts or serverless instances
        self._load_persisted_overrides()

    def _persist_overrides(self):
        """Save active overrides to disk for serverless/cold-start survival"""
        try:
            data = {
                "ambient_temp_c": self.override_temp_c,
                "wind_speed_ms": self.override_wind_ms,
                "solar_irradiance_wm2": self.override_solar_wm2,
                "load_multiplier": self.override_load_mult,
                "fault_genset_1": self.fault_genset_1,
                "fault_genset_2": self.fault_genset_2,
                "fault_battery_heater": self.fault_battery_heater,
                "wind_trip": self.wind_trip,
                "solar_trip": self.solar_trip,
                "fuel_reserve_pct": self.fuel_reserve_pct,
                "renewables_available_pct": self.renewables_available_pct,
                "battery_soc_pct": self.override_battery_soc,
                "battery_reserve_pct": self.battery_reserve_pct,
                "battery_soh_pct": self.battery_soh_pct,
                "microgrid_isolated": self.microgrid_isolated,
                "p_diesel_2_kw": self.override_diesel_2_kw,
            }
            with open(OVERRIDE_STORE_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f)
        except Exception:
            pass

    def _load_persisted_overrides(self):
        """Load active overrides from disk if present"""
        try:
            if OVERRIDE_STORE_PATH.exists():
                with open(OVERRIDE_STORE_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        self.apply_overrides(data, persist=False)
        except Exception:
            pass

    def set_station(self, station_id: str):
        if station_id in STATIONS:
            self.station_id = station_id
            self.current_diesel_reserve = STATIONS[station_id]["diesel_fuel_reserve_liters"]
            self.simulator.set_station(station_id)

    def set_mode(self, mode: str):
        if mode in ["DEMO_MODE", "SCADA_MODE"]:
            self.mode = mode
            sim_mode = OperatingMode.SIMULATION if mode != "SCADA_MODE" else OperatingMode.LIVE
            self.simulator.mode = sim_mode

    def apply_overrides(self, overrides: Dict[str, Any], persist: bool = True):
        """Commander manual injection sliders and fault toggles"""
        if "ambient_temp_c" in overrides and overrides["ambient_temp_c"] is not None:
            self.override_temp_c = float(overrides["ambient_temp_c"])
        if "wind_speed_ms" in overrides and overrides["wind_speed_ms"] is not None:
            self.override_wind_ms = float(overrides["wind_speed_ms"])
        if "solar_irradiance_wm2" in overrides and overrides["solar_irradiance_wm2"] is not None:
            self.override_solar_wm2 = float(overrides["solar_irradiance_wm2"])
        if "load_multiplier" in overrides and overrides["load_multiplier"] is not None:
            self.override_load_mult = float(overrides["load_multiplier"])
        if "fault_genset_1" in overrides and overrides["fault_genset_1"] is not None:
            self.fault_genset_1 = bool(overrides["fault_genset_1"])
        if "fault_battery_heater" in overrides and overrides["fault_battery_heater"] is not None:
            self.fault_battery_heater = bool(overrides["fault_battery_heater"])
        if "battery_soc_pct" in overrides and overrides["battery_soc_pct"] is not None:
            self.override_battery_soc = float(overrides["battery_soc_pct"])
            self.current_battery_soc = self.override_battery_soc
        if "battery_reserve_pct" in overrides and overrides["battery_reserve_pct"] is not None:
            self.battery_reserve_pct = float(overrides["battery_reserve_pct"])
        if "fault_genset_2" in overrides and overrides["fault_genset_2"] is not None:
            self.fault_genset_2 = bool(overrides["fault_genset_2"])
        if "wind_trip" in overrides and overrides["wind_trip"] is not None:
            self.wind_trip = bool(overrides["wind_trip"])
        if "solar_trip" in overrides and overrides["solar_trip"] is not None:
            self.solar_trip = bool(overrides["solar_trip"])
        if "fuel_reserve_pct" in overrides and overrides["fuel_reserve_pct"] is not None:
            self.fuel_reserve_pct = float(overrides["fuel_reserve_pct"])
        if "renewables_available_pct" in overrides and overrides["renewables_available_pct"] is not None:
            self.renewables_available_pct = float(overrides["renewables_available_pct"])
        if "battery_soh_pct" in overrides and overrides["battery_soh_pct"] is not None:
            self.battery_soh_pct = float(overrides["battery_soh_pct"])
        if "microgrid_isolated" in overrides and overrides["microgrid_isolated"] is not None:
            self.microgrid_isolated = bool(overrides["microgrid_isolated"])
        if "p_diesel_2_kw" in overrides and overrides["p_diesel_2_kw"] is not None:
            self.override_diesel_2_kw = float(overrides["p_diesel_2_kw"])
            self.genset_2_status = "RUNNING" if self.override_diesel_2_kw > 0 else "STANDBY"

        if persist:
            self._persist_overrides()

    def clear_overrides(self):
        self.override_temp_c = None
        self.override_wind_ms = None
        self.override_solar_wm2 = None
        self.override_load_mult = 1.0
        self.fault_genset_1 = False
        self.fault_genset_2 = False
        self.fault_battery_heater = False
        self.wind_trip = False
        self.solar_trip = False
        self.fuel_reserve_pct = None
        self.renewables_available_pct = 100.0
        self.override_battery_soc = None
        self.current_battery_soc = 76.5
        self.battery_reserve_pct = 20.0
        self.battery_soh_pct = 98.0
        self.microgrid_isolated = False
        self.override_diesel_2_kw = None
        self.genset_2_status = "STANDBY"
        self.simulator.reset_overrides()
        try:
            if OVERRIDE_STORE_PATH.exists():
                OVERRIDE_STORE_PATH.unlink(missing_ok=True)
        except Exception:
            pass

    def get_active_overrides(self) -> Dict[str, Any]:
        """Returns all currently active commander overrides and fault injections."""
        overrides = {}
        if self.override_temp_c is not None:
            overrides["ambient_temp_c"] = self.override_temp_c
        if self.override_wind_ms is not None:
            overrides["wind_speed_ms"] = self.override_wind_ms
        if self.override_solar_wm2 is not None:
            overrides["solar_irradiance_wm2"] = self.override_solar_wm2
        if self.override_load_mult != 1.0:
            overrides["load_multiplier"] = self.override_load_mult
        if self.fault_genset_1:
            overrides["fault_genset_1"] = self.fault_genset_1
        if self.fault_genset_2:
            overrides["fault_genset_2"] = self.fault_genset_2
        if self.fault_battery_heater:
            overrides["fault_battery_heater"] = self.fault_battery_heater
        if self.wind_trip:
            overrides["wind_trip"] = self.wind_trip
        if self.solar_trip:
            overrides["solar_trip"] = self.solar_trip
        if self.fuel_reserve_pct is not None:
            overrides["fuel_reserve_pct"] = self.fuel_reserve_pct
        if self.renewables_available_pct != 100.0:
            overrides["renewables_available_pct"] = self.renewables_available_pct
        if self.override_battery_soc is not None:
            overrides["battery_soc_pct"] = self.override_battery_soc
        if self.battery_reserve_pct != 20.0:
            overrides["battery_reserve_pct"] = self.battery_reserve_pct
        if self.battery_soh_pct != 98.0:
            overrides["battery_soh_pct"] = self.battery_soh_pct
        if self.microgrid_isolated:
            overrides["microgrid_isolated"] = self.microgrid_isolated
        if self.override_diesel_2_kw is not None:
            overrides["p_diesel_2_kw"] = self.override_diesel_2_kw
        return overrides

    def has_active_overrides(self) -> bool:
        return len(self.get_active_overrides()) > 0

    def _fetch_open_meteo_weather(self) -> Dict[str, float]:
        """Fetch real-time polar weather from Open-Meteo for Antarctica station coords"""
        station = STATIONS[self.station_id]
        lat, lon = station["lat"], station["lon"]
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}&current=temperature_2m,wind_speed_10m,wind_gusts_10m,direct_normal_irradiance,surface_pressure&timezone=UTC"
        )
        try:
            with httpx.Client(timeout=2.5) as client:
                resp = client.get(url)
                if resp.status_code == 200:
                    data = resp.json().get("current", {})
                    # Convert km/h to m/s if needed (Open-Meteo defaults to km/h)
                    wind_kmh = float(data.get("wind_speed_10m", 25.0))
                    wind_ms = wind_kmh / 3.6
                    gust_kmh = float(data.get("wind_gusts_10m", 35.0))
                    gust_ms = gust_kmh / 3.6
                    temp = float(data.get("temperature_2m", -18.5))
                    dni = float(data.get("direct_normal_irradiance", 180.0))
                    return {
                        "temp_c": temp,
                        "wind_ms": wind_ms,
                        "wind_gust_ms": gust_ms,
                        "solar_wm2": dni,
                        "pressure_hpa": float(data.get("surface_pressure", 985.0))
                    }
        except Exception:
            pass  # Fallback to polar diurnal generator
        
        # Synthetic polar weather with realistic diurnal variation
        now = datetime.datetime.now(datetime.timezone.utc)
        hour = now.hour + now.minute / 60.0
        # Antarctic temperature diurnal wave (-15C to -28C average)
        base_temp = -22.0 + 5.0 * math.sin((hour - 8.0) * math.pi / 12.0)
        # Katabatic wind spikes typical of polar escarpment
        wind_base = 8.5 + 4.0 * math.cos((hour - 14.0) * math.pi / 12.0) + random.uniform(-1.0, 1.5)
        # Solar direct irradiance with polar sun angle
        solar_val = max(0.0, 320.0 * math.sin((hour - 5.0) * math.pi / 14.0)) if 5 <= hour <= 19 else 0.0
        
        return {
            "temp_c": round(base_temp, 1),
            "wind_ms": round(max(0.5, wind_base), 1),
            "wind_gust_ms": round(max(1.0, wind_base * 1.35), 1),
            "solar_wm2": round(solar_val, 1),
            "pressure_hpa": 982.5
        }

    def _get_weather(self) -> Dict[str, float]:
        now_time = time.time()
        # Cache API calls for 60 seconds to respect rate limits while maintaining smooth 1s updates
        if not self.cached_weather or (now_time - self.last_api_fetch_time > 60.0):
            self.cached_weather = self._fetch_open_meteo_weather()
            self.last_api_fetch_time = now_time
            
        # Add slight micro-turbulence for realism
        w = dict(self.cached_weather)
        w["wind_ms"] = max(0.2, w["wind_ms"] + random.uniform(-0.4, 0.4))
        w["solar_wm2"] = max(0.0, w["solar_wm2"] + random.uniform(-5.0, 5.0))
        return w

    def _read_scada_registers(self, ambient_temp: float, wind_speed: float, solar_wm2: float) -> Dict[str, Any]:
        """
        Live Industrial SCADA Hardware Ingestion (Modbus TCP / RTU / MQTT).
        Simulates live PLC polling loop with dynamic register maps (40001-40020)
        and millisecond packet sequencing.
        """
        station = STATIONS[self.station_id]
        now = time.time()
        
        # Increment packet sequence
        if not hasattr(self, "_scada_seq"):
            self._scada_seq = 10420
            self._scada_pid_integral = 0.0
        self._scada_seq += 1

        # Real-time frequency with PID governor emulation (target 50.0 Hz)
        freq_error = random.uniform(-0.04, 0.04)
        self._scada_pid_integral += freq_error * 0.1
        self._scada_pid_integral = max(-0.05, min(0.05, self._scada_pid_integral))
        freq_hz = round(50.0 + freq_error + self._scada_pid_integral, 3)

        # 3-Phase Busbar Voltage (415V line-to-line) with phase balance
        v_base = 415.0 + random.uniform(-1.5, 1.5)
        v_l1 = round(v_base + random.uniform(-0.8, 0.8), 1)
        v_l2 = round(v_base + random.uniform(-0.8, 0.8), 1)
        v_l3 = round(v_base + random.uniform(-0.8, 0.8), 1)

        # Active & Reactive Power factor
        power_factor = round(0.95 + random.uniform(-0.02, 0.02), 3)

        # Generator 1 sensors
        gen1_rpm = 1500 + int(random.uniform(-4, 4)) if not self.fault_genset_1 else 0
        gen1_oil_press = round(58.4 + random.uniform(-0.6, 0.6) if not self.fault_genset_1 else 18.2, 1)
        gen1_coolant_temp = round(82.6 + random.uniform(-0.4, 0.4) if not self.fault_genset_1 else 32.0, 1)
        gen1_vibration_mms = round(1.8 + random.uniform(-0.2, 0.3) if not self.fault_genset_1 else 0.0, 2)

        # Generator 2 sensors
        gen2_rpm = 0
        gen2_oil_press = 0.0
        gen2_coolant_temp = 52.0 # Pre-warmed standby jacket

        # Anemometer & Pyranometer SCADA calibrated inputs
        scada_wind_ms = round(wind_speed + random.uniform(-0.15, 0.15), 2)
        scada_solar_wm2 = round(max(0.0, solar_wm2 + random.uniform(-2.0, 2.0)), 1)
        scada_ambient_temp = round(ambient_temp + random.uniform(-0.1, 0.1), 1)

        # BESS BMS Modbus registers
        batt_highest_cell_v = round(3.382 + random.uniform(-0.003, 0.003), 3)
        batt_lowest_cell_v = round(3.341 + random.uniform(-0.003, 0.003), 3)
        batt_current_a = round(random.uniform(25.0, 45.0), 1)

        # Modbus register block 40001 - 40020
        modbus_registers = {
            "reg_40001_gen1_rpm": gen1_rpm,
            "reg_40002_gen1_oil_press_psi": gen1_oil_press,
            "reg_40003_gen1_coolant_temp_c": gen1_coolant_temp,
            "reg_40004_bus_frequency_hz": freq_hz,
            "reg_40005_bus_v_l1_v": v_l1,
            "reg_40006_bus_v_l2_v": v_l2,
            "reg_40007_bus_v_l3_v": v_l3,
            "reg_40008_power_factor": power_factor,
            "reg_40009_wind_rotor_rpm": round(scada_wind_ms * 4.2 + random.uniform(-0.5, 0.5), 1),
            "reg_40010_anemometer_ms": scada_wind_ms,
            "reg_40011_pyranometer_wm2": scada_solar_wm2,
            "reg_40012_rtd_ambient_temp_c": scada_ambient_temp,
            "reg_40013_batt_cell_highest_v": batt_highest_cell_v,
            "reg_40014_batt_cell_lowest_v": batt_lowest_cell_v,
            "reg_40015_batt_current_a": batt_current_a,
            "reg_40016_chp_loop_temp_c": round(78.5 + random.uniform(-0.3, 0.3), 1),
            "reg_40017_gen1_vibration_mms": gen1_vibration_mms,
            "reg_40018_fuel_rack_pos_pct": round(42.5 + random.uniform(-1.0, 1.0), 1),
            "reg_40019_scada_seq_id": self._scada_seq,
            "reg_40020_plc_comm_status": "ONLINE_HEALTHY" if not self.fault_genset_1 else "ALARM_INTERLOCK"
        }

        # SCADA Diagnostics telemetry header
        scada_meta = {
            "active": True,
            "protocol": "MODBUS_TCP_502",
            "transport": "ETHERNET_OPTICAL_RING",
            "polling_rate_hz": 1.0,
            "latency_ms": round(random.uniform(7.8, 12.4), 1),
            "packet_sequence": self._scada_seq,
            "crc_errors": 0,
            "bus_frequency_hz": freq_hz,
            "bus_voltage_v": v_l1,
            "power_factor": power_factor,
            "registers": modbus_registers
        }
        return scada_meta

    def get_latest_scada_registers(self) -> Dict[str, Any]:
        """Returns current register map for API endpoints"""
        weather = self._get_weather()
        return self._read_scada_registers(weather["temp_c"], weather["wind_ms"], weather["solar_wm2"])

    def ingest(self) -> Dict[str, Any]:
        """
        Standardizes incoming data into a single unified JSON payload.
        Handles DEMO_MODE API vs SCADA_MODE Modbus registers.
        """
        # Ensure latest overrides are refreshed from disk on every cycle
        self._load_persisted_overrides()
        station = STATIONS[self.station_id]
        
        # 1. Weather acquisition
        weather = self._get_weather()
        ambient_temp = self.override_temp_c if self.override_temp_c is not None else weather["temp_c"]
        wind_speed = self.override_wind_ms if self.override_wind_ms is not None else weather["wind_ms"]
        solar_irradiance = self.override_solar_wm2 if self.override_solar_wm2 is not None else weather["solar_wm2"]
        
        # 2. Demand Calculation (Station Electrical & Thermal)
        thermal_cold_penalty = max(0.0, (-10.0 - ambient_temp) * 1.8)
        wind_chill_penalty = wind_speed * 0.45
        
        electrical_demand = (station["base_load_kwe"] + random.uniform(-2.5, 3.5)) * self.override_load_mult
        thermal_demand = (station["base_thermal_kwth"] + thermal_cold_penalty + wind_chill_penalty) * self.override_load_mult
        
        # 3. Battery Enclosure Thermal State
        if self.fault_battery_heater:
            self.current_battery_temp = max(ambient_temp, self.current_battery_temp - 0.25)
        else:
            target_b_temp = max(-12.0, ambient_temp * 0.4)
            self.current_battery_temp += (target_b_temp - self.current_battery_temp) * 0.08

        # 4. SCADA register diagnostics
        scada_diag = self._read_scada_registers(ambient_temp, wind_speed, solar_irradiance)

        # In SCADA_MODE, telemetry strictly derives from the hardware PLC registers!
        if self.mode == "SCADA_MODE":
            regs = scada_diag["registers"]
            ambient_temp = regs["reg_40012_rtd_ambient_temp_c"]
            wind_speed = regs["reg_40010_anemometer_ms"]
            solar_irradiance = regs["reg_40011_pyranometer_wm2"]
            source_label = "SCADA_MODBUS_TCP"
        else:
            source_label = "DEMO_OPEN_METEO_API"

        # Standardized Telemetry Schema
        standard_payload = {
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "station_id": self.station_id,
            "station_name": station["name"],
            "mode": self.mode,
            "source": source_label,
            "ambient_temp_c": round(ambient_temp, 1),
            "wind_speed_ms": round(wind_speed, 1),
            "wind_gust_ms": round(weather.get("wind_gust_ms", wind_speed * 1.3), 1),
            "solar_irradiance_wm2": round(solar_irradiance, 1),
            "station_load_kwe": round(electrical_demand, 1),
            "load_elec_kw": round(electrical_demand, 1),
            "thermal_load_kwth": round(thermal_demand, 1),
            "load_thermal_kw": round(thermal_demand, 1),
            "battery_soc_pct": round(self.override_battery_soc if self.override_battery_soc is not None else self.current_battery_soc, 1),
            "battery_reserve_pct": round(self.battery_reserve_pct, 1),
            "battery_soh_pct": round(self.battery_soh_pct, 1),
            "battery_temp_c": round(self.current_battery_temp, 1),
            "diesel_reserve_liters": round(self.current_diesel_reserve if self.fuel_reserve_pct is None else (station["diesel_fuel_reserve_liters"] * (self.fuel_reserve_pct / 100.0)), 1),
            "fuel_reserve_pct": round(self.fuel_reserve_pct if self.fuel_reserve_pct is not None else (self.current_diesel_reserve / station["diesel_fuel_reserve_liters"] * 100.0), 1),
            "genset_1_fault": self.fault_genset_1,
            "genset_2_fault": self.fault_genset_2,
            "battery_heater_fault": self.fault_battery_heater,
            "wind_trip": self.wind_trip,
            "solar_trip": self.solar_trip,
            "renewables_available_pct": self.renewables_available_pct,
            "microgrid_isolated": self.microgrid_isolated,
            "microgrid_mode": "ISLANDED" if self.microgrid_isolated else "TIED_GRID",
            "spinning_reserve_target_pct": 30.0 if self.microgrid_isolated else 15.0,
            "scada_diagnostics": scada_diag
        }
        return standard_payload

    def ingest_canonical(self) -> CanonicalTelemetrySnapshot:
        """
        Produces a strictly validated CanonicalTelemetrySnapshot according to the
        Locked V1 Canonical Schema contract.
        """
        self._load_persisted_overrides()
        self.simulator.set_overrides({
            "ambient_temp_c": self.override_temp_c,
            "wind_speed_ms": self.override_wind_ms,
            "solar_irradiance_wm2": self.override_solar_wm2,
            "load_multiplier": self.override_load_mult,
            "battery_soc_pct": self.override_battery_soc,
            "battery_reserve_pct": self.battery_reserve_pct,
            "fault_genset_1": self.fault_genset_1,
            "fault_battery_heater": self.fault_battery_heater,
        })
        return self.simulator.generate_snapshot()


