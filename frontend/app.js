/**
 * NOVARA POLAR EMS - Frontend Controller
 * Autonomous Polar Microgrid Energy Management System (PolarOPS)
 * Coordinates WebSockets, Energy Flow Particle Canvas, Chart.js, Copilot AI & Commander Overrides.
 */

// -------------------------------------------------------------
// Global Application State
// -------------------------------------------------------------
const state = {
  stationId: 'BHARATI',
  mode: 'DEMO_MODE',
  ws: null,
  wsConnected: false,
  reconnectTimer: null,
  latestData: null,
  currentScenario: 'normal',
  selectedHorizon: '12m',
  tripGen1: false,
  faultBess: false,
  sliderTemp: -26.3,
  sliderWind: 24.9,
  sliderLoadMult: 1.0,
  auditLogs: [
    {
      time: '12:00:15',
      station: 'Bharati',
      action: 'LP Dispatch Active',
      reason: 'Optimal LP solution: 6.6kW renewable, 5.9kW battery buffer, 21.8kW generator',
      tier: 'NORMAL'
    },
    {
      time: '11:58:30',
      station: 'Bharati',
      action: 'Battery Reserve Check',
      reason: 'LiFePO4 core at -8.6°C within heated thermal envelope. State of charge: 28%',
      tier: 'NORMAL'
    },
    {
      time: '11:55:00',
      station: 'Bharati',
      action: 'Telemetry Handshake',
      reason: 'FastAPI Render backend telemetry connection synchronized with satellite link',
      tier: 'NORMAL'
    }
  ]
};

// Station Profiles
const STATIONS = {
  BHARATI: {
    id: 'BHARATI',
    name: 'Bharati Station',
    locationText: "Bharati Station • 69°24'S, 76°11'E",
    crew: 22,
    batteryCapacity: 350.0,
    fuelCapacity: 60000.0,
    windCapacity: 100.0,
    solarCapacity: 90.0,
    baseLoad: 40.4
  },
  MAITRI: {
    id: 'MAITRI',
    name: 'Maitri Station',
    locationText: "Maitri Research Station • 70°45'S, 11°44'E",
    crew: 22,
    batteryCapacity: 300.0,
    fuelCapacity: 45000.0,
    windCapacity: 120.0,
    solarCapacity: 75.0,
    baseLoad: 48.0
  }
};

// -------------------------------------------------------------
// Chart.js Instances
// -------------------------------------------------------------
let forecastChartInstance = null;

// -------------------------------------------------------------
// Real-Time Energy Flow Matrix Canvas Animation Engine
// -------------------------------------------------------------
let flowCanvas = null;
let flowCtx = null;
let flowParticles = [];
let flowAnimationFrameId = null;

class FlowParticle {
  constructor(sourceX, sourceY, targetX, targetY, color, speed) {
    this.sourceX = sourceX;
    this.sourceY = sourceY;
    this.targetX = targetX;
    this.targetY = targetY;
    this.color = color;
    this.speed = speed;
    this.progress = Math.random();
  }

  update() {
    this.progress += this.speed;
    if (this.progress >= 1) {
      this.progress = 0;
    }
  }

