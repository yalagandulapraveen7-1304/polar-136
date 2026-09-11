import React, { useState } from 'react';

export default function MaintenanceModal({ isOpen, onClose, latestData }) {
  const [ackText, setAckText] = useState('Acknowledge Telemetry');
  const [isAcked, setIsAcked] = useState(false);

  if (!isOpen) return null;

  const h = latestData?.hardware_health || {};
  const healthScore = h.overall_score_pct !== undefined ? h.overall_score_pct : 84;
  const degradationRate = h.degradation_rate_pct_h !== undefined ? h.degradation_rate_pct_h : -0.03;
  const etaWarning = h.eta_warning_hours !== undefined ? h.eta_warning_hours : 724.3;

  const handleAck = () => {
    setIsAcked(true);
    setAckText('Telemetry Verified ✓');
    setTimeout(() => {
      setIsAcked(false);
      setAckText('Acknowledge Telemetry');
      onClose();
    }, 1000);
  };

  return (
    <div
      id="modal-maintenance-full"
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target.id === 'modal-maintenance-full') onClose();
      }}
    >
      <div className="modal-content p-5 sm:p-6 max-w-[900px] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div>
            <h2 className="text-base font-extrabold text-[#127694] flex items-center gap-2">
              <i className="fa-solid fa-shield-halved text-xs text-[#05c5ff]"></i>
              Station Health &amp; Preventive Maintenance Diagnostics
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time degradation telemetry, failure prevention ETA, and sub-system health.
            </p>
          </div>
          <button
            id="btnCloseMaintenanceModal"
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Maintenance High-Level Telemetry Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <div className="p-3 rounded-2xl bg-[#f0faff] border border-[#9ae5fe]/70 text-center">
            <div className="text-[9px] font-bold text-slate-400 uppercase">Station Health Score</div>
            <div id="maintScore" className="text-xl font-black text-emerald-600 my-0.5">
              {healthScore}%
            </div>
            <div id="maintStatusPill" className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-block">
              STABLE
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[#f0faff] border border-[#9ae5fe]/70 text-center">
            <div className="text-[9px] font-bold text-slate-400 uppercase">Degradation Rate</div>
            <div id="maintTrend" className="text-xl font-black text-slate-800 my-0.5">
              {degradationRate}%/h
            </div>
            <div className="text-[9px] text-slate-500">Normal thermal wear</div>
          </div>

          <div className="p-3 rounded-2xl bg-[#f0faff] border border-[#9ae5fe]/70 text-center">
            <div className="text-[9px] font-bold text-slate-400 uppercase">ETA to Warning</div>
            <div id="maintHoursWarning" className="text-xl font-black text-[#0698c4] my-0.5">
              {etaWarning} Hours
            </div>
            <div className="text-[9px] text-slate-500">~5.8 Polar Days</div>
          </div>

          <div className="p-3 rounded-2xl bg-[#f0faff] border border-[#9ae5fe]/70 text-center">
            <div className="text-[9px] font-bold text-slate-400 uppercase">ETA to Critical</div>
            <div id="maintHoursCritical" className="text-xl font-black text-[#127694] my-0.5">
              &gt; 2,000 Hours
            </div>
            <div className="text-[9px] text-slate-500">Overhaul Window Safe</div>
          </div>
        </div>

        {/* AI Maintenance Diagnostic Message */}
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl mb-4 flex items-start gap-2.5">
          <i className="fa-solid fa-circle-check text-base text-emerald-600 shrink-0 mt-0.5"></i>
          <div>
            <div className="text-xs font-bold text-emerald-900">AI Diagnostic Status</div>
            <p id="maintMessage" className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
              Device health stable ({healthScore}.0%). Battery pack thermal heating jacket is maintaining nominal LiFePO4 cell core parameters.
            </p>
          </div>
        </div>

        {/* Subsystem Diagnostics 4-Card Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {/* Subsystem 1: Wind Turbines */}
          <div className="p-3.5 rounded-2xl bg-white border border-[#9ae5fe] shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#127694] flex items-center gap-1.5">
                <i className="fa-solid fa-wind text-xs text-[#05c5ff]"></i>
                Wind Turbine Subsystem
              </span>
              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">94% Health</span>
            </div>
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Bearing Vibration:</span> <strong className="text-slate-800">0.24 mm/s (Normal)</strong>
              </div>
              <div className="flex justify-between">
                <span>Blade De-icing Coils:</span> <strong className="text-[#0698c4]">Active (Auto)</strong>
              </div>
              <div className="flex justify-between">
                <span>Sub-Zero Lubrication:</span> <strong className="text-slate-800">Synthetic Polar ISO 32</strong>
              </div>
            </div>
          </div>

          {/* Subsystem 2: LiFePO4 Thermal Pack */}
          <div className="p-3.5 rounded-2xl bg-white border border-[#9ae5fe] shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#127694] flex items-center gap-1.5">
                <i className="fa-solid fa-car-battery text-xs text-[#127694]"></i>
                LiFePO4 Storage Bank
              </span>
              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">89% Health</span>
            </div>
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Cell Core Temp:</span> <strong className="text-slate-800">-8.6°C (Thermal Pack Safe)</strong>
              </div>
              <div className="flex justify-between">
                <span>Cell Voltage Delta:</span> <strong className="text-[#0698c4]">12 mV (Balanced)</strong>
              </div>
              <div className="flex justify-between">
                <span>Total Lifetime Cycles:</span> <strong className="text-slate-800">1,420 / 6,000 Cycles</strong>
              </div>
            </div>
          </div>

          {/* Subsystem 3: Diesel Gen-Sets */}
          <div className="p-3.5 rounded-2xl bg-white border border-[#9ae5fe] shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#127694] flex items-center gap-1.5">
                <i className="fa-solid fa-gas-pump text-xs text-[#0698c4]"></i>
                Diesel Generator Units
              </span>
              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">85% Health</span>
            </div>
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Gen-Set 1 (Active):</span> <strong className="text-slate-800">Oil: 4.2 bar • Coolant: 82°C</strong>
              </div>
              <div className="flex justify-between">
                <span>Gen-Set 2 (Standby):</span> <strong className="text-[#0698c4]">Block Pre-Heater ON</strong>
              </div>
              <div className="flex justify-between">
                <span>Injector Pressure:</span> <strong className="text-slate-800">1,850 bar (Clean)</strong>
              </div>
            </div>
          </div>

          {/* Subsystem 4: Inverter & Microgrid Bus */}
          <div className="p-3.5 rounded-2xl bg-white border border-[#9ae5fe] shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#127694] flex items-center gap-1.5">
                <i className="fa-solid fa-wave-square text-xs text-[#05c5ff]"></i>
                Inverter Bus &amp; STS
              </span>
              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">98% Health</span>
            </div>
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Harmonic Distortion (THD):</span> <strong className="text-slate-800">1.8% (&lt; 5% Spec)</strong>
              </div>
              <div className="flex justify-between">
                <span>Grid Frequency:</span> <strong className="text-[#0698c4]">50.02 Hz Synced</strong>
              </div>
              <div className="flex justify-between">
                <span>Transfer Switch Time:</span> <strong className="text-slate-800">&lt; 4 ms (Uninterrupted)</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Actionable Checklist */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Routine Filter Replacement: <strong>Scheduled in 18 Days</strong></span>
          <button
            id="btnAckMaintenance"
            type="button"
            onClick={handleAck}
            className={`px-3.5 py-1.5 rounded-xl text-white font-bold transition shadow-sm ${
              isAcked ? 'bg-emerald-600' : 'bg-[#0698c4] hover:bg-[#05c5ff]'
            }`}
          >
            {ackText}
          </button>
        </div>
      </div>
    </div>
  );
}
