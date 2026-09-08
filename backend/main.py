"""
PolarOPS - FastAPI Main Application Server
Digital Twin for Antarctic Research Stations (Maitri & Bharati).
Provides real-time 1-second WebSockets, REST endpoints, SciPy MPC optimizer loop,
LightGBM 24h forecaster, Guardrail safety overrides, Groq LLM integration, and SQLite logging.
"""
import os
import asyncio
import datetime
from typing import Dict, Any, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.config import STATIONS, DEFAULT_STATION, SEMS_MODE
from backend.data_ingestion import DataIngestionDriver
from backend.ai_models import PolarDemandForecaster
from backend.optimizer import PolarEnergyOptimizer
from backend.guardrail import SafetyGuardrailEngine
from backend.logger import SystemEventLogger
from backend.llm_service import GroqAIService

# Global Singletons
ingestion_driver = DataIngestionDriver(station_id=DEFAULT_STATION, mode=SEMS_MODE)
forecaster = PolarDemandForecaster()
optimizer = PolarEnergyOptimizer()
guardrail = SafetyGuardrailEngine()
logger = SystemEventLogger()
ai_service = GroqAIService()

# Connected WebSocket clients
active_websockets: List[WebSocket] = []
last_explanation = "SEMS initialized. Microgrid synchronized with polar renewable generation and CHP thermal loop."
last_explanation_time = 0.0

# Current global system state snapshot
current_system_snapshot: Dict[str, Any] = {}

def compute_system_snapshot() -> Dict[str, Any]:
    global last_explanation, last_explanation_time, current_system_snapshot
    # 1. Ingest unified telemetry
    telemetry = ingestion_driver.ingest()
    guardrail.update_clock(1.0)
    
    # 2. Renewable physics potential
    station = STATIONS.get(telemetry["station_id"], STATIONS["MAITRI"])
    wind_avail = forecaster.calculate_wind_power(telemetry["wind_speed_ms"], station["wind_capacity_kw"])
    solar_avail = forecaster.calculate_solar_power(telemetry["solar_irradiance_wm2"], station["solar_capacity_kw"])
    
    # 3. Model Predictive Control (SciPy Linear Programming)
    optimizer_dispatch = optimizer.optimize_dispatch(telemetry, wind_avail, solar_avail)
    
    # 4. Deterministic Safety Guardrails
    guardrail_result = guardrail.enforce_safety(telemetry, optimizer_dispatch)
    safe_dispatch = guardrail_result["safe_dispatch"]
    
    # 5. Groq LLM Decision Explanation (every 30s or immediately upon guardrail trigger)
    now_ts = datetime.datetime.now(datetime.timezone.utc).timestamp()
    if guardrail_result["is_overridden"] or (now_ts - last_explanation_time > 30.0):
        try:
            last_explanation = ai_service.explain_dispatch(telemetry, safe_dispatch, guardrail_result)
            last_explanation_time = now_ts
        except Exception:
            pass

    # 6. Demand & renewable forecast
    try:
        forecast_24h = forecaster.predict_24h(telemetry)
    except Exception:
        forecast_24h = []

    # 7. Offline SQLite Logging
    try:
        logger.log_telemetry_and_dispatch(telemetry, safe_dispatch, guardrail_result, last_explanation)
    except Exception:
        pass

    # 8. Assemble Payload
    payload = {
        "telemetry": telemetry,
        "dispatch": safe_dispatch,
        "guardrail": {
            "is_overridden": guardrail_result["is_overridden"],
            "interventions": guardrail_result["interventions"],
            "gen1_runtime_minutes": guardrail_result["gen1_runtime_minutes"],
            "gen2_runtime_minutes": guardrail_result["gen2_runtime_minutes"]
        },
        "explanation": last_explanation,
        "forecast_24h": forecast_24h,
        "hardware_health": {
            "genset_1_health_pct": 0 if telemetry["genset_1_fault"] else 88,
            "genset_1_status": "FAULT_TRIPPED" if telemetry["genset_1_fault"] else ("RUNNING" if safe_dispatch.get("p_diesel_1_kw", 0) > 0 else "WARM_STANDBY"),
            "genset_2_health_pct": 96,
            "genset_2_status": "RUNNING" if safe_dispatch.get("p_diesel_2_kw", 0) > 0 else "STANDBY",
            "wind_turbine_health_pct": 92 if telemetry["wind_speed_ms"] <= 25.0 else 78,
            "wind_turbine_status": "FEATHERED_BRAKED" if telemetry["wind_speed_ms"] > 25.0 else "GENERATING",
            "bess_thermal_health_pct": 42 if telemetry["battery_heater_fault"] else 97,
            "bess_status": "HEATER_FAULT" if telemetry["battery_heater_fault"] else ("SUBZERO_DERATED" if safe_dispatch.get("battery_derating_factor", 1.0) < 1.0 else "NOMINAL")
        },
        "cloud_ai_active": ai_service.is_cloud_enabled()
    }
    current_system_snapshot = payload
    return payload