  draw(ctx) {
    const x = this.sourceX + (this.targetX - this.sourceX) * this.progress;
    const y = this.sourceY + (this.targetY - this.sourceY) * this.progress;

    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function initEnergyFlowCanvas() {
  flowCanvas = document.getElementById('energy-flow-canvas');
  if (!flowCanvas) return;
  flowCtx = flowCanvas.getContext('2d');

  function resizeFlow() {
    if (!flowCanvas || !flowCanvas.parentElement) return;
    flowCanvas.width = flowCanvas.parentElement.clientWidth;
    flowCanvas.height = 300;
  }

  resizeFlow();
  window.addEventListener('resize', resizeFlow);
  startFlowAnimation();
}

function startFlowAnimation() {
  if (flowAnimationFrameId) cancelAnimationFrame(flowAnimationFrameId);

  let lastParticleSetup = 0;

  function render(time) {
    if (!flowCanvas || !flowCtx) return;
    const w = flowCanvas.width;
    const h = flowCanvas.height;

    flowCtx.clearRect(0, 0, w, h);

    // Dynamic Topology Coordinates
    const nodes = {
      wind: { x: w * 0.14, y: h * 0.22, title: 'Wind Turbines', kw: 44.88, color: '#05c5ff' },
      solar: { x: w * 0.14, y: h * 0.50, title: 'Solar PV', kw: 1.34, color: '#f59e0b' },
      diesel: { x: w * 0.14, y: h * 0.78, title: 'Diesel Gen-Set', kw: 0.0, color: '#f43f5e' },
      bus: { x: w * 0.48, y: h * 0.48, title: 'Inverter Grid Bus', color: '#0698c4' },
      bat: { x: w * 0.48, y: h * 0.82, title: 'Storage Bank (BESS)', kw: 0.0, color: '#10b981' },
      heating: { x: w * 0.84, y: h * 0.28, title: 'Life Support HVAC', kw: 26.4, color: '#0284c7' },
      lab: { x: w * 0.84, y: h * 0.55, title: 'Science Labs', kw: 11.5, color: '#0ea5e9' },
      lighting: { x: w * 0.84, y: h * 0.80, title: 'Perimeter Lighting', kw: 2.5, color: '#38bdf8' }
    };

    // Extract live numbers if available
    if (state.latestData) {
      const d = state.latestData.dispatch || {};
      const t = state.latestData.telemetry || {};
      nodes.wind.kw = d.p_wind_kw !== undefined ? d.p_wind_kw : (t.wind_speed_ms > 3 ? 44.88 : 0);
      nodes.solar.kw = d.p_solar_kw !== undefined ? d.p_solar_kw : (t.solar_irradiance_wm2 > 10 ? 1.34 : 0);
      nodes.diesel.kw = (d.p_diesel_1_kw || 0) + (d.p_diesel_2_kw || 0);
      nodes.bat.kw = d.p_battery_kw !== undefined ? d.p_battery_kw : ((d.p_battery_discharge_kw || 0) - (d.p_battery_charge_kw || 0));
      nodes.heating.kw = t.load_thermal_kw ? t.load_thermal_kw * 0.45 : 26.4;
      nodes.lab.kw = t.load_elec_kw ? t.load_elec_kw * 0.35 : 11.5;
      nodes.lighting.kw = 2.5;
    }

    // Refresh Particles every 1.5s or on init
    if (time - lastParticleSetup > 1500 || flowParticles.length === 0) {
      flowParticles = [];
      // Wind to Bus
      if (nodes.wind.kw > 0.1) {
        for (let i = 0; i < 12; i++) {
          flowParticles.push(new FlowParticle(nodes.wind.x, nodes.wind.y, nodes.bus.x, nodes.bus.y, '#05c5ff', 0.008));
        }
      }
      // Solar to Bus
      if (nodes.solar.kw > 0.1) {
        for (let i = 0; i < 8; i++) {
          flowParticles.push(new FlowParticle(nodes.solar.x, nodes.solar.y, nodes.bus.x, nodes.bus.y, '#f59e0b', 0.008));
        }
      }
      // Diesel to Bus
      if (nodes.diesel.kw > 0.1) {
        for (let i = 0; i < 10; i++) {
          flowParticles.push(new FlowParticle(nodes.diesel.x, nodes.diesel.y, nodes.bus.x, nodes.bus.y, '#f43f5e', 0.009));
        }
      }
      // Battery bidirectional
      if (nodes.bat.kw > 0.1) {
        // Discharging to Bus
        for (let i = 0; i < 8; i++) {
          flowParticles.push(new FlowParticle(nodes.bat.x, nodes.bat.y, nodes.bus.x, nodes.bus.y, '#10b981', 0.008));
        }
      } else if (nodes.bat.kw < -0.1) {
        // Charging from Bus
        for (let i = 0; i < 8; i++) {
          flowParticles.push(new FlowParticle(nodes.bus.x, nodes.bus.y, nodes.bat.x, nodes.bat.y, '#05c5ff', 0.008));
        }
      }
      // Bus to Loads
      for (let i = 0; i < 10; i++) {
        flowParticles.push(new FlowParticle(nodes.bus.x, nodes.bus.y, nodes.heating.x, nodes.heating.y, '#0284c7', 0.009));
      }
      for (let i = 0; i < 6; i++) {
        flowParticles.push(new FlowParticle(nodes.bus.x, nodes.bus.y, nodes.lab.x, nodes.lab.y, '#0ea5e9', 0.007));
      }
      for (let i = 0; i < 4; i++) {
        flowParticles.push(new FlowParticle(nodes.bus.x, nodes.bus.y, nodes.lighting.x, nodes.lighting.y, '#38bdf8', 0.006));
      }
      lastParticleSetup = time;
    }

    // Draw Vector Connection Lines
    flowCtx.lineWidth = 1.5;
    flowCtx.strokeStyle = 'rgba(154, 229, 254, 0.55)';

    // Source lines to Bus
    [nodes.wind, nodes.solar, nodes.diesel].forEach(n => {
      flowCtx.beginPath();
      flowCtx.moveTo(n.x, n.y);
      flowCtx.lineTo(nodes.bus.x, nodes.bus.y);
      flowCtx.stroke();
    });

    // Bus to Battery line
    flowCtx.beginPath();
    flowCtx.moveTo(nodes.bus.x, nodes.bus.y);
    flowCtx.lineTo(nodes.bat.x, nodes.bat.y);
    flowCtx.stroke();

    // Bus to Load lines
    [nodes.heating, nodes.lab, nodes.lighting].forEach(n => {
      flowCtx.beginPath();
      flowCtx.moveTo(nodes.bus.x, nodes.bus.y);
      flowCtx.lineTo(n.x, n.y);
      flowCtx.stroke();
    });

    // Update & Draw Particles
    flowParticles.forEach(p => {
      p.update();
      p.draw(flowCtx);
    });

    // Draw Node Boxes
    function drawNodeCard(node, isBus = false) {
      const boxW = isBus ? 130 : 120;
      const boxH = isBus ? 50 : 44;
      const rx = node.x - boxW / 2;
      const ry = node.y - boxH / 2;

      flowCtx.fillStyle = '#ffffff';
      flowCtx.strokeStyle = isBus ? '#0698c4' : 'rgba(154, 229, 254, 0.9)';
      flowCtx.lineWidth = isBus ? 2 : 1.2;

      flowCtx.beginPath();
      flowCtx.roundRect(rx, ry, boxW, boxH, 10);
      flowCtx.fill();
      flowCtx.stroke();

      // Title
      flowCtx.font = '600 10px "Plus Jakarta Sans", sans-serif';
      flowCtx.fillStyle = '#127694';
      flowCtx.textAlign = 'center';
      flowCtx.fillText(node.title, node.x, ry + 16);

      // Value
      if (node.kw !== undefined) {
        flowCtx.font = '700 11px "JetBrains Mono", monospace';
        flowCtx.fillStyle = node.color || '#0698c4';
        flowCtx.fillText(node.kw.toFixed(2) + ' kW', node.x, ry + 32);
      } else if (isBus) {
        flowCtx.font = '600 9px "JetBrains Mono", monospace';
        flowCtx.fillStyle = '#05c5ff';
        flowCtx.fillText('Synced 400V 50Hz', node.x, ry + 32);
      }
    }

    [nodes.wind, nodes.solar, nodes.diesel, nodes.bat, nodes.heating, nodes.lab, nodes.lighting].forEach(n => drawNodeCard(n));
    drawNodeCard(nodes.bus, true);

    flowAnimationFrameId = requestAnimationFrame(render);
  }

  flowAnimationFrameId = requestAnimationFrame(render);
}

// -------------------------------------------------------------
// Forecast Chart.js Engine (Multi-Horizon)
// -------------------------------------------------------------
function initForecastChart() {
  const ctx = document.getElementById('forecastFullCanvas');
  if (!ctx) return;

  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const demandData = [34, 36, 42, 52, 57, 58, 56, 52, 44, 38, 35, 34];
  const windData = [18, 19, 22, 24, 25, 26, 26, 25, 23, 20, 19, 18];
  const solarData = [24, 21, 12, 1, 0, 0, 0, 0, 1, 11, 20, 25];

  if (forecastChartInstance) {
    forecastChartInstance.destroy();
  }

  forecastChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Station Demand (kW)',
          data: demandData,
          borderColor: '#127694',
          backgroundColor: 'rgba(18, 118, 148, 0.05)',
          borderWidth: 2.5,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: '#127694',
          fill: false
        },
        {
          label: 'Wind Generation (kW)',
          data: windData,
          borderColor: '#05c5ff',
          borderWidth: 2,
          borderDash: [5, 4],
          tension: 0.35,
          pointRadius: 2,
          pointBackgroundColor: '#05c5ff',
          fill: false
        },
        {
          label: 'Solar PV Harvest (kW)',
          data: solarData,
          borderColor: '#4499b3',
          backgroundColor: 'rgba(68, 153, 179, 0.15)',
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 2,
          pointBackgroundColor: '#4499b3',
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' },
            color: '#475569',
            usePointStyle: true,
            boxWidth: 8
          }
        },
        tooltip: {
          backgroundColor: 'rgba(18, 118, 148, 0.95)',
          titleFont: { family: 'Plus Jakarta Sans', size: 12, weight: 'bold' },
          bodyFont: { family: 'JetBrains Mono', size: 11 }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(154, 229, 254, 0.3)' },
          ticks: { font: { family: 'Plus Jakarta Sans', size: 10 }, color: '#64748b' }
        },
        y: {
          title: { display: true, text: 'Electric Power (kW)', color: '#64748b', font: { size: 11, weight: 'bold' } },
          grid: { color: 'rgba(154, 229, 254, 0.3)' },
          ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#64748b' },
          min: 0,
          max: 65
        }
      }
    }
  });
}

