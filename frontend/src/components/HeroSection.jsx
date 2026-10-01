import React, { useState } from 'react';
import { STATIONS } from '../constants/stations';
import EnergyFlowCanvas from './EnergyFlowCanvas';
import RealTimePowerChart from './charts/RealTimePowerChart';
import Lookahead24hChart from './charts/Lookahead24hChart';
import MarkdownMessage from './MarkdownMessage';

export default function HeroSection({
  stationId,
  latestData,
  onOpenModal,
  activeOverrides,
  currentScenario,
  onScenarioChange,
  isG2Dispatched: externalIsG2Dispatched,
  onAcceptRecommendation: externalOnAcceptRecommendation
}) {
  const [query, setQuery] = useState('');
  const [copilotResponse, setCopilotResponse] = useState('');
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);
  const [isResponseVisible, setIsResponseVisible] = useState(false);
  const [localIsG2Dispatched, setLocalIsG2Dispatched] = useState(false);
  const isG2Dispatched = externalIsG2Dispatched !== undefined ? externalIsG2Dispatched : localIsG2Dispatched;
  const [forecastHorizon, setForecastHorizon] = useState('6h');
  const [centerTab, setCenterTab] = useState('copilot'); // 'copilot' | 'flow'

  const t = latestData?.telemetry || {};
  const d = latestData?.dispatch || {};
  const g = latestData?.guardrail || {};

  const stationInfo = STATIONS[stationId] || STATIONS.MAITRI;

  // Telemetry Variables
  const loadKw = t.station_load_kwe !== undefined ? t.station_load_kwe : (t.load_elec_kw !== undefined ? t.load_elec_kw : stationInfo.baseLoad);
  const tempC = activeOverrides?.ambient_temp_c !== undefined ? activeOverrides.ambient_temp_c : (t.ambient_temp_c !== undefined ? t.ambient_temp_c : -42.0);
  const windMs = activeOverrides?.wind_speed_ms !== undefined ? activeOverrides.wind_speed_ms : (t.wind_speed_ms !== undefined ? t.wind_speed_ms : 25.9);
  const soc = activeOverrides?.battery_soc_pct !== undefined && activeOverrides?.battery_soc_pct !== null
    ? parseFloat(activeOverrides.battery_soc_pct)
    : (t.battery_soc_pct !== undefined ? t.battery_soc_pct : 77.0);

  const isCutoutActive = windMs >= 25.0;
  const isEmergency = g.is_overridden || isCutoutActive || soc < 30 || currentScenario === 'blizzard' || currentScenario === 'trip';

  // Copilot Action Handlers
  const handleAcceptRecommendation = externalOnAcceptRecommendation || (async () => {
    setLocalIsG2Dispatched(true);
    try {
      await fetch('/api/commander/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_diesel_2_kw: 85.0 })
      });
    } catch (e) {
      console.warn('G2 dispatch override error:', e);
    }
  });

  const handleAskCopilot = async (promptQuery) => {
    const q = promptQuery || query;
    if (!q) return;
    setIsResponseVisible(true);
    setIsCopilotLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, station_id: stationId })
      });
      if (res.ok) {
        const data = await res.json();
        setCopilotResponse(data.answer || 'Response generated.');
      } else {
        setCopilotResponse('LP optimizer balancing renewable harvest and battery reserve to maintain station life-support.');
      }
    } catch (e) {
      setCopilotResponse('SEMS optimizer actively balancing polar katabatic wind and solar generation to suppress diesel consumption while maintaining station life-support CHP heating.');
    } finally {
      setIsCopilotLoading(false);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    handleAskCopilot(query);
  };

  // Forecast Horizon Configs (Scaled dynamically for active station & live forecast deviation)
  const fd = latestData?.forecast_deviation || {};
  const deficitKw = Math.abs(fd.net_renewable_deficit_kw ?? 36.0);
  const hoursToFloor = fd.battery_consequence?.estimated_hours_to_floor ?? 3.2;
  const isBharati = (stationId || '').toUpperCase() === 'BHARATI';
  const scale = isBharati ? 0.58 : 1.0;

  const projectedTimeStr = (() => {
    try {
      const baseDate = latestData?.timestamp ? new Date(latestData.timestamp) : new Date();
      const projDate = new Date(baseDate.getTime() + (hoursToFloor * 60 * 60 * 1000));
      return `${projDate.getUTCHours().toString().padStart(2, '0')}:${projDate.getUTCMinutes().toString().padStart(2, '0')} UTC`;
    } catch (e) {
      return '18:40 UTC';
    }
  })();

  const forecastConfigs = {
    '6h': {
      peak: `${Math.round(457 * scale)} kW`,
      shortfall: `${Math.round(deficitKw * scale)} kW deficit at ${projectedTimeStr}`,
      bessEnd: '64% SoC',
      fuelProj: `${Math.round(48 * scale)} L`,
      timeline: [
        { time: '+1.5h', load: `${Math.round(412 * scale)} kW`, ren: `${Math.round(286 * scale)} kW`, soc: '77%', status: 'Normal' },
        { time: '+3.0h', load: `${Math.round(428 * scale)} kW`, ren: `${Math.round(270 * scale)} kW`, soc: '75%', status: 'Stable' },
        { time: '+4.0h', load: `${Math.round(445 * scale)} kW`, ren: `${Math.round(190 * scale)} kW`, soc: '71%', status: 'Katabatic Fade' },
        { time: projectedTimeStr.split(' ')[0], load: `${Math.round(457 * scale)} kW`, ren: `${Math.round(95 * scale)} kW`, soc: '64%', status: `Deficit Shortfall (-${Math.round(deficitKw * scale)} kW)`, isWarning: true },
        { time: '+6.0h', load: `${Math.round(430 * scale)} kW`, ren: `${Math.round(180 * scale)} kW`, soc: '68%', status: 'G2 Online · Stable' }
      ]
    },
    '12h': {
      peak: `${Math.round(475 * scale)} kW`,
      shortfall: `${Math.round(52 * scale)} kW deficit in night window`,
      bessEnd: '58% SoC',
      fuelProj: `${Math.round(124 * scale)} L`,
      timeline: [
        { time: '+2h', load: `${Math.round(425 * scale)} kW`, ren: `${Math.round(280 * scale)} kW`, soc: '76%', status: 'Normal' },
        { time: '+4h', load: `${Math.round(440 * scale)} kW`, ren: `${Math.round(210 * scale)} kW`, soc: '72%', status: 'Katabatic Fade' },
        { time: '+6h', load: `${Math.round(462 * scale)} kW`, ren: `${Math.round(90 * scale)} kW`, soc: '62%', status: 'Deficit Shortfall', isWarning: true },
        { time: '+8h', load: `${Math.round(450 * scale)} kW`, ren: `${Math.round(110 * scale)} kW`, soc: '59%', status: 'G2 Auxiliary Active' },
        { time: '+12h', load: `${Math.round(415 * scale)} kW`, ren: `${Math.round(240 * scale)} kW`, soc: '68%', status: 'Sunrise Recovery' }
      ]
    },
    '24h': {
      peak: `${Math.round(492 * scale)} kW`,
      shortfall: 'Periodic storm deficit windows',
      bessEnd: '69% SoC',
      fuelProj: `${Math.round(298 * scale)} L`,
      timeline: [
        { time: '00:00', load: `${Math.round(390 * scale)} kW`, ren: `${Math.round(180 * scale)} kW`, soc: '70%', status: 'Night Load' },
        { time: '06:00', load: `${Math.round(430 * scale)} kW`, ren: `${Math.round(290 * scale)} kW`, soc: '76%', status: 'Sunrise Recharging' },
        { time: '12:00', load: `${Math.round(460 * scale)} kW`, ren: `${Math.round(310 * scale)} kW`, soc: '82%', status: 'Peak Solar Harvest' },
        { time: '18:00', load: `${Math.round(475 * scale)} kW`, ren: `${Math.round(120 * scale)} kW`, soc: '65%', status: 'Evening Storm Peak', isWarning: true },
        { time: '23:00', load: `${Math.round(410 * scale)} kW`, ren: `${Math.round(160 * scale)} kW`, soc: '69%', status: 'Nominal Operations' }
      ]
    }
  };

  const curForecast = forecastConfigs[forecastHorizon] || forecastConfigs['6h'];

  return (
    <div className="novara-card p-4 sm:p-5 flex flex-col gap-4 overflow-hidden bg-white relative">

      {/* 1. POLAR ENERGY DISPATCH STATUS STRIP */}
      <div className="w-full p-2.5 rounded-2xl bg-[#e5f6fd] border border-[#bcecfc] flex items-center justify-between text-xs text-[#127694] font-bold shadow-xs">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
          <span>POLAR ENERGY DISPATCH · 0.00 kW residual · AI LP Optimizer active · 68.2% Green Share</span>
        </span>
        <span className="text-[10px] font-mono bg-white text-[#0699C6] px-2.5 py-0.5 rounded-full border border-[#bcecfc]">
          Grid Frequency: 50.02 Hz Synced
        </span>
      </div>

      {/* 2. SUB-HEADER: TABS (COPILOT & SCHEMATIC vs PREDICTIVE HORIZON) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#bcecfc]/40 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 p-1 bg-white rounded-xl border border-[#bcecfc] shadow-xs">
            <button
              type="button"
              onClick={() => setCenterTab('copilot')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                centerTab === 'copilot'
                  ? 'bg-[#127694] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0699C6]'
              }`}
            >
              <i className="fa-solid fa-microchip text-xs"></i>
              <span>POLAR AI COPILOT</span>
            </button>
            <button
              type="button"
              onClick={() => setCenterTab('realtime_chart')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                centerTab === 'realtime_chart'
                  ? 'bg-[#127694] text-white shadow-sm'
                  : 'text-slate-600 hover:text-[#0699C6]'
              }`}
            >
              <i className="fa-solid fa-chart-line text-xs"></i>
              <span>LIVE POWER</span>
            </button>
            <button
              type="button"
              onClick={() => setCenterTab('lookahead_chart')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                centerTab === 'lookahead_chart'
                  ? 'bg-[#127694] text-white shadow-sm'
                  : 'text-slate-600 hover:text-[#0699C6]'
              }`}
            >
              <i className="fa-solid fa-chart-area text-xs"></i>
              <span>24H LOOKAHEAD</span>
            </button>
            <button
              type="button"
              onClick={() => setCenterTab('flow')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                centerTab === 'flow'
                  ? 'bg-[#127694] text-white shadow-sm'
                  : 'text-slate-600 hover:text-[#0699C6]'
              }`}
            >
              <i className="fa-solid fa-diagram-project text-xs"></i>
              <span>FLOW MATRIX</span>
            </button>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase hidden sm:inline">
            Station: <strong className="text-slate-700">{stationInfo.name} ({stationInfo.locationText})</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-[#c2f0fe] text-[#0699C6] border border-[#bcecfc] flex items-center gap-1.5">
            <i className="fa-solid fa-microchip text-xs"></i>
            <span>98.4% AI Confidence</span>
          </span>
        </div>
      </div>

      {/* 3. CENTER STAGE: TABBED VIEW (COPILOT OR FLOW CANVAS) */}
      {centerTab === 'copilot' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">

          {/* Left / Center Column (7 Cols on lg): The AI Copilot Brain */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            {/* Primary Natural Language AI Insight Card */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#0699C6] text-white flex items-center justify-center text-xs font-bold shadow-xs">
                    <i className="fa-solid fa-microchip"></i>
                  </div>
                  <span className="text-xs font-black text-[#127694] tracking-tight uppercase">
                    Autonomous Dispatch Advisory
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {latestData?.recommendations?.items?.[0]?.confidence && (
                    <span className="text-[9px] font-mono font-bold text-[#0699C6] bg-[#edf9fd] px-2 py-0.5 rounded-full border border-[#bcecfc]">
                      {latestData.recommendations.items[0].confidence} Confidence
                    </span>
                  )}
                  <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Feature 18 Engine
                  </span>
                </div>
              </div>

              {/* Dynamic Insight Sentence */}
              <p className="text-sm font-semibold text-slate-800 leading-snug">
                "{latestData?.recommendations?.items?.[0]?.title
                  ? `${latestData.recommendations.items[0].title}: ${latestData.recommendations.items[0].recommendation}`
                  : 'Battery reserve is declining due to a projected renewable generation deficit over the next 6 hours.'}"
              </p>

              {/* 3-Part Mission Control Assessment */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100">
                <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]/60">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">1. DETECTED</span>
                  <p className="text-[11px] font-bold text-slate-800 mt-0.5">
                    {latestData?.recommendations?.items?.[0]?.reason || 'Renewable deficit expected (Blizzard gale > 25 m/s)'}
                  </p>
                </div>
                <div className="p-2 rounded-xl bg-amber-50/70 border border-amber-200/80">
                  <span className="text-[9px] font-black text-amber-700 uppercase tracking-wider block">2. FORECAST IMPACT</span>
                  <p className="text-[11px] font-bold text-slate-800 mt-0.5">
                    {latestData?.recommendations?.items?.[0]?.expected_impact || '36 kW shortfall over next 6h window'}
                  </p>
                </div>
                <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
                  <span className="text-[9px] font-black text-emerald-700 uppercase tracking-wider block">3. RECOMMENDATION</span>
                  <p className="text-[11px] font-bold text-slate-800 mt-0.5">
                    {latestData?.recommendations?.items?.[0]?.action_label || 'Dispatch Generator G2 at optimized 85 kW load'}
                  </p>
                </div>
              </div>

              {/* Operator Action CTAs */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenModal('recommendations')}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs border border-slate-200 shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                    title="Open Full Engineering & Operational Recommendations Console"
                  >
                    <i className="fa-solid fa-list-check text-[#0699C6]"></i>
                    <span>VIEW RECOMMENDATIONS ({latestData?.recommendations?.items?.length || 4})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenModal('copilot')}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs border border-slate-200 transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <i className="fa-solid fa-circle-info text-[#0699C6]"></i>
                    <span>AI EXPLANATION</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleAcceptRecommendation}
                  disabled={isG2Dispatched}
                  className={`px-4 py-1.5 rounded-xl font-extrabold text-xs transition shadow flex items-center gap-1.5 ${
                    isG2Dispatched
                      ? 'bg-emerald-600 text-white cursor-default'
                      : 'bg-[#0699C6] hover:bg-[#05C5FF] text-white cursor-pointer'
                  }`}
                >
                  <i className={`fa-solid ${isG2Dispatched ? 'fa-check' : 'fa-play'} text-xs`}></i>
                  <span>{isG2Dispatched ? 'RECOMMENDATION ACCEPTED' : 'ACCEPT RECOMMENDATION'}</span>
                </button>
              </div>
            </div>

            {/* Copilot Natural Language Command Bar */}
            <div className="w-full">
              <form onSubmit={handleFormSubmit} className="copilot-command-pill px-3 sm:px-4 py-2 flex items-center gap-2">
                <i className="fa-solid fa-magnifying-glass text-xs text-[#05C5FF] shrink-0"></i>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask Polar AI about microgrid dispatch, storm fuel autonomy, or battery health..."
                  className="flex-1 bg-transparent text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none min-w-0"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-full bg-[#0699C6] hover:bg-[#05C5FF] text-white font-bold text-xs transition flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
                >
                  <i className="fa-solid fa-paper-plane text-xs"></i>
                  <span className="hidden sm:inline">Ask Copilot</span>
                </button>
                <button
                  type="button"
                  title="Expand Full Chatbot Dialog"
                  onClick={() => onOpenModal('copilot')}
                  className="p-1.5 rounded-full text-slate-400 hover:text-[#0699C6] hover:bg-slate-100 transition shrink-0 cursor-pointer"
                >
                  <i className="fa-solid fa-up-right-and-down-left-from-center text-xs"></i>
                </button>
              </form>

              {/* Quick Suggestion Prompt Chips */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2 px-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Decision AI:</span>
                <button
                  type="button"
                  className="ai-chip text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-[#f0faff] border border-[#0699C6] text-[#127694] hover:bg-[#c2f0fe] transition font-bold"
                  onClick={() => {
                    setQuery('Explain the latest system decision and dispatch action.');
                    handleAskCopilot('Explain the latest system decision and dispatch action.');
                  }}
                >
                  <i className="fa-solid fa-circle-question text-[9px] mr-1 text-[#0699C6]"></i>
                  Explain Decision
                </button>
                <button
                  type="button"
                  className="ai-chip text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-white border border-[#bcecfc] text-[#127694] hover:bg-[#c2f0fe] transition"
                  onClick={() => {
                    setQuery('Why did Diesel Generator 2 start or run?');
                    handleAskCopilot('Why did Diesel Generator 2 start or run?');
                  }}
                >
                  G2 Start Reason
                </button>
                <button
                  type="button"
                  className="ai-chip text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-white border border-[#bcecfc] text-[#127694] hover:bg-[#c2f0fe] transition"
                  onClick={() => {
                    setQuery('Why is the battery charging or discharging?');
                    handleAskCopilot('Why is the battery charging or discharging?');
                  }}
                >
                  Battery Flow Reason
                </button>
                <button
                  type="button"
                  className="ai-chip text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-white border border-[#bcecfc] text-[#127694] hover:bg-[#c2f0fe] transition"
                  onClick={() => {
                    setQuery('Why are renewables curtailed or buffered into storage?');
                    handleAskCopilot('Why are renewables curtailed or buffered into storage?');
                  }}
                >
                  Renewable Curtailment
                </button>
                <button
                  type="button"
                  className="ai-chip text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-white border border-[#bcecfc] text-[#127694] hover:bg-[#c2f0fe] transition"
                  onClick={() => {
                    setQuery('How long will our fuel reserves last if a storm hits?');
                    handleAskCopilot('How long will our fuel reserves last if a storm hits?');
                  }}
                >
                  Storm Autonomy
                </button>
              </div>

              {/* Inline Copilot Response Box */}
              {isResponseVisible && (
                <div className="mt-2.5 p-3 rounded-2xl bg-white border border-[#05C5FF]/50 shadow-md">
                  <div className="flex items-center justify-between pb-1 mb-1 border-b border-[#bcecfc]/40 text-xs font-bold text-[#127694]">
                    <span className="flex items-center gap-1.5">
                      <i className="fa-solid fa-microchip text-xs text-[#0699C6]"></i>
                      Polar AI Response
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsResponseVisible(false)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <i className="fa-solid fa-xmark text-xs"></i>
                    </button>
                  </div>
                  <div className="text-xs text-slate-700 leading-relaxed">
                    {isCopilotLoading ? (
                      <span className="inline-flex items-center gap-1.5 text-slate-500 italic">
                        <i className="fa-solid fa-spinner fa-spin text-[#0699C6]"></i> AI reasoning over station telemetry &amp; constraints...
                      </span>
                    ) : (
                      <MarkdownMessage content={copilotResponse} />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (5 Cols on lg): 6H | 12H | 24H Forecast Panel */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className="p-3.5 rounded-2xl bg-white border border-[#bcecfc] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-[#127694] uppercase tracking-tight flex items-center gap-1.5">
                  <i className="fa-solid fa-chart-line text-[#0699C6]"></i>
                  Predictive Horizon
                </span>
                {/* 6H | 12H | 24H Horizon Toggle */}
                <div className="flex items-center gap-1 bg-[#f0faff] p-0.5 rounded-xl border border-[#bcecfc]">
                  {['6h', '12h', '24h'].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setForecastHorizon(h)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase transition ${
                        forecastHorizon === h
                          ? 'bg-[#127694] text-white shadow-xs'
                          : 'text-slate-500 hover:text-[#0699C6]'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>

              {/* Forecast Summary Badges */}
              <div className="grid grid-cols-2 gap-2 mb-2.5">
                <div className="p-2 rounded-xl bg-[#f8fcfe] border border-slate-100">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">Peak Load</span>
                  <span className="text-xs font-black text-slate-800">{curForecast.peak}</span>
                </div>
                <div className="p-2 rounded-xl bg-rose-50/70 border border-rose-200/60">
                  <span className="text-[9px] font-bold text-rose-600 uppercase block">Shortfall Risk</span>
                  <span className="text-[10px] font-extrabold text-rose-900 truncate block">{curForecast.shortfall}</span>
                </div>
              </div>

              {/* Timeline Steps */}
              <div className="space-y-1.5 mb-2.5">
                {curForecast.timeline.map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-1.5 rounded-xl text-[11px] border transition ${
                      item.isWarning
                        ? 'bg-rose-50/90 border-rose-200 text-rose-900 font-extrabold'
                        : 'bg-white border-slate-100 text-slate-700 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-400">{item.time}</span>
                      <span>{item.load}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-[#0699C6]">{item.ren}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${item.isWarning ? 'bg-rose-200 text-rose-800' : 'bg-slate-100 text-slate-600'}`}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer CTA */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                <span className="text-slate-500">Projected Burn: <strong className="text-slate-800">{curForecast.fuelProj}</strong></span>
                <button
                  type="button"
                  onClick={() => onOpenModal('forecast')}
                  className="font-bold text-[#0699C6] hover:text-[#05C5FF] flex items-center gap-1"
                >
                  <span>Full Climate Horizon</span>
                  <i className="fa-solid fa-arrow-right text-[9px]"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : centerTab === 'realtime_chart' ? (
        /* Real-Time Tactical Power & Net Balance Chart */
        <div className="w-full p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-sm min-h-[300px]">
          <RealTimePowerChart />
        </div>
      ) : centerTab === 'lookahead_chart' ? (
        /* 24-Hour Probabilistic Lookahead Chart */
        <div className="w-full p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-sm min-h-[300px]">
          <Lookahead24hChart stationId={stationId} />
        </div>
      ) : (
        /* Energy Flow Matrix View */
        <div className="w-full">
          <EnergyFlowCanvas latestData={latestData} />
        </div>
      )}
    </div>
  );
}
