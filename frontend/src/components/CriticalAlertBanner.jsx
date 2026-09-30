import React, { useState } from 'react';
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
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) {
    return null;
  }

  const fd = latestData?.forecast_deviation || {};
  const t = latestData?.telemetry || {};
  const currentStation = STATIONS[stationId] || STATIONS.MAITRI;
  const stationShortName = currentStation?.name?.split(' ')[0] || stationId || 'Maitri';

  // Dynamic Deficit Calculation from live forecast deviation or telemetry
  const deficitKw = Math.abs(fd.net_renewable_deficit_kw ?? 36.0);
  const hoursToFloor = fd.battery_consequence?.estimated_hours_to_floor ?? 3.2;

  // Compute Projected Deficit UTC Time (Current time + hoursToFloor)
  const projectedTimeStr = (() => {
    try {
      const baseDate = latestData?.timestamp ? new Date(latestData.timestamp) : new Date();
      const projDate = new Date(baseDate.getTime() + (hoursToFloor * 60 * 60 * 1000));
      return `${projDate.getUTCHours().toString().padStart(2, '0')}:${projDate.getUTCMinutes().toString().padStart(2, '0')} UTC`;
    } catch (e) {
      return '18:40 UTC';
    }
  })();

  return (
    <div className="w-full animate-fadeIn transition-all duration-300">
      {!isG2Dispatched ? (
        <div className="w-full p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-rose-50 via-amber-50 to-rose-50 border-2 border-rose-300 flex flex-wrap items-center justify-between gap-3 shadow-md animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>
            <div>
              <div className="text-xs sm:text-sm font-black text-rose-900 tracking-tight flex items-center gap-2 flex-wrap">
                <span>⚠ CRITICAL RENEWABLE DEFICIT PREDICTED (-{deficitKw.toFixed(0)} kW at {projectedTimeStr})</span>
                <span className="text-[9px] bg-rose-200 text-rose-800 px-2 py-0.5 rounded-full font-extrabold uppercase border border-rose-300">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-rose-700 font-medium mt-0.5">
                {stationShortName} blizzard gale velocity &gt; 25.0 m/s triggered turbine braking. Reserve floor risk in {hoursToFloor} hours.
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
              onClick={() => onOpenModal && onOpenModal('copilot', `Why is a critical renewable deficit predicted for ${stationShortName} at ${projectedTimeStr}, and why must Generator G2 be dispatched at 85 kW?`)}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs border border-rose-200 transition shadow-xs cursor-pointer"
            >
              Inspect Why
            </button>
            <button
              type="button"
              onClick={() => setIsDismissed(true)}
              className="w-8 h-8 rounded-xl bg-rose-100/60 hover:bg-rose-200 text-rose-700 font-bold text-xs flex items-center justify-center transition cursor-pointer"
              title="Dismiss Notification"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full p-2.5 sm:p-3 rounded-2xl bg-emerald-50 border border-emerald-300 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900 font-bold shadow-xs">
          <span className="flex items-center gap-2">
            <i className="fa-solid fa-circle-check text-emerald-600 text-base"></i>
            <span>RECOMMENDATION APPLIED: Generator G2 dispatched at 85 kW. {stationShortName} deficit neutralized · 0.00 kW residual.</span>
          </span>
          <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-300">
            20% Reserve Protected ✓
          </span>
        </div>
      )}
    </div>
  );
}