function updateForecastHorizon(horizon) {
  state.selectedHorizon = horizon;
  const pills = document.querySelectorAll('.horizon-pill');
  pills.forEach(p => {
    if (p.getAttribute('data-horizon') === horizon) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });

  const peakEl = document.getElementById('horizonPeakLoad');
  const minRenEl = document.getElementById('horizonMinRenewable');
  const renFracEl = document.getElementById('horizonAvgRenewable');
  const fuelBurnEl = document.getElementById('horizonFuelLiters');
  const insightEl = document.getElementById('horizonInsightText');

  if (horizon === '6h' || horizon === '12h' || horizon === '24h') {
    if (peakEl) peakEl.textContent = '44.5 kW';
    if (minRenEl) minRenEl.textContent = '22.0 kW';
    if (renFracEl) renFracEl.textContent = '68%';
    if (fuelBurnEl) fuelBurnEl.textContent = '48 L';
    if (insightEl) insightEl.textContent = 'High katabatic wind speeds sustaining majority of electrical demand.';
    if (forecastChartInstance) {
      forecastChartInstance.data.labels = ['+1h', '+2h', '+3h', '+4h', '+5h', '+6h'];
      forecastChartInstance.data.datasets[0].data = [39, 41, 42, 44, 43, 40];
      forecastChartInstance.data.datasets[1].data = [42, 45, 46, 44, 43, 41];
      forecastChartInstance.data.datasets[2].data = [2, 3, 2, 1, 0, 0];
      forecastChartInstance.update();
    }
  } else if (horizon === '48h' || horizon === '7d') {
    if (peakEl) peakEl.textContent = '49.0 kW';
    if (minRenEl) minRenEl.textContent = '14.5 kW';
    if (renFracEl) renFracEl.textContent = '62%';
    if (fuelBurnEl) fuelBurnEl.textContent = '280 L';
    if (insightEl) insightEl.textContent = 'Approaching low-pressure depression will reduce solar bifacial harvest.';
    if (forecastChartInstance) {
      forecastChartInstance.data.labels = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];
      forecastChartInstance.data.datasets[0].data = [40, 42, 45, 48, 46, 43, 41];
      forecastChartInstance.data.datasets[1].data = [44, 42, 36, 28, 35, 42, 45];
      forecastChartInstance.data.datasets[2].data = [3, 4, 3, 1, 2, 4, 3];
      forecastChartInstance.update();
    }
  } else {
    // 12m or yearwise
    if (peakEl) peakEl.textContent = '57.5 kW';
    if (minRenEl) minRenEl.textContent = '16 kW';
    if (renFracEl) renFracEl.textContent = '50%';
    if (fuelBurnEl) fuelBurnEl.textContent = '58,400 L';
    if (insightEl) insightEl.textContent = 'Annual polar cycle: Continuous 24h sunlight in Dec/Jan transitions to polar night winter (May-Aug) with high heating demand.';
    if (forecastChartInstance) {
      forecastChartInstance.data.labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      forecastChartInstance.data.datasets[0].data = [34, 36, 42, 52, 57, 58, 56, 52, 44, 38, 35, 34];
      forecastChartInstance.data.datasets[1].data = [18, 19, 22, 24, 25, 26, 26, 25, 23, 20, 19, 18];
      forecastChartInstance.data.datasets[2].data = [24, 21, 12, 1, 0, 0, 0, 0, 1, 11, 20, 25];
      forecastChartInstance.update();
    }
  }
}

