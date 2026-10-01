"""
PolarOPS - Master Test Suite Runner (Phase 12 Verification)
Runs all unit and integration test suites across the complete 12-Phase Polar EMS V1 Architecture:
- Phase 1: Canonical Schema & Physics-Grounded Digital Twin Simulator
- Phase 2: Data Validation & Feature Engineering Pipeline
- Phase 3: Multi-Horizon LightGBM Quantile Probabilistic Forecasting
- Phase 4: Component Physics Models & ML Residual Correction
- Phase 5: Rolling-Horizon Mixed-Integer Linear Programming (MILP) Optimizer
- Phase 6 & 7: Explicit Multi-Tier Constraints & Deterministic Safety Guardrails
- Phase 8: Asset Health, Degradation & Isolation Forest Anomaly Detection
- Phase 9 & 10: Model Performance Drift Monitoring & Champion/Challenger Governance
- Phase 11: End-to-End System Integration & REST/WebSocket Verification
"""
import sys
import os
import subprocess
import time

test_files = [
    ("Phase 0: Core Physics & Invariants Check", "tests/verify_core_invariants.py"),
    ("Phase 1: Canonical Schema & Simulation", "tests/test_phase1_canonical_and_simulation.py"),
    ("Phase 2: Validation & Feature Engineering", "tests/test_phase2_validation_and_features.py"),
    ("Phase 3: Quantile Forecasting Engine", "tests/test_phase3_quantile_forecasting.py"),
    ("Phase 4: Digital Twin & Residuals", "tests/test_phase4_digital_twin_and_residuals.py"),
    ("Phase 5: Rolling-Horizon MILP Optimizer", "tests/test_phase5_milp_optimizer.py"),
    ("Phase 6 & 7: Constraints & Guardrails", "tests/test_phase6_7_constraints_and_guardrails.py"),
    ("Phase 8: Asset Health & Anomaly Detection", "tests/test_phase8_asset_health_and_anomalies.py"),
    ("Phase 9 & 10: Drift Monitoring & Governance", "tests/test_phase9_10_monitoring_and_governance.py"),
    ("Phase 11: End-to-End System Integration", "tests/test_phase11_system_integration.py"),
]

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    print("=" * 75)
    print("POLAR EMS V1 — COMPLETE 12-PHASE ARCHITECTURE VERIFICATION HARNESS")
    print(f"Executing in: {root_dir}")
    print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
    print("=" * 75)

    passed_suites = 0
    total_start = time.perf_counter()

    for phase_name, rel_path in test_files:
        full_path = os.path.join(root_dir, rel_path)
        print(f"\n>> Executing {phase_name} ({rel_path})...")
        t0 = time.perf_counter()
        res = subprocess.run([sys.executable, full_path], cwd=root_dir, capture_output=True, text=True)
        duration = time.perf_counter() - t0

        if res.returncode == 0:
            print(f"   [SUCCESS] {phase_name} passed in {duration:.2f}s")
            passed_suites += 1
        else:
            print(f"   [FAILED] {phase_name} failed (exit code {res.returncode}) in {duration:.2f}s")
            print("--- Output ---")
            print(res.stdout)
            print("--- Stderr ---")
            print(res.stderr)

    total_duration = time.perf_counter() - total_start
    print("\n" + "=" * 75)
    print(f"FINAL RESULT: {passed_suites}/{len(test_files)} TEST SUITES PASSED IN {total_duration:.2f}s")
    if passed_suites == len(test_files):
        print("ALL 12 PHASES OF POLAR EMS V1 SPECIFICATION FULLY VERIFIED & READY!")
        print("=" * 75)
        sys.exit(0)
    else:
        print("SOME TEST SUITES FAILED. PLEASE REVIEW LOGS ABOVE.")
        print("=" * 75)
        sys.exit(1)

if __name__ == "__main__":
    main()
