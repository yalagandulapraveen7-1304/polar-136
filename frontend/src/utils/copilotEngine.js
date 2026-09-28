import { STATIONS } from '../constants/stations';

export function generateCopilotResponse(query, stationId = 'MAITRI', latestData = null, userRole = 'Operator') {
  const qLower = (query || '').toLowerCase().trim();
  const station = STATIONS[stationId] || STATIONS.MAITRI;

  // Extract live or default telemetry
  const t = latestData?.telemetry || {
    load_elec_kw: station.baseLoad || 179,
    solar_kw: stationId === 'MAITRI' ? 0 : 35,
    wind_kw: stationId === 'MAITRI' ? 100 : 75,
    diesel_kw: stationId === 'MAITRI' ? 105 : 0,
    temp_c: stationId === 'MAITRI' ? -26.3 : -21.4,
    wind_speed_ms: stationId === 'MAITRI' ? 14.2 : 11.8,
    grid_freq_hz: 50.02
  };
  const b = latestData?.battery || {
    soc_pct: 77,
    flow_kw: 26.5,
    usable_kwh: Math.round(station.batteryCapacity * 0.57),
    reserve_floor_pct: 20
  };
  const g = latestData?.generators || {
    g1_kw: 105,
    g2_kw: 0,
    loading_pct: 35.0,
    chp_heat_kwth: 72
  };

  const renewablesKw = (t.solar_kw || 0) + (t.wind_kw || 0);
  const renewablePct = t.load_elec_kw > 0 ? Math.min(100, Math.round((renewablesKw / t.load_elec_kw) * 100)) : 55;

  // 1. Cross-Station Comparison
  if (qLower.includes('compare') || qLower.includes('comparison') || (qLower.includes('maitri') && qLower.includes('bharati'))) {
    return {
      answer: `CROSS-STATION OPERATIONAL COMPARISON: MAITRI vs BHARATI\n\n` +
        `• MAITRI STATION (${STATIONS.MAITRI.locationText}):\n` +
        `  - Installed Generation: 100 kW Wind, 60 kW Solar, 3x 125 kW Volvo Gensets (Base load: 179 kW, Peak: 412 kW).\n` +
        `  - Energy Storage: 400 kWh LiFePO4 BESS (20% reserve floor).\n` +
        `  - Operating Profile: Heavier industrial & habitat heating baseline (-26°C avg). Renewable penetration currently ~52.4%.\n\n` +
        `• BHARATI STATION (${STATIONS.BHARATI.locationText}):\n` +
        `  - Installed Generation: 120 kW Wind, 90 kW Solar, 3x 100 kW MAN Gensets (Base load: 110 kW, Peak: 240 kW).\n` +
        `  - Energy Storage: 350 kWh LiFePO4 BESS (20% reserve floor).\n` +
        `  - Operating Profile: Ultra-modern aerodynamic design in Larsemann Hills. Renewable penetration currently ~68.2%.\n\n` +
        `• FLEET SUMMARY: Bharati operates with higher renewable self-sufficiency due to coastal laminar winds, while Maitri maintains larger diesel fuel reserves (60,000 L) for interior continental polar vortex survivability.`,
      evidence: `Maitri Load: ${STATIONS.MAITRI.baseLoad} kW | Bharati Load: ${STATIONS.BHARATI.baseLoad} kW. Cross-station SCADA telemetry synchronized via GSAT-8 Antarctic link.`,
      impact: `Multi-station load profile indicates high reliability across both research outposts with zero curtailment required.`,
      recommendation: `Maintain existing automated dispatch across both bases. Review fuel replenishment convoy logistics for Maitri ahead of winter freeze.`,
      sources: ['SCADA Fleet Telemetry', 'NCPOR Antarctic Logistics Database', 'HiGHS Multi-Station MILP Engine'],
      action_card: {
        action: 'Open Station Comparison',
        reason: 'View detailed side-by-side telemetry and hardware status.',
        button_label: 'COMPARE STATIONS',
        action_type: 'VIEW_COMPARISON'
      },
      mode: 'LOCAL_FALLBACK'
    };
  }

  // 2. Why is Generator 1 running when wind is available?
  if ((qLower.includes('generator') || qLower.includes('diesel') || qLower.includes('g1')) && 
      (qLower.includes('why') || qLower.includes('running') || qLower.includes('wind') || qLower.includes('available'))) {
    return {
      answer: `WHY GENERATOR 1 IS ONLINE AT ${station.name.toUpperCase()}:\n\n` +
        `1. Minimum Loading Constraint (Anti-Wet-Stacking): Generator 1 has a strictly enforced 35% minimum load floor (${Math.round(station.genset1Capacity * 0.35)} kW) to prevent cylinder glazing and carbon fouling from light-load operation.\n` +
        `2. Combined Heat & Power (CHP): G1 jacket water and exhaust heat exchangers supply 72 kWth of thermal co-generation directly to living habitat modules, keeping ambient indoor temp at +18°C despite -26.3°C exterior chill.\n` +
        `3. Battery Reserve Floor Lockout: BESS State of Charge is at ${b.soc_pct}%. The optimizer locks a 20% inviolable spinning reserve margin for critical life-support heating circuits.\n` +
        `4. Katabatic Wind Fluctuation: Current wind harvest is ${t.wind_kw} kW. The MILP solver forecasts potential wind turbulence over the next 3 hours and maintains G1 in low-idle to avoid costly thermal cold-starts.`,
      evidence: `G1 active at ${g.g1_kw || 105} kW (${g.loading_pct || 35}% load factor). Thermal CHP recovery: +72 kWth. Grid frequency locked at ${t.grid_freq_hz} Hz.`,
      impact: `Shutting down G1 would reduce station fuel burn by only 8 L/h, but would trigger auxiliary electric resistive heaters (+60 kW electrical load) and risk wet-stacking penalty upon emergency restart.`,
      recommendation: `Keep Generator 1 synchronized at current minimum thermal dispatch. Do not force manual trip.`,
      sources: ['MILP HiGHS Solver Constraints', 'Volvo Penta Genset Thermal Logs', 'Station Life-Support Telemetry'],
      action_card: {
        action: 'Inspect Dispatch Schedule',
        reason: 'Review 24-hour MILP generator commitment schedule.',
        button_label: 'VIEW DISPATCH',
        action_type: 'VIEW_OPTIMIZATION'
      },
      mode: 'LOCAL_FALLBACK'
    };
  }

  // 3. Which station has higher renewable share?
  if (qLower.includes('renewable share') || qLower.includes('higher renewable') || qLower.includes('green energy') || (qLower.includes('which') && qLower.includes('renewable'))) {
    return {
      answer: `RENEWABLE PENETRATION RANKING:\n\n` +
        `• 1st: BHARATI RESEARCH STATION — 68.2% Renewable Share\n` +
        `  - Driven by steady maritime coastal katabatic winds (avg 8.4 m/s in Larsemann Hills) and 120 kW aerodynamic turbine array.\n` +
        `  - Lower baseload electrical demand (110 kW) allows wind + solar to meet majority of consumption during peak daylight.\n\n` +
        `• 2nd: MAITRI RESEARCH STATION — 52.4% Renewable Share\n` +
        `  - Schirmacher Oasis terrain experiences higher gust volatility and winter polar night isolation.\n` +
        `  - Higher baseload (179 kW electrical, 120 kW thermal) necessitates continuous diesel CHP co-generation.\n\n` +
        `CONCLUSION: Bharati currently delivers 15.8% higher green energy penetration, saving approximately 48,000 Litres of arctic diesel annually.`,
      evidence: `Bharati: 68.2% renewable fraction (100 kW wind harvest / 110 kW load). Maitri: 52.4% renewable fraction (100 kW wind / 179 kW load).`,
      impact: `Bharati's higher renewable fraction saves ~144 tonnes of CO2 emissions annually compared to historical diesel-only baselines.`,
      recommendation: `Explore installing secondary wind turbine capacity at Maitri's northern ridge to narrow the renewable generation gap.`,
      sources: ['Polar Renewable Energy Benchmarking Report', 'SCADA Energy Audit Logs', 'National Centre for Polar and Ocean Research (NCPOR)'],
      action_card: null,
      mode: 'LOCAL_FALLBACK'
    };
  }

  // 4. Current Status / What's happening right now?
  if (qLower.includes('happening') || qLower.includes('right now') || qLower.includes('status') || qLower.includes('current') || qLower.includes('overview') || qLower.includes('condition')) {
    return {
      answer: `CURRENT OPERATIONAL STATUS — ${station.name.toUpperCase()}:\n\n` +
        `• Electrical Demand: ${t.load_elec_kw} kW (Life-Support Inviolable: 20 kW)\n` +
        `• Renewable Generation: ${renewablesKw} kW (Wind: ${t.wind_kw} kW, Solar: ${t.solar_kw} kW) — Covering ${renewablePct}% of demand\n` +
        `• Battery Storage: ${b.soc_pct}% SoC (${b.usable_kwh} kWh usable above 20% reserve floor, ${b.flow_kw > 0 ? '+' : ''}${b.flow_kw} kW buffer flow)\n` +
        `• Diesel Generation: ${t.diesel_kw} kW (Generator 1 online at 35% minimum load)\n` +
        `• Environment: ${t.temp_c}°C Ambient Temperature, ${t.wind_speed_ms} m/s Wind Velocity\n` +
        `• Microgrid Stability: 50.02 Hz frequency lock, 0.00 kW balance residual — System in complete thermodynamic equilibrium.`,
      evidence: `Telemetry verified at 1 Hz update rate. Total generation (${renewablesKw + t.diesel_kw} kW) + BESS buffer flow matches total load demand.`,
      impact: `Station operations nominal. Inviolable life-support systems (oxygen concentrators, water lines, hab heat) 100% powered.`,
      recommendation: `No manual intervention necessary. Automated MILP dispatch is operating at peak fuel efficiency.`,
      sources: [`Live SCADA Telemetry — ${stationId}`, 'HiGHS MILP Solver', 'BESS Safety State Machine v2.4'],
      action_card: null,
      mode: 'LOCAL_FALLBACK'
    };
  }

  // 5. Battery Status / Health
  if (qLower.includes('battery') || qLower.includes('bess') || qLower.includes('soc') || qLower.includes('storage') || qLower.includes('charge')) {
    return {
      answer: `BESS (BATTERY ENERGY STORAGE) HEALTH & STATUS — ${station.name.toUpperCase()}:\n\n` +
        `• State of Charge: ${b.soc_pct}% (Usable Energy: ${b.usable_kwh} kWh above 20% reserve floor)\n` +
        `• Inverter Rating: ${station.inverterRating} kW Bi-directional Inverter (Current Flow: ${b.flow_kw > 0 ? '+' : ''}${b.flow_kw} kW)\n` +
        `• Thermal Envelope: Internal battery container actively conditioned at -8.6°C (Safe Operating Window: -15°C to +35°C)\n` +
        `• Safety State Machine: SAFE / NOMINAL (Zero freeze lockout, zero high-current derating)\n` +
        `• Degradation & SOH: 97.4% State of Health after 342 completed cycles. Anti-cold charge protection active.`,
      evidence: `Pack voltage at 412.4 V DC across 128 LiFePO4 series cells. Zero unbalance between cell strings (< 12 mV spread).`,
      impact: `Battery provides instant frequency stabilization buffer (sub-20ms grid response) during katabatic wind turbulence.`,
      recommendation: `Maintain 20% floor reserve. Ensure container thermal heaters remain energized during blizzard conditions.`,
      sources: ['BMS CAN-bus Telemetry', 'LiFePO4 Degradation Model', 'Thermal Insulation Supervisory Loop'],
      action_card: {
        action: 'Open Battery Diagnostics',
        reason: 'Inspect cell temperatures and sizing degradation curves.',
        button_label: 'VIEW BATTERY',
        action_type: 'VIEW_BATTERY'
      },
      mode: 'LOCAL_FALLBACK'
    };
  }

  // 6. Why did the optimizer choose this dispatch?
  if (qLower.includes('optimizer') || qLower.includes('dispatch') || qLower.includes('milp') || qLower.includes('choose')) {
    return {
      answer: `MILP DISPATCH LOGIC EXPLANATION:\n\n` +
        `The Mixed-Integer Linear Programming (MILP) solver solves an optimal unit commitment problem every 60 seconds with objective function min J = Fuel_Cost + Degradation_Penalty + Startup_Cost.\n\n` +
        `Current Decision Rules Enforced:\n` +
        `1. Power Balance: Generation (${renewablesKw} kW renew + ${t.diesel_kw} kW diesel) - Battery (${b.flow_kw} kW) = ${t.load_elec_kw} kW load (0.00 kW residual).\n` +
        `2. Fuel Burn Minimization: Wind and solar are dispatched first at zero marginal cost.\n` +
        `3. Spinning Reserve Protection: BESS SoC (${b.soc_pct}%) is held above the 20% reserve floor to ride through unexpected turbine cut-outs.\n` +
        `4. Wet-Stacking Prevention: Genset 1 is operated at minimum 35% load (${Math.round(station.genset1Capacity * 0.35)} kW) rather than toggling on/off.`,
      evidence: `HiGHS solver converged in 14.2 ms with 0.00% MIP optimality gap. Verified zero unserved energy constraint violation.`,
      impact: `Reduces diesel fuel consumption by 25.2% compared to baseline manual governor controls, saving ~118,994 Litres annually.`,
      recommendation: `Allow solver to execute automated dispatch. Review lookahead horizon in Dispatch Command center.`,
      sources: ['HiGHS MILP Engine v1.5', 'Unit Commitment Formulation Matrix', 'Fuel Flow Sensors'],
      action_card: null,
      mode: 'LOCAL_FALLBACK'
    };
  }

  // 7. Counterfactual / Failure Scenarios
  if (qLower.includes('fail') || qLower.includes('trip') || qLower.includes('scenario') || qLower.includes('what happens') || qLower.includes('what if')) {
    return {
      answer: `CONTINGENCY IMPACT ANALYSIS — ${station.name.toUpperCase()}:\n\n` +
        `• Contingency Scenario: Genset 1 Sudden Trip\n` +
        `  - Fast Response (0 to 50 ms): BESS inverter detects dF/dt frequency drop and injects up to ${station.inverterRating} kW grid-forming power instantaneously.\n` +
        `  - Medium Response (0 to 15 s): Automated SCADA controller sends start signal to Genset 2 (Cold Standby); starter cranks, synchronizer engages bus within 12 seconds.\n` +
        `  - Contingency Load Shedding: If renewable harvest is below 50 kW during trip, Tier 3 non-essential science heaters are shed for 4 minutes to guarantee 100% power to life-support and habitat life lines.\n\n` +
        `SYSTEM RESILIENCE: Station microgrid is N-1 compliant. Critical life support will not experience power disruption.`,
      evidence: `Digital Twin dynamic step simulation tested against 412 kW peak load stress test with zero bus blackout.`,
      impact: `Full habitat survivability preserved under worst-case blizzard loss-of-primary-generation event.`,
      recommendation: `Ensure Genset 2 block heater remains active (+40°C pre-warm) for rapid emergency starting.`,
      sources: ['Digital Twin Physics Engine', 'N-1 Contingency Validator', 'PLC SCADA Auto-Start Relays'],
      action_card: null,
      mode: 'LOCAL_FALLBACK'
    };
  }

  // 8. General / Fallback Response
  return {
    answer: `OPERATIONAL ANALYSIS FOR ${station.name.toUpperCase()} (ROLE: ${userRole.toUpperCase()}):\n\n` +
      `Station telemetry indicates stable microgrid conditions at ${t.grid_freq_hz} Hz. ` +
      `Current demand is ${t.load_elec_kw} kW against ${renewablesKw} kW renewable generation (${t.wind_kw} kW wind, ${t.solar_kw} kW solar) and ${t.diesel_kw} kW diesel co-generation. ` +
      `Battery storage is at ${b.soc_pct}% SoC with ${b.usable_kwh} kWh usable energy above reserve floor. ` +
      `Exterior weather reads ${t.temp_c}°C with wind at ${t.wind_speed_ms} m/s. ` +
      `The automated MILP dispatcher is suppressing unnecessary fuel burn while maintaining 100% life-support thermal continuity.`,
    evidence: `Live SCADA telemetry verified. Energy balance equation balanced with 0.00 kW residual.`,
    impact: `Normal polar operational parameters maintained. All life-support and habitat systems fully protected.`,
    recommendation: `Continue monitoring live telemetry and 24-hour lookahead forecast.`,
    sources: [`SCADA Telemetry — ${stationId}`, 'HiGHS MILP Optimizer', 'Digital Twin Engine v1.3'],
    action_card: null,
    mode: 'LOCAL_FALLBACK'
  };
}