// -------------------------------------------------------------
// Live Telemetry UI Rendering Function
// -------------------------------------------------------------
function renderTelemetry(data) {
  if (!data) return;
  state.latestData = data;

  const t = data.telemetry || {};
  const d = data.dispatch || {};
  const g = data.guardrail || {};
  const h = data.hardware_health || {};

  // 1. Station Load
  const loadKw = t.load_elec_kw !== undefined ? t.load_elec_kw : 40.4;
  const valTotalDemandKw = document.getElementById('valTotalDemandKw');
  const valRequiredKw = document.getElementById('valRequiredKw');
  const flowLoadKw = document.getElementById('flowLoadKw');
  const matrixElecLoad = document.getElementById('matrix-elec-load');
  if (valTotalDemandKw) valTotalDemandKw.textContent = `${loadKw.toFixed(1)} kW`;
  if (valRequiredKw) valRequiredKw.textContent = `${loadKw.toFixed(1)} kW`;
  if (flowLoadKw) flowLoadKw.textContent = `${loadKw.toFixed(1)} kW`;
  if (matrixElecLoad) matrixElecLoad.textContent = `${loadKw.toFixed(1)} kWe`;

  // Thermal Load
  const thermKw = t.load_thermal_kw !== undefined ? t.load_thermal_kw : 62.0;
  const matrixThermalLoad = document.getElementById('matrix-thermal-load');
  if (matrixThermalLoad) matrixThermalLoad.textContent = `${thermKw.toFixed(1)} kWth`;

  // 2. Ambient Temperature & Wind Chill
  const tempC = t.ambient_temp_c !== undefined ? t.ambient_temp_c : -26.3;
  const windMs = t.wind_speed_ms !== undefined ? t.wind_speed_ms : 24.9;
  const windChill = t.wind_chill_c !== undefined ? t.wind_chill_c : (tempC - windMs * 0.85);

  const valOutsideTemp = document.getElementById('valOutsideTemp');
  const valWindChill = document.getElementById('valWindChill');
  if (valOutsideTemp) valOutsideTemp.textContent = `${tempC.toFixed(1)}°C`;
  if (valWindChill) valWindChill.textContent = `${windChill.toFixed(1)}°C`;

  // 3. Renewables (Wind & Solar)
  const windKw = d.p_wind_kw !== undefined ? d.p_wind_kw : 44.88;
  const solarKw = d.p_solar_kw !== undefined ? d.p_solar_kw : 1.34;
  const solarWm2 = t.solar_irradiance_wm2 !== undefined ? t.solar_irradiance_wm2 : 131;

  const valWindKw = document.getElementById('valWindKw');
  const valSolarKw = document.getElementById('valSolarKw');
  const valWindSpeed = document.getElementById('valWindSpeed');
  const valSolarIrradiance = document.getElementById('valSolarIrradiance');
  const flowRenewablesKw = document.getElementById('flowRenewablesKw');
  const dispRenewableKw = document.getElementById('dispRenewableKw');

  if (valWindKw) valWindKw.textContent = `${windKw.toFixed(2)} kW`;
  if (valSolarKw) valSolarKw.textContent = `${solarKw.toFixed(2)} kW`;
  if (valWindSpeed) valWindSpeed.textContent = `${windMs.toFixed(1)} m/s`;
  if (valSolarIrradiance) valSolarIrradiance.textContent = `${Math.round(solarWm2)} W/m²`;

  const totalRenewables = windKw + solarKw;
  if (flowRenewablesKw) flowRenewablesKw.textContent = `${totalRenewables.toFixed(1)} kW`;
  if (dispRenewableKw) dispRenewableKw.textContent = `${totalRenewables.toFixed(2)} kW`;

  // Gauge bar values
  const flowWindVal = document.getElementById('flow-wind-val');
  const flowSolarVal = document.getElementById('flow-solar-val');
  if (flowWindVal) flowWindVal.textContent = `${windKw.toFixed(2)} kW`;
  if (flowSolarVal) flowSolarVal.textContent = `${solarKw.toFixed(2)} kW`;

  // Dynamic Turbine Rotation Speed
  const rotorSpeed = windMs <= 1 ? 20 : (windMs > 25 ? 0 : Math.max(0.6, 12.0 / windMs));
  document.documentElement.style.setProperty('--turbine-speed', `${rotorSpeed}s`);

  // 4. Battery Reserve & Derating
  const soc = t.battery_soc_pct !== undefined ? t.battery_soc_pct : 24.0;
  const battTemp = t.battery_temp_c !== undefined ? t.battery_temp_c : -6.1;
  const battDischargeKw = d.p_battery_discharge_kw || 0.0;
  const battChargeKw = d.p_battery_charge_kw || 0.0;
  const battRateKw = d.p_battery_kw !== undefined 
    ? d.p_battery_kw 
    : (battDischargeKw > 0 ? battDischargeKw : (battChargeKw > 0 ? -battChargeKw : 0.0));

  const batterySocBig = document.getElementById('batterySocBig');
  const batteryPctText = document.getElementById('batteryPctText');
  const batteryFillBar = document.getElementById('batteryFillBar');
  const batteryCellTemp = document.getElementById('batteryCellTemp');
  const batteryRateEl = document.getElementById('batteryRateKw');
  const batteryStatusSub = document.getElementById('batteryStatusSub');
  const flowBatteryKw = document.getElementById('flowBatteryKw');
  const dispBatteryKw = document.getElementById('dispBatteryKw');
  const flowBatteryVal = document.getElementById('flow-battery-val');

  if (batterySocBig) batterySocBig.textContent = `${Math.round(soc)}%`;
  if (batteryPctText) batteryPctText.textContent = `${Math.round(soc)}%`;
  if (batteryFillBar) batteryFillBar.style.width = `${Math.min(100, Math.max(5, soc))}%`;
  if (batteryCellTemp) batteryCellTemp.textContent = `${battTemp.toFixed(1)}°C`;
  const battReserve = t.battery_reserve_pct !== undefined ? t.battery_reserve_pct : 20.0;
  const batteryReservePctText = document.getElementById('batteryReservePctText');
  if (batteryReservePctText) batteryReservePctText.textContent = `${Math.round(battReserve)}% Reserve`;
  if (batteryRateEl) {
    if (battChargeKw > 0.05) {
      batteryRateEl.textContent = `+${battChargeKw.toFixed(2)} kW`;
    } else if (battDischargeKw > 0.05) {
      batteryRateEl.textContent = `-${battDischargeKw.toFixed(2)} kW`;
    } else {
      batteryRateEl.textContent = `0.00 kW`;
    }
  }
  if (flowBatteryKw) flowBatteryKw.textContent = `${(battChargeKw > 0.05 ? battChargeKw : battDischargeKw).toFixed(1)} kW`;
  if (dispBatteryKw) {
    if (battChargeKw > 0.05) {
      dispBatteryKw.textContent = `+${battChargeKw.toFixed(2)} kW`;
      dispBatteryKw.className = 'text-sm font-black text-emerald-600';
    } else if (battDischargeKw > 0.05) {
      dispBatteryKw.textContent = `-${battDischargeKw.toFixed(2)} kW`;
      dispBatteryKw.className = 'text-sm font-black text-[#0698c4]';
    } else {
      dispBatteryKw.textContent = '0.00 kW';
      dispBatteryKw.className = 'text-sm font-black text-[#127694]';
    }
  }
  if (flowBatteryVal) flowBatteryVal.textContent = `${(battChargeKw > 0.05 ? ('+' + battChargeKw.toFixed(2)) : (battDischargeKw > 0.05 ? ('-' + battDischargeKw.toFixed(2)) : '0.00'))} kW`;

  if (batteryStatusSub) {
    if (battRateKw < -0.1) {
      batteryStatusSub.textContent = 'Charging';
      batteryStatusSub.className = 'text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200';
    } else if (battRateKw > 0.1) {
      batteryStatusSub.textContent = 'Discharging';
      batteryStatusSub.className = 'text-[9px] font-bold text-[#0698c4] bg-[#c2f0fe] px-2 py-0.5 rounded-full';
    } else {
      batteryStatusSub.textContent = 'Buffer Standby';
      batteryStatusSub.className = 'text-[9px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full';
    }
  }

  // 5. Diesel Reserves & Gen-Set
  const fuelLiters = t.diesel_fuel_liters !== undefined ? t.diesel_fuel_liters : 4477;
  const maxFuel = STATIONS[state.stationId]?.fuelCapacity || 60000.0;
  const fuelPct = Math.min(100, Math.max(0, (fuelLiters / maxFuel) * 100));
  const genOutputKw = (d.p_diesel_1_kw || 0) + (d.p_diesel_2_kw || 0);
  const burnRate = t.fuel_burn_rate_lh !== undefined ? t.fuel_burn_rate_lh : (genOutputKw * 0.26);

  const valFuelLitersBig = document.getElementById('valFuelLitersBig');
  const valFuelPctText = document.getElementById('valFuelPctText');
  const fuelProgressFill = document.getElementById('fuelProgressFill');
  const valFuelBurnRate = document.getElementById('valFuelBurnRate');
  const valGenKw = document.getElementById('valGenKw');
  const flowGenKw = document.getElementById('flowGenKw');
  const dispGenKw = document.getElementById('dispGenKw');
  const dispGenKwVal = document.getElementById('dispGenKwVal');
  const flowDieselVal = document.getElementById('flow-diesel-val');
  const genStatusBadge = document.getElementById('genStatusBadge');

  if (valFuelLitersBig) valFuelLitersBig.textContent = `${Math.round(fuelLiters).toLocaleString()} L`;
  if (valFuelPctText) valFuelPctText.textContent = `${Math.round(fuelPct)}% Capacity`;
  if (fuelProgressFill) fuelProgressFill.style.width = `${fuelPct}%`;
  if (valFuelBurnRate) valFuelBurnRate.textContent = `${burnRate.toFixed(2)} L/h`;
  if (valGenKw) valGenKw.textContent = `${genOutputKw.toFixed(1)} kW`;
  if (flowGenKw) flowGenKw.textContent = `${genOutputKw.toFixed(1)} kW`;
  if (dispGenKw) dispGenKw.textContent = `${genOutputKw.toFixed(2)} kW`;
  if (dispGenKwVal) dispGenKwVal.textContent = `${genOutputKw.toFixed(2)}`;
  if (flowDieselVal) flowDieselVal.textContent = `${genOutputKw.toFixed(2)} kW`;

  if (genStatusBadge) {
    if (genOutputKw > 0.1) {
      genStatusBadge.textContent = 'GEN RUNNING';
      genStatusBadge.className = 'text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200';
    } else {
      genStatusBadge.textContent = 'GEN STANDBY';
      genStatusBadge.className = 'text-[9px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200';
    }
  }

  // 6. Fuel Autonomy Days
  const autonomyDays = burnRate > 0.05 ? Math.min(60, (fuelLiters / (burnRate * 24))) : 26.6;
  const valFuelDaysHero = document.getElementById('valFuelDaysHero');
  const valFuelPctHero = document.getElementById('valFuelPctHero');
  const valFuelDaysRight = document.getElementById('valFuelDaysRight');
  if (valFuelDaysHero) valFuelDaysHero.textContent = `${autonomyDays.toFixed(1)} Days`;
  if (valFuelPctHero) valFuelPctHero.textContent = `${Math.round(fuelPct)}%`;
  if (valFuelDaysRight) valFuelDaysRight.textContent = `${autonomyDays.toFixed(1)} Days`;

  // 7. Generation Source Percentages
  const totalGen = Math.max(0.1, windKw + solarKw + Math.max(0, battRateKw) + genOutputKw);
  const solarPct = Math.round((solarKw / totalGen) * 100);
  const windPct = Math.round((windKw / totalGen) * 100);
  const battPct = Math.round((Math.max(0, battRateKw) / totalGen) * 100);
  const genPct = Math.max(0, 100 - (solarPct + windPct + battPct));

  const dispSolarPct = document.getElementById('dispSolarPct');
  const dispSolarKw = document.getElementById('dispSolarKw');
  const dispWindPct = document.getElementById('dispWindPct');
  const dispWindKw = document.getElementById('dispWindKw');
  const dispBattPct = document.getElementById('dispBattPct');
  const dispBattKw = document.getElementById('dispBattKw');
  const dispGenPct = document.getElementById('dispGenPct');

  if (dispSolarPct) dispSolarPct.textContent = `${solarPct}%`;
  if (dispSolarKw) dispSolarKw.textContent = solarKw.toFixed(2);
  if (dispWindPct) dispWindPct.textContent = `${windPct}%`;
  if (dispWindKw) dispWindKw.textContent = windKw.toFixed(2);
  if (dispBattPct) dispBattPct.textContent = `${battPct}%`;
  if (dispBattKw) {
    if (battDischargeKw > 0.05) {
      dispBattKw.textContent = `${battDischargeKw.toFixed(2)}`;
    } else if (battChargeKw > 0.05) {
      dispBattKw.textContent = `+${battChargeKw.toFixed(2)} (chg)`;
    } else {
      dispBattKw.textContent = '0.00';
    }
  }
  if (dispGenPct) dispGenPct.textContent = `${genPct}%`;

  // 8. Circuit Routing Priorities
  const dispLoadHeat = document.getElementById('dispLoadHeat');
  const dispLoadLab = document.getElementById('dispLoadLab');
  const dispLoadLight = document.getElementById('dispLoadLight');
  if (dispLoadHeat) dispLoadHeat.textContent = (loadKw * 0.65).toFixed(1);
  if (dispLoadLab) dispLoadLab.textContent = (loadKw * 0.28).toFixed(1);
  if (dispLoadLight) dispLoadLight.textContent = (loadKw * 0.07).toFixed(1);

  // 9. Risk & Guardrail Badge
  const riskBadge = document.getElementById('riskModeBadge');
  const riskText = document.getElementById('riskModeText');
  if (riskBadge && riskText) {
    if (g.is_overridden || t.genset_1_fault || t.battery_heater_fault) {
      riskBadge.className = 'badge-risk-emergency px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 shadow-sm';
      riskText.textContent = 'EMERGENCY GUARDRAIL OVERRIDE';
    } else if (soc < 25 || tempC < -30 || windMs > 22) {
      riskBadge.className = 'badge-risk-conservative px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 shadow-sm';
      riskText.textContent = 'CONSERVATIVE TIER';
    } else {
      riskBadge.className = 'badge-risk-normal px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 shadow-sm';
      riskText.textContent = 'NORMAL OPERATIONS';
    }
  }

  // 10. AI Rationale & Explanation (For Modal Dispatch Matrix)
  if (data.explanation) {
    const dispExplain = document.getElementById('dispatchFullExplanation');
    if (dispExplain) dispExplain.textContent = data.explanation;
  }

  // 11. Real-Time Guardrail Interventions in Decision Audit Log
  if (g.interventions && g.interventions.length > 0) {
    const stationName = STATIONS[state.stationId]?.name || 'Bharati';
    const nowTime = new Date().toTimeString().substring(0, 8);
    let changed = false;
    g.interventions.forEach(inv => {
      const exists = state.auditLogs.some(log => log.action === (inv.title || inv.rule_id) && log.time === nowTime);
      if (!exists) {
        state.auditLogs.unshift({
          time: nowTime,
          station: stationName,
          action: inv.title || inv.rule_id || 'Safety Interlock',
          reason: inv.reason || 'Guardrail safety clamp triggered',
          tier: inv.severity || 'CRITICAL'
        });
        changed = true;
      }
    });
    if (changed) {
      state.auditLogs = state.auditLogs.slice(0, 35);
      renderAuditTable(state.auditLogs);
    }
  }
}

