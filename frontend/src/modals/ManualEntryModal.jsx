import React, { useState, useEffect } from 'react';

export default function ManualEntryModal({
  isOpen,
  onClose,
  activeOverrides,
  onApplyOverrides,
  onResetOverrides
}) {
  const [temp, setTemp] = useState(-26.3);
  const [wind, setWind] = useState(24.9);
  const [loadMult, setLoadMult] = useState(1.0);
  const [reserve, setReserve] = useState(20);
  const [soc, setSoc] = useState(74);
  const [tripGen1, setTripGen1] = useState(false);
  const [faultBess, setFaultBess] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState(false);

  useEffect(() => {
    if (activeOverrides) {
      if (activeOverrides.ambient_temp_c !== undefined) setTemp(activeOverrides.ambient_temp_c);
      if (activeOverrides.wind_speed_ms !== undefined) setWind(activeOverrides.wind_speed_ms);
      if (activeOverrides.load_multiplier !== undefined) setLoadMult(activeOverrides.load_multiplier);
      if (activeOverrides.battery_reserve_pct !== undefined) setReserve(activeOverrides.battery_reserve_pct);
      if (activeOverrides.battery_soc_pct !== undefined) setSoc(activeOverrides.battery_soc_pct);
      if (activeOverrides.fault_genset_1 !== undefined) setTripGen1(activeOverrides.fault_genset_1);
      if (activeOverrides.fault_battery_heater !== undefined) setFaultBess(activeOverrides.fault_battery_heater);
    }
  }, [activeOverrides]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsApplying(true);
    const payload = {
      ambient_temp_c: temp !== '' ? parseFloat(temp) : undefined,
      wind_speed_ms: wind !== '' ? parseFloat(wind) : undefined,
      load_multiplier: loadMult !== '' ? parseFloat(loadMult) : 1.0,
      fault_genset_1: tripGen1,
      fault_battery_heater: faultBess,
      battery_reserve_pct: reserve !== '' ? parseFloat(reserve) : 20.0,
      battery_soc_pct: soc !== '' ? parseFloat(soc) : 74.0
    };
    await onApplyOverrides(payload);
    setIsApplying(false);
    setAppliedSuccess(true);
    setTimeout(() => {
      setAppliedSuccess(false);
      onClose();
    }, 600);
  };

  const handleReset = async () => {
    setTemp(-26.3);
    setWind(24.9);
    setLoadMult(1.0);
    setReserve(20);
    setSoc(74);
    setTripGen1(false);
    setFaultBess(false);
    await onResetOverrides();
  };

  return (
    <div
      id="modal-manual"
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target.id === 'modal-manual') onClose();
      }}
    >
      <div className="modal-content p-4 sm:p-5 max-w-[700px] max-h-[86vh] flex flex-col">
        {/* Sticky Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 mb-2.5 shrink-0">
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-[#127694] flex items-center gap-2">
              <i className="fa-solid fa-sliders text-xs text-[#05c5ff]"></i>
              Commander Override Controls &amp; Contingency Injection
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Inject polar weather contingencies or equipment faults directly into live SEMS physics.
            </p>
          </div>
          <button
            id="btnCloseManualModal"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form id="commanderOverrideForm" onSubmit={handleSubmit} className="flex-1 overflow-y-auto pr-1 space-y-2.5">
          {/* 2-Column Responsive Grid for Textbox Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Ambient Temperature Textbox */}
            <div className="bg-[#f8fcfe] p-2.5 rounded-2xl border border-[#9ae5fe]/70 flex flex-col justify-between">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <i className="fa-solid fa-temperature-empty text-[#0698c4]"></i> Ambient Temp:
                </span>
                <span className="text-[10px] font-mono text-slate-400 bg-white/90 px-2 py-0.5 rounded-full border border-[#9ae5fe]/60">
                  -50.0 to +5.0°C
                </span>
              </div>
              <div className="relative flex items-center">
                <input
                  type="number"
                  id="slider-temp"
                  min="-50"
                  max="5"
                  step="0.1"
                  value={temp}
                  onChange={(e) => setTemp(e.target.value)}
                  className="w-full px-3 py-2 pr-12 rounded-xl border border-[#9ae5fe] bg-white text-xs font-mono font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#05c5ff] shadow-inner transition"
                  placeholder="-26.3"
                />
                <span className="absolute right-3 text-xs font-bold text-[#0698c4] font-mono pointer-events-none">
                  °C
                </span>
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 mt-1 font-mono">
                <span>-50°C (Blizzard)</span>
                <span>0°C</span>
                <span>+5°C (Warm)</span>
              </div>
            </div>

            {/* Wind Velocity Textbox */}
            <div className="bg-[#f8fcfe] p-2.5 rounded-2xl border border-[#9ae5fe]/70 flex flex-col justify-between">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <i className="fa-solid fa-wind text-[#0698c4]"></i> Wind Velocity:
                </span>
                <span className="text-[10px] font-mono text-slate-400 bg-white/90 px-2 py-0.5 rounded-full border border-[#9ae5fe]/60">
                  0.0 to 35.0 m/s
                </span>
              </div>
              <div className="relative flex items-center">
                <input
                  type="number"
                  id="slider-wind"
                  min="0"
                  max="35"
                  step="0.1"
                  value={wind}
                  onChange={(e) => setWind(e.target.value)}
                  className="w-full px-3 py-2 pr-14 rounded-xl border border-[#9ae5fe] bg-white text-xs font-mono font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#05c5ff] shadow-inner transition"
                  placeholder="24.9"
                />
                <span className="absolute right-3 text-xs font-bold text-[#0698c4] font-mono pointer-events-none">
                  m/s
                </span>
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 mt-1 font-mono">
                <span>0 m/s (Calm)</span>
                <span>12 m/s (Rated)</span>
                <span>&gt;25 m/s (Brake)</span>
              </div>
            </div>

            {/* Station Load Multiplier Textbox */}
            <div className="bg-[#f8fcfe] p-2.5 rounded-2xl border border-[#9ae5fe]/70 flex flex-col justify-between">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <i className="fa-solid fa-bolt text-[#0698c4]"></i> Station Load Multiplier:
                </span>
                <span className="text-[10px] font-mono text-slate-400 bg-white/90 px-2 py-0.5 rounded-full border border-[#9ae5fe]/60">
                  0.5x to 2.0x
                </span>
              </div>
              <div className="relative flex items-center">
                <input
                  type="number"
                  id="slider-load-mult"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={loadMult}
                  onChange={(e) => setLoadMult(e.target.value)}
                  className="w-full px-3 py-2 pr-10 rounded-xl border border-[#9ae5fe] bg-white text-xs font-mono font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#05c5ff] shadow-inner transition"
                  placeholder="1.0"
                />
                <span className="absolute right-3 text-xs font-bold text-[#0698c4] font-mono pointer-events-none">
                  x
                </span>
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 mt-1 font-mono">
                <span>0.5x (Night Base)</span>
                <span>1.0x (Nominal)</span>
                <span>2.0x (Peak Surge)</span>
              </div>
            </div>

            {/* Manual Protected Battery Reserve Textbox */}
            <div className="bg-[#f8fcfe] p-2.5 rounded-2xl border border-[#9ae5fe]/70 flex flex-col justify-between">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <i className="fa-solid fa-shield-halved text-[#0698c4]"></i> Protected Reserve Floor:
                </span>
                <span className="text-[10px] font-mono text-slate-400 bg-white/90 px-2 py-0.5 rounded-full border border-[#9ae5fe]/60">
                  10% to 50%
                </span>
              </div>
              <div className="relative flex items-center">
                <input
                  type="number"
                  id="slider-batt-reserve"
                  min="10"
                  max="50"
                  step="1"
                  value={reserve}
                  onChange={(e) => setReserve(e.target.value)}
                  className="w-full px-3 py-2 pr-10 rounded-xl border border-[#9ae5fe] bg-white text-xs font-mono font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#05c5ff] shadow-inner transition"
                  placeholder="20"
                />
                <span className="absolute right-3 text-xs font-bold text-[#0698c4] font-mono pointer-events-none">
                  %
                </span>
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 mt-1 font-mono">
                <span>10% (Low Margin)</span>
                <span>20% (Standard)</span>
                <span>50% (High Life-Support)</span>
              </div>
            </div>
          </div>

          {/* Manual Battery SoC Level Textbox (Full Width) */}
          <div className="bg-[#f8fcfe] p-2.5 rounded-2xl border border-[#9ae5fe]/70">
            <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <i className="fa-solid fa-car-battery text-[#0698c4]"></i> Manual Battery SoC Level:
              </span>
              <span className="text-[10px] font-mono text-slate-400 bg-white/90 px-2 py-0.5 rounded-full border border-[#9ae5fe]/60">
                10% to 100%
              </span>
            </div>
            <div className="relative flex items-center">
              <input
                type="number"
                id="slider-batt-soc"
                min="10"
                max="100"
                step="1"
                value={soc}
                onChange={(e) => setSoc(e.target.value)}
                className="w-full px-3 py-2 pr-10 rounded-xl border border-[#9ae5fe] bg-white text-xs font-mono font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#05c5ff] shadow-inner transition"
                placeholder="74"
              />
              <span className="absolute right-3 text-xs font-bold text-[#0698c4] font-mono pointer-events-none">
                %
              </span>
            </div>
            <div className="flex justify-between text-[9px] text-slate-400 mt-1 font-mono">
              <span>10% (Critical Reserve Inhibit)</span>
              <span>50% (Nominal Storage)</span>
              <span>100% (Fully Saturated)</span>
            </div>
          </div>

          {/* Hardware Fault Injection Toggles */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Actuator &amp; Hardware Fault Injections
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                id="btn-trip-gen1"
                onClick={() => setTripGen1(!tripGen1)}
                className={`p-2 rounded-2xl border text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm ${
                  tripGen1
                    ? 'bg-rose-50 border-rose-400 text-rose-700'
                    : 'bg-white hover:bg-rose-50 border-slate-200 hover:border-rose-300 text-slate-700'
                }`}
              >
                <i className="fa-solid fa-triangle-exclamation text-rose-500 text-xs"></i>
                <span>Trip Genset 1</span>
              </button>
              <button
                type="button"
                id="btn-fault-bess"
                onClick={() => setFaultBess(!faultBess)}
                className={`p-2 rounded-2xl border text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm ${
                  faultBess
                    ? 'bg-amber-50 border-amber-400 text-amber-700'
                    : 'bg-white hover:bg-amber-50 border-slate-200 hover:border-amber-300 text-slate-700'
                }`}
              >
                <i className="fa-solid fa-snowflake text-amber-500 text-xs"></i>
                <span>BESS Freeze Fault</span>
              </button>
            </div>
          </div>

          <div className="text-[9px] text-slate-400 italic">
            * Fault injection immediately tests deterministic safety guardrails, spinning reserve, and MPC dispatch recovery.
          </div>

          {/* Sticky Action Buttons Footer */}
          <div className="sticky bottom-0 bg-white pt-2.5 pb-0.5 border-t border-slate-100 flex items-center justify-between shrink-0 mt-2">
            <button
              type="button"
              id="btn-reset-overrides"
              onClick={handleReset}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition flex items-center gap-1.5"
            >
              <i className="fa-solid fa-rotate-left text-xs"></i>
              <span>Reset to Nominal</span>
            </button>
            <button
              type="submit"
              id="btn-apply-overrides"
              disabled={isApplying}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold text-white transition flex items-center gap-1.5 shadow-sm ${
                appliedSuccess
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-[#0698c4] hover:bg-[#05c5ff]'
              }`}
            >
              {isApplying ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin text-xs"></i>
                  <span>Applying...</span>
                </>
              ) : appliedSuccess ? (
                <>
                  <i className="fa-solid fa-circle-check text-xs"></i>
                  <span>Applied ✓</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-check text-xs"></i>
                  <span>Apply Overrides</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