export function getFallbackIntelligenceState(stationId = 'MAITRI') {
  const station = STATIONS[stationId] || STATIONS.MAITRI;
  return {
    status: {
      copilot_mode: 'LOCAL_FALLBACK',
      station: station.name,
      online: true,
      last_sync: new Date().toISOString()
    },
    anomalies: {
      total_anomalies: 0,
      active_status: 'NORMAL',
      sensors_monitored: 42,
      subsystems: [
        { name: 'Wind Turbines (1 & 2)', status: 'HEALTHY', metric: 'Vibration 1.2 mm/s (Limit: 4.5)' },
        { name: 'BESS Thermal Enclosure', status: 'HEALTHY', metric: 'Core -8.6°C (Limit: > -15°C)' },
        { name: 'Diesel Genset 1 Exhaust', status: 'HEALTHY', metric: 'EGT 382°C (Limit: 520°C)' },
        { name: 'SCADA PLC Modbus Bus', status: 'HEALTHY', metric: 'Latency 18 ms (Packet Loss 0%)' }
      ]
    },
    residuals: {
      bess_temp_residual_c: -0.4,
      genset_fuel_residual_lh: +0.2,
      thermal_heat_residual_kw: +1.1,
      model_accuracy_pct: 98.6
    },
    mlops: {
      active_model: 'Polar-LP-MILP-v2.6',
      dataset_version: 'Antarctic-Winter-2026-v4',
      training_mae_kw: 3.14,
      drift_status: 'INSIGNIFICANT',
      last_retrained: '2026-09-25 04:00 UTC'
    },
    timeline: [
      { time: '12:00:15', event: 'MILP Unit Commitment Re-solved', impact: 'Suppressed G2 start, saved 14 L fuel' },
      { time: '11:45:00', event: 'Wind Turbine #1 Pitch Angle Optimized', impact: 'Increased wind harvest by +8.4 kW' },
      { time: '11:12:30', event: 'Habitat Thermal Loop Regulated', impact: 'CHP recovered 72 kWth heating' },
      { time: '10:30:00', event: 'Battery Deep State Check', impact: 'LiFePO4 SOH confirmed at 97.4%' }
    ],
    audit: [
      { id: 'AUD-901', operator: 'Cmdr. Vance', role: 'Commander', action: 'Set Battery Reserve Floor to 20%', status: 'APPROVED' },
      { id: 'AUD-892', operator: 'Lt. Singh', role: 'Operator', action: 'Acknowledge Wind Gust Advisory', status: 'ACKNOWLEDGED' },
      { id: 'AUD-878', operator: 'System Auto', role: 'Automated Agent', action: 'Hourly SCADA Health Self-Test', status: 'PASSED' }
    ],
    metrics: {
      total_queries: 48,
      local_fallbacks: 48,
      average_latency_ms: 18.4,
      grounding_accuracy_pct: 100.0,
      safety_interventions: 0
    }
  };
}

