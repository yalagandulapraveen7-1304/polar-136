import React from 'react';
import { STATIONS } from '../constants/stations';

export default function CriticalAlertBanner({
  stationId,
  latestData,
  activeOverrides = {},
  currentScenario,
  onOpenModal,
  isG2Dispatched = false,
  onAcceptRecommendation
}) {
  const t = latestData?.telemetry || {};
  const g = latestData?.guardrail || {};
  const stationInfo = STATIONS[stationId] || STATIONS.MAITRI;

  const windMs = activeOverrides?.wind_speed_ms !== undefined
    ? activeOverrides.wind_speed_ms
    : (t.wind_speed_ms !== undefined ? t.wind_speed_ms : 25.9);

  const soc = activeOverrides?.battery_soc_pct !== undefined && activeOverrides?.battery_soc_pct !== null
    ? parseFloat(activeOverrides.battery_soc_pct)
    : (t.battery_soc_pct !== undefined ? t.battery_soc_pct : 77.0);

  const isCutoutActive = windMs >= 25.0;
  const isEmergency = g.is_overridden || isCutoutActive || soc < 30 || currentScenario === 'blizzard' || currentScenario === 'trip';

  if (!isEmergency && !isG2Dispatched) {
    return null;
  }

  return (
    <div className="w-full animate-fadeIn transition-all duration-300">
      {isEmergency && !isG2Dispatched ? (
        <div className="w-full p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-rose-50 via-amber-50 to-rose-50 border-2 border-rose-300 flex flex-wrap items-center justify-between gap-3 shadow-md animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>
            <div>
              <div className="text-xs sm:text-sm font-black text-rose-900 tracking-tight flex items-center gap-2 flex-wrap">
                <span>⚠ CRITICAL RENEWABLE DEFICIT PREDICTED (-36 kW at 18:40 UTC)</span>
                <span className="text-[9px] bg-rose-200 text-rose-800 px-2 py-0.5 rounded-full font-extrabold uppercase border border-rose-300">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-rose-700 font-medium mt-0.5">
                Blizzard gale velocity &gt; 25.0 m/s triggered turbine braking. Reserve floor risk in 3.2 hours.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onAcceptRecommendation}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-bolt"></i>
              <span>Auto-Dispatch G2 (85 kW)</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenModal && onOpenModal('copilot', 'Why is a critical renewable deficit predicted at 18:40 UTC, and why must Generator G2 be dispatched at 85 kW?')}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs border border-rose-200 transition shadow-xs cursor-pointer"
            >
              Inspect Why
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full p-2.5 sm:p-3 rounded-2xl bg-emerald-50 border border-emerald-300 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900 font-bold shadow-xs">
          <span className="flex items-center gap-2">
            <i className="fa-solid fa-circle-check text-emerald-600 text-base"></i>
            <span>RECOMMENDATION APPLIED: Generator G2 dispatched at 85 kW. Renewable deficit neutralized · 0.00 kW residual.</span>
          </span>
          <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-300">
            20% Reserve Protected ✓
          </span>
        </div>
      )}
    </div>
  );
}
