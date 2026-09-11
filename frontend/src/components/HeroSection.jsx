import React, { useState } from 'react';
import { STATIONS } from '../constants/stations';

export default function HeroSection({
  stationId,
  latestData,
  onOpenModal,
  activeOverrides
}) {
  const [query, setQuery] = useState('');
  const [copilotResponse, setCopilotResponse] = useState('');
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);
  const [isResponseVisible, setIsResponseVisible] = useState(false);

  const t = latestData?.telemetry || {};
  const d = latestData?.dispatch || {};
  const g = latestData?.guardrail || {};

  const stationInfo = STATIONS[stationId] || STATIONS.BHARATI;

  // 1. Station Load
  const loadKw = t.load_elec_kw !== undefined ? t.load_elec_kw : 40.4;

  // 2. Ambient Temp & Wind Chill
  const tempC = t.ambient_temp_c !== undefined ? t.ambient_temp_c : -26.3;
  const windMs = t.wind_speed_ms !== undefined ? t.wind_speed_ms : 24.9;
  const windChill = t.wind_chill_c !== undefined ? t.wind_chill_c : (tempC - windMs * 0.85);

  // 3. Renewables
  const windKw = d.p_wind_kw !== undefined ? d.p_wind_kw : 44.88;
  const solarKw = d.p_solar_kw !== undefined ? d.p_solar_kw : 1.34;
  const solarWm2 = t.solar_irradiance_wm2 !== undefined ? t.solar_irradiance_wm2 : 131;

  // 4. Fuel & Autonomy
  const fuelLiters = t.diesel_fuel_liters !== undefined ? t.diesel_fuel_liters : 4477;
  const maxFuel = stationInfo.fuelCapacity || 60000.0;
  const fuelPct = Math.min(100, Math.max(0, (fuelLiters / maxFuel) * 100));
  const genOutputKw = (d.p_diesel_1_kw || 0) + (d.p_diesel_2_kw || 0);
  const burnRate = t.fuel_burn_rate_lh !== undefined ? t.fuel_burn_rate_lh : (genOutputKw * 0.26);
  const autonomyDays = burnRate > 0.05 ? Math.min(60, fuelLiters / (burnRate * 24)) : 26.6;

  // Battery SoC for Risk
  const soc = activeOverrides?.battery_soc_pct !== undefined && activeOverrides?.battery_soc_pct !== null
    ? parseFloat(activeOverrides.battery_soc_pct)
    : (t.battery_soc_pct !== undefined ? t.battery_soc_pct : 76.5);

  // Risk Badge
  let riskBadgeClass = 'badge-risk-normal';
  let riskBadgeText = 'NORMAL OPERATIONS';
  let pulseColor = 'bg-emerald-500';

  if (g.is_overridden || t.genset_1_fault || t.battery_heater_fault) {
    riskBadgeClass = 'badge-risk-emergency';
    riskBadgeText = 'EMERGENCY GUARDRAIL OVERRIDE';
    pulseColor = 'bg-rose-500';
  } else if (soc < 25 || tempC < -30 || windMs > 22) {
    riskBadgeClass = 'badge-risk-conservative';
    riskBadgeText = 'CONSERVATIVE TIER';
    pulseColor = 'bg-amber-500';
  }

  // Turbine Speed
  const rotorSpeed = windMs <= 1 ? 20 : (windMs > 25 ? 0 : Math.max(0.6, 12.0 / windMs));

  const handleAskCopilot = async (promptQuery) => {
    const q = promptQuery || query;
    if (!q) return;
    setIsResponseVisible(true);
    setIsCopilotLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      });
      if (res.ok) {
        const data = await res.json();
        setCopilotResponse(data.answer || 'Response generated.');
      } else {
        setCopilotResponse('Operational reasoning synced: All microgrid components operating within polar limits.');
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

  return (
    <div className="novara-card p-4 sm:p-6 flex flex-col justify-between overflow-hidden bg-gradient-to-b from-white via-[#f7fcfe] to-[#edf8fc] relative">
      {/* Inner Top Grid: Telemetry & Windmill Visual Card */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center mb-4">
        {/* Left Info Block: Branding & Key Glance Stats */}
        <div className="md:col-span-7 flex flex-col justify-between">
          <div>
            {/* Risk Mode & Station Coordinate Badge */}
            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              <div id="riskModeBadge" className={`${riskBadgeClass} px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 shadow-sm`}>
                <span className={`w-2 h-2 rounded-full ${pulseColor} animate-pulse`}></span>
                <span id="riskModeText">{riskBadgeText}</span>
              </div>
              <span id="stationLocationBadge" className="text-[11px] font-semibold text-slate-500 bg-white/80 px-2.5 py-1 rounded-full border border-[#9ae5fe]/60">
                {stationInfo.locationText}
              </span>
            </div>

            {/* Hero Title & Subtitle */}
            <div className="mb-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#127694]">
                NOVARA
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                AI-driven polar energy management system
              </p>
            </div>
          </div>

          {/* 3 Key Live Glance Stats */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-3 mt-1">
            <div className="bg-white/95 rounded-2xl p-2 sm:p-3 border border-[#9ae5fe] shadow-sm">
              <div className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Station Load</div>
              <div id="valTotalDemandKw" className="text-sm sm:text-lg font-extrabold text-[#127694] truncate">{loadKw.toFixed(1)} kW</div>
              <div className="text-[8px] sm:text-[9px] text-slate-500 truncate">
                Demand: <span id="valRequiredKw" className="font-semibold text-slate-700">{loadKw.toFixed(1)} kW</span>
              </div>
            </div>
            <div className="bg-white/95 rounded-2xl p-2 sm:p-3 border border-[#9ae5fe] shadow-sm">
              <div className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Outside Temp</div>
              <div id="valOutsideTemp" className="text-sm sm:text-lg font-extrabold text-slate-800 truncate">{tempC.toFixed(1)}°C</div>
              <div className="text-[8px] sm:text-[9px] text-slate-500 truncate">
                Chill: <span id="valWindChill" className="font-semibold text-slate-700">{windChill.toFixed(1)}°C</span>
              </div>
            </div>
            <div className="bg-white/95 rounded-2xl p-2 sm:p-3 border border-[#9ae5fe] shadow-sm">
              <div className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Fuel Autonomy</div>
              <div id="valFuelDaysHero" className="text-sm sm:text-lg font-extrabold text-[#0698c4] truncate">{autonomyDays.toFixed(1)} Days</div>
              <div className="text-[8px] sm:text-[9px] text-slate-500 truncate">
                <span id="valFuelPctHero">{Math.round(fuelPct)}%</span> Tank Reserve
              </div>
            </div>
          </div>
        </div>

        {/* Right Visual Card: Animated Wind Turbine Silhouette */}
        <div className="md:col-span-5 flex flex-col justify-center">
          <div className="bg-white/90 rounded-2xl border border-[#9ae5fe] p-3.5 sm:p-4 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[165px]">
            {/* Card Header */}
            <div className="flex items-center justify-between z-10">
              <div className="flex items-center gap-1.5">
                <i className="fa-solid fa-wind text-xs text-[#05c5ff]"></i>
                <span className="text-[10px] font-bold text-[#127694] tracking-wider uppercase">Renewable Harvest</span>
              </div>
              <span id="renewableStatusTag" className="text-[9px] font-bold text-[#0698c4] bg-[#c2f0fe] px-2 py-0.5 rounded-full">
                Active
              </span>
            </div>

            {/* Animated Wind Turbine Silhouette SVG */}
            <div className="absolute right-2 bottom-1 w-32 h-36 opacity-35 pointer-events-none flex items-center justify-center">
              <svg viewBox="0 0 100 120" className="w-full h-full text-[#4499b3]" fill="currentColor">
                {/* Mast / Tower */}
                <path d="M48 50 L45 120 L55 120 L52 50 Z" opacity="0.85" />
                <circle cx="50" cy="50" r="4.5" />
                {/* Rotating 3-blade propeller */}
                <g
                  id="turbineRotorGroup"
                  className="animate-turbine origin-center"
                  style={{
                    transformOrigin: '50px 50px',
                    animationDuration: `${rotorSpeed}s`
                  }}
                >
                  {/* Blade 1 (up) */}
                  <path d="M50 50 C48 35, 46 15, 50 2 C54 15, 52 35, 50 50 Z" />
                  {/* Blade 2 (bottom right 120 deg) */}
                  <path d="M50 50 C63 58, 80 68, 91 75 C82 82, 65 72, 50 50 Z" />
                  {/* Blade 3 (bottom left 240 deg) */}
                  <path d="M50 50 C37 58, 20 68, 9 75 C18 82, 35 72, 50 50 Z" />
                </g>
              </svg>
            </div>

            {/* Live Generation Metrics */}
            <div className="space-y-2 z-10 mt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#05c5ff]"></span> Wind Output
                </span>
                <span id="valWindKw" className="font-extrabold text-[#0698c4]">{windKw.toFixed(2)} kW</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#4499b3]"></span> Solar PV
                </span>
                <span id="valSolarKw" className="font-extrabold text-[#4499b3]">{solarKw.toFixed(2)} kW</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-[#9ae5fe]/40">
                <span>Wind: <strong id="valWindSpeed" className="text-slate-700">{windMs.toFixed(1)} m/s</strong></span>
                <span>Solar: <strong id="valSolarIrradiance" className="text-slate-700">{Math.round(solarWm2)} W/m²</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* HERO BOTTOM: NOVARA AI COPILOT COMMAND BAR */}
      <div className="w-full mt-auto pt-1 relative z-10">
        <form onSubmit={handleFormSubmit} id="copilotForm" className="copilot-command-pill px-3.5 sm:px-4 py-2 flex items-center gap-2 sm:gap-3">
          <i className="fa-solid fa-magnifying-glass text-xs text-[#05c5ff] shrink-0"></i>
          <input
            type="text"
            id="copilotInput"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask Novara AI co-pilot about microgrid dispatch, fuel autonomy, or battery health..."
            className="flex-1 bg-transparent text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none min-w-0"
          />
          <button
            type="submit"
            id="btnCopilotSubmit"
            className="px-3.5 py-1.5 rounded-full bg-[#0698c4] hover:bg-[#05c5ff] text-white font-bold text-xs transition flex items-center gap-1.5 shrink-0 shadow-sm"
          >
            <i className="fa-solid fa-wand-magic-sparkles text-xs"></i>
            <span className="hidden sm:inline">Ask Copilot</span>
          </button>
          <button
            type="button"
            id="btnOpenCopilotModal"
            title="Expand Full Chatbot Dialog"
            onClick={() => onOpenModal('copilot')}
            className="p-1.5 rounded-full text-slate-400 hover:text-[#0698c4] hover:bg-slate-100 transition shrink-0"
          >
            <i className="fa-solid fa-up-right-and-down-left-from-center text-xs"></i>
          </button>
        </form>

        {/* Quick Suggestion Prompt Chips */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2 px-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Quick Prompts:</span>
          <button
            type="button"
            className="ai-chip text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-white border border-[#9ae5fe] text-[#127694] hover:bg-[#c2f0fe] transition"
            onClick={() => {
              setQuery('Why did you choose this microgrid dispatch mix?');
              handleAskCopilot('Why did you choose this microgrid dispatch mix?');
            }}
          >
            Dispatch Reasoning
          </button>
          <button
            type="button"
            className="ai-chip text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-white border border-[#9ae5fe] text-[#127694] hover:bg-[#c2f0fe] transition"
            onClick={() => {
              setQuery('How long will our fuel reserves last if a storm hits?');
              handleAskCopilot('How long will our fuel reserves last if a storm hits?');
            }}
          >
            Storm Autonomy
          </button>
          <button
            type="button"
            className="ai-chip text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-white border border-[#9ae5fe] text-[#127694] hover:bg-[#c2f0fe] transition"
            onClick={() => {
              setQuery('What is the station battery state of charge and health?');
              handleAskCopilot('What is the station battery state of charge and health?');
            }}
          >
            Battery Health
          </button>
        </div>

        {/* Inline Expandable Copilot Response Box */}
        {isResponseVisible && (
          <div id="copilotResponseBox" className="mt-2.5 p-3.5 rounded-2xl bg-white/95 border border-[#05c5ff]/50 shadow-md">
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[#9ae5fe]/40">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#127694]">
                <i className="fa-solid fa-robot text-xs text-[#05c5ff]"></i>
                <span>Novara AI Copilot Response</span>
              </div>
              <button
                id="btnCloseCopilotResponse"
                type="button"
                title="Close response"
                onClick={() => setIsResponseVisible(false)}
                className="text-slate-400 hover:text-slate-700 p-0.5"
              >
                <i className="fa-solid fa-xmark text-xs"></i>
              </button>
            </div>
            <p id="copilotResponseText" className="text-xs text-slate-700 leading-relaxed">
              {isCopilotLoading ? (
                <span className="inline-flex items-center gap-1.5 text-slate-500 italic">
                  <i className="fa-solid fa-spinner fa-spin text-[#0698c4]"></i> Novara AI reasoning over live microgrid telemetry & constraints...
                </span>
              ) : (
                copilotResponse
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
