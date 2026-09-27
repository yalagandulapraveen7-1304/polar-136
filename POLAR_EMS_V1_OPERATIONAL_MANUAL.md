# POLAR ENERGY MANAGEMENT SYSTEM (POLAR EMS V1)
## OPERATIONAL ARCHITECTURE & SYSTEMS MANUAL

**Primary Source of Truth**: Polar EMS V1 Master Specification  
**Design Environment**: Extreme Antarctic Research Stations (Bharati & Maitri)  
**Operating Philosophy**: `PREDICT → VERIFY → CONSTRAIN → OPTIMIZE → ADAPT → PROTECT → MONITOR → IMPROVE SAFELY`  
**License Tier**: 100% Local-First / Zero Software License Cost / Fully Air-Gapped Capable  

---

## 1. EXECUTIVE SUMMARY & SYSTEM ARCHITECTURE

The Polar Energy Management System (Polar EMS V1) is a production-grade, life-critical microgrid supervisory control and energy dispatch system designed specifically for the extreme conditions of the Antarctic plateau and coastlines.

### 1.1 Key Technical Milestones
- **Multi-Horizon Probabilistic Forecasting**: LightGBM Quantile Regression ($p_{10}, p_{50}, p_{90}$) trained on polar physics (katabatic winds, solar declination, building UA thermal loss) with strict non-crossing monotonicity ($p_{10} \le p_{50} \le p_{90}$).
- **Physics-Grounded Digital Twin**: First-principles electro-thermal component models (Arrhenius internal battery impedance, non-linear diesel SFOC curves with wet-stacking penalty, station building envelope conduction) combined with an adaptive ML residual correction loop.
- **Rolling-Horizon Mixed-Integer Linear Programming (MILP)**: Fuel minimization and engine commitment optimization powered by the high-performance open-source **HiGHS** solver (`scipy.optimize.milp`), featuring semi-continuous generator limits and binary battery charge/discharge mutual exclusivity.
- **Multi-Tier Policy & Safety Guardrail Layer**: Strict classification into **HARD** (inviolable life-safety boundaries), **SOFT** (hierarchical load-shedding and battery cycle preservation), and **OBJECTIVE** (fuel and emissions reduction) tiers.
- **Asset Health & Anomaly Detection**: Component degradation models (battery equivalent full cycles, generator soot index, blade icing risk) paired with **Isolation Forest** multivariate anomaly detection.
- **Continuous Drift Monitoring & Governance**: Population Stability Index (PSI) feature drift tracking, rolling pinball loss validation, and Champion/Challenger shadow evaluation with automated rollback protection.

---

## 2. CANONICAL DATA SCHEMA & OPERATING ENVELOPES

Polar EMS enforces canonical typing across all data ingestion and dispatch pipelines (`backend/schema/canonical.py`):

| Signal | Nominal Range | Hard Physical Bounds | Rate of Change Limit |
|---|---|---|---|
| **Ambient Temperature** | $-55^\circ\text{C}$ to $+5^\circ\text{C}$ | $[-65.0^\circ\text{C}, +15.0^\circ\text{C}]$ | $1.5^\circ\text{C}/\text{s}$ |
| **Wind Velocity** | $0$ to $30\text{ m/s}$ | $[0.0, 55.0\text{ m/s}]$ | $12.0\text{ m/s}/\text{s}$ |
| **Solar Irradiance** | $0$ to $800\text{ W/m}^2$ | $[0.0, 1200.0\text{ W/m}^2]$ | $50.0\text{ W/m}^2/\text{s}$ |
| **Battery State of Charge** | $20\%$ to $95\%$ | $[0.0\%, 100.0\%]$ | $1.0\%/\text{s}$ |
| **Battery Cell Temp** | $+5^\circ\text{C}$ to $+15^\circ\text{C}$ | $[-45.0^\circ\text{C}, +45.0^\circ\text{C}]$ | $0.5^\circ\text{C}/\text{s}$ |
| **Grid AC Frequency** | $50.0\text{ Hz}$ | $[47.5\text{ Hz}, 52.5\text{ Hz}]$ | $1.2\text{ Hz}/\text{s}$ |
| **Microgrid AC Voltage** | $400.0\text{ V}$ | $[360.0\text{ V}, 440.0\text{ V}]$ | $15.0\text{ V}/\text{s}$ |

Every telemetry snapshot undergoes automated Range Validation, Rate-of-Change Delta Clamping, and Cross-Signal Consistency Filtering (tagging data quality as `GOOD`, `SUSPECT`, `BAD`, or `SUBSTITUTED`).

