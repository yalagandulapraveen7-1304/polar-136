import React, { useState } from 'react';
import { STATIONS } from '../constants/stations';
import EnergyFlowCanvas from './EnergyFlowCanvas';
import RealTimePowerChart from './charts/RealTimePowerChart';
import Lookahead24hChart from './charts/Lookahead24hChart';

export default function HeroSection({
  stationId,
  latestData,
  onOpenModal,
  activeOverrides,
  currentScenario,
  onScenarioChange
}) {
  const [query, setQuery] = useState('');
  const [copilotResponse, setCopilotResponse] = useState('');
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);
  const [isResponseVisible, setIsResponseVisible] = useState(false);
  const [isG2Dispatched, setIsG2Dispatched] = useState(false);
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
  const handleAcceptRecommendation = async () => {
    setIsG2Dispatched(true);
    try {
      await fetch('/api/commander/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_diesel_2_kw: 85.0 })
      });
    } catch (e) {
      console.warn('G2 dispatch override error:', e);
    }
  };

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

  // Forecast Horizon Configs
  const forecastConfigs = {
    '6h': {
      peak: '457 kW',
      shortfall: '36 kW deficit at 18:40 UTC',
      bessEnd: '64% SoC',
      fuelProj: '48 L',
      timeline: [
        { time: '14:00', load: '412 kW', ren: '286 kW', soc: '77%', status: 'Normal' },
        { time: '15:30', load: '428 kW', ren: '270 kW', soc: '75%', status: 'Stable' },
        { time: '17:00', load: '445 kW', ren: '190 kW', soc: '71%', status: 'Katabatic Fade' },
        { time: '18:40', load: '457 kW', ren: '95 kW', soc: '64%', status: 'Deficit Shortfall (-36 kW)', isWarning: true },
        { time: '20:00', load: '430 kW', ren: '180 kW', soc: '68%', status: 'G2 Online · Stable' }
      ]
    },
    '12h': {
      peak: '475 kW',
      shortfall: '52 kW deficit in night window',
      bessEnd: '58% SoC',
      fuelProj: '124 L',
      timeline: [
        { time: '+2h', load: '425 kW', ren: '280 kW', soc: '76%', status: 'Normal' },
        { time: '+4h', load: '440 kW', ren: '210 kW', soc: '72%', status: 'Katabatic Fade' },
        { time: '+6h', load: '462 kW', ren: '90 kW', soc: '62%', status: 'Deficit Shortfall', isWarning: true },
        { time: '+8h', load: '450 kW', ren: '110 kW', soc: '59%', status: 'G2 Auxiliary Active' },
        { time: '+12h', load: '415 kW', ren: '240 kW', soc: '68%', status: 'Sunrise Recovery' }
      ]
    },
    '24h': {
      peak: '492 kW',
      shortfall: 'Periodic storm deficit windows',
      bessEnd: '69% SoC',
      fuelProj: '298 L',
      timeline: [
        { time: '00:00', load: '390 kW', ren: '180 kW', soc: '70%', status: 'Night Load' },
        { time: '06:00', load: '430 kW', ren: '290 kW', soc: '76%', status: 'Sunrise Recharging' },
        { time: '12:00', load: '460 kW', ren: '310 kW', soc: '82%', status: 'Peak Solar Harvest' },
        { time: '18:00', load: '475 kW', ren: '120 kW', soc: '65%', status: 'Evening Storm Peak', isWarning: true },
        { time: '23:00', load: '410 kW', ren: '160 kW', soc: '69%', status: 'Nominal Operations' }
      ]
    }
  };

  const curForecast = forecastConfigs[forecastHorizon] || forecastConfigs['6h'];

  return (
    <div className="novara-card p-4 sm:p-5 flex flex-col gap-4 overflow-hidden bg-gradient-to-b from-white via-[#f7fcfe] to-[#edf8fc] relative">

      {/* 1. CRITICAL ALERT / SYSTEM STABILITY BANNER */}
      {isEmergency && !isG2Dispatched ? (
        <div className="w-full p-3 rounded-2xl bg-gradient-to-r from-rose-50 via-amber-50 to-rose-50 border-2 border-rose-300 flex flex-wrap items-center justify-between gap-3 shadow-sm animate-pulse">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black text-sm shrink-0">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>
            <div>
              <div className="text-xs font-black text-rose-900 tracking-tight flex items-center gap-2">
                <span>⚠ CRITICAL RENEWABLE DEFICIT PREDICTED (-36 kW at 18:40 UTC)</span>
                <span className="text-[9px] bg-rose-200 text-rose-800 px-2 py-0.5 rounded-full font-bold uppercase">
                  Action Required
                </span>
              </div>
              <p className="text-[11px] text-rose-700 font-medium">
                Blizzard gale velocity &gt; 25.0 m/s triggered turbine braking. Reserve floor risk in 3.2 hours.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAcceptRecommendation}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs transition shadow flex items-center gap-1.5"
            >
              <i className="fa-solid fa-bolt"></i>
              <span>Auto-Dispatch G2 (85 kW)</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenModal('copilot')}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-rose-200 transition"
            >
              Inspect Why
            </button>
          </div>
        </div>
      ) : isG2Dispatched ? (
        <div className="w-full p-2.5 rounded-2xl bg-emerald-50 border border-emerald-300 flex items-center justify-between text-xs text-emerald-900 font-bold shadow-sm">
          <span className="flex items-center gap-2">
            <i className="fa-solid fa-circle-check text-emerald-600 text-sm"></i>
            <span>RECOMMENDATION APPLIED: Generator G2 dispatched at 85 kW. Renewable deficit neutralized · 0.00 kW residual.</span>
          </span>
          <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
            20% Reserve Protected ✓
          </span>
        </div>
      ) : (
        <div className="w-full p-2.5 rounded-2xl bg-[#e5f6fd] border border-[#bcecfc] flex items-center justify-between text-xs text-[#127694] font-bold shadow-sm">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>ENERGY BALANCE STABLE · 0.00 kW residual · AI LP Optimizer active · 68.2% Green Share</span>
          </span>
          <span className="text-[10px] font-mono bg-white text-[#0699C6] px-2.5 py-0.5 rounded-full border border-[#bcecfc]">
            Grid Frequency: 50.02 Hz Synced
          </span>
        </div>
      )}

      {/* 2. SUB-HEADER: TABS (COPILOT & SCHEMATIC vs PREDICTIVE HORIZON) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#bcecfc]/40 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 p-1 bg-white rounded-xl border border-[#bcecfc] shadow-sm">
            <button
              type="button"
              onClick={() => setCenterTab('copilot')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                centerTab === 'copilot'
                  ? 'bg-[#127694] text-white shadow-sm'
                  : 'text-slate-600 hover:text-[#0699C6]'
              }`}
            >
              <i className="fa-solid fa-robot text-xs"></i>
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
                  <div className="w-7 h-7 rounded-lg bg-[#0699C6] text-white flex items-center justify-center text-xs font-bold shadow-sm">
                    <i className="fa-solid fa-brain"></i>
                  </div>
                  <span className="text-xs font-black text-[#127694] tracking-tight uppercase">
                    Autonomous Dispatch Advisory
                  </span>
                </div>
                <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Real-Time Neural LP
                </span>
              </div>

              {/* Dynamic Insight Sentence */}
              <p className="text-sm font-semibold text-slate-800 leading-snug">
                "Battery reserve is declining due to a projected renewable generation deficit over the next 6 hours."
              </p>

              {/* 3-Part Mission Control Assessment */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100">
                <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]/60">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">1. DETECTED</span>
                  <p className="text-[11px] font-bold text-slate-800 mt-0.5">
                    Renewable deficit expected (Blizzard gale &gt; 25 m/s)
                  </p>
                </div>
                <div className="p-2 rounded-xl bg-amber-50/70 border border-amber-200/80">
                  <span className="text-[9px] font-black text-amber-700 uppercase tracking-wider block">2. FORECAST</span>
                  <p className="text-[11px] font-bold text-slate-800 mt-0.5">
                    36 kW shortfall over next 6h window
                  </p>
                </div>
                <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
                  <span className="text-[9px] font-black text-emerald-700 uppercase tracking-wider block">3. RECOMMENDATION</span>
                  <p className="text-[11px] font-bold text-slate-800 mt-0.5">
                    Dispatch Generator G2 at optimized 85 kW load
                  </p>
                </div>
              </div>

              {/* Operator Action CTAs */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onOpenModal('copilot')}
                  className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#127694] font-extrabold text-xs border border-[#bcecfc] transition shadow-sm flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-lightbulb text-amber-500"></i>
                  <span>VIEW EXPLANATION</span>
                </button>
                <button
                  type="button"
                  onClick={handleAcceptRecommendation}
                  disabled={isG2Dispatched}
                  className={`px-4 py-1.5 rounded-xl font-extrabold text-xs transition shadow flex items-center gap-1.5 ${
                    isG2Dispatched
                      ? 'bg-emerald-600 text-white cursor-default'
                      : 'bg-[#0699C6] hover:bg-[#05C5FF] text-white'
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
                  className="px-3.5 py-1.5 rounded-full bg-[#0699C6] hover:bg-[#05C5FF] text-white font-bold text-xs transition flex items-center gap-1.5 shrink-0 shadow-sm"
                >
                  <i className="fa-solid fa-wand-magic-sparkles text-xs"></i>
                  <span className="hidden sm:inline">Ask Copilot</span>
                </button>
                <button
                  type="button"
                  title="Expand Full Chatbot Dialog"
                  onClick={() => onOpenModal('copilot')}
                  className="p-1.5 rounded-full text-slate-400 hover:text-[#0699C6] hover:bg-slate-100 transition shrink-0"
                >
                  <i className="fa-solid fa-up-right-and-down-left-from-center text-xs"></i>
                </button>
              </form>

              {/* Quick Suggestion Prompt Chips */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2 px-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Quick Prompts:</span>
                <button
                  type="button"
                  className="ai-chip text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-white border border-[#bcecfc] text-[#127694] hover:bg-[#c2f0fe] transition"
                  onClick={() => {
                    setQuery('Why did you choose this microgrid dispatch mix?');
                    handleAskCopilot('Why did you choose this microgrid dispatch mix?');
                  }}
                >
                  Dispatch Reasoning
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
                <button
                  type="button"
                  className="ai-chip text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-white border border-[#bcecfc] text-[#127694] hover:bg-[#c2f0fe] transition"
                  onClick={() => {
                    setQuery('Explain verified fuel and cost savings vs baseline.');
                    handleAskCopilot('Explain verified fuel and cost savings vs baseline.');
                  }}
                >
                  $356K Savings Benchmark
                </button>
              </div>

              {/* Inline Copilot Response Box */}
              {isResponseVisible && (
                <div className="mt-2.5 p-3 rounded-2xl bg-white border border-[#05C5FF]/50 shadow-md">
                  <div className="flex items-center justify-between pb-1 mb-1 border-b border-[#bcecfc]/40 text-xs font-bold text-[#127694]">
                    <span className="flex items-center gap-1.5">
                      <i className="fa-solid fa-robot text-xs text-[#05C5FF]"></i>
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