async def telemetry_broadcast_loop():
    """1-second high-resolution telemetry, MPC optimization, guardrail, and logging loop"""
    while True:
        try:
            payload = compute_system_snapshot()

            # Broadcast to active WebSockets
            if active_websockets:
                dead_sockets = []
                for ws in active_websockets:
                    try:
                        await ws.send_json(payload)
                    except Exception:
                        dead_sockets.append(ws)
                for ws in dead_sockets:
                    if ws in active_websockets:
                        active_websockets.remove(ws)

        except Exception as e:
            print(f"[Loop Error]: {e}")

        await asyncio.sleep(1.0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        compute_system_snapshot()
    except Exception as e:
        print(f"[Startup Snapshot Warning]: {e}")

    task = None
    try:
        task = asyncio.create_task(telemetry_broadcast_loop())
    except Exception as e:
        print(f"[Broadcast Task Warning]: {e}")

    yield
    if task:
        task.cancel()

app = FastAPI(title="PolarOPS SEMS", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",                                   # keep for local dev
        "https://YOUR_VERCEL_SUBDOMAIN.vercel.app"   # <-- replace with your Vercel URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- Request Models -----------------
class StationSwitchRequest(BaseModel):
    station_id: str

class ModeSwitchRequest(BaseModel):
    mode: str

class CommanderOverrideRequest(BaseModel):
    ambient_temp_c: float | None = None
    wind_speed_ms: float | None = None
    solar_irradiance_wm2: float | None = None
    load_multiplier: float | None = 1.0
    fault_genset_1: bool | None = False
    fault_battery_heater: bool | None = False
    battery_reserve_pct: float | None = None
    battery_soc_pct: float | None = None

class ChatRequest(BaseModel):
    query: str

# ----------------- REST Endpoints -----------------
@app.get("/api/status")
async def get_status(
    override_soc: Optional[float] = Query(None),
    override_reserve: Optional[float] = Query(None),
    override_temp: Optional[float] = Query(None),
    override_wind: Optional[float] = Query(None),
    override_load: Optional[float] = Query(None),
    fault_genset_1: Optional[bool] = Query(None),
    fault_battery_heater: Optional[bool] = Query(None),
):
    query_overrides = {}
    if override_soc is not None:
        query_overrides["battery_soc_pct"] = override_soc
    if override_reserve is not None:
        query_overrides["battery_reserve_pct"] = override_reserve
    if override_temp is not None:
        query_overrides["ambient_temp_c"] = override_temp
    if override_wind is not None:
        query_overrides["wind_speed_ms"] = override_wind
    if override_load is not None:
        query_overrides["load_multiplier"] = override_load
    if fault_genset_1 is not None:
        query_overrides["fault_genset_1"] = fault_genset_1
    if fault_battery_heater is not None:
        query_overrides["fault_battery_heater"] = fault_battery_heater

    if query_overrides:
        ingestion_driver.apply_overrides(query_overrides)

    # In serverless environments, always compute a fresh snapshot so overrides are never stale
    snapshot = compute_system_snapshot()
    return {
        **snapshot,
        "status": "ONLINE",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "station": ingestion_driver.station_id,
        "mode": ingestion_driver.mode,
        "active_ws_clients": len(active_websockets),
        "cloud_ai_active": ai_service.is_cloud_enabled()
    }

@app.post("/api/station/switch")
async def switch_station(req: StationSwitchRequest):
    if req.station_id in STATIONS:
        ingestion_driver.set_station(req.station_id)
        return {"status": "SUCCESS", "station_id": req.station_id, "station": STATIONS[req.station_id]}
    return JSONResponse(status_code=400, content={"status": "ERROR", "message": "Unknown station ID"})

@app.post("/api/mode/switch")
async def switch_mode(req: ModeSwitchRequest):
    if req.mode in ["DEMO_MODE", "SCADA_MODE"]:
        ingestion_driver.set_mode(req.mode)
        return {"status": "SUCCESS", "mode": req.mode}
    return JSONResponse(status_code=400, content={"status": "ERROR", "message": "Invalid mode"})

@app.post("/api/commander/override")
async def commander_override(req: CommanderOverrideRequest):
    ingestion_driver.apply_overrides(req.model_dump(exclude_unset=True))
    compute_system_snapshot()
    return {"status": "SUCCESS", "message": "Commander overrides applied to digital twin."}

@app.post("/api/commander/reset")
async def commander_reset():
    ingestion_driver.clear_overrides()
    compute_system_snapshot()
    return {"status": "SUCCESS", "message": "Overrides cleared, nominal polar physics restored."}

@app.post("/api/chat")
async def ai_chat(req: ChatRequest):
    snapshot = current_system_snapshot if current_system_snapshot else compute_system_snapshot()
    
    answer = ai_service.answer_commander(
        req.query,
        snapshot.get("telemetry", {}),
        snapshot.get("dispatch", {}),
        snapshot.get("guardrail", {})
    )
    logger.log_chat_interaction(req.query, answer)
    return {"answer": answer}

@app.get("/api/scada/registers")
async def get_scada_registers():
    return ingestion_driver.get_latest_scada_registers()

@app.get("/api/forecast")
async def get_forecast(horizon: str = "24 Hours"):
    telemetry = current_system_snapshot.get("telemetry") if current_system_snapshot else ingestion_driver.ingest()
    return forecaster.predict_horizon(telemetry, horizon=horizon)

@app.get("/api/history")
async def get_history():
    return logger.get_recent_history(limit=35)


# ----------------- WebSocket Endpoint -----------------
@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.append(websocket)
    # Immediately send latest snapshot if ready
    if current_system_snapshot:
        try:
            await websocket.send_json(current_system_snapshot)
        except Exception:
            pass
    try:
        while True:
            # Keep socket alive and handle any incoming messages from client
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        if websocket in active_websockets:
            active_websockets.remove(websocket)
    except Exception:
        if websocket in active_websockets:
            active_websockets.remove(websocket)

# ----------------- Frontend Static Files -----------------
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(frontend_dir, "index.html"))