---

## 3. MULTI-HORIZON PROBABILISTIC FORECASTING (PHASE 3)

The forecasting engine (`backend/ai_models.py`) provides calibrated quantile forecasts ($p_{10}, p_{50}, p_{90}$) across 8 operational horizons:
1. `24 Hours` (Hourly operational dispatch)
2. `Tomorrow` (Next calendar day lookahead)
3. `Current Week` (7-day synoptic outlook)
4. `Next 2-3 Weeks` (21-day expedition planning)
5. `1 Month` (30-day fuel burn schedule)
6. `3 Months` (Seasonal transition)
7. `6 Months` (Solstice cycle)
8. `12 Months` (Annual polar winter / summer campaign)

### 3.1 Non-Crossing Monotonicity & Pinball Loss
- Quantile models are trained with pinball loss objective:
  $$\mathcal{L}_q(y, \hat{y}) = \max(q(y - \hat{y}), (1 - q)(\hat{y} - y))$$
- Post-processing enforces physical monotonicity and non-negativity:
  $$\hat{y}_{p10} = \max(0.0, \min(\hat{y}_{p10}, \hat{y}_{p50}))$$
  $$\hat{y}_{p90} = \max(\hat{y}_{p50}, \hat{y}_{p90})$$
- Polar Night Constraint: During Antarctic winter (May to August) or solar elevation $\le 0^\circ$, solar generation potential is clamped to strictly $0.0\text{ kW}$ across all quantiles.

---

## 4. ROLLING-HORIZON MILP OPTIMIZATION (PHASE 5)

Microgrid dispatch is formulated as a Mixed-Integer Linear Program solved via HiGHS (`backend/optimizer.py`):

$$\min \sum_{t=1}^T \left( C_{\text{fuel}} P_{\text{gen}}(t) + C_{\text{idle}} u_{\text{gen}}(t) + C_{\text{deg}} P_{\text{dis}}(t) - R_{\text{store}} P_{\text{chg}}(t) + C_{\text{aux}} Q_{\text{aux}}(t) + C_{\text{curt}} P_{\text{curt}}(t) \right)$$

### 4.1 Constraints
1. **Electrical Power Balance**:
   $$P_{g1}(t) + P_{g2}(t) + P_{\text{wind}}(t) + P_{\text{solar}}(t) + P_{\text{dis}}(t) - P_{\text{chg}}(t) - P_{\text{curt}}(t) = P_{\text{load}}(t)$$
2. **Semi-Continuous Diesel Loading**:
   $$0.25 P_{\text{rated}} \cdot u_{g}(t) \le P_g(t) \le P_{\text{rated}} \cdot u_{g}(t), \quad u_g(t) \in \{0, 1\}$$
3. **Battery DC Exclusivity**:
   $$u_{\text{dis}}(t) + u_{\text{chg}}(t) \le 1, \quad u_{\text{dis}}, u_{\text{chg}} \in \{0, 1\}$$
4. **Thermal CHP Recovery & Balance**:
   $$1.20 \cdot (P_{g1}(t) + P_{g2}(t)) + Q_{\text{aux}}(t) \ge Q_{\text{thermal\_load}}(t)$$
5. **Protected Reserve Floor**:
   $$\text{SoC}(t) \ge \text{Reserve Floor} \quad \forall t$$

---

## 5. MULTI-TIER POLICY & SAFETY GUARDRAILS (PHASE 6 & 7)

Constraint hierarchy enforced by `PolarPolicyEngine` (`backend/policy/constraint_engine.py`):

