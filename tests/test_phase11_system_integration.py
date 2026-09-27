import sys
import os
import asyncio
import httpx

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.main import app, compute_system_snapshot


def test_compute_system_snapshot_structure():
    """Verify compute_system_snapshot integrates all 10 modular microgrid subsystems."""
    snapshot = compute_system_snapshot()

    assert "telemetry" in snapshot
    assert "dispatch" in snapshot
    assert "guardrail" in snapshot
    assert "explanation" in snapshot
    assert "forecast_24h" in snapshot
    assert "hardware_health" in snapshot
    assert "digital_twin" in snapshot

    # Verify telemetry
    t = snapshot["telemetry"]
    assert "station_id" in t
    assert "station_load_kwe" in t
    assert "ambient_temp_c" in t

    # Verify MILP dispatch
    d = snapshot["dispatch"]
    assert "p_diesel_1_kw" in d
    assert "p_wind_kw" in d
    assert "p_battery_discharge_kw" in d
    assert "p_battery_charge_kw" in d

    # Verify Guardrail & Load shedding
    g = snapshot["guardrail"]
    assert "is_overridden" in g
    assert "load_shedding_active" in g
    assert g["tier_1_shed_kw"] == 0.0

    # Verify Hardware Health & Isolation Forest
    hh = snapshot["hardware_health"]
    assert "genset_1_health_pct" in hh
    assert "wind_turbine_health_pct" in hh
    assert "bess_thermal_health_pct" in hh
    assert "multivariate_anomaly_score" in hh

    # Verify Digital Twin
    dt = snapshot["digital_twin"]
    assert "hybrid_fuel_burn_lh" in dt or "battery_soc_pct" in dt


async def run_async_endpoint_tests():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", timeout=10.0) as client:
        # 1. GET /api/status
        res_status = await client.get("/api/status")
        assert res_status.status_code == 200, f"Status failed: {res_status.text}"
        data = res_status.json()
        assert data["status"] == "ONLINE"
        assert "telemetry" in data
        assert "dispatch" in data
        assert "hardware_health" in data
        print("  [PASS] test_rest_endpoint_status")

        # 2. GET /api/forecast across horizons
        for horizon in ["24 Hours", "Tomorrow"]:
            res_fc = await client.get(f"/api/forecast?horizon={horizon}")
            assert res_fc.status_code == 200, f"Forecast failed: {res_fc.text}"
            fc_data = res_fc.json()
            assert fc_data["horizon"] == horizon
            assert "electrical_kwe" in fc_data
            assert "electrical_kwe_p10" in fc_data
            assert "electrical_kwe_p90" in fc_data
            assert len(fc_data["hours"]) == 24
        print("  [PASS] test_rest_endpoint_forecast")

        # 3. POST /api/commander/override and /api/commander/reset
        res_override = await client.post("/api/commander/override", json={
            "ambient_temp_c": -45.0,
            "wind_speed_ms": 22.0,
            "fault_genset_1": True,
            "battery_reserve_pct": 35.0
        })
        assert res_override.status_code == 200
        assert res_override.json()["status"] == "SUCCESS"

        # Verify override in status
        res_verify = await client.get("/api/status")
        assert res_verify.json()["telemetry"]["ambient_temp_c"] == -45.0
        assert res_verify.json()["telemetry"]["genset_1_fault"] is True

        # Reset override
        res_reset = await client.post("/api/commander/reset")
        assert res_reset.status_code == 200
        assert res_reset.json()["status"] == "SUCCESS"
        print("  [PASS] test_rest_endpoint_commander_override_and_reset")

        # 4. GET /api/health
        res_health = await client.get("/api/health")
        assert res_health.status_code == 200
        h_data = res_health.json()
        assert "hardware_health" in h_data
        assert "details" in h_data
        assert "genset_1" in h_data["details"]
        assert "bess" in h_data["details"]
        print("  [PASS] test_rest_endpoint_health")

        # 5. GET /api/drift
        res_drift = await client.get("/api/drift")
        assert res_drift.status_code == 200
        d_data = res_drift.json()
        assert "feature_psi" in d_data
        assert "max_psi" in d_data
        print("  [PASS] test_rest_endpoint_drift")

        # 6. GET /api/digital_twin
        res_twin = await client.get("/api/digital_twin")
        assert res_twin.status_code == 200
        t_data = res_twin.json()
        assert "station_id" in t_data
        print("  [PASS] test_rest_endpoint_digital_twin")

        # 7. GET / (Frontend serving)
        res_index = await client.get("/")
        assert res_index.status_code == 200
        assert "<title>" in res_index.text or 'id="root"' in res_index.text
        print("  [PASS] test_frontend_static_serving")


def test_rest_endpoints():
    asyncio.run(run_async_endpoint_tests())


if __name__ == "__main__":
    print("=== RUNNING PHASE 11 SYSTEM INTEGRATION TESTS ===")
    try:
        test_compute_system_snapshot_structure()
        print("  [PASS] test_compute_system_snapshot_structure")
        test_rest_endpoints()
        print("\nALL PHASE 11 SYSTEM INTEGRATION TESTS PASSED SUCCESSFULLY.")
    except Exception as e:
        print(f"\n[FAIL]: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
