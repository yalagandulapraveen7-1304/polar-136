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
        <div className="w-full p-3 sm:p-3.5 rounded-xl bg-rose-50 border border-rose-300 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>
            <div>
              <div className="text-xs sm:text-sm font-bold text-rose-900 tracking-tight flex items-center gap-2 flex-wrap">
                <span>CRITICAL RENEWABLE DEFICIT PREDICTED (-{deficitKw.toFixed(0)} kW at {projectedTimeStr})</span>
                <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-bold uppercase border border-rose-200">
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
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-bolt text-xs"></i>
              <span>Auto-Dispatch G2 (85 kW)</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenModal && onOpenModal('copilot', `Why is a critical renewable deficit predicted for ${stationShortName} at ${projectedTimeStr}, and why must Generator G2 be dispatched at 85 kW?`)}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-rose-200 transition cursor-pointer"
            >
              Inspect Why
            </button>
            <button
              type="button"
              onClick={() => setIsDismissed(true)}
              className="w-7 h-7 rounded-lg bg-rose-100/60 hover:bg-rose-200 text-rose-700 font-bold text-xs flex items-center justify-center transition cursor-pointer"
              title="Dismiss Notification"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900 font-semibold shadow-xs">
          <span className="flex items-center gap-2">
            <i className="fa-solid fa-circle-check text-emerald-600 text-sm"></i>
            <span>RECOMMENDATION APPLIED: Generator G2 dispatched at 85 kW. {stationShortName} deficit neutralized · 0.00 kW residual.</span>
          </span>
          <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300">
            20% Reserve Protected
          </span>
        </div>
      )}
    </div>
  );
}
