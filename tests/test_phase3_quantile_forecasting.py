import sys
import os
import datetime
import numpy as np

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.ai_models import (
    PolarDemandForecaster,
    compute_pinball_loss,
    evaluate_quantile_calibration
)
from backend.schema.canonical import ForecastQuantileRecord


def test_forecaster_initialization_and_training():
    """Verify that all 12 LightGBM quantile models (elec, therm, wind, solar x 3 quantiles) train successfully."""
    forecaster = PolarDemandForecaster()
    assert forecaster.is_trained is True

    for target in ["elec", "therm", "wind", "solar"]:
        assert target in forecaster.models
        for q in [0.10, 0.50, 0.90]:
            assert q in forecaster.models[target]
            assert forecaster.models[target][q] is not None


def test_monotonicity_constraint():
    """Verify strict non-crossing monotonicity: p10 <= p50 <= p90 across 24-hour horizon."""
    forecaster = PolarDemandForecaster()
    telemetry = {
        "station_id": "BHARATI",
        "timestamp": datetime.datetime(2026, 3, 15, 12, 0, 0, tzinfo=datetime.timezone.utc).isoformat(),
        "ambient_temp_c": -28.0,
        "wind_speed_ms": 14.5,
        "solar_irradiance_wm2": 180.0
    }

    res = forecaster.predict_horizon(telemetry, "24 Hours")

    for i in range(len(res["hours"])):
        # Electrical Load
        assert res["electrical_kwe_p10"][i] <= res["electrical_kwe_p50"][i], f"Elec p10 > p50 at step {i}"
        assert res["electrical_kwe_p50"][i] <= res["electrical_kwe_p90"][i], f"Elec p50 > p90 at step {i}"

        # Thermal Load
        assert res["thermal_kwth_p10"][i] <= res["thermal_kwth_p50"][i], f"Therm p10 > p50 at step {i}"
        assert res["thermal_kwth_p50"][i] <= res["thermal_kwth_p90"][i], f"Therm p50 > p90 at step {i}"

        # Wind Power
        assert res["wind_kw_p10"][i] <= res["wind_kw_p50"][i], f"Wind p10 > p50 at step {i}"
        assert res["wind_kw_p50"][i] <= res["wind_kw_p90"][i], f"Wind p50 > p90 at step {i}"

        # Solar Power
        assert res["solar_kw_p10"][i] <= res["solar_kw_p50"][i], f"Solar p10 > p50 at step {i}"
        assert res["solar_kw_p50"][i] <= res["solar_kw_p90"][i], f"Solar p50 > p90 at step {i}"


def test_non_negativity():
    """Verify that all physical loads and power generation forecasts are non-negative."""
    forecaster = PolarDemandForecaster()
    telemetry = {
        "station_id": "MAITRI",
        "timestamp": datetime.datetime(2026, 7, 10, 2, 0, 0, tzinfo=datetime.timezone.utc).isoformat(),
        "ambient_temp_c": -42.0,
        "wind_speed_ms": 0.5,
        "solar_irradiance_wm2": 0.0
    }

    res = forecaster.predict_horizon(telemetry, "24 Hours")

    for i in range(len(res["hours"])):
        assert res["electrical_kwe_p10"][i] >= 0.0
        assert res["thermal_kwth_p10"][i] >= 0.0
        assert res["wind_kw_p10"][i] >= 0.0
        assert res["solar_kw_p10"][i] >= 0.0
        assert res["net_electrical_kwe"][i] >= 0.0


def test_pinball_loss_and_calibration():
    """Verify pinball loss and coverage calibration calculations."""
    y_true = np.array([50.0, 55.0, 60.0, 45.0, 52.0])
    p50 = np.array([50.0, 54.0, 61.0, 46.0, 52.0])
    p10 = p50 - 5.0
    p90 = p50 + 5.0

    loss_10 = compute_pinball_loss(y_true, p10, 0.10)
    loss_50 = compute_pinball_loss(y_true, p50, 0.50)
    loss_90 = compute_pinball_loss(y_true, p90, 0.90)

    assert loss_10 >= 0.0
    assert loss_50 >= 0.0
    assert loss_90 >= 0.0

    cal = evaluate_quantile_calibration(y_true, p10, p50, p90)
    assert cal["coverage_80_empirical"] == 1.0  # All points fall between p10 and p90
    assert cal["empirical_fraction_below_p10"] == 0.0
    assert cal["empirical_fraction_above_p90"] == 0.0


