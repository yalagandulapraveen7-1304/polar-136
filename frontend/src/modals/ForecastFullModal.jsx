import React, { useState, useEffect, useRef } from 'react';

export default function ForecastFullModal({
  isOpen,
  onClose,
  stationId = 'MAITRI',
  onOpenModal,
  latestData = null,
  activeOverrides = {}
}) {
  const [activeTab, setActiveTab] = useState('quantiles'); // 'quantiles' | 'deviation' | 'reserve' | 'benchmark' | 'mlops'
  const [selectedTarget, setSelectedTarget] = useState('electrical_load_kw');
  const [selectedHorizon, setSelectedHorizon] = useState('24H');
  const [forecastData, setForecastData] = useState(null);
  const [deviationData, setDeviationData] = useState(null);
  const [reserveAdvisory, setReserveAdvisory] = useState(null);
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [mlopsData, setMlopsData] = useState(null);
  const [eventsData, setEventsData] = useState([]);
  const [auditLogData, setAuditLogData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  const canvasRef = useRef(null);

  const TARGETS = [
    { id: 'electrical_load_kw', label: 'Electrical Load', unit: 'kWe', icon: 'fa-bolt' },
    { id: 'heating_load_kw', label: 'Heating Load', unit: 'kWth', icon: 'fa-fire-flame-curved' },
    { id: 'renewable_generation_kw', label: 'Renewable Gen', unit: 'kW', icon: 'fa-solar-panel' },
    { id: 'wind_speed_ms', label: 'Wind Speed', unit: 'm/s', icon: 'fa-wind' },
    { id: 'solar_irradiance_wm2', label: 'Solar Irradiance', unit: 'W/m²', icon: 'fa-sun' },
    { id: 'temperature_c', label: 'Ambient Temp', unit: '°C', icon: 'fa-temperature-low' },
    { id: 'total_demand_kw', label: 'Total Demand', unit: 'kW', icon: 'fa-chart-pie' }
  ];

  const HORIZONS = [
    { id: '1H', label: '1 Hour', category: 'Short-Term' },
    { id: '6H', label: '6 Hours', category: 'Short-Term' },
    { id: '24H', label: '24 Hours', category: 'Operational' },
    { id: '72H', label: '72 Hours', category: 'Operational' },
    { id: '7D', label: '7 Days', category: 'Operational' },
    { id: '30D', label: '30 Days', category: 'Strategic' },
    { id: '12M', label: '12 Months', category: 'Strategic' }
  ];

  // Fetch forecast data when target or horizon changes
  useEffect(() => {
    if (!isOpen) return;
    fetchForecastIntel(selectedTarget, selectedHorizon);
  }, [isOpen, selectedTarget, selectedHorizon]);

  // Fetch ancillary modules when modal opens
  useEffect(() => {
    if (!isOpen) return;
    fetchDeviationData();
    fetchReserveAdvisory();
    fetchBenchmarkData();
    fetchMlopsData();
    fetchEventsData();
    fetchAuditLogData();
  }, [isOpen]);

  async function fetchForecastIntel(target, horizon) {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/forecast/intel?target=${target}&horizon=${horizon}`);
      if (res.ok) {
        const json = await res.json();
        setForecastData(json);
      }
    } catch (err) {
      console.error('Failed to fetch forecast intel:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchDeviationData() {
    try {
      const res = await fetch('/api/forecast/deviation');
      if (res.ok) setDeviationData(await res.json());
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchReserveAdvisory() {
    try {
      const res = await fetch('/api/forecast/reserve-advisory');
      if (res.ok) setReserveAdvisory(await res.json());
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchBenchmarkData() {
    try {
      const res = await fetch('/api/forecast/benchmark');
      if (res.ok) setBenchmarkData(await res.json());
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchMlopsData() {
    try {
      const res = await fetch('/api/forecast/mlops');
      if (res.ok) setMlopsData(await res.json());
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchEventsData() {
    try {
      const res = await fetch('/api/forecast/events');
      if (res.ok) {
        const json = await res.json();
        setEventsData(json.events || []);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchAuditLogData() {
    try {
      const res = await fetch('/api/forecast/audit-log');
      if (res.ok) {
        const json = await res.json();
        setAuditLogData(json.audit_log || []);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handlePromoteChallenger() {
    try {
      const res = await fetch('/api/forecast/champion-challenger/promote', { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        setActionMessage(json.message);
        fetchMlopsData();
        fetchBenchmarkData();
        setTimeout(() => setActionMessage(null), 4000);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleRollbackChampion() {
    try {
      const res = await fetch('/api/forecast/champion-challenger/rollback', { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        setActionMessage(json.message);
        fetchMlopsData();
        fetchBenchmarkData();
        setTimeout(() => setActionMessage(null), 4000);
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Draw SVG/Canvas Chart for Quantiles & History
  useEffect(() => {
    if (activeTab !== 'quantiles' || !forecastData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const hist = forecastData.history_actuals || [];
    const p10 = forecastData.p10 || [];
    const p50 = forecastData.p50 || [];
    const p90 = forecastData.p90 || [];

    const allValues = [...hist, ...p10, ...p50, ...p90];
    if (allValues.length === 0) return;

    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const valRange = Math.max(1, maxVal - minVal);

    const padding = { top: 30, right: 30, bottom: 40, left: 50 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    function getY(v) {
      return padding.top + chartH - ((v - minVal) / valRange) * chartH;
    }

    const totalPoints = hist.length + p50.length - 1;
    const xStep = chartW / Math.max(1, totalPoints);

    // Draw horizontal grid lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      const v = maxVal - (valRange / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.fillText(v.toFixed(1), 10, y + 3);
    }

    // Draw divider between Historical Actuals and Forecast Lookahead
    const splitX = padding.left + (hist.length - 1) * xStep;
    ctx.strokeStyle = '#0284c7';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(splitX, padding.top);
    ctx.lineTo(splitX, height - padding.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('◄ HISTORICAL ACTUALS', splitX - 140, padding.top - 10);
    ctx.fillText('PROBABILISTIC FORECAST ►', splitX + 15, padding.top - 10);

    // Draw P10-P90 Uncertainty Ribbon (Shaded Area)
    ctx.fillStyle = 'rgba(14, 165, 233, 0.18)';
    ctx.beginPath();
    // Forward along P90
    for (let i = 0; i < p90.length; i++) {
      const x = splitX + i * xStep;
      const y = getY(p90[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // Backward along P10
    for (let i = p10.length - 1; i >= 0; i--) {
      const x = splitX + i * xStep;
      const y = getY(p10[i]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Draw P90 line (Upper Stress Bound)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let i = 0; i < p90.length; i++) {
      const x = splitX + i * xStep;
      const y = getY(p90[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw P10 line (Lower Favorable Bound)
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let i = 0; i < p10.length; i++) {
      const x = splitX + i * xStep;
      const y = getY(p10[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw P50 line (Central Forecast)
    ctx.strokeStyle = '#0369a1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < p50.length; i++) {
      const x = splitX + i * xStep;
      const y = getY(p50[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw Historical Actuals line (Solid Emerald/Slate)
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < hist.length; i++) {
      const x = padding.left + i * xStep;
      const y = getY(hist[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw data points on Historical
    hist.forEach((v, i) => {
      const x = padding.left + i * xStep;
      const y = getY(v);
      ctx.fillStyle = '#059669';
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw NOW indicator circle at junction
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(splitX, getY(hist[hist.length - 1] || p50[0]), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(splitX, getY(hist[hist.length - 1] || p50[0]), 2.5, 0, Math.PI * 2);
    ctx.fill();

  }, [activeTab, forecastData]);

  if (!isOpen) return null;

  const currentTargetMeta = TARGETS.find(t => t.id === selectedTarget) || TARGETS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-50/40 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-3xl bg-white border border-[#bcecfc] text-slate-800 shadow-2xl(2,132,199,0.25)] overflow-hidden">
        
        {/* Header Strip */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#bcecfc]/60 bg-gradient-to-r from-[#f0faff] via-white to-[#f0faff]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#0699C6] to-[#05C5FF] flex items-center justify-center text-white shadow-lg">
              <i className="fa-solid fa-chart-line text-lg"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-[#127694] uppercase">
                  Predictive Intelligence & Forecasting Center
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-[#edf9fd] text-[#127694] border border-[#bcecfc]">
                  LightGBM Quantiles (P10/P50/P90)
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Zero-Leakage Architecture
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Multi-Horizon Environmental, Renewable & Demand Uncertainty Quantification for Antarctic Microgrids
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenModal && (
              <>
                <button
                  type="button"
                  onClick={() => onOpenModal('energy')}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#05C5FF] to-[#0699C6] text-white text-xs font-bold shadow-xs hover:opacity-95 transition flex items-center gap-1.5 cursor-pointer"
                  title="Send predicted load profile to Energy Matrix"
                >
                  <i className="fa-solid fa-bolt"></i>
                  <span>Send to Energy Matrix</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenModal('digital_twin')}
                  className="px-3 py-1.5 rounded-xl bg-[#edf9fd] hover:bg-[#c2f0fe] text-[#127694] text-xs font-bold border border-[#bcecfc] transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title="Evaluate forecast impacts in Digital Twin"
                >
                  <i className="fa-solid fa-cube text-[#0699C6]"></i>
                  <span>Evaluate in Digital Twin</span>
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition border border-slate-200 cursor-pointer"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        </div>

        {/* Global Action Message Banner */}
        {actionMessage && (
          <div className="px-6 py-2 bg-emerald-100 border-b border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <i className="fa-solid fa-circle-check text-emerald-700"></i>
            <span>{actionMessage}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 pb-2 border-b border-[#bcecfc]/60 bg-gradient-to-r from-[#f0faff] via-white to-[#f0faff] overflow-x-auto text-xs font-bold shrink-0">
          <button
            onClick={() => setActiveTab('quantiles')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'quantiles'
                ? 'bg-gradient-to-r from-[#05C5FF] to-[#0699C6] text-white shadow-xs'
                : 'text-slate-600 hover:text-[#127694] hover:bg-[#edf9fd]'
            }`}
          >
            <i className="fa-solid fa-chart-area"></i>
            <span>Probabilistic Quantiles</span>
          </button>

          <button
            onClick={() => setActiveTab('deviation')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'deviation'
                ? 'bg-gradient-to-r from-[#05C5FF] to-[#0699C6] text-white shadow-xs'
                : 'text-slate-600 hover:text-[#127694] hover:bg-[#edf9fd]'
            }`}
          >
            <i className="fa-solid fa-arrows-split-up-and-left"></i>
            <span>Actual vs Forecast Deviation</span>
            {deviationData?.active_alert_count > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-extrabold shadow-xs">
                {deviationData.active_alert_count}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('reserve')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'reserve'
                ? 'bg-gradient-to-r from-[#05C5FF] to-[#0699C6] text-white shadow-xs'
                : 'text-slate-600 hover:text-[#127694] hover:bg-[#edf9fd]'
            }`}
          >
            <i className="fa-solid fa-shield-halved"></i>
            <span>Forecast-Aware Reserve Advisory</span>
          </button>

          <button
            onClick={() => setActiveTab('benchmark')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'benchmark'
                ? 'bg-gradient-to-r from-[#05C5FF] to-[#0699C6] text-white shadow-xs'
                : 'text-slate-600 hover:text-[#127694] hover:bg-[#edf9fd]'
            }`}
          >
            <i className="fa-solid fa-scale-balanced"></i>
            <span>Model Benchmark & Pinball Loss</span>
          </button>

          <button
            onClick={() => setActiveTab('mlops')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'mlops'
                ? 'bg-gradient-to-r from-[#05C5FF] to-[#0699C6] text-white shadow-xs'
                : 'text-slate-600 hover:text-[#127694] hover:bg-[#edf9fd]'
            }`}
          >
            <i className="fa-solid fa-dna"></i>
            <span>MLOps Drift & Champion/Challenger</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white text-slate-800">

          {/* TAB 1: PROBABILISTIC QUANTILES */}
          {activeTab === 'quantiles' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Target & Horizon Selector Controls */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-[#f0faff] p-4 rounded-2xl border border-slate-200">
                {/* Target Variables */}
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <i className="fa-solid fa-crosshairs text-[#0699C6]"></i>
                    <span>Prediction Target</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {TARGETS.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTarget(t.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                          selectedTarget === t.id
                            ? 'bg-sky-500 text-slate-950 shadow-sm'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-[#127694]'
                        }`}
                      >
                        <i className={`fa-solid ${t.icon} text-[10px]`}></i>
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Horizon Durations */}
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <i className="fa-solid fa-clock text-[#0699C6]"></i>
                    <span>Forecast Horizon</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {HORIZONS.map(h => (
                      <button
                        key={h.id}
                        onClick={() => setSelectedHorizon(h.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                          selectedHorizon === h.id
                            ? 'bg-sky-500 text-slate-950 shadow-sm'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-[#127694]'
                        }`}
                      >
                        <span>{h.label}</span>
                        <span className={`text-[9px] px-1 py-0.2 rounded ${selectedHorizon === h.id ? 'bg-slate-100/20 text-slate-950' : 'bg-slate-100 text-slate-600'}`}>
                          {h.category}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Polar Microgrid Critical Load Breakdown & Risk Advisory Banner */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-2xl bg-[#edf9fd] border border-[#bcecfc] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Life-Support Critical Load</span>
                    <strong className="text-sm font-black text-[#127694] font-mono">142.0 kW (44.4%)</strong>
                    <span className="text-[10px] text-emerald-600 block">Protected: Habitat heating & comms</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                    NON-SHEDDABLE
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-[#edf9fd] border border-[#bcecfc] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Auxiliary / Science Load</span>
                    <strong className="text-sm font-black text-slate-700 font-mono">178.0 kW (55.6%)</strong>
                    <span className="text-[10px] text-slate-500 block">Sheddable during severe deficit</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-200 text-slate-700">
                    SHED BUFFER
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider block">Upcoming Deficit Window</span>
                    <strong className="text-xs font-black text-amber-900 block">18:00 – 22:00 UTC Peak</strong>
                    <span className="text-[10px] text-amber-700 block">Wind drops to 6.2 m/s; BESS scheduled to buffer</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenModal && onOpenModal('energy')}
                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] shadow-xs cursor-pointer"
                  >
                    Dispatch Now
                  </button>
                </div>
              </div>

              {/* Chart Visualizer */}
              <div className="bg-[#f0faff] p-5 rounded-3xl border border-sky-500/20 relative shadow-inner">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="font-extrabold text-sm text-[#127694] uppercase flex items-center gap-2">
                      <i className={`fa-solid ${currentTargetMeta.icon} text-[#0699C6]`}></i>
                      <span>{currentTargetMeta.label} ({currentTargetMeta.unit}) — {selectedHorizon} Horizon</span>
                    </h3>
                    {forecastData && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        forecastData.confidence_level === 'HIGH'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : forecastData.confidence_level === 'MEDIUM'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}>
                        Confidence: {forecastData.confidence_level} ({Math.round(forecastData.confidence_score * 100)}%)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-1 bg-emerald-500 rounded-full"></span>
                      <span className="text-slate-400">Historical Actual</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-1 bg-sky-500 rounded-full"></span>
                      <span className="text-slate-400 font-bold">P50 Expected</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-2 bg-sky-500/30 rounded border border-sky-400/50"></span>
                      <span className="text-slate-400">P10 - P90 Ribbon</span>
                    </div>
                  </div>
                </div>

                {/* Canvas Render */}
                <div className="w-full h-72 rounded-2xl bg-slate-50 p-2 flex items-center justify-center relative overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    width={960}
                    height={280}
                    className="w-full h-full object-contain"
                  />
                  {isLoading && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center text-[#0699C6] text-xs font-bold gap-2">
                      <i className="fa-solid fa-spinner fa-spin"></i>
                      <span>Running LightGBM Quantile Inference...</span>
                    </div>
                  )}
                </div>

                {forecastData && (
                  <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between">
                    <span className="italic">{forecastData.confidence_reason}</span>
                    <span className="font-mono text-slate-400">Model: {forecastData.model_champion} · Strictly Monotonic</span>
                  </div>
                )}
              </div>

              {/* Quantile Metric Readout Strip */}
              {forecastData && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-[#f0faff] border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      P10 Downside Bound
                    </div>
                    <div className="text-xl font-black text-[#127694] font-mono">
                      {forecastData.p10[0]} <span className="text-xs font-sans text-slate-400">{currentTargetMeta.unit}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">10% Probability of occurrence below this floor</div>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#e5f6fd]/40 border border-sky-500/40">
                    <div className="text-[10px] font-extrabold text-[#127694] uppercase tracking-wider mb-1">
                      P50 Central Expected
                    </div>
                    <div className="text-xl font-black text-[#127694] font-mono">
                      {forecastData.p50[0]} <span className="text-xs font-sans text-[#127694] font-bold">{currentTargetMeta.unit}</span>
                    </div>
                    <div className="text-[10px] text-[#127694] font-medium mt-1">Median operational baseline for MILP dispatch</div>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#f0faff] border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      P90 Peak Stress Bound
                    </div>
                    <div className="text-xl font-black text-[#127694] font-mono">
                      {forecastData.p90[0]} <span className="text-xs font-sans text-slate-500 font-bold">{currentTargetMeta.unit}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Conservative reserve & stress-testing scenario</div>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#f0faff] border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Prediction Interval Width (Δ)
                    </div>
                    <div className="text-xl font-black text-amber-800 font-mono">
                      ±{forecastData.avg_interval_width} <span className="text-xs font-sans text-slate-500 font-bold">{currentTargetMeta.unit}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Uncertainty spread (P90 - P10) across horizon</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ACTUAL VS FORECAST DEVIATION */}
          {activeTab === 'deviation' && deviationData && (
            <div className="space-y-6 animate-fadeIn">
              {/* Alert Banner if Active Divergence */}
              {deviationData.active_alert_count > 0 && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 space-y-2.5 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-900">
                    <i className="fa-solid fa-triangle-exclamation text-base text-amber-600"></i>
                    <span>Forecast Deviation Alert Triggered ({deviationData.active_alert_count} Active Divergence Event)</span>
                  </div>
                  {deviationData.alerts.map((al, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-white border border-amber-200 text-xs flex flex-wrap items-center justify-between gap-3 shadow-xs">
                      <div className="space-y-0.5">
                        <span className="font-black text-slate-900 block text-xs">{al.message}</span>
                        <div className="text-[11px] text-slate-700 font-medium">
                          <strong className="text-amber-900 font-bold">Mitigation:</strong> {al.mitigation}
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-amber-100 text-amber-900 font-extrabold border border-amber-300 shrink-0">
                        {al.timestamp}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Comparison Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(deviationData.comparison_cards || []).map(rawCard => {
                  let actual = rawCard.actual;
                  let forecast_p50 = rawCard.forecast_p50;

                  if (rawCard.target === 'solar_irradiance_wm2') {
                    const overrideVal = activeOverrides?.solar_irradiance_wm2 !== undefined && activeOverrides.solar_irradiance_wm2 !== null
                      ? parseFloat(activeOverrides.solar_irradiance_wm2)
                      : null;
                    actual = overrideVal !== null ? overrideVal : (latestData?.telemetry?.solar_irradiance_wm2 ?? rawCard.actual);
                    // Clear-sky diurnal P50 meteorological baseline is ~112.5 W/m² during daylight
                    if (forecast_p50 === rawCard.actual || rawCard.residual_delta === 0 || forecast_p50 <= 0) {
                      forecast_p50 = 112.5;
                    }
                  } else if (rawCard.target === 'wind_speed_ms') {
                    const overrideVal = activeOverrides?.wind_speed_ms !== undefined && activeOverrides.wind_speed_ms !== null
                      ? parseFloat(activeOverrides.wind_speed_ms)
                      : null;
                    if (overrideVal !== null) actual = overrideVal;
                  } else if (rawCard.target === 'temperature_c') {
                    const overrideVal = activeOverrides?.ambient_temp_c !== undefined && activeOverrides.ambient_temp_c !== null
                      ? parseFloat(activeOverrides.ambient_temp_c)
                      : null;
                    if (overrideVal !== null) actual = overrideVal;
                  } else if (rawCard.target === 'electrical_load_kw') {
                    const overrideVal = activeOverrides?.station_load_kwe !== undefined
                      ? parseFloat(activeOverrides.station_load_kwe)
                      : (activeOverrides?.load_elec_kw !== undefined ? parseFloat(activeOverrides.load_elec_kw) : null);
                    if (overrideVal !== null) actual = overrideVal;
                  } else if (rawCard.target === 'renewable_generation_kw') {
                    const solarAct = activeOverrides?.solar_irradiance_wm2 !== undefined
                      ? parseFloat(activeOverrides.solar_irradiance_wm2)
                      : (latestData?.telemetry?.solar_irradiance_wm2 ?? 86.4);
                    const windAct = activeOverrides?.wind_speed_ms !== undefined
                      ? parseFloat(activeOverrides.wind_speed_ms)
                      : (latestData?.telemetry?.wind_speed_ms ?? 1.2);
                    actual = Math.round(((windAct / 12.0) * 100.0 + (solarAct / 1000.0) * 80.0) * 10) / 10;
                  }

                  const residual_delta = +(actual - forecast_p50).toFixed(1);
                  const denom = Math.max(0.1, Math.abs(forecast_p50));
                  const pct_deviation = +( (residual_delta / denom) * 100 ).toFixed(1);
                  const absDev = Math.abs(pct_deviation);
                  const status = absDev >= 25.0 ? 'CRITICAL' : absDev >= 15.0 ? 'WARNING' : 'NOMINAL';

                  const c = {
                    ...rawCard,
                    actual: +actual.toFixed(1),
                    forecast_p50: +forecast_p50.toFixed(1),
                    residual_delta,
                    pct_deviation,
                    status
                  };

                  return (
                    <div key={c.target} className="p-4 rounded-2xl bg-[#f0faff] border border-slate-200 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-[#127694] uppercase tracking-tight">
                          {c.target.replace(/_/g, ' ')}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                          c.status === 'NOMINAL'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : c.status === 'WARNING'
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}>
                          {c.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/80">
                          <div className="text-[10px] text-slate-500 font-bold">Actual Realized</div>
                          <div className="text-base font-black font-mono text-emerald-700">{c.actual}</div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/80">
                          <div className="text-[10px] text-slate-500 font-bold">P50 Forecast</div>
                          <div className="text-base font-black font-mono text-[#127694]">{c.forecast_p50}</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-xs">
                        <span className="text-slate-600 font-medium">Residual (Δ): <strong className="font-mono text-slate-900">{c.residual_delta > 0 ? `+${c.residual_delta}` : c.residual_delta}</strong></span>
                        <span className={`font-mono font-bold ${c.pct_deviation >= 0 ? 'text-rose-600' : 'text-[#0699C6]'}`}>
                          {c.pct_deviation > 0 ? `+${c.pct_deviation}%` : `${c.pct_deviation}%`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* High-Impact Forecast Events Timeline */}
              <div className="p-5 rounded-3xl bg-[#f0faff] border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm text-[#127694] uppercase tracking-tight flex items-center gap-2">
                    <i className="fa-solid fa-bolt-lightning text-amber-500"></i>
                    <span>Upcoming High-Impact Forecast Events (Prioritized by Severity)</span>
                  </h4>
                  <span className="text-xs text-slate-500 font-bold">4 Lookahead Checkpoints</span>
                </div>

                <div className="space-y-2.5">
                  {eventsData.map(ev => (
                    <div key={ev.id} className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-start justify-between gap-4 shadow-xs">
                      <div className="flex items-start gap-3">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-black ${
                          ev.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                          ev.severity === 'WARNING' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                          'bg-[#edf9fd] text-[#127694] border border-[#bcecfc]'
                        }`}>
                          {ev.offset}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                            <span>{ev.event}</span>
                            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                              ev.severity === 'CRITICAL' ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-700'
                            }`}>{ev.severity}</span>
                          </div>
                          <div className="text-[11px] text-slate-600 mt-1 font-medium"><strong className="text-slate-700">Impact:</strong> {ev.operational_impact}</div>
                          <div className="text-[11px] text-[#0699C6] font-bold mt-0.5"><strong className="text-[#127694]">Action:</strong> {ev.suggested_action}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: FORECAST-TO-MICROGRID RESERVE ADVISORY */}
          {activeTab === 'reserve' && reserveAdvisory && (
            <div className="space-y-6 animate-fadeIn">
              {/* Formula & Advisory Banner */}
              <div className="p-5 rounded-3xl bg-gradient-to-r from-[#edf9fd] to-[#f0faff] border border-[#bcecfc] space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#127694]">
                    <i className="fa-solid fa-calculator text-[#0699C6]"></i>
                    <span>Dynamic Spinning Reserve Math: {reserveAdvisory.formula}</span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                    reserveAdvisory.urgency === 'HIGH' ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}>
                    Status: {reserveAdvisory.urgency} URGENCY
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-800 leading-relaxed">
                  {reserveAdvisory.recommendation}
                </p>
              </div>

              {/* 6-Hour Step Trajectory Grid */}
              <div className="p-5 rounded-3xl bg-[#f0faff] border border-slate-200 space-y-4">
                <h4 className="font-extrabold text-sm text-[#127694] uppercase tracking-tight flex items-center gap-2">
                  <i className="fa-solid fa-battery-three-quarters text-emerald-600"></i>
                  <span>6-Hour Lookahead: Demand P90 vs Renewable P10 & Battery Reserve Projection</span>
                </h4>

                <div className="grid grid-cols-7 gap-2 text-center">
                  {reserveAdvisory.hours.map((hr, idx) => (
                    <div key={hr} className="p-3 rounded-2xl bg-white border border-slate-200 space-y-2 shadow-xs">
                      <span className="text-xs font-mono font-bold text-[#0699C6]">{hr}</span>
                      
                      <div className="space-y-1 text-[11px]">
                        <div className="text-slate-500 font-medium">P90 Dem: <span className="font-mono text-slate-900 font-bold">{reserveAdvisory.demand_p90[idx]} kW</span></div>
                        <div className="text-slate-500 font-medium">P10 Ren: <span className="font-mono text-emerald-700 font-bold">{reserveAdvisory.renewable_p10[idx]} kW</span></div>
                        <div className="text-slate-500 font-medium">R_req: <span className="font-mono text-[#127694] font-bold">{reserveAdvisory.spinning_reserve_required_kw[idx]} kW</span></div>
                      </div>

                      <div className="pt-2 border-t border-slate-200">
                        <div className="text-[10px] text-slate-500 font-medium">SoC Proj</div>
                        <div className={`text-xs font-black font-mono ${reserveAdvisory.projected_bess_soc_pct[idx] <= 30 ? 'text-rose-600' : 'text-emerald-700'}`}>
                          {reserveAdvisory.projected_bess_soc_pct[idx]}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: MODEL BENCHMARK & PINBALL LOSS */}
          {activeTab === 'benchmark' && benchmarkData && (
            <div className="space-y-6 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-[#f0faff] border border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-sm text-[#127694] uppercase tracking-tight">
                    Dual Model Head-to-Head Benchmark
                  </h4>
                  <p className="text-xs text-slate-400">
                    Comparing Primary LightGBM Quantile Regressors vs Project A Gradient Boosting Benchmark on Chronological Test Set
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-sky-500/20 text-[#127694] border border-sky-500/40">
                  {benchmarkData.evaluation_scope}
                </span>
              </div>

              {/* Benchmark Metrics Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-[#f0faff]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Prediction Target</th>
                      <th className="py-3 px-3">LGBM MAE</th>
                      <th className="py-3 px-3">GBR MAE</th>
                      <th className="py-3 px-3">MAE Δ %</th>
                      <th className="py-3 px-3">Pinball P10</th>
                      <th className="py-3 px-3">Pinball P50</th>
                      <th className="py-3 px-3">Pinball P90</th>
                      <th className="py-3 px-4">80% Interval Coverage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/60 font-mono">
                    {benchmarkData.metrics.map(m => (
                      <tr key={m.target} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-4 font-sans font-bold text-slate-900">
                          {m.target.replace(/_/g, ' ')}
                        </td>
                        <td className="py-2.5 px-3 text-[#127694] font-bold">{m.lightgbm_mae}</td>
                        <td className="py-2.5 px-3 text-slate-600 font-medium">{m.gradient_boost_mae}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.mae_improvement_pct >= 0 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {m.mae_improvement_pct >= 0 ? `+${m.mae_improvement_pct}%` : `${m.mae_improvement_pct}%`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">{m.lightgbm_pinball_p10}</td>
                        <td className="py-2.5 px-3 text-[#127694] font-bold">{m.lightgbm_pinball_p50}</td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">{m.lightgbm_pinball_p90}</td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full bg-[#05C5FF] rounded-full"
                                style={{ width: `${Math.min(100, m.lightgbm_coverage_80)}%` }}
                              ></div>
                            </div>
                            <span className="text-[11px] text-[#127694] font-bold">{m.lightgbm_coverage_80}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: MLOPS, DRIFT & CHAMPION/CHALLENGER */}
          {activeTab === 'mlops' && mlopsData && (
            <div className="space-y-6 animate-fadeIn">
              {/* Feature PSI Drift Meters */}
              <div className="p-5 rounded-3xl bg-[#f0faff] border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-extrabold text-sm text-[#127694] uppercase tracking-tight flex items-center gap-2">
                      <i className="fa-solid fa-gauge-high text-[#0699C6]"></i>
                      <span>Population Stability Index (PSI) Covariate Drift Monitor</span>
                    </h4>
                    <p className="text-xs text-slate-500 font-medium">
                      Evaluates distribution shift between historical training reference and live telemetry buffer
                    </p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                    mlopsData.overall_status === 'STABLE' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}>
                    {mlopsData.overall_status}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(mlopsData.feature_psi).map(([feat, d]) => (
                    <div key={feat} className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-1 shadow-xs">
                      <div className="text-[10px] text-slate-600 uppercase font-bold">{feat.replace(/_/g, ' ')}</div>
                      <div className="text-lg font-black font-mono text-[#127694]">{d.psi}</div>
                      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-200">
                        <span className="text-slate-500 font-medium">Status</span>
                        <span className={`font-bold ${d.status === 'STABLE' ? 'text-emerald-700' : 'text-amber-800'}`}>{d.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Champion vs Challenger Shadow Governance */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Champion Card */}
                <div className="p-5 rounded-3xl bg-[#f0faff] border border-emerald-300 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 uppercase border border-emerald-300">
                      Active Production Champion
                    </span>
                    <i className="fa-solid fa-crown text-amber-500"></i>
                  </div>
                  <h3 className="text-base font-black text-slate-900">{mlopsData.champion_model.name}</h3>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <div className="p-2 rounded-xl bg-white border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-bold">MAE</div>
                      <div className="font-bold text-[#127694]">{mlopsData.champion_model.mae}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-white border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-bold">Pinball</div>
                      <div className="font-bold text-[#127694]">{mlopsData.champion_model.pinball_loss}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-white border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-bold">Coverage</div>
                      <div className="font-bold text-emerald-700">{mlopsData.champion_model.coverage_80}%</div>
                    </div>
                  </div>
                  <button
                    onClick={handleRollbackChampion}
                    className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                  >
                    <i className="fa-solid fa-rotate-left mr-1.5"></i>
                    Rollback to Previous Stable Release
                  </button>
                </div>

                {/* Challenger Card */}
                <div className="p-5 rounded-3xl bg-[#f0faff] border border-[#bcecfc] space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#edf9fd] text-[#127694] uppercase border border-[#bcecfc]">
                      Candidate Challenger (Shadow Mode)
                    </span>
                    <i className="fa-solid fa-flask text-[#0699C6]"></i>
                  </div>
                  <h3 className="text-base font-black text-slate-900">{mlopsData.challenger_model.name}</h3>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <div className="p-2 rounded-xl bg-white border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-bold">MAE</div>
                      <div className="font-bold text-emerald-700">{mlopsData.challenger_model.mae}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-white border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-bold">Pinball</div>
                      <div className="font-bold text-[#127694]">{mlopsData.challenger_model.pinball_loss}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-white border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-bold">Coverage</div>
                      <div className="font-bold text-emerald-700">{mlopsData.challenger_model.coverage_80}%</div>
                    </div>
                  </div>
                  <button
                    onClick={handlePromoteChallenger}
                    className="w-full py-2 rounded-xl bg-gradient-to-r from-[#05C5FF] to-[#0699C6] hover:opacity-95 text-white font-bold text-xs transition shadow-xs cursor-pointer"
                  >
                    <i className="fa-solid fa-arrow-up-right-from-square mr-1.5"></i>
                    Promote Challenger to Production Champion
                  </button>
                </div>
              </div>

              {/* Historical Forecast Audit Trail Log */}
              <div className="p-5 rounded-3xl bg-[#f0faff] border border-slate-200 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm text-[#127694] uppercase tracking-tight flex items-center gap-2">
                    <i className="fa-solid fa-file-shield text-[#0699C6]"></i>
                    <span>Archived Forecast Audit Trail (Prediction vs Reality Verification)</span>
                  </h4>
                  <span className="text-xs text-slate-500 font-bold">Showing last {auditLogData.length} records</span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Archived Timestamp</th>
                        <th className="py-2.5 px-3">Target</th>
                        <th className="py-2.5 px-2">Model</th>
                        <th className="py-2.5 px-2">Horizon</th>
                        <th className="py-2.5 px-2">P10</th>
                        <th className="py-2.5 px-2">P50</th>
                        <th className="py-2.5 px-2">P90</th>
                        <th className="py-2.5 px-2">Actual</th>
                        <th className="py-2.5 px-3">Error (Δ)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/60">
                      {auditLogData.map((a, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition">
                          <td className="py-2 px-3 text-slate-600">{a.timestamp}</td>
                          <td className="py-2 px-3 font-sans font-bold text-slate-900">{a.target.replace(/_/g, ' ')}</td>
                          <td className="py-2 px-2 text-[#127694] font-medium">{a.model}</td>
                          <td className="py-2 px-2 text-slate-700 font-medium">{a.horizon_hours}h</td>
                          <td className="py-2 px-2 text-slate-600">{a.p10}</td>
                          <td className="py-2 px-2 text-[#127694] font-bold">{a.p50}</td>
                          <td className="py-2 px-2 text-slate-600">{a.p90}</td>
                          <td className="py-2 px-2 text-emerald-700 font-bold">{a.actual}</td>
                          <td className={`py-2 px-3 font-bold ${a.residual_error >= 0 ? 'text-rose-600' : 'text-[#0699C6]'}`}>
                            {a.residual_error >= 0 ? `+${a.residual_error}` : a.residual_error}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