// -------------------------------------------------------------
// Live UTC Clock
// -------------------------------------------------------------
function startClock() {
  const clockEl = document.getElementById('stationClock');
  setInterval(() => {
    const now = new Date();
    const utcStr = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    if (clockEl) clockEl.textContent = utcStr;
  }, 1000);
}

// -------------------------------------------------------------
// WebSockets Telemetry Client with Auto-Reconnect
// -------------------------------------------------------------
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;

  try {
    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
      state.wsConnected = true;
      if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
      console.log('[WebSocket] Connected to SEMS Telemetry Stream');
    };

    state.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        renderTelemetry(payload);
      } catch (err) {
        console.error('[WebSocket] Message parsing error:', err);
      }
    };

    state.ws.onclose = () => {
      state.wsConnected = false;
      state.reconnectTimer = setTimeout(initWebSocket, 2500);
    };

    state.ws.onerror = () => {
      state.wsConnected = false;
      if (state.ws) state.ws.close();
    };
  } catch (e) {
    state.reconnectTimer = setTimeout(initWebSocket, 3000);
  }
}

// HTTP Polling Fallback & Periodic Audit Synchronization
function initHttpFallback() {
  // Sync audit log periodically every 4s
  setInterval(loadAndRenderAuditTable, 4000);

  const pollStatus = async () => {
    if (!state.wsConnected) {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const status = await res.json();
          renderTelemetry(status);
        }
      } catch (e) {
        // quiet retry
      }
    }
  };

  // Immediate poll for serverless environments
  pollStatus();
  setInterval(pollStatus, 2000);
}

// -------------------------------------------------------------
// Audit Table Renderer & Live Formatter
// -------------------------------------------------------------
function formatAuditTime(ts) {
  if (!ts) return new Date().toTimeString().substring(0, 8);
  if (typeof ts === 'string' && ts.length <= 8 && ts.includes(':')) return ts;
  if (typeof ts === 'string' && ts.includes('T')) {
    const afterT = ts.split('T')[1];
    return afterT.substring(0, 8);
  }
  try {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toISOString().substring(11, 19);
  } catch (e) {}
  return String(ts).substring(0, 8);
}