def test_polar_night_and_darkness_solar_shutoff():
    """Verify that during polar night or zero irradiance, solar forecast is strictly 0.0 across all quantiles."""
    forecaster = PolarDemandForecaster()
    # Antarctic winter midnight: June 21, 00:00 UTC
    telemetry = {
        "station_id": "BHARATI",
        "timestamp": datetime.datetime(2026, 6, 21, 0, 0, 0, tzinfo=datetime.timezone.utc).isoformat(),
        "ambient_temp_c": -35.0,
        "wind_speed_ms": 12.0,
        "solar_irradiance_wm2": 0.0
    }

    res = forecaster.predict_horizon(telemetry, "Tomorrow")

    # In polar winter, all 24 hours must predict 0 solar
    for i in range(len(res["hours"])):
        assert res["solar_kw_p10"][i] == 0.0
        assert res["solar_kw_p50"][i] == 0.0
        assert res["solar_kw_p90"][i] == 0.0
        assert res["solar_available_kw"][i] == 0.0


def test_high_wind_gale_shutoff():
    """Verify wind turbine cut-out behavior at wind speeds > 25 m/s."""
    forecaster = PolarDemandForecaster()
    p_high = forecaster.calculate_wind_power(26.5, 100.0)
    assert p_high == 0.0

    p_rated = forecaster.calculate_wind_power(12.0, 100.0)
    assert p_rated == 100.0


def test_multi_horizon_backward_compatibility():
    """Verify backward compatibility of output format with legacy frontend keys across horizons."""
    forecaster = PolarDemandForecaster()
    telemetry = {
        "station_id": "MAITRI",
        "timestamp": datetime.datetime(2026, 1, 10, 10, 0, 0, tzinfo=datetime.timezone.utc).isoformat(),
        "ambient_temp_c": -12.0,
        "wind_speed_ms": 8.5,
        "solar_irradiance_wm2": 250.0
    }

    for horizon in ["24 Hours", "Tomorrow", "Current Week", "1 Month", "12 Months"]:
        res = forecaster.predict_horizon(telemetry, horizon)
        # Verify mandatory legacy keys
        assert "horizon" in res
        assert "hours" in res
        assert "timestamps" in res
        assert "electrical_kwe" in res
        assert "thermal_kwth" in res
        assert "wind_available_kw" in res
        assert "solar_available_kw" in res
        assert "net_electrical_kwe" in res

        # Verify length consistency
        n = len(res["hours"])
        assert len(res["timestamps"]) == n
        assert len(res["electrical_kwe"]) == n
        assert len(res["thermal_kwth"]) == n
        assert len(res["wind_available_kw"]) == n
        assert len(res["solar_available_kw"]) == n
        assert len(res["net_electrical_kwe"]) == n

        # Verify new quantile keys
        assert len(res["electrical_kwe_p10"]) == n
        assert len(res["electrical_kwe_p90"]) == n


def test_canonical_forecast_records_generation():
    """Verify that strongly-typed ForecastQuantileRecord records are produced for downstream MILP."""
    forecaster = PolarDemandForecaster()
    telemetry = {
        "station_id": "BHARATI",
        "timestamp": datetime.datetime(2026, 2, 1, 12, 0, 0, tzinfo=datetime.timezone.utc).isoformat(),
        "ambient_temp_c": -15.0,
        "wind_speed_ms": 10.0,
        "solar_irradiance_wm2": 220.0
    }

    res = forecaster.predict_horizon(telemetry, "24 Hours")
    assert "quantile_records" in res
    records = res["quantile_records"]
    assert len(records) == 24 * 4  # 24 steps x 4 variables

    first_rec = records[0]
    assert first_rec["station_id"] == "BHARATI"
    assert first_rec["variable_name"] in ["elec_load_kw", "thermal_load_kw", "wind_power_kw", "solar_power_kw"]
    assert first_rec["p10"] <= first_rec["p50"] <= first_rec["p90"]
    assert first_rec["confidence_score"] > 0.0


if __name__ == "__main__":
    tests = [
        test_forecaster_initialization_and_training,
        test_monotonicity_constraint,
        test_non_negativity,
        test_pinball_loss_and_calibration,
        test_polar_night_and_darkness_solar_shutoff,
        test_high_wind_gale_shutoff,
        test_multi_horizon_backward_compatibility,
        test_canonical_forecast_records_generation,
    ]
    passed = 0
    print(f"=== RUNNING PHASE 3 QUANTILE FORECASTING TESTS ({len(tests)} total) ===")
    for t in tests:
        try:
            t()
            print(f"  [PASS] {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  [FAIL] {t.__name__}: {e}")
            import traceback
            traceback.print_exc()

    print(f"\nPhase 3 Test Results: {passed}/{len(tests)} passed.")
    if passed == len(tests):
        print("ALL PHASE 3 UNIT TESTS PASSED SUCCESSFULLY.")
    else:
        sys.exit(1)
