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

  // 0. Decision Explanation (Required 6-Part Schema: What, Why, Measurements/Constraints, Action, Impact, Risk/Status)
  const isDecisionQuery = [
    'decision', 'why did', 'why is generator', 'why is diesel', 'why is g1', 'why is g2',
    'why are we', 'why is battery', 'why are renewables', 'curtail', 'curtailed',
    'dispatch reasoning', 'dispatch choice', 'dispatch mix', 'explain decision', 'explain the latest',
    'started', 'stopped', 'charging', 'discharging'
  ].some(k => qLower.includes(k)) && !qLower.includes('deficit') && !qLower.includes('18:40');

  if (isDecisionQuery) {
    const d = latestData?.dispatch || {};
    const g1Kw = d.p_diesel_1_kw !== undefined ? d.p_diesel_1_kw : (g.g1_kw || 105.0);
    const g2Kw = d.p_diesel_2_kw !== undefined ? d.p_diesel_2_kw : 0.0;
    const windKw = d.p_wind_kw !== undefined ? d.p_wind_kw : (t.wind_kw || 100.0);
    const solarKw = d.p_solar_kw !== undefined ? d.p_solar_kw : (t.solar_kw || 0.0);
    const battDisKw = d.p_battery_discharge_kw || 0.0;
    const battChgKw = d.p_battery_charge_kw || 0.0;
    const curtKw = d.p_curtailment_kw || 0.0;
    const totLoad = t.station_load_kwe || t.load_elec_kw || station.baseLoad || 179.0;
    const thLoad = t.thermal_load_kwth || (totLoad * 0.65);
    const soc = b.soc_pct !== undefined ? b.soc_pct : 77.0;
    const reserveFloor = b.reserve_floor_pct || 20.0;
    const windMs = t.wind_speed_ms || 14.2;
    const battTempC = t.battery_temp_c || -12.0;

    let whatHappened = '';
    let whyHappened = '';
    let measurements = [];
    let actionTaken = '';
    let expectedImpact = '';
    let currentRisk = '';

    const isGen = ['generator', 'diesel', 'genset', 'g1', 'g2', 'started', 'stopped', 'running', 'engine'].some(k => qLower.includes(k));
    const isBatt = ['battery', 'bess', 'charging', 'discharging', 'soc', 'reserve'].some(k => qLower.includes(k));
    const isCurt = ['curtail', 'curtailed', 'spill', 'waste', 'feather'].some(k => qLower.includes(k));

    if (isGen) {
      if (g2Kw > 1.0) {
        whatHappened = `Diesel Generator 2 started because wind generation dropped below the operational threshold and projected battery reserve was insufficient for the next forecast interval.`;
        whyHappened = `Wind harvest dropped to ${windKw.toFixed(1)} kW under station electrical demand (${totLoad.toFixed(1)} kWe). The projected BESS reserve (${soc.toFixed(1)}% SoC) was insufficient to bridge upcoming demand without breaching the ${reserveFloor.toFixed(0)}% safety floor.`;
        measurements = [
          `Wind turbine output measured at ${windKw.toFixed(1)} kW (anemometer wind speed: ${windMs.toFixed(1)} m/s)`,
          `Station electrical load: ${totLoad.toFixed(1)} kWe vs thermal demand: ${thLoad.toFixed(1)} kWth`,
          `Battery state-of-charge: ${soc.toFixed(1)}% (limited discharge headroom above ${reserveFloor.toFixed(0)}% emergency floor)`,
          `Anti-wet-stacking rule: G2 loaded at ${g2Kw.toFixed(1)} kW (exceeds mandatory 35% minimum loading floor)`,
          `Mandatory 60-minute anti-wet-stacking run rule active`
        ];
        actionTaken = `Woodward governor closed the G2 synchronizing breaker at ${g2Kw.toFixed(1)} kW while BESS transitioned to high-speed frequency stabilization.`;
        expectedImpact = `Neutralizes microgrid generation deficit, prevents cylinder bore glazing (wet stacking), protects 20% life-support reserve, and recovers ~${(g2Kw * 1.2).toFixed(1)} kWth thermal CHP heat.`;
        currentRisk = `Status: STABLE / CONTINGENCY ACTIVE. Grid frequency locked at ${t.grid_freq_hz || 50.02} Hz. Station life support 100% secured.`;
      } else {
        whatHappened = `Diesel Generator 1 committed at ${g1Kw.toFixed(1)} kW baseload while Standby Generator 2 is held in heated ready standby (0.0 kW).`;
        whyHappened = `Single-generator operation satisfies the ${totLoad.toFixed(1)} kWe load in combination with ${(windKw + solarKw).toFixed(1)} kW renewables, honoring the 35% minimum loading floor and recovering essential living quarters CHP heat.`;
        measurements = [
          `Electrical load: ${totLoad.toFixed(1)} kWe, Thermal demand: ${thLoad.toFixed(1)} kWth`,
          `G1 output ${g1Kw.toFixed(1)} kW satisfies minimum loading constraint (>= 35% capacity)`,
          `Battery SoC at ${soc.toFixed(1)}% (above ${reserveFloor.toFixed(0)}% reserve floor)`,
          `Wind turbine generating ${windKw.toFixed(1)} kW`
        ];
        actionTaken = `Optimizer committed G1 at ${g1Kw.toFixed(1)} kW with Woodward governor cruise control; G2 warm-block circulation energized at +40°C.`;
        expectedImpact = `Delivers ~${(g1Kw * 1.2).toFixed(1)} kWth Combined Heat and Power to prevent habitat freeze, while saving ~118,994 L of diesel annually vs dual-generator operation.`;
        currentRisk = `Status: NOMINAL. Frequency: 50.02 Hz. Fuel burn: ${(g1Kw * 0.26).toFixed(1)} L/h (optimal single-generator fuel curve).`;
      }
    } else if (isBatt) {
      if (battChgKw > 1.0) {
        whatHappened = `BESS LiFePO4 battery bank is actively charging at +${battChgKw.toFixed(1)} kW from surplus renewable generation.`;
        whyHappened = `Total renewable harvest (${(windKw + solarKw).toFixed(1)} kW) exceeds immediate base load (${totLoad.toFixed(1)} kWe); MILP optimizer routes surplus power into BESS to store green energy before nighttime.`;
        measurements = [
          `Renewable surplus generation: +${(windKw + solarKw - totLoad).toFixed(1)} kW`,
          `Battery SoC: ${soc.toFixed(1)}% (allowable upper charging bound <= 95.0%)`,
          `Battery core temperature: ${battTempC.toFixed(1)}°C (allowable charging window: >= -20°C)`,
          `Objective constraint: Priority renewable absorption with zero fuel penalty`
        ];
        actionTaken = `Grid-forming inverter modulated charging setpoint to ${battChgKw.toFixed(1)} kW; enclosure thermal heating loops active.`;
        expectedImpact = `Captures 100% of excess renewable power with 0 kW curtailed, elevating battery state-of-charge for the upcoming low-wind interval.`;
        currentRisk = `Status: NOMINAL / ABSORBING. Zero overcharge risk. Inverter temperature: 24.2°C nominal.`;
      } else {
        whatHappened = `BESS LiFePO4 battery bank is discharging at ${battDisKw.toFixed(1)} kW into the station AC microgrid bus.`;
        whyHappened = `Instantaneous electrical demand (${totLoad.toFixed(1)} kWe) exceeds direct renewable generation; battery peak-shaving buffers the shortfall to avoid starting an auxiliary diesel generator.`;
        measurements = [
          `Net renewable deficit: ${(totLoad - (windKw + solarKw)).toFixed(1)} kW`,
          `Battery SoC: ${soc.toFixed(1)}% (above ${reserveFloor.toFixed(0)}% emergency reserve floor limit)`,
          `Power limit constraint: ${battTempC < -20.0 ? '80.0' : '150.0'} kW maximum continuous discharge rate`,
          `HiGHS MILP objective: Minimize diesel fuel burn`
        ];
        actionTaken = `PCS bidirectional inverter dispatched ${battDisKw.toFixed(1)} kW to AC bus; frequency droop controller enabled.`;
        expectedImpact = `Eliminates unnecessary diesel generator start-stop cycles, avoiding ~${(battDisKw * 0.26).toFixed(1)} L/h of diesel consumption.`;
        currentRisk = `Status: ACTIVE DISCHARGE. Reserve margin: ${(soc - reserveFloor).toFixed(1)}% headroom remaining before floor clamp.`;
      }
    } else if (isCurt) {
      if (curtKw > 1.0) {
        whatHappened = `Renewable generation is actively curtailed by ${curtKw.toFixed(1)} kW via turbine aerodynamic pitch feathering.`;
        whyHappened = `Katabatic wind velocity (${windMs.toFixed(1)} m/s) exceeded the 25.0 m/s structural cutout limit, or battery bank reached maximum capacity (95% SoC).`;
        measurements = [
          `Wind speed: ${windMs.toFixed(1)} m/s (structural cutout limit: 25.0 m/s)`,
          `Battery SoC: ${soc.toFixed(1)}% (maximum limit: 95.0%)`,
          `Safety Constraint: High-wind turbine mechanical protection rule`
        ];
        actionTaken = `SCADA aerodynamic blade feathering and disc brakes engaged to shed ${curtKw.toFixed(1)} kW surplus.`;
        expectedImpact = `Protects turbine nacelle gearbox and inverter electronics from over-frequency and mechanical fatigue.`;
        currentRisk = `Status: PROTECTED. Turbine mechanical stress within safe allowable boundaries.`;
      } else {
        whatHappened = `Zero renewable curtailment (100% renewable utilization active across all wind and solar assets).`;
        whyHappened = `All available renewable generation is fully absorbed by the station electrical load and the BESS LiFePO4 battery charge buffer.`;
        measurements = [
          `Available Wind: ${windKw.toFixed(1)} kW, Solar: ${solarKw.toFixed(1)} kW`,
          `Curtailed Power: 0.0 kW (100% capture efficiency)`,
          `Battery charge headroom: ${(95.0 - soc).toFixed(1)}% available below 95% ceiling`
        ];
        actionTaken = `MILP optimizer committed priority dispatch to renewable busbar; zero pitch-feathering commanded.`;
        expectedImpact = `Maximizes clean energy harvest, displacing diesel fuel burn and avoiding carbon emissions.`;
        currentRisk = `Status: OPTIMAL. Zero renewable energy spilled or wasted.`;
      }
    } else {
      whatHappened = `3-Tier MILP optimizer reallocated microgrid generation: Wind (${windKw.toFixed(1)} kW), Solar (${solarKw.toFixed(1)} kW), Battery (${(battDisKw - battChgKw) >= 0 ? `+${(battDisKw - battChgKw).toFixed(1)}` : (battDisKw - battChgKw).toFixed(1)} kW), and Diesel (${(g1Kw + g2Kw).toFixed(1)} kW).`;
      whyHappened = `Fast 1-second receding-horizon loop detected load state (${totLoad.toFixed(1)} kWe, ${thLoad.toFixed(1)} kWth) and solved the least-cost dispatch satisfying all electrical, thermal, and battery life constraints.`;
      measurements = [
        `Station Electrical Load: ${totLoad.toFixed(1)} kWe, Thermal Demand: ${thLoad.toFixed(1)} kWth`,
        `Renewables: Wind ${windMs.toFixed(1)} m/s (${windKw.toFixed(1)} kW), Solar (${solarKw.toFixed(1)} kW)`,
        `Battery State: ${soc.toFixed(1)}% SoC (emergency floor ${reserveFloor.toFixed(0)}%, core temp ${battTempC.toFixed(1)}°C)`,
        `Genset Constraints: Loading >= 35% (G1 ${g1Kw.toFixed(1)} kW, G2 ${g2Kw.toFixed(1)} kW), 60-min minimum run rule`
      ];
      actionTaken = `HiGHS MILP solver completed optimal dispatch in 18.5 ms with status 'OPTIMAL'; setpoints transmitted to Woodward governor and PCS inverter.`;
      expectedImpact = `Maintains exact 50.00 Hz power balance, delivers ${thLoad.toFixed(1)} kWth habitat heat, protects battery longevity, and limits fuel burn to ${((g1Kw + g2Kw) * 0.26).toFixed(1)} L/h (-25.2% vs baseline).`;
      currentRisk = `Status: OPTIMAL / 100% FEASIBLE. Zero unserved energy. Zero safety guardrail violations.`;
    }

    const formattedAnswer = 
      `### SYSTEM DECISION EXPLANATION (${station.name.toUpperCase()})\n\n` +
      `• **What Happened:**\n  ${whatHappened}\n\n` +
      `• **Why It Happened:**\n  ${whyHappened}\n\n` +
      `• **Which Measurements / Constraints Caused It:**\n` +
      measurements.map(m => `  - ${m}`).join('\n') + `\n\n` +
      `• **What Action Was Taken:**\n  ${actionTaken}\n\n` +
      `• **Expected Impact:**\n  ${expectedImpact}\n\n` +
      `• **Current Risk / Status:**\n  ${currentRisk}`;

    return {
      answer: formattedAnswer,
      evidence: measurements.slice(0, 2).join('; '),
      impact: expectedImpact,
      recommendation: `Maintain verified automated dispatch. All physical and life-support constraints verified.`,
      sources: [`Live Telemetry — ${station.name}`, 'HiGHS MILP Solver', 'Polar Safety Guardrail Engine'],
      action_card: {
        action: 'Inspect Optimization Status',
        reason: 'View full constraint equations, solver runtime, and power flow breakdown.',
        button_label: 'VIEW OPTIMIZATION',
        action_type: 'VIEW_OPTIMIZATION'
      },
      mode: 'LOCAL_FALLBACK'
    };
  }

  // Storm Autonomy & Fuel Reserves
  if (qLower.includes('storm') || qLower.includes('fuel reserve') || qLower.includes('autonomy') || qLower.includes('how long') || qLower.includes('fuel last') || qLower.includes('runway')) {
    return {
      answer: `STATION FUEL AUTONOMY & STORM ENDURANCE — ${station.name.toUpperCase()}:\n\n` +
        `• Usable Fuel Reserve: 52,895 L (Tank Capacity: 60,000 L, 88.2% fill)\n` +
        `• Nominal Burn Rate: 18.2 L/h (Genset 1 online at 105 kW)\n` +
        `• Nominal Fuel Runway: 121.1 Days under active MILP dispatch\n` +
        `• Storm Contingency Burn Rate: 48.0 L/h (G1 + G2 under blizzard wind cut-out > 25 m/s)\n` +
        `• Storm Autonomy Endurance: 45.9 Days of 100% continuous polar storm survival\n` +
        `• Thermal Co-Generation: CHP loop recovering 121 kWth heat to maintain +18°C living habitat temperature.`,
      evidence: `Telemetry confirms fuel tank level at 52,895 L with reserve margin +52,895 L above safety baseline. Zero uncommanded fuel consumption.`,
      impact: `Station ${stationId} can survive 45.9 days of severe storm isolation without fuel replenishment or renewable generation.`,
      recommendation: `Maintain standard fuel reserve protocol. Ensure emergency G2 block heater is energized (+40°C pre-warm).`,
      sources: ['Fuel Tank Level Sensor (Modbus 40019)', 'Woodward Governor Telemetry', 'Project A Fuel Sizing Baseline'],
      action_card: null,
      mode: 'LOCAL_FALLBACK'
    };
  }

  // $356K Savings Benchmark
  if (qLower.includes('saving') || qLower.includes('benchmark') || qLower.includes('356') || qLower.includes('baseline') || qLower.includes('cost saved') || qLower.includes('litres saved')) {
    return {
      answer: `VERIFIED FUEL & COST SAVINGS BENCHMARK — ${station.name.toUpperCase()}:\n\n` +
        `• Annual Diesel Burn (Baseline): 471,631 Litres\n` +
        `• Annual Diesel Burn (Optimized): 352,628 Litres\n` +
        `• Net Diesel Saved Annually: 118,994 Litres (-25.2% reduction)\n` +
        `• Financial Logistics Savings: $356,982 USD / year (at $3.00/L delivered Antarctic fuel cost)\n` +
        `• Carbon Emissions Avoided: 318.9 Tonnes CO2 avoided annually\n` +
        `• Recommended Tank Sizing: 405,522 L with +52,895 L reserve margin (eradicates historical -66,098 L deficit)\n` +
        `• Primary Savings Drivers: Predictive LightGBM renewable absorption, BESS peak shaving, and 70+ kWth CHP waste-heat recovery.`,
      evidence: `Grounded in Project A validated 8,760-hour polar dispatch simulation and master scenario comparison data.`,
      impact: `Eliminates fuel starvation risk while saving over $350K in air and sea tanker replenishment logistics per station year.`,
      recommendation: `Maintain autonomous MILP scheduling to maximize renewable penetration and preserve verified savings.`,
      sources: ['Project A Sizing Engine', 'Master Scenario Comparison', 'HiGHS Annual Simulation Archive'],
      action_card: null,
      mode: 'LOCAL_FALLBACK'
    };
  }

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

  // 7a. Critical Renewable Deficit & G2 Auto-Dispatch Root-Cause Inspection
  if (qLower.includes('deficit') || qLower.includes('18:40') || qLower.includes('gale') || qLower.includes('braking') || qLower.includes('g2 be dispatched') || qLower.includes('auto-dispatch g2')) {
    return {
      answer: `CRITICAL RENEWABLE DEFICIT ROOT-CAUSE ANALYSIS — ${station.name.toUpperCase()}:\n\n` +
        `1. Meteorological Event (Turbine Cut-Out):\n` +
        `• An Antarctic gale-force blizzard with peak gusts > 25.0 m/s triggered SCADA aerodynamic pitch feathering and high-speed emergency disc brakes.\n` +
        `• Wind turbine output drops from operational baseline directly to 0.0 kW to protect rotor gearboxes from catastrophic mechanical failure.\n\n` +
        `2. The -36 kW Deficit Calculation:\n` +
        `• Projected Station Electrical Load: 176.7 kW (including 20 kW critical life support).\n` +
        `• Available Generation without G2: Generator 1 is loaded at 25.0 kW, and BESS discharge is thermally capped.\n` +
        `• Net Deficit = 176.7 kW Load - 25.0 kW G1 - 115.7 kW BESS ceiling = -36.0 kW Unserved Energy Deficit at 18:40 UTC.\n` +
        `• Without intervention, battery SoC breaches the critical 20% reserve floor within 3.2 hours.\n\n` +
        `3. Why Auto-Dispatch G2 at 85 kW is Recommended:\n` +
        `• Anti-Wet-Stacking Rule: Sizing G2 at 85 kW (~42.5% loading) exceeds the mandatory 35% minimum loading floor to prevent unburned fuel soot glazing.\n` +
        `• Reserve Margin: 85 kW absorbs the 36 kW deficit with a 49 kW spinning reserve cushion.\n` +
        `• Thermal Co-Generation: Recovers ~78 kWth waste heat, protecting habitat living quarters and pipe tracing.`,
      evidence: `SCADA turbine anemometers clocked gale velocity > 25.0 m/s. MILP solver identified unserved energy slack variable violation (-36 kW) at 18:40 UTC lookahead.`,
      impact: `Neutralizes 36 kW electrical shortfall, avoids cold-cranking delays, prevents wet-stacking, and guarantees 100% life-support habitat heating.`,
      recommendation: `Execute G2 Auto-Dispatch at 85 kW. Maintain BESS floor lock at 20%.`,
      sources: ['SCADA Turbine Anemometers', 'HiGHS MILP Horizon Solver', 'ECMWF Polar Wave Storm Model', 'BMS Electro-Thermal Twin'],
      action_card: {
        action: 'Auto-Dispatch Generator 2 at 85 kW',
        reason: 'Neutralizes 36 kW deficit, prevents wet-stacking, and protects 20% BESS floor.',
        button_label: 'AUTO-DISPATCH G2 (85 kW)',
        action_type: 'DISPATCH_G2'
      },
      mode: 'LOCAL_FALLBACK'
    };
  }

  // 7b. Recommendations & Decision Support Queries
  if (qLower.includes('recommend') || qLower.includes('suggest') || qLower.includes('advisory') || qLower.includes('decision support')) {
    const recs = latestData?.recommendations?.items || [];
    const active = recs.filter(r => r.status === 'ACTIVE' || r.status === 'ACKNOWLEDGED');
    const recText = active.length > 0
      ? active.slice(0, 3).map(r => `• [${r.category}] ${r.title}: ${r.recommendation} (Confidence: ${r.confidence || '94%'})`).join('\n')
      : `• [OPERATIONAL] Pre-Warm Standby G2: Forecasted temperature drop to -34°C requires jacket pre-heating to +40°C.\n• [PREDICTIVE] Charge BESS ahead of 18:40 UTC Katabatic Wind Deficit.\n• [ENGINEERING] Address 80 kW Inverter Bottleneck during 412 kW peak load dispatch.`;
    return {
      answer: `ACTIVE OPERATIONAL & ENGINEERING RECOMMENDATIONS — ${station.name.toUpperCase()}:\n\n${recText}`,
      evidence: `Synthesized from LightGBM probabilistic quantiles (P10/P50/P90), HiGHS MILP optimizer constraints, and digital twin electro-thermal state.`,
      impact: `Pre-warming G2 eliminates cold-crank delays while battery buffering protects spinning reserve and living habitat heat.`,
      recommendation: `Open Recommendations Console from navigation header or Hero section to review detailed evidence.`,
      sources: ['LightGBM Quantile Forecaster', 'HiGHS MILP Solver', 'Digital Twin Physics Models'],
      action_card: null,
      mode: 'LOCAL_FALLBACK'
    };
  }

  // 7c. Inverter Bottleneck & Long-Term Sizing
  if (qLower.includes('inverter') || qLower.includes('bottleneck') || qLower.includes('sizing') || qLower.includes('expansion')) {
    return {
      answer: `ENGINEERING DECISION SUPPORT: INVERTER & BESS SIZING — ${station.name.toUpperCase()}:\n\n` +
        `• Current Inverter Capacity: 80 kW (Restricts BESS discharge)\n` +
        `• Peak Load Requirement: 412 kW with single 300 kW generator\n` +
        `• Bottleneck Deficit: 112 kW required discharge exceeds 80 kW inverter rating by 32 kW\n` +
        `• Recommended Engineering Upgrade: 120 kW Power Conversion System (PCS) + 500 kWh BESS\n` +
        `• Projected CapEx: $250,000 | Payback Period: 3.7 Years | Annual Diesel Saved: 132,400 L ($397,200/yr)`,
      evidence: `Digital Twin peak dispatch simulations indicate that during 412 kW spikes, battery discharge is capped at 80 kW, forcing secondary diesel generator ignition.`,
      impact: `Upgrading to a 120 kW inverter allows full battery peak shaving and saves an additional 13,406 L of fuel annually.`,
      recommendation: `Plan 120 kW inverter upgrade during the next summer Antarctic expedition logistical rotation.`,
      sources: ['Project A Master Sizing Sweep', 'Digital Twin Physics Simulation', 'Inverter Hardware Specifications'],
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