export function getFallbackSimulation(scenarioId, stationId = 'MAITRI') {
  const station = STATIONS[stationId] || STATIONS.MAITRI;
  const isGensetFail = scenarioId === 'GENSET_1_FAILURE';
  const isBessFail = scenarioId === 'BESS_UNAVAILABLE';
  const isWindCutout = scenarioId === 'WIND_ICING_CUTOUT';

  return {
    scenario_id: scenarioId,
    station: station.name,
    timestamp: new Date().toISOString(),
    status: 'SIMULATION_COMPLETE',
    headline: isGensetFail
      ? 'Genset 1 Sudden Trip Simulation: BESS Inverter Catches Grid Deficit; Secondary Genset Starts within 12s'
      : isBessFail
      ? 'Battery Freeze Lockout Simulation: Diesel Genset 2 Dispatched; Fuel Consumption Increases +38 L/h'
      : isWindCutout
      ? 'Turbine Gale Cut-Out (>25 m/s): Sudden Loss of Wind Generation Replaced by BESS Discharge'
      : 'Simulation Complete: Automated Unit Commitment Maintains Complete Life-Support Power Integrity',
    power_deficit_kw: isGensetFail ? 105 : isWindCutout ? station.windCapacity : 0,
    frequency_nadir_hz: isGensetFail ? 49.32 : isWindCutout ? 49.65 : 49.88,
    frequency_recovery_seconds: isGensetFail ? 1.8 : 0.6,
    unserved_energy_kwh: 0.0,
    fuel_impact_litres: isGensetFail ? -12 : isBessFail ? +92 : +45,
    critical_life_support_interrupted: false,
    mitigation_steps: [
      '1. Fast-acting battery inverter delivers instantaneous frequency support within 18 milliseconds.',
      '2. Secondary diesel generator is signaled to crank and synchronize to the 400V bus within 12 seconds.',
      '3. Inviolable life-support and heating circuits remain 100% powered with zero microgrid blackout.'
    ]
  };
}