function renderAuditTable(logs) {
  const tbody = document.getElementById('dispatchAuditTableBody');
  if (!tbody) return;

  let entries = [];
  if (Array.isArray(logs)) {
    entries = logs;
  } else if (logs && Array.isArray(logs.audit_logs)) {
    entries = logs.audit_logs;
  } else if (logs && Array.isArray(logs.guardrail_events)) {
    entries = logs.guardrail_events.map(g => ({
      time: formatAuditTime(g.timestamp),
      station: g.station || g.station_id || STATIONS[state.stationId]?.name || 'Bharati',
      action: g.title || g.rule_id || 'Safety Guardrail',
      reason: g.reason || 'Guardrail safety interlock engaged',
      tier: g.severity || 'CRITICAL'
    }));
  }

  if (!entries || entries.length === 0) {
    entries = state.auditLogs;
  }

  const activeStationName = STATIONS[state.stationId]?.name || 'Bharati';

  tbody.innerHTML = entries.slice(0, 25).map(item => {
    const timeStr = formatAuditTime(item.time || item.timestamp);
    const stationStr = item.station || activeStationName;
    const actionStr = item.action || item.event || 'LP Dispatch Active';
    const reasonStr = item.reason || item.safety_reasoning || item.explanation || 'Optimal LP balance between renewables and battery buffer';
    const tier = (item.tier || 'NORMAL').toUpperCase();

    const tierBadgeClass = (tier === 'CRITICAL' || tier === 'EMERGENCY' || tier === 'FAULT')
      ? 'bg-rose-50 text-rose-700 border border-rose-200'
      : (tier === 'CONSERVATIVE' || tier === 'WARNING')
      ? 'bg-amber-50 text-amber-700 border border-amber-200'
      : 'bg-emerald-50 text-emerald-700 border border-emerald-200';

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-b-0">
        <td class="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">${timeStr}</td>
        <td class="py-2.5 px-3 font-semibold text-[#127694] whitespace-nowrap">${stationStr}</td>
        <td class="py-2.5 px-3 font-bold text-slate-800">${actionStr}</td>
        <td class="py-2.5 px-3 text-slate-600 leading-relaxed text-[11px]">${reasonStr}</td>
        <td class="py-2.5 px-3 whitespace-nowrap">
          <span class="text-[9px] font-bold px-2.5 py-0.5 rounded-full ${tierBadgeClass}">${tier}</span>
        </td>
      </tr>
    `;
  }).join('');
}

async function loadAndRenderAuditTable() {
  try {
    const res = await fetch('/api/history');
    if (res.ok) {
      const data = await res.json();
      if (data.audit_logs && data.audit_logs.length > 0) {
        state.auditLogs = data.audit_logs;
      }
      renderAuditTable(data);
    }
  } catch (err) {
    console.warn('[Audit Log] Failed to fetch /api/history:', err);
    renderAuditTable(state.auditLogs);
  }
}

// -------------------------------------------------------------
// Setup Interactive Event Listeners & Modals
// -------------------------------------------------------------
function setupStationSwitchers() {
  const btnBharati = document.getElementById('btn-bharati');
  const btnMaitri = document.getElementById('btn-maitri');
  const locationBadge = document.getElementById('stationLocationBadge');
  const capLabel = document.getElementById('batteryCapacityKwh');

  async function switchStation(id) {
    state.stationId = id;
    if (id === 'BHARATI') {
      btnBharati.classList.add('active');
      btnMaitri.classList.remove('active');
      if (locationBadge) locationBadge.textContent = STATIONS.BHARATI.locationText;
      if (capLabel) capLabel.textContent = `${STATIONS.BHARATI.batteryCapacity} kWh`;
    } else {
      btnMaitri.classList.add('active');
      btnBharati.classList.remove('active');
      if (locationBadge) locationBadge.textContent = STATIONS.MAITRI.locationText;
      if (capLabel) capLabel.textContent = `${STATIONS.MAITRI.batteryCapacity} kWh`;
    }

    try {
      await fetch('/api/station/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ station_id: id })
      });
    } catch (e) {
      console.warn('Switch station endpoint unavailable:', e);
    }
    loadAndRenderAuditTable();
  }

  if (btnBharati) btnBharati.addEventListener('click', () => switchStation('BHARATI'));
  if (btnMaitri) btnMaitri.addEventListener('click', () => switchStation('MAITRI'));
}

function setupModeSwitchers() {
  const btnDemo = document.getElementById('btn-mode-demo');
  const btnScada = document.getElementById('btn-mode-scada');

  async function switchMode(mode) {
    state.mode = mode;
    if (mode === 'DEMO_MODE') {
      btnDemo.classList.add('active');
      btnScada.classList.remove('active');
    } else {
      btnScada.classList.add('active');
      btnDemo.classList.remove('active');
    }

    try {
      await fetch('/api/mode/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: mode })
      });
    } catch (e) {
      console.warn('Mode switch error:', e);
    }
  }

  if (btnDemo) btnDemo.addEventListener('click', () => switchMode('DEMO_MODE'));
  if (btnScada) btnScada.addEventListener('click', () => switchMode('SCADA_MODE'));
}

function setupModals() {
  // Modal IDs
  const modals = {
    forecast: document.getElementById('modal-forecast-full'),
    dispatch: document.getElementById('modal-dispatch-full'),
    copilot: document.getElementById('modal-copilot-full'),
    maintenance: document.getElementById('modal-maintenance-full'),
    manual: document.getElementById('modal-manual')
  };

  function openModal(modal) {
    if (!modal) return;
    modal.classList.remove('hidden');
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.add('hidden');
  }

  // Trigger buttons
  const btnOpenForecast = document.getElementById('btnOpenForecastModal');
  const navBtnForecast = document.getElementById('navBtnForecast');
  const btnCloseForecast = document.getElementById('btnCloseForecastModal');

  const btnOpenDispatch = document.getElementById('btnOpenDispatchModal');
  const navBtnDispatch = document.getElementById('navBtnDispatch');
  const btnCloseDispatch = document.getElementById('btnCloseDispatchModal');

  const btnOpenCopilot = document.getElementById('btnOpenCopilotModal');
  const navBtnAssistant = document.getElementById('navBtnAssistant');
  const btnCloseCopilot = document.getElementById('btnCloseCopilotModal');

  const navBtnMaintenance = document.getElementById('navBtnMaintenance');
  const btnOpenMaintenance = document.getElementById('btnOpenMaintenanceDirect');
  const btnCloseMaintenance = document.getElementById('btnCloseMaintenanceModal');

  const btnOpenManual = document.getElementById('btnOpenManualModal');
  const btnTriggerSecondary = document.getElementById('btnTriggerModalSecondary');
  const btnCloseManual = document.getElementById('btnCloseManualModal');

  // Forecast
  if (btnOpenForecast) btnOpenForecast.addEventListener('click', () => { openModal(modals.forecast); initForecastChart(); });
  if (navBtnForecast) navBtnForecast.addEventListener('click', () => { openModal(modals.forecast); initForecastChart(); });
  if (btnCloseForecast) btnCloseForecast.addEventListener('click', () => closeModal(modals.forecast));

  // Dispatch Matrix
  if (btnOpenDispatch) btnOpenDispatch.addEventListener('click', () => { 
    openModal(modals.dispatch); 
    loadAndRenderAuditTable();
    setTimeout(initEnergyFlowCanvas, 50); 
  });
  if (navBtnDispatch) navBtnDispatch.addEventListener('click', () => { 
    openModal(modals.dispatch); 
    loadAndRenderAuditTable();
    setTimeout(initEnergyFlowCanvas, 50); 
  });
  if (btnCloseDispatch) btnCloseDispatch.addEventListener('click', () => closeModal(modals.dispatch));

  // Copilot Assistant
  if (btnOpenCopilot) btnOpenCopilot.addEventListener('click', () => openModal(modals.copilot));
  if (navBtnAssistant) navBtnAssistant.addEventListener('click', () => openModal(modals.copilot));
  if (btnCloseCopilot) btnCloseCopilot.addEventListener('click', () => closeModal(modals.copilot));

  // Maintenance
  if (navBtnMaintenance) navBtnMaintenance.addEventListener('click', () => openModal(modals.maintenance));
  if (btnOpenMaintenance) btnOpenMaintenance.addEventListener('click', () => openModal(modals.maintenance));
  if (btnCloseMaintenance) btnCloseMaintenance.addEventListener('click', () => closeModal(modals.maintenance));

  // Manual Override
  if (btnOpenManual) btnOpenManual.addEventListener('click', () => openModal(modals.manual));
  if (btnTriggerSecondary) btnTriggerSecondary.addEventListener('click', () => openModal(modals.manual));
  const btnQuickAdjustReserve = document.getElementById('btnQuickAdjustReserve');
  if (btnQuickAdjustReserve) btnQuickAdjustReserve.addEventListener('click', () => openModal(modals.manual));
  if (btnCloseManual) btnCloseManual.addEventListener('click', () => closeModal(modals.manual));

  // Backdrop close
  Object.values(modals).forEach(m => {
    if (!m) return;
    m.addEventListener('click', (e) => {
      if (e.target === m) closeModal(m);
    });
  });

  // Acknowledge Telemetry button
  const btnAck = document.getElementById('btnAckMaintenance');
  if (btnAck) {
    btnAck.addEventListener('click', () => {
      btnAck.textContent = 'Telemetry Verified ✓';
      btnAck.classList.replace('bg-[#0698c4]', 'bg-emerald-600');
      setTimeout(() => {
        btnAck.textContent = 'Acknowledge Telemetry';
        btnAck.classList.replace('bg-emerald-600', 'bg-[#0698c4]');
        closeModal(modals.maintenance);
      }, 1000);
    });
  }

  // Horizon selector pills
  const horizonPills = document.querySelectorAll('.horizon-pill');
  horizonPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const h = pill.getAttribute('data-horizon');
      if (h) updateForecastHorizon(h);
    });
  });
}

// -------------------------------------------------------------
// Commander Override Controls & Form Handling
// -------------------------------------------------------------
function setupCommanderOverrides() {
  const sliderTemp = document.getElementById('slider-temp');
  const sliderTempVal = document.getElementById('slider-temp-val');
  const sliderWind = document.getElementById('slider-wind');
  const sliderWindVal = document.getElementById('slider-wind-val');
  const sliderLoadMult = document.getElementById('slider-load-mult');
  const sliderLoadMultVal = document.getElementById('slider-load-mult-val');
  const sliderBattReserve = document.getElementById('slider-batt-reserve');
  const sliderBattReserveVal = document.getElementById('slider-batt-reserve-val');
  const sliderBattSoc = document.getElementById('slider-batt-soc');
  const sliderBattSocVal = document.getElementById('slider-batt-soc-val');

  const btnTripGen1 = document.getElementById('btn-trip-gen1');
  const btnFaultBess = document.getElementById('btn-fault-bess');
  const btnResetOverrides = document.getElementById('btn-reset-overrides');
  const form = document.getElementById('commanderOverrideForm');

  if (sliderTemp && sliderTempVal) {
    sliderTemp.addEventListener('input', () => {
      sliderTempVal.textContent = `${parseFloat(sliderTemp.value).toFixed(1)}°C`;
    });
  }

  if (sliderWind && sliderWindVal) {
    sliderWind.addEventListener('input', () => {
      sliderWindVal.textContent = `${parseFloat(sliderWind.value).toFixed(1)} m/s`;
    });
  }

  if (sliderLoadMult && sliderLoadMultVal) {
    sliderLoadMult.addEventListener('input', () => {
      sliderLoadMultVal.textContent = `${parseFloat(sliderLoadMult.value).toFixed(1)}x`;
    });
  }

  if (sliderBattReserve && sliderBattReserveVal) {
    sliderBattReserve.addEventListener('input', () => {
      sliderBattReserveVal.textContent = `${sliderBattReserve.value}%`;
    });
  }

  if (sliderBattSoc && sliderBattSocVal) {
    sliderBattSoc.addEventListener('input', () => {
      sliderBattSocVal.textContent = `${sliderBattSoc.value}%`;
    });
  }

  if (btnTripGen1) {
    btnTripGen1.addEventListener('click', () => {
      state.tripGen1 = !state.tripGen1;
      btnTripGen1.classList.toggle('bg-rose-50', state.tripGen1);
      btnTripGen1.classList.toggle('border-rose-400', state.tripGen1);
      btnTripGen1.classList.toggle('text-rose-700', state.tripGen1);
    });
  }

  if (btnFaultBess) {
    btnFaultBess.addEventListener('click', () => {
      state.faultBess = !state.faultBess;
      btnFaultBess.classList.toggle('bg-amber-50', state.faultBess);
      btnFaultBess.classList.toggle('border-amber-400', state.faultBess);
      btnFaultBess.classList.toggle('text-amber-700', state.faultBess);
    });
  }

  if (btnResetOverrides) {
    btnResetOverrides.addEventListener('click', async () => {
      state.tripGen1 = false;
      state.faultBess = false;
      if (btnTripGen1) btnTripGen1.className = 'p-2 rounded-2xl bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm';
      if (btnFaultBess) btnFaultBess.className = 'p-2 rounded-2xl bg-white hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm';
      if (sliderTemp) { sliderTemp.value = -26.3; sliderTempVal.textContent = '-26.3°C'; }
      if (sliderWind) { sliderWind.value = 24.9; sliderWindVal.textContent = '24.9 m/s'; }
      if (sliderLoadMult) { sliderLoadMult.value = 1.0; sliderLoadMultVal.textContent = '1.0x'; }
      if (sliderBattReserve) { sliderBattReserve.value = 20; sliderBattReserveVal.textContent = '20%'; }
      if (sliderBattSoc) { sliderBattSoc.value = 74; sliderBattSocVal.textContent = '74%'; }

      try {
        await fetch('/api/commander/reset', { method: 'POST' });
        btnResetOverrides.innerHTML = '<i class="fa-solid fa-circle-check text-xs text-emerald-600"></i> <span>Reset ✓</span>';
        setTimeout(() => {
          btnResetOverrides.innerHTML = '<i class="fa-solid fa-rotate-left text-xs"></i> <span>Reset to Nominal</span>';
        }, 1200);
      } catch (e) {
        console.warn('Reset endpoint unavailable:', e);
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btnApply = document.getElementById('btn-apply-overrides');
      if (btnApply) {
        btnApply.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i> <span>Applying...</span>';
      }

      const payload = {
        ambient_temp_c: sliderTemp ? parseFloat(sliderTemp.value) : undefined,
        wind_speed_ms: sliderWind ? parseFloat(sliderWind.value) : undefined,
        load_multiplier: sliderLoadMult ? parseFloat(sliderLoadMult.value) : 1.0,
        fault_genset_1: state.tripGen1,
        fault_battery_heater: state.faultBess,
        battery_reserve_pct: sliderBattReserve ? parseFloat(sliderBattReserve.value) : undefined,
        battery_soc_pct: sliderBattSoc ? parseFloat(sliderBattSoc.value) : undefined
      };

      try {
        const res = await fetch('/api/commander/override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          if (btnApply) {
            btnApply.innerHTML = '<i class="fa-solid fa-circle-check text-xs"></i> <span>Applied ✓</span>';
            btnApply.classList.remove('bg-[#0698c4]', 'hover:bg-[#05c5ff]');
            btnApply.classList.add('bg-emerald-600', 'hover:bg-emerald-500');
          }
          // Brief confirmation delay so commander sees the applied status, then smoothly close popup
          setTimeout(() => {
            const modalManual = document.getElementById('modal-manual');
            if (modalManual) modalManual.classList.add('hidden');
            if (btnApply) {
              btnApply.innerHTML = '<i class="fa-solid fa-check text-xs"></i> <span>Apply Overrides</span>';
              btnApply.classList.remove('bg-emerald-600', 'hover:bg-emerald-500');
              btnApply.classList.add('bg-[#0698c4]', 'hover:bg-[#05c5ff]');
            }
          }, 600);
        } else {
          if (btnApply) {
            btnApply.innerHTML = '<i class="fa-solid fa-check text-xs"></i> <span>Apply Overrides</span>';
          }
        }
      } catch (e) {
        console.warn('Override POST error:', e);
        if (btnApply) {
          btnApply.innerHTML = '<i class="fa-solid fa-check text-xs"></i> <span>Apply Overrides</span>';
        }
      }
    });
  }
}

// -------------------------------------------------------------
// 1-Tap Demo Scenarios
// -------------------------------------------------------------
function setupDemoScenarios() {
  const scenarioBtns = document.querySelectorAll('.scenario-btn');
  const label = document.getElementById('activeScenarioLabel');
  const btnReset = document.getElementById('btnResetScenario');

  scenarioBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const scenario = btn.getAttribute('data-scenario');
      scenarioBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      state.currentScenario = scenario;
      let overridePayload = {};

      if (scenario === 'blizzard') {
        if (label) {
          label.textContent = 'Cat-3 Blizzard Active';
          label.className = 'text-[9px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200';
        }
        overridePayload = { ambient_temp_c: -52.0, wind_speed_ms: 34.0, load_multiplier: 1.3 };
      } else if (scenario === 'trip') {
        if (label) {
          label.textContent = 'Gen-Set Trip Active';
          label.className = 'text-[9px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200';
        }
        overridePayload = { fault_genset_1: true };
      } else if (scenario === 'night') {
        if (label) {
          label.textContent = 'Polar Night Active';
          label.className = 'text-[9px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200';
        }
        overridePayload = { solar_irradiance_wm2: 0.0, ambient_temp_c: -35.0 };
      } else if (scenario === 'dawn') {
        if (label) {
          label.textContent = 'Spring Sunrise Active';
          label.className = 'text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200';
        }
        overridePayload = { solar_irradiance_wm2: 520.0, wind_speed_ms: 12.0 };
      }

      try {
        await fetch('/api/commander/override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(overridePayload)
        });
      } catch (e) {
        console.warn('Scenario override error:', e);
      }
    });
  });

  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      scenarioBtns.forEach(b => b.classList.remove('active'));
      if (label) {
        label.textContent = 'Live Normal';
        label.className = 'text-[9px] font-bold text-[#0698c4] bg-[#c2f0fe] px-2 py-0.5 rounded-full';
      }
      try {
        await fetch('/api/commander/reset', { method: 'POST' });
      } catch (e) {
        console.warn('Reset error:', e);
      }
    });
  }
}

// -------------------------------------------------------------
// Novara AI Copilot Command Bar & Full Modal Chat
// -------------------------------------------------------------
function setupCopilot() {
  const form = document.getElementById('copilotForm');
  const input = document.getElementById('copilotInput');
  const respBox = document.getElementById('copilotResponseBox');
  const respText = document.getElementById('copilotResponseText');
  const btnCloseResp = document.getElementById('btnCloseCopilotResponse');
  const quickChips = document.querySelectorAll('.ai-chip');

  async function askAi(query) {
    if (!query) return;
    if (respBox) respBox.classList.remove('hidden');
    if (respText) {
      respText.innerHTML = '<span class="inline-flex items-center gap-1.5 text-slate-500 italic"><i class="fa-solid fa-spinner fa-spin text-[#0698c4]"></i> Novara AI reasoning over live microgrid telemetry & constraints...</span>';
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query })
      });
      if (res.ok) {
        const data = await res.json();
        if (respText) respText.textContent = data.answer || 'Response generated.';
      } else {
        if (respText) respText.textContent = 'Operational reasoning synced: All microgrid components operating within polar limits.';
      }
    } catch (e) {
      if (respText) respText.textContent = 'SEMS optimizer actively balancing polar katabatic wind and solar generation to suppress diesel consumption while maintaining station life-support CHP heating.';
    }
  }

  if (form && input) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) askAi(q);
    });
  }

  if (btnCloseResp && respBox) {
    btnCloseResp.addEventListener('click', () => {
      respBox.classList.add('hidden');
    });
  }

  quickChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-q') || chip.textContent.trim();
      if (input) input.value = prompt;
      askAi(prompt);
    });
  });

  // Modal Full Chat
  const modalForm = document.getElementById('copilotModalForm');
  const modalInput = document.getElementById('copilotModalInput');
  const chatThread = document.getElementById('copilotModalChatThread');
  const modalChips = document.querySelectorAll('.ai-modal-chip');

  function appendChatMessage(sender, text) {
    if (!chatThread) return;
    const isAi = sender === 'ai';
    const msgDiv = document.createElement('div');
    msgDiv.className = isAi ? 'flex items-start gap-2.5' : 'flex items-start justify-end gap-2.5';

    if (isAi) {
      msgDiv.innerHTML = `
        <div class="w-7 h-7 rounded-lg bg-[#0698c4] text-white flex items-center justify-center text-xs shrink-0 mt-0.5">
          <i class="fa-solid fa-robot"></i>
        </div>
        <div class="bg-white p-3 rounded-2xl border border-[#9ae5fe]/70 shadow-sm max-w-[85%]">
          <p class="text-xs text-slate-700 leading-relaxed">${text}</p>
          <span class="text-[9px] text-slate-400 font-mono mt-1 block">Novara AI Telemetry Synced</span>
        </div>
      `;
    } else {
      msgDiv.innerHTML = `
        <div class="bg-[#127694] text-white p-3 rounded-2xl shadow-sm max-w-[85%]">
          <p class="text-xs leading-relaxed">${text}</p>
          <span class="text-[9px] text-cyan-200 font-mono mt-1 block text-right">Commander</span>
        </div>
      `;
    }

    chatThread.appendChild(msgDiv);
    chatThread.scrollTop = chatThread.scrollHeight;
  }

  async function sendModalChat(q) {
    if (!q) return;
    appendChatMessage('commander', q);
    if (modalInput) modalInput.value = '';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      });
      if (res.ok) {
        const data = await res.json();
        appendChatMessage('ai', data.answer || 'Response generated.');
      } else {
        appendChatMessage('ai', 'Meeting station load with available renewables and active battery buffer.');
      }
    } catch (e) {
      appendChatMessage('ai', 'Current conditions: -26.3°C with wind at 24.9 m/s. Fuel reserves at 75%, battery at 24%. System is running optimal LP balance.');
    }
  }

  if (modalForm && modalInput) {
    modalForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = modalInput.value.trim();
      if (q) sendModalChat(q);
    });
  }

  modalChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt') || chip.textContent.trim();
      sendModalChat(prompt);
    });
  });
}

// -------------------------------------------------------------
// Application Initializer
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  setupStationSwitchers();
  setupModeSwitchers();
  setupModals();
  setupCommanderOverrides();
  setupDemoScenarios();
  setupCopilot();
  initEnergyFlowCanvas();
  initForecastChart();
  initWebSocket();
  initHttpFallback();
  loadAndRenderAuditTable();
});