```
┌─────────────────────────────────────────────────────────────┐
│                    TIER 1: HARD CONSTRAINTS                 │
│  • Life-Support Load 100% Inviolable (NEVER shed)           │
│  • Sub-Zero BESS Freeze Lockout (≤ -35°C discharge blocked) │
│  • Protected Reserve Floor (SoC ≤ Reserve discharge blocked)│
│  • Gale Cut-Out Mechanical Feathering (> 25 m/s shutoff)    │
│  • Minimum 60-Minute Diesel Runtime (Thermal shock defense) │
│  • Battery DC Exclusivity (No concurrent charge/discharge)  │
│  • Blackout Defense (Emergency Gen 2 automatic spin-up)     │
└──────────────────────────────┬──────────────────────────────┘
                               │ (Deficit unresolved)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    TIER 2: SOFT CONSTRAINTS                 │
│  • Hierarchical Emergency Load Shedding:                    │
│      Step 1: Shed Tier 3 Auxiliary loads (garages, melt)    │
│      Step 2: Shed Tier 2 Science labs (spectrometers, rigs) │
│      Step 3: Preserve Tier 1 Life Support at all costs      │
│  • Battery Cycle Life Conservation                          │
│  • Renewable Curtailment Minimization                       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  TIER 3: OBJECTIVE DIRECTIVES               │
│  • Minimize Total Diesel Fuel Consumption (Liters)          │
│  • Minimize CO2 & Particulate Emissions                     │
│  • Maximize Clean Renewable Energy Utilization Ratio        │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. ASSET HEALTH, ANOMALIES & MODEL GOVERNANCE (PHASE 8, 9, 10)

- **Genset Health**: Tracks wet-stacking soot accumulation when operated under 30% load, running hours toward 8000-hr overhaul, and fuel injector fouling deviation.
- **BESS Health**: Tracks Coulombic throughput, Equivalent Full Cycles (EFC), calendar/thermal aging, and sub-zero freeze damage events.
- **Wind Turbine Health**: Tracks aerodynamic fatigue index under turbulent katabatic winds ($> 18\text{ m/s}$) and detects blade rime icing.
- **Multivariate Anomaly Detection**: 35-estimator Isolation Forest (`sklearn.ensemble.IsolationForest`) computing anomaly scores $[0.0, 1.0]$ across environmental and microgrid channels.
- **Model Drift Monitoring**: Population Stability Index (PSI) computed on rolling 500-sample buffers with automatic warning triggers at $\text{PSI} \ge 0.10$ and retraining alerts at $\text{PSI} \ge 0.25$.
- **Champion/Challenger Governance**: Shadow evaluation gate requiring $\ge 2.5\%$ improvement in composite pinball loss, 100% monotonicity compliance, and automated rollback capability.

---

## 7. FULL 69-TEST VERIFICATION MATRIX

| Phase | Test Suite Module | Tests | Result | Status |
|---|---|:---:|:---:|:---:|
| **Phase 1** | `test_phase1_canonical_and_simulation.py` | 8 | 8 / 8 Pass | **VERIFIED** |
| **Phase 2** | `test_phase2_validation_and_features.py` | 8 | 8 / 8 Pass | **VERIFIED** |
| **Phase 3** | `test_phase3_quantile_forecasting.py` | 8 | 8 / 8 Pass | **VERIFIED** |
| **Phase 4** | `test_phase4_digital_twin_and_residuals.py` | 8 | 8 / 8 Pass | **VERIFIED** |
| **Phase 5** | `test_phase5_milp_optimizer.py` | 8 | 8 / 8 Pass | **VERIFIED** |
| **Phase 6 & 7** | `test_phase6_7_constraints_and_guardrails.py` | 8 | 8 / 8 Pass | **VERIFIED** |
| **Phase 8** | `test_phase8_asset_health_and_anomalies.py` | 7 | 7 / 7 Pass | **VERIFIED** |
| **Phase 9 & 10** | `test_phase9_10_monitoring_and_governance.py` | 6 | 6 / 6 Pass | **VERIFIED** |
| **Phase 11** | `test_phase11_system_integration.py` | 8 | 8 / 8 Pass | **VERIFIED** |
| **Phase 12** | `run_all_v1_tests.py` | 9 suites | 9 / 9 Pass | **ALL 69 TESTS PASSED** |

---

## 8. OPERATIONAL RUNBOOK FOR COMMANDERS

### 8.1 Initiating Commander Overrides
Operators can inject environmental extremes or asset contingencies using the Commander Control Modal in the React UI or the REST API:
- `POST /api/commander/override`
  ```json
  {
    "ambient_temp_c": -45.0,
    "wind_speed_ms": 28.0,
    "fault_genset_1": true,
    "battery_reserve_pct": 35.0
  }
  ```
- To restore nominal autonomous control:
  `POST /api/commander/reset`

### 8.2 Inspecting System Diagnostics
- **Full Microgrid Status**: `GET /api/status`
- **Probabilistic Forecasts**: `GET /api/forecast?horizon=24+Hours`
- **Asset Health Diagnostics**: `GET /api/health`
- **Model Drift & PSI Report**: `GET /api/drift`
- **Digital Twin Simulation State**: `GET /api/digital_twin`
- **Historical Event & Audit Log**: `GET /api/history`
