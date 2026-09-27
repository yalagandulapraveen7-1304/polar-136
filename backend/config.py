"""
PolarOPS - System Configuration and Hardware Profiles
Indian Antarctic Research Stations: Maitri & Bharati
"""
import os
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import Dict

# Load environment variables from .env file
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

# Station Definitions
STATIONS = {
    "MAITRI": {
        "id": "MAITRI",
        "name": "Maitri Research Station",
        "region": "Schirmacher Oasis, Queen Maud Land, Antarctica",
        "lat": -70.7661,
        "lon": 11.7358,
        "elevation_m": 117,
        "base_load_kwe": 179.0,
        "peak_load_kwe": 412.0,
        "base_thermal_kwth": 120.0,
        "peak_thermal_kwth": 268.0,
        "genset_1_max_kw": 300.0,
        "genset_2_max_kw": 200.0,
        "wind_capacity_kw": 100.0,
        "solar_capacity_kw": 60.0,
        "battery_capacity_kwh": 400.0,
        "inverter_rating_kw": 80.0,
        "battery_nominal_v": 480.0,
        "diesel_fuel_reserve_liters": 60000.0,
    },
    "BHARATI": {
        "id": "BHARATI",
        "name": "Bharati Research Station",
        "region": "Larsemann Hills, East Antarctica",
        "lat": -69.4078,
        "lon": 76.1872,
        "elevation_m": 35,
        "base_load_kwe": 110.0,
        "peak_load_kwe": 240.0,
        "base_thermal_kwth": 85.0,
        "peak_thermal_kwth": 175.0,
        "genset_1_max_kw": 120.0,
        "genset_2_max_kw": 120.0,
        "wind_capacity_kw": 120.0,
        "solar_capacity_kw": 90.0,
        "battery_capacity_kwh": 350.0,
        "inverter_rating_kw": 70.0,
        "battery_nominal_v": 480.0,
        "diesel_fuel_reserve_liters": 60000.0,
    }
}

# Control & Physics Constants
DIESEL_SPECIFIC_CONSUMPTION = 0.28   # Liters fuel per kWh produced (0.28 L/kWh)
DIESEL_MIN_LOAD_PCT = 0.35           # 35% minimum loading to prevent wet stacking & bore glazing
CHP_THERMAL_RATIO = 1.20             # kWth recovered per kWe of diesel output
DIESEL_MIN_RUN_TIME_MIN = 60.0       # Minimum mandatory run-time (minutes) to prevent thermal shock
CRITICAL_LOAD_MIN_KWE = 20.0         # Inviolable life-support floor (kW)
FLEXIBLE_LOAD_MAX_KWE = 120.0        # Deferrable / sheddable scientific and freezer loads (kW)

# Battery Physical Limits & Derating
BATTERY_MIN_SOC_PCT = 20.0           # Reserve minimum limit (%)
BATTERY_MAX_SOC_PCT = 95.0           # Maximum charge threshold (%)
BATTERY_DERATE_TEMP_C = -20.0        # Temp below which capacity derating begins
BATTERY_LOCKOUT_TEMP_C = -35.0       # Temp below which discharge is inhibited without heating
BATTERY_ROUNDTRIP_EFFICIENCY = 0.92  # 92% efficiency

# Wind Turbine Aerodynamic Envelope
WIND_CUT_IN_MS = 3.2
WIND_RATED_MS = 12.0
WIND_CUT_OUT_MS = 25.0               # High wind mechanical feathering shutoff

# Environment & Settings
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "YOUR_GROQ_API_KEY")
SEMS_MODE = os.getenv("SEMS_MODE", "DEMO_MODE") # DEMO_MODE or SCADA_MODE
DEFAULT_STATION = os.getenv("DEFAULT_STATION", "MAITRI")
if os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
    DB_PATH = "/tmp/sems_logs.db"
else:
    DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "sems_logs.db")

