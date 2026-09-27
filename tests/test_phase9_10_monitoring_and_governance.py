import sys
import os
import numpy as np

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.monitoring.drift_detector import calculate_psi, ModelDriftMonitor, DriftReport
from backend.monitoring.champion_challenger import ChampionChallengerSupervisor, ModelEvaluationCard


def test_calculate_psi_no_drift():
    """Verify PSI is < 0.10 when comparing identical distributions."""
    np.random.seed(42)
    ref = np.random.normal(loc=-20.0, scale=5.0, size=1000)
    curr = np.random.normal(loc=-20.0, scale=5.0, size=200)

    psi = calculate_psi(ref, curr)
    assert psi < 0.10, f"Expected PSI < 0.10 for identical distributions, got {psi}"


def test_calculate_psi_significant_drift():
    """Verify PSI >= 0.25 when comparing drastically shifted distributions."""
    np.random.seed(42)
    # Reference: Antarctic summer (-10°C)
    ref = np.random.normal(loc=-10.0, scale=3.0, size=1000)
    # Current: Deep winter blizzard (-45°C)
    curr = np.random.normal(loc=-45.0, scale=4.0, size=200)

    psi = calculate_psi(ref, curr)
    assert psi >= 0.25, f"Expected significant PSI >= 0.25, got {psi}"


def test_model_drift_monitor_ingestion_and_reporting():
    """Verify ModelDriftMonitor ingest loop and report generation."""
    monitor = ModelDriftMonitor()

    np.random.seed(42)
    # Ingest 100 normal observations drawn from nominal baseline distributions
    for i in range(100):
        feats = {
            "ambient_temp_c": float(np.random.uniform(-35.0, -5.0)),
            "wind_speed_ms": float(np.random.weibull(2.0) * 11.0),
            "solar_irradiance_wm2": float(np.maximum(0.0, np.random.uniform(-20.0, 300.0))),
            "station_load_kwe": float(np.random.normal(50.0, 6.0))
        }
        y_true = feats["station_load_kwe"] + float(np.random.normal(0, 0.5))
        monitor.ingest_observation(feats, y_true=y_true, p10=y_true - 5.0, p50=y_true, p90=y_true + 5.0)

    report = monitor.evaluate_drift()
    assert isinstance(report, DriftReport)
    assert report.max_psi < 0.25
    assert report.drift_detected is False
    assert report.rolling_rmse >= 0.0


def test_champion_challenger_evaluation():
    """Verify Champion/Challenger evaluation card metrics."""
    supervisor = ChampionChallengerSupervisor()
    np.random.seed(42)
    y_true = np.array([50.0, 52.0, 48.0, 55.0, 60.0])

    champ_preds = {
        "p10": np.array([45.0, 47.0, 43.0, 50.0, 55.0]),
        "p50": np.array([50.0, 52.0, 48.0, 55.0, 60.0]),
        "p90": np.array([55.0, 57.0, 53.0, 60.0, 65.0]),
    }

    champ_card, chall_card = supervisor.evaluate_models(y_true, champ_preds)
    assert champ_card.monotonicity_compliance_pct == 100.0
    assert champ_card.non_negative_compliance_pct == 100.0
    assert champ_card.rmse == 0.0  # Perfect median prediction
    assert chall_card is None


def test_challenger_rejection_on_monotonicity_failure():
    """Verify Challenger is rejected if predictions cross: p10 > p50."""
    supervisor = ChampionChallengerSupervisor()
    supervisor.register_challenger("CHALLENGER-BUGGY-V2")

    y_true = np.array([50.0, 52.0, 48.0])
    champ_preds = {
        "p10": np.array([45.0, 47.0, 43.0]),
        "p50": np.array([50.0, 52.0, 48.0]),
        "p90": np.array([55.0, 57.0, 53.0]),
    }
    # Buggy challenger: p10 is 60.0 > p50 is 50.0 at step 0!
    chall_preds = {
        "p10": np.array([60.0, 47.0, 43.0]),
        "p50": np.array([50.0, 52.0, 48.0]),
        "p90": np.array([55.0, 57.0, 53.0]),
    }

    champ_card, chall_card = supervisor.evaluate_models(y_true, champ_preds, chall_preds)
    assert chall_card.monotonicity_compliance_pct < 100.0
    assert chall_card.is_promotable is False

    promo_res = supervisor.promote_challenger(chall_card)
    assert promo_res["status"] == "REJECTED"


def test_challenger_successful_promotion_and_rollback():
    """Verify Challenger promotion when superior, followed by safe rollback."""
    supervisor = ChampionChallengerSupervisor()
    initial_champ = supervisor.champion_id
    supervisor.register_challenger("LGBM-QUANTILE-V2-SUPERIOR")

    y_true = np.array([50.0, 52.0, 48.0, 55.0, 60.0])
    # Baseline champion has errors of +/- 4 kW
    champ_preds = {
        "p10": np.array([42.0, 44.0, 40.0, 47.0, 52.0]),
        "p50": np.array([46.0, 48.0, 44.0, 51.0, 56.0]),
        "p90": np.array([58.0, 60.0, 56.0, 63.0, 68.0]),
    }
    # Challenger has much tighter, more accurate predictions
    chall_preds = {
        "p10": np.array([47.0, 49.0, 45.0, 52.0, 57.0]),
        "p50": np.array([50.0, 52.0, 48.0, 55.0, 60.0]),
        "p90": np.array([53.0, 55.0, 51.0, 58.0, 63.0]),
    }

    champ_card, chall_card = supervisor.evaluate_models(y_true, champ_preds, chall_preds)
    assert chall_card.is_promotable is True

    # Promote challenger
    res_promo = supervisor.promote_challenger(chall_card)
    assert res_promo["status"] == "PROMOTED"
    assert supervisor.champion_id == "LGBM-QUANTILE-V2-SUPERIOR"

    # Rollback to initial champion
    res_rollback = supervisor.rollback_to_previous_champion()
    assert res_rollback["status"] == "ROLLED_BACK"
    assert supervisor.champion_id == initial_champ


if __name__ == "__main__":
    tests = [
        test_calculate_psi_no_drift,
        test_calculate_psi_significant_drift,
        test_model_drift_monitor_ingestion_and_reporting,
        test_champion_challenger_evaluation,
        test_challenger_rejection_on_monotonicity_failure,
        test_challenger_successful_promotion_and_rollback,
    ]
    passed = 0
    print(f"=== RUNNING PHASE 9 & 10 MONITORING & GOVERNANCE TESTS ({len(tests)} total) ===")
    for t in tests:
        try:
            t()
            print(f"  [PASS] {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  [FAIL] {t.__name__}: {e}")
            import traceback
            traceback.print_exc()

    print(f"\nPhase 9 & 10 Test Results: {passed}/{len(tests)} passed.")
    if passed == len(tests):
        print("ALL PHASE 9 & 10 UNIT TESTS PASSED SUCCESSFULLY.")
    else:
        sys.exit(1)
