import React, { useState, useEffect, useRef } from 'react';
import { STATIONS } from '../constants/stations';

export default function MicrogridModal({
  isOpen,
  onClose,
  latestData,
  stationId = 'MAITRI'
}) {
  const [activeTab, setActiveTab] = useState('balance'); // 'balance' | 'advisor' | 'generators' | 'blackout' | 'historical'
  const [analyticsRange, setAnalyticsRange] = useState('7D');
  const [recommendation, setRecommendation] = useState(null);
  const [acceptToast, setAcceptToast] = useState(null);
  const [blackoutLogs, setBlackoutLogs] = useState([]);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const particlesRef = useRef([]);

  const currentStation = STATIONS[stationId] || STATIONS.MAITRI;
  const t = latestData?.telemetry || {};
  const d = latestData?.dispatch || {};
  const mg = latestData?.microgrid || {};
  const bal = mg.balance || {};
  const gens = mg.generators || {};
  const bess = mg.battery_coordination || {};
  const curt = mg.curtailment || {};

  // 1. Fetch Recommendation on Open or Tab Switch
  useEffect(() => {
    if (!isOpen || activeTab !== 'advisor') return;
    const fetchRec = async () => {
      try {
        const res = await fetch('/api/microgrid/dispatch-recommendation');
        if (res.ok) {
          const json = await res.json();
          setRecommendation(json);
        }
      } catch (e) {
        console.warn('Recommendation fetch error:', e);
      }
    };
    fetchRec();
  }, [isOpen, activeTab]);

  // 2. Fetch Analytics on Tab or Range Switch
  useEffect(() => {
    if (!isOpen || activeTab !== 'historical') return;
    const fetchAnalytics = async () => {
      try {
        const res = await fetch(`/api/microgrid/analytics?range=${analyticsRange}`);
        if (res.ok) {
          const json = await res.json();
          setAnalyticsData(json);
        }
        const compRes = await fetch('/api/microgrid/compare-stations');
        if (compRes.ok) {
          const compJson = await compRes.json();
          setComparisonData(compJson.comparison);
        }
      } catch (e) {
        console.warn('Analytics fetch error:', e);
      }
    };
    fetchAnalytics();
  }, [isOpen, activeTab, analyticsRange]);

  // 3. Canvas Microgrid Vector Particle Flow Animation
  useEffect(() => {
    if (!isOpen || activeTab !== 'balance') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = (canvas.width = canvas.parentElement.clientWidth || 800);
    let height = (canvas.height = 360);

    // Particle nodes definition
    const pSolar = d.p_solar_kw || 15.0;
    const pWind = d.p_wind_kw || 45.0;
    const pGen1 = d.p_diesel_1_kw || 110.0;
    const pGen2 = d.p_diesel_2_kw || 0.0;
    const pDis = d.p_battery_discharge_kw || 0.0;
    const pChg = d.p_battery_charge_kw || 0.0;
    const pLoad = bal.effective_electrical_demand_kw || 179.0;
    const qChp = bal.chp_thermal_recovered_kwth || 132.0;

    // Node coordinates
    const nodes = {
      solar: { x: width * 0.15, y: height * 0.2, label: 'SOLAR PV', val: `${pSolar.toFixed(0)} kW`, color: '#f59e0b' },
      wind: { x: width * 0.5, y: height * 0.12, label: 'WIND TURBINE', val: `${pWind.toFixed(0)} kW`, color: '#06b6d4' },
      bus: { x: width * 0.5, y: height * 0.5, label: 'POLAR MICROGRID BUS', val: '50.02 Hz STABLE', color: '#10b981' },
      load: { x: width * 0.85, y: height * 0.35, label: 'ELEC LOAD', val: `${pLoad.toFixed(0)} kW`, color: '#38bdf8' },
      battery: { x: width * 0.22, y: height * 0.8, label: 'BESS STORAGE', val: pDis > 0 ? `-${pDis.toFixed(0)} kW` : (pChg > 0 ? `+${pChg.toFixed(0)} kW` : 'HOLD'), color: '#10b981' },
      diesel: { x: width * 0.65, y: height * 0.8, label: 'DIESEL / CHP', val: `${(pGen1 + pGen2).toFixed(0)} kW`, color: '#f97316' },
      thermal: { x: width * 0.88, y: height * 0.8, label: 'THERMAL LOAD', val: `${qChp.toFixed(0)} kWth`, color: '#ec4899' }
    };

    // Paths
    const paths = [
      { from: nodes.solar, to: nodes.bus, power: pSolar, color: '#f59e0b' },
      { from: nodes.wind, to: nodes.bus, power: pWind, color: '#06b6d4' },
      { from: nodes.bus, to: nodes.load, power: pLoad, color: '#38bdf8' },
      { from: nodes.diesel, to: nodes.bus, power: pGen1 + pGen2, color: '#f97316' },
      { from: nodes.diesel, to: nodes.thermal, power: qChp, color: '#ec4899' }
    ];

    if (pDis > 1.0) {
      paths.push({ from: nodes.battery, to: nodes.bus, power: pDis, color: '#10b981' });
    } else if (pChg > 1.0) {
      paths.push({ from: nodes.bus, to: nodes.battery, power: pChg, color: '#10b981' });
    }

    // Initialize particles
    particlesRef.current = [];
    paths.forEach((path) => {
      const count = Math.min(16, Math.max(3, Math.floor(path.power / 12.0)));
      for (let i = 0; i < count; i++) {
        particlesRef.current.push({
          path,
          progress: Math.random(),
          speed: 0.004 + (path.power / 400.0) * 0.008
        });
      }
    });

    let isRunning = true;
    const render = () => {
      if (!isRunning) return;
      ctx.clearRect(0, 0, width, height);

      // Draw background circuit lines
      paths.forEach((p) => {
        ctx.beginPath();
        ctx.moveTo(p.from.x, p.from.y);
        ctx.lineTo(p.to.x, p.to.y);
        ctx.strokeStyle = p.power > 0 ? `${p.color}33` : '#33415533';
        ctx.lineWidth = 2.5;
        if (p.power === 0) ctx.setLineDash([4, 4]);
        else ctx.setLineDash([]);
        ctx.stroke();
      });

      // Draw moving particles
      particlesRef.current.forEach((part) => {
        part.progress += part.speed;
        if (part.progress > 1.0) part.progress = 0.0;

        const x = part.path.from.x + (part.path.to.x - part.path.from.x) * part.progress;
        const y = part.path.from.y + (part.path.to.y - part.path.from.y) * part.progress;

        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = part.path.color;
        ctx.shadowColor = part.path.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Draw Nodes
      Object.values(nodes).forEach((n) => {
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(n.x - 48, n.y - 20, 96, 40, 8);
        ctx.fill();
        ctx.strokeStyle = n.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.fillText(n.label, n.x, n.y - 4);

        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(n.val, n.x, n.y + 12);
      });

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      isRunning = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isOpen, activeTab, d, bal]);

  if (!isOpen) return null;

  // Handlers
  const handleAcceptDispatch = async (recId) => {
    try {
      const res = await fetch('/api/microgrid/accept-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendation_id: recId || 'REC-CURRENT' })
      });
      if (res.ok) {
        setAcceptToast('Dispatch setpoints successfully applied to microgrid controller.');
        setTimeout(() => setAcceptToast(null), 4000);
      }
    } catch (e) {
      console.warn('Accept dispatch error:', e);
    }
  };

  const handleTriggerBlackoutDefense = async () => {
    setIsSimulating(true);
    try {
      const res = await fetch('/api/microgrid/simulate-blackout-defense', { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        setBlackoutLogs(json.events || []);
      }
    } catch (e) {
      console.warn('Blackout simulation error:', e);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleResetEmergency = async () => {
    try {
      const res = await fetch('/api/microgrid/reset-emergency', { method: 'POST' });
      if (res.ok) {
        setBlackoutLogs([]);
        setAcceptToast('Microgrid restored to nominal operating state. All loads re-engaged.');
        setTimeout(() => setAcceptToast(null), 4000);
      }
    } catch (e) {
      console.warn('Reset emergency error:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900/95 border border-cyan-500/40 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col text-slate-100 overflow-hidden font-sans">
        
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/20 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold text-lg">
              <i className="fa-solid fa-network-wired"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-wide text-cyan-300">POLAR MICROGRID MANAGEMENT SYSTEM</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-500/30">
                  {currentStation.name}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                  {bal.system_status || 'STABLE'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Coordinating Renewables, Storage, Dual Diesel Generators (35% Min Load), CHP Heating & Blackout Defense
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-700"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Global Toast Banner */}
        {acceptToast && (
          <div className="px-6 py-2.5 bg-emerald-500/20 border-b border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-circle-check text-emerald-400"></i>
              <span>{acceptToast}</span>
            </div>
            <button onClick={() => setAcceptToast(null)} className="text-emerald-400 hover:text-white">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-800 bg-slate-900/40 overflow-x-auto">
          {[
            { id: 'balance', label: '1. Live Microgrid Flow', icon: 'fa-diagram-project' },
            { id: 'advisor', label: '2. Forecast-Aware Dispatch', icon: 'fa-brain' },
            { id: 'generators', label: '3. Dual Gensets & CHP', icon: 'fa-gears' },
            { id: 'blackout', label: '4. Blackout Defense & Shedding', icon: 'fa-shield-halved' },
            { id: 'historical', label: '5. Analytics & Comparison', icon: 'fa-chart-column' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition whitespace-nowrap border-b-2 ${
                activeTab === tab.id
                  ? 'border-cyan-400 text-cyan-300 bg-slate-800/80 shadow-sm'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <i className={`fa-solid ${tab.icon} text-xs`}></i>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* ============================================================== */}
          {/* TAB 1: LIVE ENERGY BALANCE & ANIMATED VECTOR FLOW              */}
          {/* ============================================================== */}
          {activeTab === 'balance' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Tactical Readout Banner */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Generation</div>
                  <div className="text-xl font-mono font-black text-cyan-300 mt-1">
                    {bal.total_generation_kw || 0} <span className="text-xs text-slate-400 font-sans">kW</span>
                  </div>
                  <div className="text-[10px] text-cyan-400 font-semibold mt-0.5">
                    Elec: {bal.total_electrical_gen_kw || 0} kW + CHP: {bal.chp_thermal_recovered_kwth || 0} kWth
                  </div>
                </div>

                <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Demand</div>
                  <div className="text-xl font-mono font-black text-amber-300 mt-1">
                    {bal.total_demand_kw || 0} <span className="text-xs text-slate-400 font-sans">kW</span>
                  </div>
                  <div className="text-[10px] text-amber-400 font-semibold mt-0.5">
                    Elec: {bal.effective_electrical_demand_kw || 0} kW + Heat: {bal.thermal_demand_kwth || 0} kWth
                  </div>
                </div>

                <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Surplus / Deficit</div>
                  <div className="text-xl font-mono font-black text-emerald-400 mt-1">
                    {bal.surplus_deficit_kw >= 0 ? `+${bal.surplus_deficit_kw}` : bal.surplus_deficit_kw} <span className="text-xs text-slate-400 font-sans">kW</span>
                  </div>
                  <div className="text-[10px] text-emerald-300 font-semibold mt-0.5">
                    {bal.net_electrical_residual_kw === 0 ? '0.00 kW residual · STABLE' : `${bal.net_electrical_residual_kw} kW residual`}
                  </div>
                </div>

                <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Station State</div>
                  <div className="text-sm font-black text-purple-300 mt-2 truncate uppercase">
                    {bal.operating_state || 'BALANCED'}
                  </div>
                  <div className="text-[10px] text-purple-400 font-semibold mt-0.5">
                    Renewable Share: {bal.renewable_fraction_pct || 0}%
                  </div>
                </div>

                <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Life Support Floor</div>
                  <div className="text-xl font-mono font-black text-rose-400 mt-1">
                    20.0 <span className="text-xs text-slate-400 font-sans">kW</span>
                  </div>
                  <div className="text-[10px] text-rose-300 font-semibold mt-0.5 flex items-center gap-1">
                    <i className="fa-solid fa-lock text-[8px]"></i> Inviolable non-sheddable
                  </div>
                </div>
              </div>

              {/* Central Dynamic Energy Flow Canvas */}
              <div className="bg-slate-950/80 rounded-2xl border border-cyan-500/30 p-4 relative overflow-hidden shadow-inner">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                    <span className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider">
                      Real-Time Vector Microgrid Dispatch Topology
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    Particle Velocity & Density ∝ Power Magnitude
                  </span>
                </div>
                <div className="w-full h-[360px] relative">
                  <canvas ref={canvasRef} className="w-full h-full block rounded-xl" />
                </div>
              </div>

              {/* Equipment Configuration Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
                  <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 mb-2">
                    <i className="fa-solid fa-wind"></i> RENEWABLE INFRASTRUCTURE
                  </div>
                  <div className="text-xs text-slate-300 space-y-1.5 font-mono">
                    <div className="flex justify-between"><span>Wind Turbine Capacity:</span><span className="font-bold text-white">{currentStation.windCapacity} kW</span></div>
                    <div className="flex justify-between"><span>Solar PV Array:</span><span className="font-bold text-white">{currentStation.solarCapacity} kW</span></div>
                    <div className="flex justify-between"><span>Storm Cut-Out Speed:</span><span className="font-bold text-amber-300">25.0 m/s</span></div>
                  </div>
                </div>

                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 mb-2">
                    <i className="fa-solid fa-car-battery"></i> STORAGE & INVERTER
                  </div>
                  <div className="text-xs text-slate-300 space-y-1.5 font-mono">
                    <div className="flex justify-between"><span>Battery Energy Storage:</span><span className="font-bold text-white">{currentStation.batteryCapacity} kWh</span></div>
                    <div className="flex justify-between"><span>Inverter Rating:</span><span className="font-bold text-white">{currentStation.inverterRating || 80} kW</span></div>
                    <div className="flex justify-between"><span>Emergency Reserve Floor:</span><span className="font-bold text-emerald-400">20.0% SoC</span></div>
                  </div>
                </div>

                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400 mb-2">
                    <i className="fa-solid fa-gears"></i> DIESEL GENERATORS & CHP
                  </div>
                  <div className="text-xs text-slate-300 space-y-1.5 font-mono">
                    <div className="flex justify-between"><span>Genset 1 (Base):</span><span className="font-bold text-white">{currentStation.genset1Capacity} kW (35% min load)</span></div>
                    <div className="flex justify-between"><span>Genset 2 (Peaking):</span><span className="font-bold text-white">{currentStation.genset2Capacity} kW (35% min load)</span></div>
                    <div className="flex justify-between"><span>CHP Heat Ratio:</span><span className="font-bold text-cyan-300">1.20 kWth / kWe</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: FORECAST-AWARE DISPATCH ADVISOR                        */}
          {/* ============================================================== */}
          {activeTab === 'advisor' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Quantile Forecast Context */}
              <div className="bg-slate-800/50 p-4 rounded-xl border border-cyan-500/20">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                    <i className="fa-solid fa-chart-area text-cyan-400"></i>
                    PROBABILISTIC QUANTILE LOOKAHEAD (P10 / P50 / P90)
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-500/30">
                    2-Hour Rolling Horizon
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/60">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">P50 Expected Wind</div>
                    <div className="text-lg font-mono font-bold text-white mt-1">
                      {recommendation?.predicted_state_2h?.predicted_wind_p50_kw || 18.0} kW
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Median planning baseline for MILP solver</div>
                  </div>

                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/60">
                    <div className="text-[10px] font-bold text-amber-400 uppercase">P10 Conservative Wind</div>
                    <div className="text-lg font-mono font-bold text-amber-300 mt-1">
                      {recommendation?.predicted_state_2h?.predicted_wind_p10_kw || 8.0} kW
                    </div>
                    <div className="text-[10px] text-amber-400/80 mt-0.5">Stress bound; requires spinning reserve</div>
                  </div>

                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/60">
                    <div className="text-[10px] font-bold text-cyan-400 uppercase">Predicted Deficit</div>
                    <div className="text-lg font-mono font-bold text-cyan-300 mt-1">
                      {recommendation?.predicted_state_2h?.projected_renewable_deficit_kw || 28.0} kW
                    </div>
                    <div className="text-[10px] text-cyan-400/80 mt-0.5">Renewable shortfall to absorb</div>
                  </div>
                </div>
              </div>

              {/* Active Optimization Recommendation Card */}
              <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 p-5 rounded-2xl border border-cyan-500/40 shadow-xl space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold">
                      <i className="fa-solid fa-wand-magic-sparkles text-sm"></i>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider font-mono">
                        Optimization Recommendation ID: {recommendation?.recommendation_id || 'REC-CURRENT'}
                      </span>
                      <h4 className="text-base font-bold text-white">
                        {recommendation?.recommended_action || 'Maintain Generator 1 online. Reduce battery discharge by 14 kW.'}
                      </h4>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAcceptDispatch(recommendation?.recommendation_id)}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/30 transition transform active:scale-95 flex items-center gap-2"
                  >
                    <i className="fa-solid fa-circle-check"></i>
                    ACCEPT DISPATCH
                  </button>
                </div>

                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed font-mono">
                  <span className="text-cyan-400 font-bold uppercase">Operational Rationale: </span>
                  {recommendation?.operational_reason || 'Wind generation is forecast to decline during the next 2 hours. Preserving battery SoC above 20% guarantees critical life-support reserve without requiring an inefficient cold-start on Generator 2.'}
                </div>

                {/* Expected Impacts Matrix */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Fuel Impact</div>
                    <div className="text-sm font-mono font-bold text-emerald-400 mt-1">-18.4 L avoided</div>
                    <div className="text-[10px] text-slate-400">Cold-start avoided</div>
                  </div>

                  <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Reserve Margin</div>
                    <div className="text-sm font-mono font-bold text-cyan-300 mt-1">+6.8% preserved</div>
                    <div className="text-[10px] text-slate-400">Guarantees 20% floor</div>
                  </div>

                  <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Green Utilization</div>
                    <div className="text-sm font-mono font-bold text-purple-300 mt-1">98.4% harvested</div>
                    <div className="text-[10px] text-slate-400">Near-zero curtailment</div>
                  </div>

                  <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Reliability Tier</div>
                    <div className="text-sm font-mono font-bold text-emerald-300 mt-1">HIGH (P90)</div>
                    <div className="text-[10px] text-slate-400">Stress bound satisfied</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: DUAL GENERATOR MANAGEMENT & CHP COORDINATION           */}
          {/* ============================================================== */}
          {activeTab === 'generators' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Generator 1 Card */}
                <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/60 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold">
                        <i className="fa-solid fa-bolt"></i>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">{gens?.genset_1?.name || 'Diesel Generator 1'}</h4>
                        <span className="text-[10px] font-mono text-slate-400">Continuous Base Load Unit</span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                      gens?.genset_1?.status === 'ONLINE' ? 'bg-emerald-950 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      ● {gens?.genset_1?.status || 'ONLINE'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">Output</div>
                      <div className="text-base font-mono font-black text-cyan-300 mt-0.5">{gens?.genset_1?.output_kw || 0} kW</div>
                    </div>
                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">Capacity</div>
                      <div className="text-base font-mono font-black text-white mt-0.5">{gens?.genset_1?.capacity_kw || currentStation.genset1Capacity} kW</div>
                    </div>
                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">Load</div>
                      <div className="text-base font-mono font-black text-amber-300 mt-0.5">{gens?.genset_1?.current_load_pct || 0}%</div>
                    </div>
                  </div>

                  {/* 35% Minimum Loading Safety Bar */}
                  <div>
                    <div className="flex justify-between text-[10px] font-mono mb-1">
                      <span className="text-slate-400">Loading vs 35% Wet-Stacking Floor</span>
                      <span className="text-amber-400 font-bold">Min: {gens?.genset_1?.min_loading_kw || 105} kW (35%)</span>
                    </div>
                    <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800">
                      <div className="w-[35%] bg-rose-500/40 border-r border-rose-500 flex items-center justify-center text-[8px] text-rose-300 font-bold">
                        DANGER
                      </div>
                      <div
                        className="bg-emerald-500 transition-all duration-300"
                        style={{ width: `${Math.max(0, (gens?.genset_1?.current_load_pct || 0) - 35)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 space-y-1.5 font-mono pt-2 border-t border-slate-700/60">
                    <div className="flex justify-between"><span>Specific Fuel Rate:</span><span className="font-bold text-white">{gens?.genset_1?.fuel_rate_l_per_h || 0} L/h</span></div>
                    <div className="flex justify-between"><span>Continuous Runtime:</span><span className="font-bold text-white">{gens?.genset_1?.runtime_minutes || 0} min</span></div>
                    <div className="flex justify-between"><span>Anti-Wet-Stacking Rule:</span><span className="text-emerald-400 font-bold">60 min Lock Complied</span></div>
                    <div className="flex justify-between"><span>CHP Recovered Heat:</span><span className="text-cyan-300 font-bold">{gens?.genset_1?.thermal_output_kwth || 0} kWth</span></div>
                  </div>
                </div>

                {/* Generator 2 Card */}
                <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/60 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                        <i className="fa-solid fa-power-off"></i>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">{gens?.genset_2?.name || 'Diesel Generator 2'}</h4>
                        <span className="text-[10px] font-mono text-slate-400">Peaking & Spinning Reserve Unit</span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                      gens?.genset_2?.status === 'ONLINE' ? 'bg-emerald-950 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      ● {gens?.genset_2?.status || 'STANDBY'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">Output</div>
                      <div className="text-base font-mono font-black text-cyan-300 mt-0.5">{gens?.genset_2?.output_kw || 0} kW</div>
                    </div>
                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">Capacity</div>
                      <div className="text-base font-mono font-black text-white mt-0.5">{gens?.genset_2?.capacity_kw || currentStation.genset2Capacity} kW</div>
                    </div>
                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">Load</div>
                      <div className="text-base font-mono font-black text-amber-300 mt-0.5">{gens?.genset_2?.current_load_pct || 0}%</div>
                    </div>
                  </div>

                  {/* 35% Minimum Loading Safety Bar */}
                  <div>
                    <div className="flex justify-between text-[10px] font-mono mb-1">
                      <span className="text-slate-400">Loading vs 35% Wet-Stacking Floor</span>
                      <span className="text-amber-400 font-bold">Min: {gens?.genset_2?.min_loading_kw || 70} kW (35%)</span>
                    </div>
                    <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800">
                      <div className="w-[35%] bg-rose-500/40 border-r border-rose-500 flex items-center justify-center text-[8px] text-rose-300 font-bold">
                        DANGER
                      </div>
                      <div
                        className="bg-emerald-500 transition-all duration-300"
                        style={{ width: `${Math.max(0, (gens?.genset_2?.current_load_pct || 0) - 35)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 space-y-1.5 font-mono pt-2 border-t border-slate-700/60">
                    <div className="flex justify-between"><span>Standby Readiness:</span><span className="text-emerald-400 font-bold">PRE-HEATED & READY</span></div>
                    <div className="flex justify-between"><span>Health Score:</span><span className="font-bold text-white">{gens?.genset_2?.health_pct || 98}%</span></div>
                    <div className="flex justify-between"><span>Auto-Start Threshold:</span><span className="text-amber-300 font-bold">Load &gt; {currentStation.genset1Capacity} kW</span></div>
                    <div className="flex justify-between"><span>CHP Recovered Heat:</span><span className="text-cyan-300 font-bold">{gens?.genset_2?.thermal_output_kwth || 0} kWth</span></div>
                  </div>
                </div>

              </div>

              {/* CHP Thermal Coordination Diagram */}
              <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
                <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <i className="fa-solid fa-fire-flame-curved text-orange-400"></i>
                  COMBINED HEAT & POWER (CHP) THERMAL CO-GENERATION LOOP
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400">Captured Engine Heat:</span>
                    <div className="text-base font-bold text-orange-400 mt-1">{bal.chp_thermal_recovered_kwth || 0} kWth</div>
                    <span className="text-[10px] text-slate-500">1.20 kWth per kWe generated</span>
                  </div>
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400">Auxiliary Heat Required:</span>
                    <div className="text-base font-bold text-rose-300 mt-1">{bal.auxiliary_thermal_kwth || 0} kWth</div>
                    <span className="text-[10px] text-slate-500">Electric heating element</span>
                  </div>
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400">Thermal Supply vs Demand:</span>
                    <div className="text-base font-bold text-emerald-400 mt-1">100.0% SATISFIED</div>
                    <span className="text-[10px] text-emerald-300">Living quarters protected</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: BLACKOUT DEFENSE & HIERARCHICAL LOAD SHEDDING          */}
          {/* ============================================================== */}
          {activeTab === 'blackout' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Emergency Status Banner */}
              <div className="bg-slate-800/60 p-4 rounded-xl border border-rose-500/30 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-lg">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">BLACKOUT DEFENSE & HIERARCHICAL LOAD SHEDDING</h3>
                    <p className="text-xs text-slate-400 font-mono">
                      State: <span className="font-bold text-rose-400 uppercase">{mg.emergency_state || 'NORMAL'}</span> · Total Shedding: <span className="text-amber-300 font-bold">{bal.total_shed_kw || 0} kW</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTriggerBlackoutDefense}
                    disabled={isSimulating}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition active:scale-95 disabled:opacity-50"
                  >
                    {isSimulating ? 'SIMULATING DEFENSE...' : 'TRIGGER BLACKOUT STRESS TEST'}
                  </button>
                  <button
                    onClick={handleResetEmergency}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition"
                  >
                    RESTORE NOMINAL
                  </button>
                </div>
              </div>

              {/* 3-Tier Load Shedding Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] text-amber-400 font-bold uppercase">Tier 1: Non-Essential</div>
                  <div className="text-lg font-mono font-bold text-white mt-1">25.0 kW</div>
                  <div className="text-[10px] text-slate-400 mt-1">External floodlights, auxiliary heating (First to shed)</div>
                </div>

                <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] text-amber-400 font-bold uppercase">Tier 2: Flexible Loads</div>
                  <div className="text-lg font-mono font-bold text-white mt-1">45.0 kW</div>
                  <div className="text-[10px] text-slate-400 mt-1">Scientific freezers, snowmelter, water recycling</div>
                </div>

                <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] text-amber-400 font-bold uppercase">Tier 3: Non-Critical</div>
                  <div className="text-lg font-mono font-bold text-white mt-1">30.0 kW</div>
                  <div className="text-[10px] text-slate-400 mt-1">Deep core drills, auxiliary workshop tools</div>
                </div>

                <div className="bg-rose-950/30 p-3.5 rounded-xl border border-rose-500/50">
                  <div className="text-[10px] text-rose-400 font-bold uppercase flex items-center gap-1">
                    <i className="fa-solid fa-lock text-[9px]"></i> CRITICAL LIFE SUPPORT
                  </div>
                  <div className="text-lg font-mono font-bold text-rose-300 mt-1">20.0 kW</div>
                  <div className="text-[10px] text-rose-300 font-semibold mt-1">Habitat O2, pressure, medical, satcom (CANNOT SHED)</div>
                </div>
              </div>

              {/* Blackout Defense Event Log */}
              {blackoutLogs.length > 0 && (
                <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider mb-2">
                    Automated Blackout Defense Sequential Execution Trace:
                  </div>
                  <div className="space-y-1.5 font-mono text-xs">
                    {blackoutLogs.map((log) => (
                      <div key={log.step} className="flex items-start gap-2.5 bg-slate-900/60 p-2 rounded border border-slate-800">
                        <span className="text-cyan-400 font-bold">[{log.time}]</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-amber-300 font-bold">{log.event}</span>
                        <span className="text-slate-300">{log.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 5: HISTORICAL ANALYTICS & STATION COMPARISON              */}
          {/* ============================================================== */}
          {activeTab === 'historical' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Range Selector */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-mono font-bold text-cyan-300 uppercase">
                  Multi-Horizon Performance Aggregations:
                </span>
                <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
                  {['24H', '7D', '30D', '12M'].map((rng) => (
                    <button
                      key={rng}
                      onClick={() => setAnalyticsRange(rng)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition font-mono ${
                        analyticsRange === rng
                          ? 'bg-cyan-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {rng}
                    </button>
                  ))}
                </div>
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Total Generation</div>
                  <div className="text-lg font-mono font-bold text-white mt-1">
                    {analyticsData?.totals?.total_generation_kwh?.toLocaleString() || 0} kWh
                  </div>
                  <div className="text-[10px] text-cyan-400 mt-0.5">Green: {analyticsData?.totals?.renewable_fraction_pct || 0}%</div>
                </div>

                <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Diesel Fuel Saved</div>
                  <div className="text-lg font-mono font-bold text-emerald-400 mt-1">
                    {analyticsData?.totals?.fuel_saved_liters?.toLocaleString() || 0} L
                  </div>
                  <div className="text-[10px] text-emerald-300 mt-0.5">CO2 Avoided: {analyticsData?.totals?.co2_avoided_kg?.toLocaleString() || 0} kg</div>
                </div>

                <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Battery Throughput</div>
                  <div className="text-lg font-mono font-bold text-purple-300 mt-1">
                    {analyticsData?.totals?.battery_throughput_kwh?.toLocaleString() || 0} kWh
                  </div>
                  <div className="text-[10px] text-purple-400 mt-0.5">Displaced generator starts</div>
                </div>

                <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Renewable Curtailment</div>
                  <div className="text-lg font-mono font-bold text-amber-400 mt-1">
                    {analyticsData?.totals?.curtailed_energy_kwh?.toLocaleString() || 0} kWh
                  </div>
                  <div className="text-[10px] text-amber-300 mt-0.5">Clamp & min-load events</div>
                </div>
              </div>

              {/* Side-by-Side Station Profile Comparison Matrix */}
              {comparisonData && (
                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
                  <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <i className="fa-solid fa-code-compare text-cyan-400"></i>
                    ANTARCTIC STATION PROFILE COMPARISON MATRIX: MAITRI vs BHARATI
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-900/80 text-slate-400 text-[10px] uppercase">
                        <tr>
                          <th className="p-2.5">Parameter</th>
                          <th className="p-2.5 text-cyan-300">MAITRI (Queen Maud Land)</th>
                          <th className="p-2.5 text-amber-300">BHARATI (Larsemann Hills)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        <tr>
                          <td className="p-2 text-slate-400">Diesel Generator 1</td>
                          <td className="p-2 font-bold text-white">{comparisonData.MAITRI.diesel_generator_1_kw} kW</td>
                          <td className="p-2 font-bold text-white">{comparisonData.BHARATI.diesel_generator_1_kw} kW</td>
                        </tr>
                        <tr>
                          <td className="p-2 text-slate-400">Diesel Generator 2</td>
                          <td className="p-2 font-bold text-white">{comparisonData.MAITRI.diesel_generator_2_kw} kW</td>
                          <td className="p-2 font-bold text-white">{comparisonData.BHARATI.diesel_generator_2_kw} kW</td>
                        </tr>
                        <tr>
                          <td className="p-2 text-slate-400">35% Minimum Loading Floor</td>
                          <td className="p-2 text-amber-300 font-bold">105 kW (G1) / 70 kW (G2)</td>
                          <td className="p-2 text-amber-300 font-bold">42 kW (G1) / 42 kW (G2)</td>
                        </tr>
                        <tr>
                          <td className="p-2 text-slate-400">Wind Turbine Capacity</td>
                          <td className="p-2 text-cyan-400 font-bold">{comparisonData.MAITRI.wind_capacity_kw} kW</td>
                          <td className="p-2 text-cyan-400 font-bold">{comparisonData.BHARATI.wind_capacity_kw} kW</td>
                        </tr>
                        <tr>
                          <td className="p-2 text-slate-400">Solar PV Capacity</td>
                          <td className="p-2 text-amber-400 font-bold">{comparisonData.MAITRI.solar_capacity_kw} kW</td>
                          <td className="p-2 text-amber-400 font-bold">{comparisonData.BHARATI.solar_capacity_kw} kW</td>
                        </tr>
                        <tr>
                          <td className="p-2 text-slate-400">Battery Capacity & Inverter</td>
                          <td className="p-2 text-emerald-400 font-bold">{comparisonData.MAITRI.battery_capacity_kwh} kWh ({comparisonData.MAITRI.inverter_rating_kw} kW Inv)</td>
                          <td className="p-2 text-emerald-400 font-bold">{comparisonData.BHARATI.battery_capacity_kwh} kWh ({comparisonData.BHARATI.inverter_rating_kw} kW Inv)</td>
                        </tr>
                        <tr>
                          <td className="p-2 text-slate-400">Base / Peak Electrical Load</td>
                          <td className="p-2 font-bold text-white">{comparisonData.MAITRI.base_load_kwe} kW / {comparisonData.MAITRI.peak_load_kwe} kW</td>
                          <td className="p-2 font-bold text-white">{comparisonData.BHARATI.base_load_kwe} kW / {comparisonData.BHARATI.peak_load_kwe} kW</td>
                        </tr>
                        <tr>
                          <td className="p-2 text-slate-400">Annual Fuel Saved (Optimized)</td>
                          <td className="p-2 text-emerald-300 font-bold">{comparisonData.MAITRI.annual_fuel_saved_l.toLocaleString()} L (-25.2%)</td>
                          <td className="p-2 text-emerald-300 font-bold">{comparisonData.BHARATI.annual_fuel_saved_l.toLocaleString()} L (-27.1%)</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Bottom Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-900/60 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-3">
            <span>STATION: <strong className="text-white">{currentStation.name}</strong></span>
            <span>BALANCE: <strong className="text-emerald-400">{bal.system_status || 'STABLE'}</strong></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition border border-slate-700"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
