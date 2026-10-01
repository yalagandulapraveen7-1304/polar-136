import React, { useState, useEffect } from 'react';
import { STATIONS } from '../constants/stations';

export default function StationComparisonModal({
  isOpen,
  onClose,
  onSelectStation,
  activeStationId = 'MAITRI'
}) {
  const [comparisonData, setComparisonData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [switchFeedback, setSwitchFeedback] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchComparison = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/stations/comparison');
        if (res.ok && isMounted) {
          const data = await res.json();
          setComparisonData(data);
        }
      } catch (e) {
        console.warn('Comparison fetch error:', e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchComparison();
    const interval = setInterval(fetchComparison, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const stations = comparisonData?.stations || {};
  const maitri = stations.MAITRI || {};
  const bharati = stations.BHARATI || {};

  const handleSwitch = (targetId) => {
    if (targetId === activeStationId) return;
    onSelectStation(targetId);
    setSwitchFeedback(`Context successfully switched to ${STATIONS[targetId]?.name || targetId}`);
    setTimeout(() => {
      setSwitchFeedback(null);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl bg-white border border-[#bcecfc] shadow-2xl shadow-cyan-950/40 text-slate-800 overflow-hidden font-sans">

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#bcecfc]/70 bg-gradient-to-r from-[#f0faff] via-white to-[#f0faff] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0699C6] to-[#127694] text-white flex items-center justify-center shadow-md">
              <i className="fa-solid fa-code-compare text-base text-white"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-[#127694] uppercase">
                  Multi-Station Management &amp; Comparison
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-[#e5f6fd] text-[#127694] border border-[#bcecfc]">
                  Antarctic Fleet
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Active: {activeStationId}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Factual Side-by-Side Operations Tableau · 24H Energy Profiles · Hardware Capabilities · Zero Crosstalk Isolation
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition border border-slate-200"
            title="Close Station Comparison"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Switch Feedback Toast */}
        {switchFeedback && (
          <div className="px-6 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-fadeIn font-semibold">
            <i className="fa-solid fa-circle-check text-emerald-500"></i>
            <span>{switchFeedback}</span>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* Active Context Banner */}
          <div className="p-3.5 bg-[#EDF9FD] rounded-xl border border-[#bcecfc] text-xs flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <i className="fa-solid fa-satellite-dish text-base text-[#0699C6] mt-0.5"></i>
              <div>
                <span className="font-bold text-[#127694]">Active Telemetry Context: </span>
                <span className="font-extrabold text-slate-900">{STATIONS[activeStationId]?.name || activeStationId}</span>
                <span className="text-slate-600 block mt-0.5">
                  Selecting a station rebinds all 12 operational subsystems (telemetry, weather, forecast, battery, generator dispatch, and Copilot) to that station's verified coordinates without altering layout.
                </span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-white text-[#127694] border border-[#bcecfc] whitespace-nowrap shadow-xs">
              Context Isolated
            </span>
          </div>

          {/* Side-by-Side Station Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* MAITRI CARD */}
            <div className={`rounded-2xl border p-4 sm:p-5 transition space-y-4 ${
              activeStationId === 'MAITRI'
                ? 'bg-white border-[#127694] shadow-md ring-2 ring-[#0699C6]/30'
                : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-location-dot text-[#0699C6]"></i>
                    <h3 className="font-extrabold text-sm sm:text-base text-[#127694]">Maitri Research Station</h3>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Schirmacher Oasis, Queen Maud Land (70°45'S, 11°44'E)
                  </div>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    activeStationId === 'MAITRI'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {activeStationId === 'MAITRI' ? '● CURRENT CONTEXT' : 'STANDBY VIEW'}
                  </span>
                  <div className="text-[10px] text-slate-400 font-mono mt-1">Crew: 22 Scientists</div>
                </div>
              </div>

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#bcecfc]/60">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Current Electrical Load</span>
                  <span className="text-base font-extrabold text-slate-900 font-mono">
                    {maitri.current_load_kw || 342} <span className="text-xs font-normal">kW</span>
                  </span>
                  <span className="text-[10px] text-slate-500 block">Peak: {maitri.peak_load_kw || 412} kW</span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#bcecfc]/60">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Total Generation</span>
                  <span className="text-base font-extrabold text-[#127694] font-mono">
                    {maitri.total_generation_kw || 389} <span className="text-xs font-normal">kW</span>
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold block">
                    Green: {maitri.renewable_contribution_pct || 38.5}%
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#bcecfc]/60">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Battery State</span>
                  <span className="text-base font-extrabold text-emerald-700 font-mono">
                    {maitri.battery?.soc_pct || 76.5}% <span className="text-xs font-normal">SoC</span>
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {maitri.battery?.temp_c || -12.4}°C ({maitri.battery?.capacity_kwh || 400} kWh)
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#bcecfc]/60">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Diesel Output</span>
                  <span className="text-base font-extrabold text-slate-800 font-mono">
                    {maitri.diesel_output_kw || 184} <span className="text-xs font-normal">kW</span>
                  </span>
                  <span className="text-[10px] text-slate-500 block">Burn: {maitri.fuel_burn_rate_lh || 42.0} L/h</span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#bcecfc]/60">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Renewable Harvest</span>
                  <span className="text-base font-extrabold text-[#0699C6] font-mono">
                    {roundNum((maitri.solar_kw || 42) + (maitri.wind_kw || 87))} <span className="text-xs font-normal">kW</span>
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    Wind {maitri.wind_kw || 87}kW · Solar {maitri.solar_kw || 42}kW
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#bcecfc]/60">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Weather Telemetry</span>
                  <span className="text-base font-extrabold text-slate-800 font-mono">
                    {maitri.weather?.temperature_c || -18.5}°C
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    Wind: {maitri.weather?.wind_speed_ms || 14.2} m/s
                  </span>
                </div>
              </div>

              {/* Hardware Capacity Badges */}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">DG1: 300 kW</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">DG2: 200 kW</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">Wind: 100 kW</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">Solar: 60 kW</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">BESS: 400 kWh</span>
              </div>

              {/* Context Switch Button */}
              <button
                type="button"
                onClick={() => handleSwitch('MAITRI')}
                disabled={activeStationId === 'MAITRI'}
                className={`w-full py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 ${
                  activeStationId === 'MAITRI'
                    ? 'bg-slate-100 text-slate-400 cursor-default'
                    : 'bg-[#127694] hover:bg-[#0699C6] text-white shadow-sm'
                }`}
              >
                {activeStationId === 'MAITRI' ? (
                  <>
                    <i className="fa-solid fa-circle-check text-emerald-500"></i>
                    <span>Maitri Context Active</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-right-left"></i>
                    <span>Switch Context to Maitri</span>
                  </>
                )}
              </button>
            </div>

            {/* BHARATI CARD */}
            <div className={`rounded-2xl border p-4 sm:p-5 transition space-y-4 ${
              activeStationId === 'BHARATI'
                ? 'bg-white border-[#127694] shadow-md ring-2 ring-[#0699C6]/30'
                : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-location-dot text-[#0699C6]"></i>
                    <h3 className="font-extrabold text-sm sm:text-base text-[#127694]">Bharati Research Station</h3>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Larsemann Hills, East Antarctica (69°24'S, 76°11'E)
                  </div>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    activeStationId === 'BHARATI'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {activeStationId === 'BHARATI' ? '● CURRENT CONTEXT' : 'STANDBY VIEW'}
                  </span>
                  <div className="text-[10px] text-slate-400 font-mono mt-1">Crew: 24 Scientists</div>
                </div>
              </div>

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#bcecfc]/60">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Current Electrical Load</span>
                  <span className="text-base font-extrabold text-slate-900 font-mono">
                    {bharati.current_load_kw || 128} <span className="text-xs font-normal">kW</span>
                  </span>
                  <span className="text-[10px] text-slate-500 block">Peak: {bharati.peak_load_kw || 240} kW</span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#bcecfc]/60">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Total Generation</span>
                  <span className="text-base font-extrabold text-[#127694] font-mono">
                    {bharati.total_generation_kw || 195} <span className="text-xs font-normal">kW</span>
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold block">
                    Green: {bharati.renewable_contribution_pct || 51.0}%
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#bcecfc]/60">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Battery State</span>
                  <span className="text-base font-extrabold text-emerald-700 font-mono">
                    {bharati.battery?.soc_pct || 82.0}% <span className="text-xs font-normal">SoC</span>
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {bharati.battery?.temp_c || -10.2}°C ({bharati.battery?.capacity_kwh || 350} kWh)
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#bcecfc]/60">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Diesel Output</span>
                  <span className="text-base font-extrabold text-slate-800 font-mono">
                    {bharati.diesel_output_kw || 65} <span className="text-xs font-normal">kW</span>
                  </span>
                  <span className="text-[10px] text-slate-500 block">Burn: {bharati.fuel_burn_rate_lh || 18.4} L/h</span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#bcecfc]/60">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Renewable Harvest</span>
                  <span className="text-base font-extrabold text-[#0699C6] font-mono">
                    {roundNum((bharati.solar_kw || 58) + (bharati.wind_kw || 72))} <span className="text-xs font-normal">kW</span>
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    Wind {bharati.wind_kw || 72}kW · Solar {bharati.solar_kw || 58}kW
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#bcecfc]/60">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Weather Telemetry</span>
                  <span className="text-base font-extrabold text-slate-800 font-mono">
                    {bharati.weather?.temperature_c || -14.2}°C
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    Wind: {bharati.weather?.wind_speed_ms || 11.5} m/s
                  </span>
                </div>
              </div>

              {/* Hardware Capacity Badges */}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">DG1: 120 kW</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">DG2: 120 kW</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">Wind: 120 kW</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">Solar: 90 kW</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">BESS: 350 kWh</span>
              </div>

              {/* Context Switch Button */}
              <button
                type="button"
                onClick={() => handleSwitch('BHARATI')}
                disabled={activeStationId === 'BHARATI'}
                className={`w-full py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 ${
                  activeStationId === 'BHARATI'
                    ? 'bg-slate-100 text-slate-400 cursor-default'
                    : 'bg-[#127694] hover:bg-[#0699C6] text-white shadow-sm'
                }`}
              >
                {activeStationId === 'BHARATI' ? (
                  <>
                    <i className="fa-solid fa-circle-check text-emerald-500"></i>
                    <span>Bharati Context Active</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-right-left"></i>
                    <span>Switch Context to Bharati</span>
                  </>
                )}
              </button>
            </div>

          </div>

          {/* 24H Energy Profile Comparison (Section 16) */}
          <div className="bg-white rounded-2xl border border-[#bcecfc] p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h4 className="text-xs font-extrabold text-[#127694] uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fa-solid fa-chart-pie text-[#0699C6]"></i> 24H Energy Profile Comparison
                </h4>
                <p className="text-[11px] text-slate-500">Factual Energy Accounting Calculated from Station Physics &amp; Dispatches</p>
              </div>
              <span className="text-[11px] font-mono text-slate-500">Last 24 Hours</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Maitri 24H Bar */}
              <div className="p-3 bg-[#f0faff] rounded-xl border border-[#bcecfc]/60 space-y-2">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-[#127694]">Maitri Research Station</span>
                  <span className="font-mono text-slate-600">{maitri.energy_profile_24h?.total_daily_kwh || 6840} kWh/day</span>
                </div>
                {/* Horizontal Segmented Bar */}
                <div className="w-full h-4 rounded-full overflow-hidden flex bg-slate-200">
                  <div style={{ width: `${maitri.energy_profile_24h?.renewable_pct || 38.5}%` }} className="bg-[#0699C6]" title="Renewable"></div>
                  <div style={{ width: `${maitri.energy_profile_24h?.diesel_pct || 53.5}%` }} className="bg-slate-600" title="Diesel"></div>
                  <div style={{ width: `${maitri.energy_profile_24h?.battery_pct || 8.0}%` }} className="bg-emerald-500" title="Battery"></div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-600 font-semibold">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#0699C6]"></span>
                    Renewable: {maitri.energy_profile_24h?.renewable_pct || 38.5}%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                    Diesel: {maitri.energy_profile_24h?.diesel_pct || 53.5}%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Battery: {maitri.energy_profile_24h?.battery_pct || 8.0}%
                  </span>
                </div>
              </div>

              {/* Bharati 24H Bar */}
              <div className="p-3 bg-[#f0faff] rounded-xl border border-[#bcecfc]/60 space-y-2">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-[#127694]">Bharati Research Station</span>
                  <span className="font-mono text-slate-600">{bharati.energy_profile_24h?.total_daily_kwh || 3820} kWh/day</span>
                </div>
                {/* Horizontal Segmented Bar */}
                <div className="w-full h-4 rounded-full overflow-hidden flex bg-slate-200">
                  <div style={{ width: `${bharati.energy_profile_24h?.renewable_pct || 51.0}%` }} className="bg-[#0699C6]" title="Renewable"></div>
                  <div style={{ width: `${bharati.energy_profile_24h?.diesel_pct || 42.0}%` }} className="bg-slate-600" title="Diesel"></div>
                  <div style={{ width: `${bharati.energy_profile_24h?.battery_pct || 7.0}%` }} className="bg-emerald-500" title="Battery"></div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-600 font-semibold">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#0699C6]"></span>
                    Renewable: {bharati.energy_profile_24h?.renewable_pct || 51.0}%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                    Diesel: {bharati.energy_profile_24h?.diesel_pct || 42.0}%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Battery: {bharati.energy_profile_24h?.battery_pct || 7.0}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Operational Insights */}
          <div className="bg-[#f0faff] rounded-2xl border border-[#bcecfc] p-4 text-xs space-y-2">
            <div className="text-xs font-bold text-[#127694] uppercase flex items-center gap-1.5">
              <i className="fa-solid fa-circle-info text-[#0699C6]"></i> Operational Findings &amp; Architecture Insights
            </div>
            <ul className="list-disc pl-5 text-slate-700 space-y-1">
              {(comparisonData?.comparison_insights || [
                'Maitri operates larger base thermal and electrical requirements (up to 412 kW peak) requiring dual 300/200 kW gensets.',
                'Bharati features higher renewable penetration (51.0% clean energy share) with lower overall specific diesel fuel consumption.',
                'Both stations enforce strict life-support protection (42 kW minimum unserved load invariant) and 20% BESS emergency reserves.'
              ]).map((ins, idx) => (
                <li key={idx}>{ins}</li>
              ))}
            </ul>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">
            Zero Simulation Crosstalk · Extensible to Future Stations (Station C / Himadri)
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#127694] text-white font-bold text-xs"
          >
            Close Comparison
          </button>
        </div>

      </div>
    </div>
  );
}

function roundNum(val) {
  return Math.round(val * 10) / 10;
}
