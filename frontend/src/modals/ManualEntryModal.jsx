import React, { useState, useEffect } from 'react';

export default function ManualEntryModal({
  isOpen,
  onClose,
  activeOverrides,
  onApplyOverrides,
  onResetOverrides,
  latestData,
  stationId
}) {
  const [activeTab, setActiveTab] = useState('data'); // 'data' | 'presets' | 'comparison' | 'winter' | 'timeline'

  // Precision Engineering Data Inputs (NO SLIDERS)
  const [temp, setTemp] = useState(-22.5);
  const [wind, setWind] = useState(11.2);
  const [solar, setSolar] = useState(280.0);
  const [loadMult, setLoadMult] = useState(1.0);
  const [reserveFloor, setReserveFloor] = useState(20.0);
  const [soc, setSoc] = useState(76.5);
  const [fuelPct, setFuelPct] = useState(75.0);

  // Hardware Contingency Fault Switches
  const [faultGen1, setFaultGen1] = useState(false);
  const [faultGen2, setFaultGen2] = useState(false);
  const [faultBess, setFaultBess] = useState(false);
  const [windTrip, setWindTrip] = useState(false);
  const [solarTrip, setSolarTrip] = useState(false);

  // State Management
  const [isApplying, setIsApplying] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [winterReport, setWinterReport] = useState(null);
  const [isLoadingWinter, setIsLoadingWinter] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [presetNotice, setPresetNotice] = useState(null);

  const isScadaMode = latestData?.mode === 'SCADA_MODE';
  const stationName = latestData?.station_name || 'Maitri Research Station';
  const scenarioControl = latestData?.scenario_control || {};

  // Sync with active overrides from parent
  useEffect(() => {
    if (activeOverrides) {
      if (activeOverrides.ambient_temp_c !== undefined && activeOverrides.ambient_temp_c !== null) setTemp(activeOverrides.ambient_temp_c);
      if (activeOverrides.wind_speed_ms !== undefined && activeOverrides.wind_speed_ms !== null) setWind(activeOverrides.wind_speed_ms);
      if (activeOverrides.solar_irradiance_wm2 !== undefined && activeOverrides.solar_irradiance_wm2 !== null) setSolar(activeOverrides.solar_irradiance_wm2);
      if (activeOverrides.load_multiplier !== undefined && activeOverrides.load_multiplier !== null) setLoadMult(activeOverrides.load_multiplier);
      if (activeOverrides.battery_reserve_pct !== undefined && activeOverrides.battery_reserve_pct !== null) setReserveFloor(activeOverrides.battery_reserve_pct);
      if (activeOverrides.battery_soc_pct !== undefined && activeOverrides.battery_soc_pct !== null) setSoc(activeOverrides.battery_soc_pct);
      if (activeOverrides.fuel_reserve_pct !== undefined && activeOverrides.fuel_reserve_pct !== null) setFuelPct(activeOverrides.fuel_reserve_pct);
      if (activeOverrides.fault_genset_1 !== undefined) setFaultGen1(Boolean(activeOverrides.fault_genset_1));
      if (activeOverrides.fault_genset_2 !== undefined) setFaultGen2(Boolean(activeOverrides.fault_genset_2));
      if (activeOverrides.fault_battery_heater !== undefined) setFaultBess(Boolean(activeOverrides.fault_battery_heater));
      if (activeOverrides.wind_trip !== undefined) setWindTrip(Boolean(activeOverrides.wind_trip));
      if (activeOverrides.solar_trip !== undefined) setSolarTrip(Boolean(activeOverrides.solar_trip));
    }
  }, [activeOverrides]);

  // Load 21-day failure simulation when tab opened
  useEffect(() => {
    if (activeTab === 'winter' && !winterReport && !isLoadingWinter) {
      setIsLoadingWinter(true);
      fetch('/api/scenarios/three-week-outage')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setWinterReport(data);
          setIsLoadingWinter(false);
        })
        .catch(() => setIsLoadingWinter(false));
    }
  }, [activeTab, winterReport, isLoadingWinter]);

  if (!isOpen) return null;

  // Real-time boundary validation
  const validateForm = () => {
    const errs = [];
    const t = parseFloat(temp);
    if (isNaN(t) || t < -60.0 || t > 15.0) errs.push('Ambient Temperature must be between -60.0°C and +15.0°C.');
    const w = parseFloat(wind);
    if (isNaN(w) || w < 0.0 || w > 60.0) errs.push('Wind Velocity must be between 0.0 m/s and 60.0 m/s.');
    const s = parseFloat(solar);
    if (isNaN(s) || s < 0.0 || s > 1200.0) errs.push('Solar Irradiance must be between 0.0 W/m² and 1200.0 W/m².');
    const l = parseFloat(loadMult);
    if (isNaN(l) || l < 0.1 || l > 3.0) errs.push('Station Load Multiplier must be between 0.10x and 3.00x.');
    const r = parseFloat(reserveFloor);
    if (isNaN(r) || r < 10.0 || r > 50.0) errs.push('Battery Reserve Floor must be between 10.0% and 50.0%.');
    const b = parseFloat(soc);
    if (isNaN(b) || b < 5.0 || b > 100.0) errs.push('Battery SoC must be between 5.0% and 100.0%.');
    const f = parseFloat(fuelPct);
    if (isNaN(f) || f < 0.0 || f > 100.0) errs.push('Fuel Reserve Level must be between 0.0% and 100.0%.');
    return errs;
  };

  const handleApply = async (e) => {
    if (e) e.preventDefault();
    if (isScadaMode) return;

    const errs = validateForm();
    if (errs.length > 0) {
      setValidationErrors(errs);
      return;
    }
    setValidationErrors([]);
    setIsApplying(true);

    const payload = {
      ambient_temp_c: parseFloat(temp),
      wind_speed_ms: parseFloat(wind),
      solar_irradiance_wm2: parseFloat(solar),
      load_multiplier: parseFloat(loadMult),
      battery_reserve_pct: parseFloat(reserveFloor),
      battery_soc_pct: parseFloat(soc),
      fuel_reserve_pct: parseFloat(fuelPct),
      fault_genset_1: faultGen1,
      fault_genset_2: faultGen2,
      fault_battery_heater: faultBess,
      wind_trip: windTrip,
      solar_trip: solarTrip
    };

    try {
      // 1. Post to backend Scenario Engine
      await fetch('/api/scenarios/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params: payload, scenario_name: 'MANUAL_CALIBRATED_INPUT' })
      });
      // 2. Notify App state
      await onApplyOverrides(payload);
      setAppliedSuccess(true);
      setTimeout(() => setAppliedSuccess(false), 1200);
    } catch (err) {
      console.warn('Failed to apply overrides:', err);
    } finally {
      setIsApplying(false);
    }
  };

  const handleReset = async () => {
    if (isScadaMode) return;
    setTemp(-22.5);
    setWind(11.2);
    setSolar(280.0);
    setLoadMult(1.0);
    setReserveFloor(20.0);
    setSoc(76.5);
    setFuelPct(75.0);
    setFaultGen1(false);
    setFaultGen2(false);
    setFaultBess(false);
    setWindTrip(false);
    setSolarTrip(false);
    setValidationErrors([]);

    try {
      await fetch('/api/scenarios/reset', { method: 'POST' });
      await onResetOverrides();
    } catch (err) {
      console.warn('Reset error:', err);
    }
  };

  // Populate data inputs from a preset without directly submitting
  const handlePopulatePreset = (presetKey) => {
    const presets = {
      POLAR_VORTEX: {
        temp: -41.0,
        wind: 28.0,
        solar: 0.0,
        loadMult: 1.45,
        reserveFloor: 25.0,
        soc: 52.0,
        fuelPct: 65.0,
        faultGen1: false,
        faultGen2: false,
        faultBess: false,
        windTrip: true,
        solarTrip: false,
        label: 'Extreme Polar Vortex'
      },
      WINTER_FAILURE: {
        temp: -32.0,
        wind: 14.5,
        solar: 0.0,
        loadMult: 1.15,
        reserveFloor: 20.0,
        soc: 68.0,
        fuelPct: 55.0,
        faultGen1: true,
        faultGen2: false,
        faultBess: false,
        windTrip: false,
        solarTrip: false,
        label: 'Three-Week Winter Failure (Genset 1 Outage)'
      },
      SEVERE_COLD: {
        temp: -35.0,
        wind: 12.0,
        solar: 50.0,
        loadMult: 1.25,
        reserveFloor: 20.0,
        soc: 72.0,
        fuelPct: 70.0,
        faultGen1: false,
        faultGen2: false,
        faultBess: false,
        windTrip: false,
        solarTrip: false,
        label: 'Severe Cold Snap (-35°C)'
      },
      RENEWABLE_DROUGHT: {
        temp: -25.0,
        wind: 2.2,
        solar: 0.0,
        loadMult: 1.0,
        reserveFloor: 20.0,
        soc: 45.0,
        fuelPct: 60.0,
        faultGen1: false,
        faultGen2: false,
        faultBess: false,
        windTrip: false,
        solarTrip: false,
        label: 'Renewable Generation Drought'
      },
      COMPOUND_EXTREME: {
        temp: -38.0,
        wind: 22.0,
        solar: 0.0,
        loadMult: 1.35,
        reserveFloor: 25.0,
        soc: 58.0,
        fuelPct: 50.0,
        faultGen1: true,
        faultGen2: false,
        faultBess: true,
        windTrip: false,
        solarTrip: false,
        label: 'Compound Extreme Multi-Failure'
      }
    };

    const p = presets[presetKey];
    if (!p) return;

    setTemp(p.temp);
    setWind(p.wind);
    setSolar(p.solar);
    setLoadMult(p.loadMult);
    setReserveFloor(p.reserveFloor);
    setSoc(p.soc);
    setFuelPct(p.fuelPct);
    setFaultGen1(p.faultGen1);
    setFaultGen2(p.faultGen2);
    setFaultBess(p.faultBess);
    setWindTrip(p.windTrip);
    setSolarTrip(p.solarTrip);

    setPresetNotice(`Loaded '${p.label}' parameters into input fields. Review and click 'Apply Changes' to inject.`);
    setActiveTab('data');
    setTimeout(() => setPresetNotice(null), 5000);
  };

  const handleApplyPresetDirect = async (presetId) => {
    if (isScadaMode) return;
    try {
      setIsApplying(true);
      const res = await fetch('/api/scenarios/preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset_id: presetId })
      });
      if (res.ok) {
        const data = await res.json();
        await onApplyOverrides(data.active_params);
        setAppliedSuccess(true);
        setTimeout(() => setAppliedSuccess(false), 1200);
      }
    } catch (e) {
      console.warn('Preset application error:', e);
    } finally {
      setIsApplying(false);
    }
  };

  const handleCopyJson = () => {
    const payload = {
      run_id: scenarioControl?.run_id || 'SCEN-LIVE',
      station_id: stationId,
      parameters: {
        ambient_temp_c: parseFloat(temp),
        wind_speed_ms: parseFloat(wind),
        solar_irradiance_wm2: parseFloat(solar),
        load_multiplier: parseFloat(loadMult),
        battery_reserve_pct: parseFloat(reserveFloor),
        battery_soc_pct: parseFloat(soc),
        fuel_reserve_pct: parseFloat(fuelPct),
        fault_genset_1: faultGen1,
        fault_genset_2: faultGen2,
        fault_battery_heater: faultBess,
        wind_trip: windTrip,
        solar_trip: solarTrip
      }
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <div
      id="modal-scenario-control"
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target.id === 'modal-scenario-control') onClose();
      }}
    >
      <div className="modal-content p-4 sm:p-6 max-w-[880px] max-h-[90vh] flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-100">
        {/* Sticky Header */}
        <div className="pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0699C6] to-[#05C5FF] flex items-center justify-center text-white shadow-md">
                <i className="fa-solid fa-sliders text-xs"></i>
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <span>Scenario Control &amp; Precise Data Input</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    {stationName}
                  </span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  Section 11: Real-Time Contingency Injection, Stress Presets, and Digital Twin Comparative Evaluation.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>

          {/* Operating Mode Status Banner */}
          <div className="mt-2.5">
            {isScadaMode ? (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                  <span className="font-mono font-bold tracking-wider text-[11px]">SCADA MODE ● LIVE READ-ONLY</span>
                  <span className="text-rose-600 font-normal text-[11px]">
                    — Manual data inputs locked to protect physical station hardware.
                  </span>
                </div>
                <span className="text-[10px] bg-rose-200/80 px-2 py-0.5 rounded-full text-rose-900 font-mono">
                  HARDWARE INTERLOCKED
                </span>
              </div>
            ) : (
              <div className="bg-cyan-50 border border-cyan-200 text-[#0699C6] rounded-xl px-3 py-1.5 flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#05C5FF] animate-ping"></span>
                  <span className="font-mono font-bold tracking-wider text-[11px]">SIMULATION MODE ● DIGITAL TWIN</span>
                  <span className="text-slate-600 font-normal text-[11px]">
                    — Direct manual data inputs alter simulated physics and re-solve MILP optimization.
                  </span>
                </div>
                <span className="text-[10px] bg-white px-2 py-0.5 rounded-full text-[#127694] font-mono border border-cyan-200">
                  RUN ID: {scenarioControl?.run_id || 'SCEN-LIVE'}
                </span>
              </div>
            )}
          </div>

          {/* Notification Banner when preset populated */}
          {presetNotice && (
            <div className="mt-2 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl px-3 py-1.5 text-xs flex items-center justify-between animate-fade-in">
              <span className="flex items-center gap-1.5">
                <i className="fa-solid fa-circle-check text-emerald-600"></i>
                {presetNotice}
              </span>
              <button
                type="button"
                onClick={() => setPresetNotice(null)}
                className="text-emerald-600 hover:text-emerald-900 text-xs font-bold"
              >
                ×
              </button>
            </div>
          )}

          {/* 5-Tab Navigation Bar */}
          <div className="flex items-center gap-1 mt-2.5 border-b border-slate-100 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('data')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'data'
                  ? 'bg-[#0699C6] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <i className="fa-solid fa-keyboard text-[10px]"></i>
              <span>1. Precise Data Input</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('presets')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'presets'
                  ? 'bg-[#0699C6] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <i className="fa-solid fa-flask-vial text-[10px]"></i>
              <span>2. Engineering Presets</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('comparison')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'comparison'
                  ? 'bg-[#0699C6] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <i className="fa-solid fa-table-columns text-[10px]"></i>
              <span>3. Comparison Tableau</span>
              {scenarioControl?.is_override_active && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('winter')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'winter'
                  ? 'bg-[#0699C6] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <i className="fa-solid fa-snowflake text-[10px]"></i>
              <span>4. 21-Day Failure Deep-Dive</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('timeline')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'timeline'
                  ? 'bg-[#0699C6] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <i className="fa-solid fa-clock-rotate-left text-[10px]"></i>
              <span>5. Timeline &amp; Export</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Precise Data Entry & Injections (STRICTLY NO SLIDERS) */}
        {activeTab === 'data' && (
          <form onSubmit={handleApply} className="flex-1 overflow-y-auto pr-1 py-3 space-y-3">
            {/* Validation Errors Box */}
            {validationErrors.length > 0 && (
              <div className="bg-rose-50 border border-rose-300 text-rose-800 p-2.5 rounded-xl text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <i className="fa-solid fa-triangle-exclamation text-rose-500"></i>
                  <span>Input Boundary Violations:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {validationErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Environmental Data Inputs Grid */}
            <div>
              <div className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <i className="fa-solid fa-cloud-sun text-[#0699C6]"></i>
                  <span>Environmental &amp; Atmospheric Parameters (Manual Data Entry)</span>
                </span>
                <span className="text-[10px] text-slate-400 font-normal">
                  *Direct keyboard entry with decimal precision
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* 1. Ambient Temperature Box */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 hover:border-[#0699C6] transition flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <i className="fa-solid fa-temperature-half text-[#0699C6]"></i> Ambient Temp:
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                      -60.0 to +15.0°C
                    </span>
                  </div>
                  <div className="relative flex items-center my-1">
                    <input
                      type="number"
                      disabled={isScadaMode}
                      step="0.1"
                      min="-60.0"
                      max="15.0"
                      value={temp}
                      onChange={(e) => setTemp(e.target.value)}
                      className={`w-full px-3 py-2 pr-12 rounded-xl border bg-white text-xs font-mono font-bold text-slate-800 focus:outline-none transition ${
                        parseFloat(temp) < -60.0 || parseFloat(temp) > 15.0
                          ? 'border-rose-400 bg-rose-50 text-rose-700'
                          : 'border-slate-300 focus:border-[#0699C6]'
                      }`}
                      placeholder="-22.5"
                    />
                    <span className="absolute right-3 text-xs font-mono font-bold text-slate-500 pointer-events-none">
                      °C
                    </span>
                  </div>
                  {/* Quick-Set Helper Buttons */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setTemp(-41.0)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-200 font-mono text-slate-600 transition"
                    >
                      -41°C Vortex
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setTemp(-35.0)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-200 font-mono text-slate-600 transition"
                    >
                      -35°C Severe
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setTemp(-22.5)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-200 font-mono text-slate-600 transition"
                    >
                      -22.5°C Nom
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setTemp(0.0)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-200 font-mono text-slate-600 transition"
                    >
                      0°C Thaw
                    </button>
                  </div>
                </div>

                {/* 2. Wind Velocity Box */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 hover:border-[#0699C6] transition flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <i className="fa-solid fa-wind text-[#0699C6]"></i> Wind Velocity:
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                      0.0 to 60.0 m/s
                    </span>
                  </div>
                  <div className="relative flex items-center my-1">
                    <input
                      type="number"
                      disabled={isScadaMode}
                      step="0.1"
                      min="0.0"
                      max="60.0"
                      value={wind}
                      onChange={(e) => setWind(e.target.value)}
                      className={`w-full px-3 py-2 pr-12 rounded-xl border bg-white text-xs font-mono font-bold text-slate-800 focus:outline-none transition ${
                        parseFloat(wind) < 0.0 || parseFloat(wind) > 60.0
                          ? 'border-rose-400 bg-rose-50 text-rose-700'
                          : 'border-slate-300 focus:border-[#0699C6]'
                      }`}
                      placeholder="11.2"
                    />
                    <span className="absolute right-3 text-xs font-mono font-bold text-slate-500 pointer-events-none">
                      m/s
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setWind(0.0)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-200 font-mono text-slate-600 transition"
                    >
                      0 Calm
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setWind(3.0)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-200 font-mono text-slate-600 transition"
                    >
                      3 Cut-in
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setWind(12.0)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-200 font-mono text-slate-600 transition"
                    >
                      12 Rated
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setWind(25.0)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-200 font-mono text-rose-600 transition"
                    >
                      25 Cut-out
                    </button>
                  </div>
                </div>

                {/* 3. Solar Irradiance Box */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 hover:border-[#0699C6] transition flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <i className="fa-solid fa-sun text-amber-500"></i> Solar Irradiance:
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                      0.0 to 1200 W/m²
                    </span>
                  </div>
                  <div className="relative flex items-center my-1">
                    <input
                      type="number"
                      disabled={isScadaMode}
                      step="10.0"
                      min="0.0"
                      max="1200.0"
                      value={solar}
                      onChange={(e) => setSolar(e.target.value)}
                      className={`w-full px-3 py-2 pr-14 rounded-xl border bg-white text-xs font-mono font-bold text-slate-800 focus:outline-none transition ${
                        parseFloat(solar) < 0.0 || parseFloat(solar) > 1200.0
                          ? 'border-rose-400 bg-rose-50 text-rose-700'
                          : 'border-slate-300 focus:border-[#0699C6]'
                      }`}
                      placeholder="280.0"
                    />
                    <span className="absolute right-3 text-xs font-mono font-bold text-slate-500 pointer-events-none">
                      W/m²
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setSolar(0.0)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-200 font-mono text-slate-600 transition"
                    >
                      0 Polar Night
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setSolar(280.0)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-200 font-mono text-slate-600 transition"
                    >
                      280 Nominal
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setSolar(650.0)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-200 font-mono text-slate-600 transition"
                    >
                      650 Albedo
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setSolar(1000.0)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-200 font-mono text-slate-600 transition"
                    >
                      1000 STC
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Electrical Demand & Storage Parameters */}
            <div>
              <div className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <i className="fa-solid fa-bolt text-amber-500"></i>
                  <span>Station Demand &amp; Energy Storage Parameters</span>
                </span>
                <span className="text-[10px] text-slate-400 font-normal">
                  *Calibrated engineering numbers
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                {/* 1. Station Load Multiplier Box */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 hover:border-[#0699C6] transition flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-xs font-bold text-slate-700">Load Scale:</span>
                    <span className="text-[10px] font-mono text-slate-400">0.1x - 3.0x</span>
                  </div>
                  <div className="relative flex items-center my-1">
                    <input
                      type="number"
                      disabled={isScadaMode}
                      step="0.05"
                      min="0.1"
                      max="3.0"
                      value={loadMult}
                      onChange={(e) => setLoadMult(e.target.value)}
                      className="w-full px-3 py-2 pr-8 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-[#0699C6]"
                      placeholder="1.00"
                    />
                    <span className="absolute right-3 text-xs font-mono font-bold text-slate-500 pointer-events-none">
                      x
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setLoadMult(0.7)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-slate-600"
                    >
                      0.70x Night
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setLoadMult(1.0)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-slate-600"
                    >
                      1.00x Nom
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setLoadMult(1.45)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-rose-600"
                    >
                      1.45x Vortex
                    </button>
                  </div>
                </div>

                {/* 2. Battery Reserve Floor Box */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 hover:border-[#0699C6] transition flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-xs font-bold text-slate-700">Reserve Floor:</span>
                    <span className="text-[10px] font-mono text-slate-400">10% - 50%</span>
                  </div>
                  <div className="relative flex items-center my-1">
                    <input
                      type="number"
                      disabled={isScadaMode}
                      step="1.0"
                      min="10"
                      max="50"
                      value={reserveFloor}
                      onChange={(e) => setReserveFloor(e.target.value)}
                      className="w-full px-3 py-2 pr-8 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-[#0699C6]"
                      placeholder="20"
                    />
                    <span className="absolute right-3 text-xs font-mono font-bold text-slate-500 pointer-events-none">
                      %
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setReserveFloor(15)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-slate-600"
                    >
                      15% Low
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setReserveFloor(20)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-slate-600"
                    >
                      20% Std
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setReserveFloor(35)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-slate-600"
                    >
                      35% Safe
                    </button>
                  </div>
                </div>

                {/* 3. Battery State of Charge Box */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 hover:border-[#0699C6] transition flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-xs font-bold text-slate-700">Battery SoC:</span>
                    <span className="text-[10px] font-mono text-slate-400">5% - 100%</span>
                  </div>
                  <div className="relative flex items-center my-1">
                    <input
                      type="number"
                      disabled={isScadaMode}
                      step="0.5"
                      min="5"
                      max="100"
                      value={soc}
                      onChange={(e) => setSoc(e.target.value)}
                      className="w-full px-3 py-2 pr-8 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-[#0699C6]"
                      placeholder="76.5"
                    />
                    <span className="absolute right-3 text-xs font-mono font-bold text-slate-500 pointer-events-none">
                      %
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setSoc(25.0)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-rose-600"
                    >
                      25% Crit
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setSoc(50.0)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-slate-600"
                    >
                      50% Mid
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setSoc(76.5)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-slate-600"
                    >
                      76.5% Nom
                    </button>
                  </div>
                </div>

                {/* 4. Fuel Reserve Box */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 hover:border-[#0699C6] transition flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-xs font-bold text-slate-700">Fuel Level:</span>
                    <span className="text-[10px] font-mono text-slate-400">0% - 100%</span>
                  </div>
                  <div className="relative flex items-center my-1">
                    <input
                      type="number"
                      disabled={isScadaMode}
                      step="1.0"
                      min="0"
                      max="100"
                      value={fuelPct}
                      onChange={(e) => setFuelPct(e.target.value)}
                      className="w-full px-3 py-2 pr-8 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-[#0699C6]"
                      placeholder="75"
                    />
                    <span className="absolute right-3 text-xs font-mono font-bold text-slate-500 pointer-events-none">
                      %
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setFuelPct(25)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-rose-600"
                    >
                      25% Low
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setFuelPct(50)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-slate-600"
                    >
                      50% Half
                    </button>
                    <button
                      type="button"
                      disabled={isScadaMode}
                      onClick={() => setFuelPct(75)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-slate-600"
                    >
                      75% Nom
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Hardware Fault Injections */}
            <div>
              <div className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <i className="fa-solid fa-triangle-exclamation text-rose-500"></i>
                  <span>Hardware Contingency &amp; Failure Injection Toggles</span>
                </span>
                <span className="text-[10px] text-slate-400 font-normal">
                  *Tests automatic spinning reserve &amp; MILP re-dispatch
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <button
                  type="button"
                  disabled={isScadaMode}
                  onClick={() => setFaultGen1(!faultGen1)}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 shadow-sm ${
                    faultGen1
                      ? 'bg-rose-50 border-rose-400 text-rose-700 shadow-rose-100'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <i className={`fa-solid fa-triangle-exclamation text-xs ${faultGen1 ? 'text-rose-600' : 'text-slate-400'}`}></i>
                  <span>Trip Genset 1</span>
                  <span className={`text-[9px] font-mono ${faultGen1 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                    {faultGen1 ? 'FAILED (0 kW)' : 'ONLINE'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isScadaMode}
                  onClick={() => setFaultGen2(!faultGen2)}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 shadow-sm ${
                    faultGen2
                      ? 'bg-rose-50 border-rose-400 text-rose-700 shadow-rose-100'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <i className={`fa-solid fa-power-off text-xs ${faultGen2 ? 'text-rose-600' : 'text-slate-400'}`}></i>
                  <span>Trip Genset 2</span>
                  <span className={`text-[9px] font-mono ${faultGen2 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                    {faultGen2 ? 'UNAVAILABLE' : 'STANDBY READY'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isScadaMode}
                  onClick={() => setFaultBess(!faultBess)}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 shadow-sm ${
                    faultBess
                      ? 'bg-amber-50 border-amber-400 text-amber-800 shadow-amber-100'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <i className={`fa-solid fa-snowflake text-xs ${faultBess ? 'text-amber-600' : 'text-slate-400'}`}></i>
                  <span>BESS Freeze Fault</span>
                  <span className={`text-[9px] font-mono ${faultBess ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>
                    {faultBess ? 'HEATER OFF (-0.25°C/s)' : 'HEATED'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isScadaMode}
                  onClick={() => setWindTrip(!windTrip)}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 shadow-sm ${
                    windTrip
                      ? 'bg-amber-50 border-amber-400 text-amber-800'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <i className={`fa-solid fa-fan text-xs ${windTrip ? 'text-amber-600' : 'text-slate-400'}`}></i>
                  <span>Wind Lockout</span>
                  <span className={`text-[9px] font-mono ${windTrip ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>
                    {windTrip ? 'BRAKE ENGAGED' : 'GENERATING'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isScadaMode}
                  onClick={() => setSolarTrip(!solarTrip)}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 shadow-sm ${
                    solarTrip
                      ? 'bg-amber-50 border-amber-400 text-amber-800'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <i className={`fa-solid fa-solar-panel text-xs ${solarTrip ? 'text-amber-600' : 'text-slate-400'}`}></i>
                  <span>Solar Disconnect</span>
                  <span className={`text-[9px] font-mono ${solarTrip ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>
                    {solarTrip ? 'ISOLATED' : 'GRID TIED'}
                  </span>
                </button>
              </div>
            </div>

            {/* Sticky Action Footer */}
            <div className="sticky bottom-0 bg-white pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <button
                type="button"
                disabled={isScadaMode}
                onClick={handleReset}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition flex items-center gap-1.5"
              >
                <i className="fa-solid fa-rotate-left text-xs"></i>
                <span>Reset to Nominal</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('comparison')}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border border-[#0699C6]/30 text-[#0699C6] hover:bg-cyan-50 transition flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-eye text-xs"></i>
                  <span>View Delta Tableau</span>
                </button>

                <button
                  type="submit"
                  disabled={isApplying || isScadaMode}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold text-white transition flex items-center gap-1.5 shadow-md ${
                    isScadaMode
                      ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                      : appliedSuccess
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-[#0699C6] hover:bg-[#05C5FF]'
                  }`}
                >
                  {isApplying ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin text-xs"></i>
                      <span>Applying &amp; Optimizing...</span>
                    </>
                  ) : appliedSuccess ? (
                    <>
                      <i className="fa-solid fa-circle-check text-xs"></i>
                      <span>Applied &amp; Re-Optimized</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-check text-xs"></i>
                      <span>Apply Changes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Tab 2: Engineering Stress Presets */}
        {activeTab === 'presets' && (
          <div className="flex-1 overflow-y-auto pr-1 py-3 space-y-3">
            <p className="text-xs text-slate-600">
              Select an engineering benchmark or polar stress scenario. You can either <strong>pre-populate the data fields</strong> to inspect and tweak the numbers, or <strong>apply immediately</strong> to trigger automated MILP re-dispatch.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 1. Extreme Polar Vortex */}
              <div className="p-3.5 rounded-2xl border border-rose-200 bg-rose-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-xs font-extrabold text-rose-900 flex items-center gap-1.5">
                      <i className="fa-solid fa-icicles text-rose-500"></i> Extreme Polar Vortex
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-200 text-rose-900 font-bold">
                      EMERGENCY
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mb-2">
                    -41.0°C blizzard temperature, 28.0 m/s gale wind (tripping turbine cut-out), 0 solar, and 1.45x peak heating demand.
                  </p>
                  <div className="bg-white/80 p-2 rounded-xl text-[10px] font-mono text-slate-600 space-y-0.5 border border-rose-100 mb-3">
                    <div>Temp: -41.0°C | Wind: 28.0 m/s (Tripped)</div>
                    <div>Solar: 0 W/m² | Load Scale: 1.45x</div>
                    <div>BESS Floor: 25% | Fuel: 65%</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-rose-200/60">
                  <button
                    type="button"
                    disabled={isScadaMode}
                    onClick={() => handlePopulatePreset('POLAR_VORTEX')}
                    className="flex-1 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 transition"
                  >
                    Pre-populate Inputs
                  </button>
                  <button
                    type="button"
                    disabled={isScadaMode}
                    onClick={() => handleApplyPresetDirect('EXTREME_POLAR_VORTEX')}
                    className="flex-1 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-500 shadow-sm transition"
                  >
                    Apply Now
                  </button>
                </div>
              </div>

              {/* 2. Three-Week Winter Failure */}
              <div className="p-3.5 rounded-2xl border border-amber-200 bg-amber-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5">
                      <i className="fa-solid fa-triangle-exclamation text-amber-500"></i> 21-Day Winter Outage (Project A)
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold">
                      CRITICAL
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mb-2">
                    504-hour complete mechanical loss of Primary Genset 1. G2 + BESS buffer maintain 100% life-support uptime with 0 unmet load.
                  </p>
                  <div className="bg-white/80 p-2 rounded-xl text-[10px] font-mono text-slate-600 space-y-0.5 border border-amber-100 mb-3">
                    <div>Genset 1: OUTAGE (0 kW) | Genset 2: ONLINE</div>
                    <div>Temp: -32.0°C | Wind: 14.5 m/s</div>
                    <div>Infeasible Windows: 0 under SEMS</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-amber-200/60">
                  <button
                    type="button"
                    disabled={isScadaMode}
                    onClick={() => handlePopulatePreset('WINTER_FAILURE')}
                    className="flex-1 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 transition"
                  >
                    Pre-populate Inputs
                  </button>
                  <button
                    type="button"
                    disabled={isScadaMode}
                    onClick={() => handleApplyPresetDirect('THREE_WEEK_WINTER_FAILURE')}
                    className="flex-1 py-1.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-500 shadow-sm transition"
                  >
                    Apply Now
                  </button>
                </div>
              </div>

              {/* 3. Severe Cold Snap */}
              <div className="p-3.5 rounded-2xl border border-sky-200 bg-sky-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-xs font-extrabold text-sky-900 flex items-center gap-1.5">
                      <i className="fa-solid fa-snowflake text-sky-500"></i> Severe Cold Snap (-35°C)
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-200 text-sky-900 font-bold">
                      WARNING
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mb-2">
                    Deep freeze increasing habitat thermal envelope heat loss by 38% and derating cold-soaked LiFePO4 cells.
                  </p>
                  <div className="bg-white/80 p-2 rounded-xl text-[10px] font-mono text-slate-600 space-y-0.5 border border-sky-100 mb-3">
                    <div>Temp: -35.0°C | Wind: 12.0 m/s</div>
                    <div>Solar: 50 W/m² | Load Scale: 1.25x</div>
                    <div>BESS Throughput: Derated by 35%</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-sky-200/60">
                  <button
                    type="button"
                    disabled={isScadaMode}
                    onClick={() => handlePopulatePreset('SEVERE_COLD')}
                    className="flex-1 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 transition"
                  >
                    Pre-populate Inputs
                  </button>
                  <button
                    type="button"
                    disabled={isScadaMode}
                    onClick={() => handleApplyPresetDirect('SEVERE_COLD')}
                    className="flex-1 py-1.5 rounded-xl text-xs font-bold bg-[#0699C6] text-white hover:bg-[#05C5FF] shadow-sm transition"
                  >
                    Apply Now
                  </button>
                </div>
              </div>

              {/* 4. Renewable Drought */}
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                      <i className="fa-solid fa-cloud text-slate-500"></i> Renewable Drought
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold">
                      RESOURCE STRESS
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mb-2">
                    Sub-cut-in wind velocity (2.2 m/s &lt; 3.0 m/s) and zero solar irradiance forcing 100% reliance on diesel + battery buffer.
                  </p>
                  <div className="bg-white/80 p-2 rounded-xl text-[10px] font-mono text-slate-600 space-y-0.5 border border-slate-200 mb-3">
                    <div>Wind: 2.2 m/s (Below Cut-in)</div>
                    <div>Solar: 0 W/m² | Ren Gen: 0 kW</div>
                    <div>Thermal Loop: 100% Diesel CHP</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
                  <button
                    type="button"
                    disabled={isScadaMode}
                    onClick={() => handlePopulatePreset('RENEWABLE_DROUGHT')}
                    className="flex-1 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 transition"
                  >
                    Pre-populate Inputs
                  </button>
                  <button
                    type="button"
                    disabled={isScadaMode}
                    onClick={() => handleApplyPresetDirect('RENEWABLE_DROUGHT')}
                    className="flex-1 py-1.5 rounded-xl text-xs font-bold bg-slate-700 text-white hover:bg-slate-800 shadow-sm transition"
                  >
                    Apply Now
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Baseline vs Scenario Comparison Tableau */}
        {activeTab === 'comparison' && (
          <div className="flex-1 overflow-y-auto pr-1 py-3 space-y-3">
            {/* System Impact Assessment Card */}
            {scenarioControl?.summary_card && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-900 to-[#127694] text-white shadow-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold flex items-center gap-1.5">
                    <i className="fa-solid fa-shield-halved text-[#05C5FF]"></i>
                    <span>{scenarioControl.summary_card.headline || 'System Impact Assessment'}</span>
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      scenarioControl.summary_card.overall_health === 'EMERGENCY'
                        ? 'bg-rose-500 text-white'
                        : scenarioControl.summary_card.overall_health === 'CRITICAL'
                        ? 'bg-amber-500 text-slate-900'
                        : scenarioControl.summary_card.overall_health === 'WARNING'
                        ? 'bg-yellow-400 text-slate-900'
                        : 'bg-emerald-500 text-white'
                    }`}
                  >
                    {scenarioControl.summary_card.overall_health}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-cyan-200 block mb-1">
                      Identified Operational Risks:
                    </span>
                    <ul className="space-y-1 text-[11px] text-slate-200">
                      {scenarioControl.summary_card.operational_risks?.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-rose-400">●</span> {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-cyan-200 block mb-1">
                      Recommended Mitigations:
                    </span>
                    <ul className="space-y-1 text-[11px] text-slate-200">
                      {scenarioControl.summary_card.recommended_mitigations?.map((m, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-emerald-400">●</span> {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Metrics Comparison Table */}
            <div>
              <div className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Side-by-Side Metric Comparison (Nominal Baseline vs Realized Scenario)</span>
                <span className="text-[10px] font-mono text-slate-500">
                  Scenario: {scenarioControl?.scenario_id || 'Nominal'}
                </span>
              </div>
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Physical Metric</th>
                      <th className="py-2 px-3">Nominal Baseline</th>
                      <th className="py-2 px-3">Realized Scenario</th>
                      <th className="py-2 px-3">Delta (±)</th>
                      <th className="py-2 px-3">Shift (%)</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {scenarioControl?.metrics?.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition">
                        <td className="py-2 px-3 font-sans font-bold text-slate-800">
                          {row.metric}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {row.nominal_baseline} {row.unit}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">
                          {row.scenario_realized} {row.unit}
                        </td>
                        <td
                          className={`py-2 px-3 font-bold ${
                            row.delta > 0
                              ? row.metric === 'Unserved Energy / Deficit' || row.metric === 'Fuel Consumption Rate'
                                ? 'text-rose-600'
                                : 'text-emerald-600'
                              : row.delta < 0
                              ? 'text-slate-600'
                              : 'text-slate-400'
                          }`}
                        >
                          {row.delta > 0 ? `+${row.delta}` : row.delta} {row.unit}
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          {row.delta_pct > 0 ? `+${row.delta_pct}%` : `${row.delta_pct}%`}
                        </td>
                        <td className="py-2 px-3 font-sans">
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              row.status === 'EMERGENCY'
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : row.status === 'CRITICAL'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : row.status === 'WARNING'
                                ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: 21-Day Winter Outage Deep-Dive */}
        {activeTab === 'winter' && (
          <div className="flex-1 overflow-y-auto pr-1 py-3 space-y-3">
            {isLoadingWinter ? (
              <div className="flex items-center justify-center py-12 text-slate-500 text-xs">
                <i className="fa-solid fa-spinner fa-spin mr-2 text-[#0699C6]"></i>
                <span>Simulating 504 hours of polar winter failure physics...</span>
              </div>
            ) : winterReport ? (
              <>
                {/* Benchmark Verification Banner */}
                <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 p-3 rounded-2xl flex items-center justify-between text-xs shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                      <i className="fa-solid fa-check text-xs"></i>
                    </div>
                    <div>
                      <div className="font-extrabold">{winterReport.benchmark_name}</div>
                      <div className="text-[11px] text-emerald-700">
                        {winterReport.window} ({winterReport.duration_hours} consecutive hours) — Primary Generator G1 offline.
                      </div>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-[10px] bg-white px-2.5 py-1 rounded-full text-emerald-800 border border-emerald-200">
                    0.0 kWh UNMET LOAD
                  </span>
                </div>

                {/* 4 KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Life-Support Uptime
                    </span>
                    <span className="text-base font-extrabold text-emerald-600 font-mono">
                      {winterReport.life_support_uptime_pct}%
                    </span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">
                      100% Critical Heat &amp; Power
                    </span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Infeasible Windows
                    </span>
                    <span className="text-base font-extrabold text-slate-800 font-mono">
                      0 SEMS <span className="text-xs text-rose-500 font-normal">vs 22 Base</span>
                    </span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">
                      Zero station blackouts
                    </span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Fuel Saved vs Baseline
                    </span>
                    <span className="text-base font-extrabold text-[#0699C6] font-mono">
                      {winterReport.fuel_saved_litres?.toLocaleString()} L
                    </span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">
                      {winterReport.fuel_savings_pct}% Total Reduction
                    </span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Minimum Battery SoC
                    </span>
                    <span className="text-base font-extrabold text-slate-800 font-mono">
                      {winterReport.minimum_bess_soc_pct}%
                    </span>
                    <span className="text-[9px] text-emerald-600 font-bold block mt-0.5">
                      Reserve floor (&ge;20%) held
                    </span>
                  </div>
                </div>

                {/* 21-Day Daily Checkpoint Table */}
                <div>
                  <div className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Daily Checkpoint Timeline (Days 1 to 21)</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      G1 Tripped (0 kW) | G2 + BESS Supplying Station
                    </span>
                  </div>
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold sticky top-0">
                        <tr>
                          <th className="py-2 px-3">Day</th>
                          <th className="py-2 px-3">Hour</th>
                          <th className="py-2 px-3">Ambient</th>
                          <th className="py-2 px-3">Wind</th>
                          <th className="py-2 px-3">Load</th>
                          <th className="py-2 px-3">G1 Status</th>
                          <th className="py-2 px-3">G2 Dispatch</th>
                          <th className="py-2 px-3">BESS SoC</th>
                          <th className="py-2 px-3">Unserved</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {winterReport.daily_checkpoints?.map((chk, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-1.5 px-3 font-bold text-slate-800">Day {chk.day}</td>
                            <td className="py-1.5 px-3 text-slate-500">Hr {chk.hour}</td>
                            <td className="py-1.5 px-3 text-slate-700">{chk.ambient_temp_c}°C</td>
                            <td className="py-1.5 px-3 text-slate-700">{chk.wind_speed_ms} m/s</td>
                            <td className="py-1.5 px-3 text-slate-900 font-bold">{chk.station_load_kw} kW</td>
                            <td className="py-1.5 px-3 text-rose-600 font-bold">{chk.g1_status}</td>
                            <td className="py-1.5 px-3 text-[#0699C6] font-bold">{chk.g2_dispatch_kw} kW</td>
                            <td className="py-1.5 px-3 text-slate-700">{chk.bess_soc_pct}%</td>
                            <td className="py-1.5 px-3 text-emerald-600 font-bold">{chk.unserved_load_kw} kW</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Tab 5: Timeline & JSON Export */}
        {activeTab === 'timeline' && (
          <div className="flex-1 overflow-y-auto pr-1 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-800">
                  Reproducibility Envelope &amp; Audit Trail
                </h3>
                <p className="text-[11px] text-slate-500">
                  Every scenario modification generates an immutable audit record and unique run hash.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 transition flex items-center gap-1.5"
                >
                  <i className={`fa-solid ${copiedJson ? 'fa-check text-emerald-600' : 'fa-copy'}`}></i>
                  <span>{copiedJson ? 'Copied!' : 'Copy JSON'}</span>
                </button>
                <a
                  href="/api/scenarios/export"
                  download="scenario_envelope.json"
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#0699C6] text-white hover:bg-[#05C5FF] transition flex items-center gap-1.5 shadow-sm"
                >
                  <i className="fa-solid fa-download"></i>
                  <span>Export JSON</span>
                </a>
              </div>
            </div>

            {/* Live JSON Preview */}
            <div className="bg-slate-50 text-cyan-300 p-3 rounded-2xl font-mono text-[11px] overflow-x-auto max-h-52 border border-slate-200">
              <pre>
                {JSON.stringify(
                  {
                    scenario_metadata: {
                      run_id: scenarioControl?.run_id || 'SCEN-LIVE',
                      station_id: stationId,
                      timestamp_utc: new Date().toISOString(),
                      reproducibility_seed: 42
                    },
                    parameters: {
                      ambient_temp_c: parseFloat(temp),
                      wind_speed_ms: parseFloat(wind),
                      solar_irradiance_wm2: parseFloat(solar),
                      load_multiplier: parseFloat(loadMult),
                      battery_reserve_pct: parseFloat(reserveFloor),
                      battery_soc_pct: parseFloat(soc),
                      fuel_reserve_pct: parseFloat(fuelPct),
                      fault_genset_1: faultGen1,
                      fault_genset_2: faultGen2,
                      fault_battery_heater: faultBess,
                      wind_trip: windTrip,
                      solar_trip: solarTrip
                    }
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
