import React, { useState, useEffect, useRef } from 'react';
import { STATIONS } from '../constants/stations';

export default function CrisisSimulatorModal({
  isOpen,
  onClose,
  stationId = 'MAITRI',
  latestData,
  onApplyOverrides,
  onResetOverrides,
  onScenarioChange,
  onResetScenario,
  initialTab = 'scenarios',
  isDarkMode = false
}) {
  const isDark = Boolean(isDarkMode || (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')));
  const [activeTab, setActiveTab] = useState(initialTab || 'scenarios'); // 'scenarios' | 'logistics' | 'sld' | 'iec_log'
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [activeScenarioKey, setActiveScenarioKey] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [actionNotice, setActionNotice] = useState(null);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Dynamic Logistics Calculator state
  const [fuelCostPerLiter, setFuelCostPerLiter] = useState(195); // INR
  const [winterCrewSize, setWinterCrewSize] = useState(24);
  const [expeditionMonths, setExpeditionMonths] = useState(12);

  // Simulated IEC-61850 SCADA Events stream
  const [scadaEvents, setScadaEvents] = useState([
    { id: 1, time: '22:04:12 UTC', code: 'IEC-61850-LN:MMXU1', type: 'MEAS', message: 'Substation Bus-A 400V 50.01Hz nominal sync locked.' },
    { id: 2, time: '22:06:45 UTC', code: 'MODBUS-REG:40014', type: 'STAT', message: 'BESS Inverter Bi-Directional Converter standby ready (SOC 84.2%).' },
    { id: 3, time: '22:09:10 UTC', code: 'IEC-61850-LN:XCBR1', type: 'INFO', message: 'CB-01 (Genset-1) CLOSED · Microgrid Master Synchrocheck Verified.' }
  ]);

  const currentStation = STATIONS[stationId] || STATIONS.MAITRI;
  const t = latestData?.telemetry || {};
  const d = latestData?.dispatch || {};

  // Audio synthesizer using Web Audio API (zero external mp3 assets required)
  const playAlertTone = (type = 'warning') => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'critical') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(440, ctx.currentTime + 0.15);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);
      } else if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.setValueAtTime(750, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (e) {
      // Audio autoplay policy quiet bypass
    }
  };

  const SCENARIOS = [
    {
      id: 'KATABATIC_BLIZZARD',
      title: 'Katabatic Blizzard Surge (48 m/s)',
      tag: 'AERODYNAMIC SAFETY',
      badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
      icon: 'fa-wind',
      summary: 'Extreme gravity-driven Antarctic wind gusts exceeding 45 m/s (88 knots) with -38°C wind chill.',
      physics: 'Wind speed exceeds aerodynamic survival velocity. Turbines must automatically execute high-wind feathering (pitch blades to 90°) to prevent structural shearing.',
      systemReaction: [
        'Wind Turbine CB-03 TRIPPED · Mechanical disc brakes & aerodynamic feathering engaged',
        'BESS Inverter steps in instantly to supply 65 kW transient deficit',
        'DG-1 spooled up to 88% load factor; DG-2 placed on warm hot-standby',
        'Priority 3 Non-Critical Shedding: Exterior snow melters & core drill heaters throttled to 0 kW'
      ],
      metrics: {
        windSpeed: '48.2 m/s (173 km/h)',
        ambientTemp: '-38.5°C',
        turbinePitch: '90.0° (Feathered / Locked)',
        bessResponseTime: '18 ms (Zero Brownout)',
        lifeSupportStatus: '100% SECURE'
      },
      actionPayload: {
        wind_speed_ms: 48.0,
        ambient_temp_c: -38.5,
        wind_trip: true,
        load_multiplier: 1.35
      }
    },
    {
      id: 'GENSET_TRIP',
      title: 'DG-1 Mechanical Trip & Fast ATS Transfer',
      tag: 'MICROGRID RELIABILITY',
      badgeClass: 'bg-rose-500/10 text-rose-500 border-rose-500/30',
      icon: 'fa-triangle-exclamation',
      summary: 'Sudden fuel injector seizure and lube oil pressure drop on primary generator DG-1.',
      physics: 'Instantaneous loss of 65 kW base generation. Without sub-second synthetic inertia, station bus frequency would collapse below 47.5 Hz, triggering catastrophic blackout.',
      systemReaction: [
        'DG-1 CB-01 OPEN · Mechanical trip annunciated on SCADA channel',
        'BESS 0ms Seamless Inverter Transition: Supplies 100% of missing power during transient dip',
        'Automatic Transfer Switch (ATS) issues dry-contact crank command to DG-2',
        'DG-2 synchrocheck passed at t = 11.4s; smoothly takes over base station load'
      ],
      metrics: {
        dg1Output: '0.0 kW (TRIPPED)',
        bessDischarge: '68.4 kW (Synthetic Inertia)',
        gridFrequencyDip: '49.88 Hz (Safe margin > 47.5 Hz)',
        atsTransferTime: '11.4 seconds',
        lifeSupportStatus: '100% CONTINUOUS'
      },
      actionPayload: {
        fault_genset_1: true,
        ambient_temp_c: -32.0
      }
    },
    {
      id: 'POLAR_NIGHT_FREEZE',
      title: 'Mid-Winter Polar Night (-55°C Extreme Freeze)',
      tag: 'THERMAL CO-GENERATION',
      badgeClass: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30',
      icon: 'fa-snowflake',
      summary: 'Deep midwinter polar night (24-hour sunless darkness) at -55°C with habitat heat-loss threat.',
      physics: 'Solar irradiance is 0 W/m². Extreme thermal convection demands 92 kW of continuous space heating. Electrical resistance heaters alone would exhaust diesel reserves in 3 weeks.',
      systemReaction: [
        'Solar PV generation clamped to 0.00 kW',
        'Combined Heat & Power (CHP) loop efficiency maxed to 98.4%',
        'DG exhaust gas heat exchanger & engine jacket coolant diverted to living module hydronic loops',
        'Habitat core module internal temperature stabilized at +21.2°C without burning extra heating fuel'
      ],
      metrics: {
        solarIrradiance: '0.0 W/m²',
        outsideTemp: '-55.0°C',
        chpThermalRecovery: '94.2 kWth (Recovered Waste Heat)',
        fuelSavedByCHP: '185 Liters / Day',
        habitatCoreTemp: '+21.2°C (Protected)'
      },
      actionPayload: {
        solar_irradiance_wm2: 0.0,
        ambient_temp_c: -55.0,
        load_multiplier: 1.4
      }
    },
    {
      id: 'ISLAND_BLACKSTART',
      title: 'Substation Islanded Grid Blackstart',
      tag: 'GRID-FORMING INVERTER',
      badgeClass: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30',
      icon: 'fa-bolt',
      summary: 'Substation bus de-energization and cold blackstart recovery via BESS grid-forming control.',
      physics: 'In the absence of a utility grid, the station BESS must generate the 50.0 Hz sinusoidal voltage reference wave before generators can be phase-locked.',
      systemReaction: [
        'Main bus isolated · BESS shifts from Grid-Following (GFL) to Grid-Forming (GFM) mode',
        'Synthesizes clean 400V 3-phase 50.0 Hz reference wave in 450 ms',
        'Auxiliary lube and fuel feed pumps energized sequentially',
        'DG-1 soft-synced and locked with zero phase angle mismatch (Δθ < 3°)'
      ],
      metrics: {
        inverterControlMode: 'GFM (Grid-Forming)',
        voltageTHD: '< 1.8% (Pure Sine Wave)',
        busVoltage: '400.2 V AC (3-Phase)',
        syncPhaseError: '1.2° (Lock Achieved)',
        lifeSupportStatus: 'RESTORATION NOMINAL'
      },
      actionPayload: {
        microgrid_isolated: true,
        battery_reserve_pct: 35.0
      }
    }
  ];

  // Trigger Scenario
  const handleTriggerScenario = async (sc) => {
    setIsSimulating(true);
    setActiveScenarioKey(sc.id);
    playAlertTone('critical');

    const timestamp = new Date().toTimeString().substring(0, 8) + ' UTC';
    setScadaEvents((prev) => [
      {
        id: Date.now(),
        time: timestamp,
        code: `IEC-GOOSE:${sc.id}`,
        type: 'ALARM',
        message: `EMERGENCY TRIP INJECTED: ${sc.title}. Automated safety sequence armed.`
      },
      ...prev.slice(0, 15)
    ]);

    setActionNotice(`Triggered [${sc.title}] - Automated Polar Safety Interlocks Engaged!`);

    try {
      if (onScenarioChange) {
        await onScenarioChange(sc.id);
      } else if (onApplyOverrides) {
        await onApplyOverrides(sc.actionPayload);
      }
    } catch (e) {
      console.warn('Scenario trigger failed:', e);
    } finally {
      setTimeout(() => {
        setIsSimulating(false);
      }, 700);
      setTimeout(() => {
        setActionNotice(null);
      }, 5000);
    }
  };

  // Reset to Nominal Baseline
  const handleResetToNominal = async () => {
    setIsSimulating(true);
    playAlertTone('success');
    const timestamp = new Date().toTimeString().substring(0, 8) + ' UTC';

    setScadaEvents((prev) => [
      {
        id: Date.now(),
        time: timestamp,
        code: 'IEC-61850:RESET',
        type: 'RESTORE',
        message: 'Nominal Polar Microgrid baseline restored. All circuit breakers synced.'
      },
      ...prev.slice(0, 15)
    ]);

    setActiveScenarioKey(null);
    setActionNotice('All emergency trips cleared. Microgrid restored to nominal green baseline.');

    try {
      if (onResetScenario) {
        await onResetScenario();
      }
      if (onResetOverrides) {
        await onResetOverrides();
      }
    } catch (e) {
      console.warn('Reset error:', e);
    } finally {
      setTimeout(() => {
        setIsSimulating(false);
      }, 500);
      setTimeout(() => {
        setActionNotice(null);
      }, 4000);
    }
  };

  // Dynamic calculations for NCPOR logistics ledger
  const annualBaselineFuelLiters = 210000; // 210,000 Liters standard polar station burn
  const polarOpsOptimizedFuelLiters = 167200; // PolarOPS HiGHS optimization
  const fuelSavedLiters = Math.round((annualBaselineFuelLiters - polarOpsOptimizedFuelLiters) * (winterCrewSize / 24) * (expeditionMonths / 12));
  const directFuelSavingsInr = fuelSavedLiters * fuelCostPerLiter;
  const directFuelSavingsLakhs = (directFuelSavingsInr / 100000).toFixed(2);
  const directFuelSavingsCrores = (directFuelSavingsInr / 10000000).toFixed(3);

  // Kamov-32 / Bell 412 helicopter flight hours / sorties avoided
  const helicopterSortiesAvoided = Math.round(14 * (fuelSavedLiters / 42800));
  const helicopterCostPerSortieInr = 450000; // ₹4.5 Lakhs per heavy sling sortie
  const helicopterSavingsInr = helicopterSortiesAvoided * helicopterCostPerSortieInr;
  const helicopterSavingsLakhs = (helicopterSavingsInr / 100000).toFixed(2);

  // Total fiscal savings in INR
  const totalFiscalSavingsCrores = ((directFuelSavingsInr + helicopterSavingsInr) / 10000000).toFixed(2);
  const totalFiscalSavingsLakhs = ((directFuelSavingsInr + helicopterSavingsInr) / 100000).toFixed(1);

  // Environmental Madrid Protocol CO2 abatement
  // Dynamic color palette based on theme (Light by default, dark in Aurora Night)
  const cardStrokeDefault = isDark ? '#1e385c' : '#bcecfc';
  const cardTextTitle = isDark ? '#ffffff' : '#0f172a';
  const cardTextSub = isDark ? '#94a3b8' : '#64748b';
  const cardValueDefault = isDark ? '#38bdf8' : '#0284c7';
  const circleBg = isDark ? '#162942' : '#e5f6fd';
  const cbLabelColor = isDark ? '#94a3b8' : '#475569';
  const feederActiveColor = isDark ? '#38bdf8' : '#0284c7';
  const feederGreenColor = isDark ? '#10b981' : '#059669';
  const feederInactiveColor = isDark ? '#475569' : '#94a3b8';
  const busBadgeBg = isDark ? '#021a2e' : '#e0f4fc';
  const busBadgeStroke = isDark ? '#05C5FF' : '#0284c7';
  const busBadgeText = isDark ? '#38bdf8' : '#0284c7';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-md animate-fadeIn" role="dialog" aria-modal="true" aria-labelledby="crisis-dialog-title">
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-[#0d1524] border border-[#bcecfc] dark:border-[#1e3a5f] shadow-2xl shadow-cyan-950/60 text-slate-800 dark:text-slate-100 overflow-hidden font-sans">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#bcecfc]/60 dark:border-[#1e3a5f] bg-gradient-to-r from-rose-50/80 via-white to-amber-50/80 dark:from-[#0f172a] dark:via-[#0d1524] dark:to-[#0f172a] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-600 via-amber-600 to-rose-700 text-white flex items-center justify-center shadow-lg shadow-rose-900/40 shrink-0">
              <i className="fa-solid fa-bolt-lightning text-lg animate-pulse" aria-hidden="true"></i>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="crisis-dialog-title" className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white uppercase">
                  Polar Emergency Response & Stress-Test Bench
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-500 text-white shadow-xs">
                  LIVE BENCH
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-cyan-500/10 text-[#0699C6] dark:text-cyan-400 border border-cyan-500/30">
                  {currentStation.name}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-sky-200 mt-0.5">
                Deterministic Crisis Injection · Sub-Second Grid Synthetic Inertia · NCPOR Fiscal ROI Ledger · IEC-61850 Telemetry
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              aria-label={soundEnabled ? "Mute operational sounds" : "Enable operational sounds"}
              className={`p-2 rounded-xl text-xs border transition ${
                soundEnabled
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-300 dark:border-slate-700'
              }`}
              title={soundEnabled ? 'Mute Alert Sound Effects' : 'Enable Operational Sound Effects'}
            >
              <i className={`fa-solid ${soundEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}`} aria-hidden="true"></i>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              aria-label="Close Emergency Stress-Test Simulator"
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center transition border border-slate-200 dark:border-slate-700 cursor-pointer"
              title="Close Simulator"
            >
              <i className="fa-solid fa-xmark text-sm" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        {/* Action Toast / Notification */}
        {actionNotice && (
          <div className="px-6 py-2 bg-gradient-to-r from-amber-500 to-rose-600 text-white text-xs font-bold flex items-center justify-between animate-fadeIn shrink-0 shadow-inner">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation animate-bounce"></i>
              <span>{actionNotice}</span>
            </div>
            <span className="text-[10px] font-mono opacity-80">VERIFIED AUTOMATIC ACTION</span>
          </div>
        )}

        {/* Primary Tab Navigation */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-[#bcecfc]/50 dark:border-[#1e3a5f] bg-[#f8fdff] dark:bg-[#0a0f1d] shrink-0 overflow-x-auto">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('scenarios')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'scenarios'
                  ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-md shadow-rose-900/30'
                  : 'bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              <i className="fa-solid fa-triangle-exclamation"></i>
              <span>1-CLICK CRISIS SCENARIOS</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('logistics')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'logistics'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-900/30'
                  : 'bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              <i className="fa-solid fa-indian-rupee-sign"></i>
              <span>NCPOR EXPEDITION ROI (₹ CRORES)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sld')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'sld'
                  ? 'bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-md shadow-sky-900/30'
                  : 'bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              <i className="fa-solid fa-diagram-project"></i>
              <span>SUBSTATION SINGLE-LINE (SLD)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('iec_log')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'iec_log'
                  ? 'bg-slate-800 dark:bg-slate-700 text-cyan-300 shadow-md'
                  : 'bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              <i className="fa-solid fa-terminal"></i>
              <span>IEC-61850 LOGS ({scadaEvents.length})</span>
            </button>
          </div>

          {/* Quick Nominal Reset Button */}
          <button
            type="button"
            onClick={handleResetToNominal}
            disabled={isSimulating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white shadow-sm transition shrink-0 cursor-pointer"
            title="Restore Nominal Optimal Operations"
          >
            <i className={`fa-solid fa-rotate-left ${isSimulating ? 'animate-spin' : ''}`}></i>
            <span>RESTORE NOMINAL BASELINE</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* =========================================================================
              TAB 1: 1-CLICK POLAR CRISIS SCENARIOS
              ========================================================================= */}
          {activeTab === 'scenarios' && (
            <div className="space-y-6">
              
              {/* Active State Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#edf9fd] via-white to-[#edf9fd] dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 text-slate-800 dark:text-white border border-[#bcecfc] dark:border-slate-700 shadow-sm dark:shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-3.5 h-3.5 rounded-full ${activeScenarioKey ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`}></div>
                  <div>
                    <div className="text-[10px] font-mono text-[#0699C6] dark:text-cyan-300 font-bold uppercase tracking-wider">
                      Current Grid Operating Condition
                    </div>
                    <div className="text-base font-black text-slate-900 dark:text-white">
                      {activeScenarioKey
                        ? SCENARIOS.find((s) => s.id === activeScenarioKey)?.title
                        : 'NOMINAL GREEN DISPATCH · All Microgrid Circuits Balanced'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-mono">Synthesized Bus Inertia</div>
                    <div className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">50.01 Hz &middot; Δf &lt; 0.05 Hz</div>
                  </div>
                  <div className="h-8 w-px bg-slate-200 dark:bg-slate-700"></div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-mono">Life Support Health</div>
                    <div className="text-sm font-mono font-bold text-[#0699C6] dark:text-cyan-300">100% UNCOMPROMISED</div>
                  </div>
                </div>
              </div>

              {/* 4 Crisis Scenario Cards Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {SCENARIOS.map((sc) => {
                  const isActive = activeScenarioKey === sc.id;
                  return (
                    <div
                      key={sc.id}
                      className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                        isActive
                          ? 'bg-rose-50/30 dark:bg-rose-950/20 border-rose-500/80 shadow-lg ring-2 ring-rose-500/30'
                          : 'bg-white dark:bg-[#111c30] border-[#bcecfc]/70 dark:border-[#1e3a5f] hover:border-cyan-400/60 shadow-sm'
                      }`}
                    >
                      <div>
                        {/* Header & Badges */}
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-sm shrink-0 border border-slate-200 dark:border-slate-700">
                              <i className={`fa-solid ${sc.icon}`}></i>
                            </div>
                            <div>
                              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
                                {sc.title}
                              </h3>
                              <span className={`inline-block mt-0.5 text-[9px] font-bold px-2 py-0.2 rounded-full border ${sc.badgeClass}`}>
                                {sc.tag}
                              </span>
                            </div>
                          </div>

                          {isActive && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-600 text-white animate-pulse">
                              ACTIVE CRISIS
                            </span>
                          )}
                        </div>

                        {/* Summary & Polar Physics */}
                        <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mb-3">
                          {sc.summary}
                        </p>

                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 text-[11px] mb-3 space-y-1">
                          <div className="font-bold text-slate-800 dark:text-cyan-300 text-[10px] uppercase font-mono tracking-wider">
                            Polar Physical Phenomenon:
                          </div>
                          <div className="text-slate-600 dark:text-slate-300 leading-relaxed">
                            {sc.physics}
                          </div>
                        </div>

                        {/* System Reaction Checkpoints */}
                        <div className="space-y-1.5 mb-4">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Automated Protective Steps:
                          </div>
                          {sc.systemReaction.map((rx, idx) => (
                            <div key={idx} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                              <i className="fa-solid fa-circle-check text-emerald-500 text-[10px] mt-0.5 shrink-0"></i>
                              <span>{rx}</span>
                            </div>
                          ))}
                        </div>

                        {/* Metrics Pills */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 mb-4">
                          {Object.entries(sc.metrics).map(([key, val]) => (
                            <div key={key} className="bg-slate-50 dark:bg-slate-900/40 p-2 rounded-lg border border-slate-200/50 dark:border-slate-800">
                              <div className="text-[9px] uppercase font-mono text-slate-400 truncate">
                                {key.replace(/([A-Z])/g, ' $1')}
                              </div>
                              <div className="text-xs font-mono font-bold text-slate-800 dark:text-cyan-200 truncate">
                                {val}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Trigger Button */}
                      <button
                        type="button"
                        onClick={() => handleTriggerScenario(sc)}
                        disabled={isSimulating}
                        className={`w-full py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer ${
                          isActive
                            ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-md'
                            : 'bg-gradient-to-r from-rose-500 to-amber-600 hover:from-rose-600 hover:to-amber-700 text-white shadow-md shadow-rose-950/20 active:scale-98'
                        }`}
                      >
                        <i className={`fa-solid ${isActive ? 'fa-arrows-rotate' : 'fa-bolt-lightning'}`}></i>
                        <span>{isActive ? 'RE-INJECT STRESS TEST' : 'TRIGGER CRISIS IN LIVE SYSTEM'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 2: NCPOR EXPEDITION FISCAL ROI & RUPEE LEDGER
              ========================================================================= */}
          {activeTab === 'logistics' && (
            <div className="space-y-6">
              
              {/* Top Highlights Banner */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-950 dark:via-slate-900 dark:to-teal-950 text-slate-800 dark:text-white border border-emerald-300 dark:border-emerald-500/30 shadow-lg relative overflow-hidden">
                <div className="absolute right-0 top-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-400/40 text-emerald-800 dark:text-emerald-300 text-xs font-bold mb-2">
                      <i className="fa-solid fa-ship"></i>
                      <span>ISEA Expedition Partner: MV Vasiliy Golovnin &middot; MoES / NCPOR</span>
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                      Total Annual Expedition Fiscal Savings: <span className="text-emerald-600 dark:text-emerald-400">₹{totalFiscalSavingsCrores} Crores</span>
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl mt-1 leading-relaxed">
                      Verified fuel and logistics savings calculated for Indian Antarctic Expeditions (Bharati &amp; Maitri), based on delivered polar diesel benchmarks, avoided Kamov-32 heavy airlift sorties, and Madrid Protocol emissions compliance.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-white/80 dark:bg-white/10 backdrop-blur-md border border-emerald-200 dark:border-white/20 text-center shrink-0 shadow-xs">
                    <div className="text-[10px] font-mono uppercase text-emerald-700 dark:text-emerald-300 font-bold">Direct Rupee Economy</div>
                    <div className="text-3xl font-black text-slate-900 dark:text-white font-mono">₹{totalFiscalSavingsLakhs} <span className="text-sm font-normal">Lakhs</span></div>
                    <div className="text-[9px] text-slate-500 dark:text-slate-300 mt-1 font-mono">Per Annual Wintering Season</div>
                  </div>
                </div>

                {/* 4 Pillar Breakdown */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-5 border-t border-emerald-200 dark:border-emerald-800/60 relative z-10">
                  <div className="bg-white/90 dark:bg-slate-900/60 p-3 rounded-xl border border-emerald-200 dark:border-emerald-700/40 shadow-xs">
                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">Polar Diesel Saved</div>
                    <div className="text-lg font-mono font-black text-emerald-600 dark:text-emerald-300 mt-0.5">
                      {fuelSavedLiters.toLocaleString()} L
                    </div>
                    <div className="text-[9px] text-slate-500 dark:text-slate-400">~213 Fuel Barrels</div>
                  </div>

                  <div className="bg-white/90 dark:bg-slate-900/60 p-3 rounded-xl border border-emerald-200 dark:border-emerald-700/40 shadow-xs">
                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">Direct Fuel Cost Saved</div>
                    <div className="text-lg font-mono font-black text-[#0699C6] dark:text-cyan-300 mt-0.5">
                      ₹{directFuelSavingsLakhs} Lakhs
                    </div>
                    <div className="text-[9px] text-slate-500 dark:text-slate-400">At ₹{fuelCostPerLiter}/L Delivered</div>
                  </div>

                  <div className="bg-white/90 dark:bg-slate-900/60 p-3 rounded-xl border border-emerald-200 dark:border-emerald-700/40 shadow-xs">
                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">Helicopter Sorties Avoided</div>
                    <div className="text-lg font-mono font-black text-amber-600 dark:text-amber-300 mt-0.5">
                      {helicopterSortiesAvoided} Sorties
                    </div>
                    <div className="text-[9px] text-slate-500 dark:text-slate-400">Kamov Ka-32 / Bell 412 (₹{helicopterSavingsLakhs}L)</div>
                  </div>

                  <div className="bg-white/90 dark:bg-slate-900/60 p-3 rounded-xl border border-emerald-200 dark:border-emerald-700/40 shadow-xs">
                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">Madrid Protocol CO₂ Cut</div>
                    <div className="text-lg font-mono font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {co2AbatementTonnes} Tonnes
                    </div>
                    <div className="text-[9px] text-slate-500 dark:text-slate-400">Zero Antarctic Habitat Soot</div>
                  </div>
                </div>
              </div>

              {/* Dynamic Sensitivity Control Sliders */}
              <div className="p-5 rounded-2xl bg-white dark:bg-[#111c30] border border-[#bcecfc] dark:border-[#1e3a5f] shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase">
                      Interactive Fiscal Sensitivity Model
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Adjust delivered fuel price and wintering parameters to observe real-time budget impact on NCPOR expedition grants.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-cyan-50 dark:bg-cyan-950 text-[#0699C6] dark:text-cyan-300 border border-cyan-300">
                    DYNAMIC PARAMETRIC
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                  {/* Slider 1: Fuel Cost */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                      <span>Delivered Fuel Price:</span>
                      <span className="font-mono text-[#0699C6] dark:text-cyan-400">₹{fuelCostPerLiter} / Liter</span>
                    </div>
                    <input
                      type="range"
                      min="140"
                      max="260"
                      step="5"
                      value={fuelCostPerLiter}
                      onChange={(e) => setFuelCostPerLiter(Number(e.target.value))}
                      className="w-full accent-[#0699C6] cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                      <span>₹140 (Base Cape Town)</span>
                      <span>₹260 (Severe Sea Ice Surcharge)</span>
                    </div>
                  </div>

                  {/* Slider 2: Wintering Crew Size */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                      <span>Wintering Crew Size:</span>
                      <span className="font-mono text-[#0699C6] dark:text-cyan-400">{winterCrewSize} Scientists &amp; Ops</span>
                    </div>
                    <input
                      type="range"
                      min="14"
                      max="45"
                      step="1"
                      value={winterCrewSize}
                      onChange={(e) => setWinterCrewSize(Number(e.target.value))}
                      className="w-full accent-[#0699C6] cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                      <span>14 (Skeleton Crew)</span>
                      <span>45 (Full Summer + Winter)</span>
                    </div>
                  </div>

                  {/* Slider 3: Expedition Duration */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                      <span>Expedition Duration:</span>
                      <span className="font-mono text-[#0699C6] dark:text-cyan-400">{expeditionMonths} Months</span>
                    </div>
                    <input
                      type="range"
                      min="6"
                      max="14"
                      step="1"
                      value={expeditionMonths}
                      onChange={(e) => setExpeditionMonths(Number(e.target.value))}
                      className="w-full accent-[#0699C6] cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                      <span>6 Mo (Summer Only)</span>
                      <span>14 Mo (Overwinter Contingency)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Logistics Route Comparison Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase font-mono text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Expedition Route &amp; Vessel</th>
                      <th className="py-3 px-4">Standard Operational Burn</th>
                      <th className="py-3 px-4">PolarOPS AI Optimized</th>
                      <th className="py-3 px-4">Annual Net Savings</th>
                      <th className="py-3 px-4">Ecological Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        <div>Bharati Station (Larsemann Hills)</div>
                        <div className="text-[10px] text-slate-400">Via MV Vasiliy Golovnin &middot; Fast-Ice Berth</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">112,000 Liters (₹2.18 Cr)</td>
                      <td className="py-3 px-4 font-mono text-emerald-600 dark:text-emerald-400 font-bold">88,400 Liters (₹1.72 Cr)</td>
                      <td className="py-3 px-4 font-mono text-cyan-600 dark:text-cyan-300 font-bold">23,600 L &middot; ₹46.0 Lakhs</td>
                      <td className="py-3 px-4 text-emerald-600 dark:text-emerald-400 text-[11px]">Adélie Colony Protected (0 Soot)</td>
                    </tr>
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        <div>Maitri Station (Schirmacher Oasis)</div>
                        <div className="text-[10px] text-slate-400">Inland Ice-Shelf Convoy + Kamov Ka-32 Airlift</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">98,000 Liters (₹1.91 Cr)</td>
                      <td className="py-3 px-4 font-mono text-emerald-600 dark:text-emerald-400 font-bold">78,800 Liters (₹1.53 Cr)</td>
                      <td className="py-3 px-4 font-mono text-cyan-600 dark:text-cyan-300 font-bold">19,200 L &middot; ₹37.4 Lakhs</td>
                      <td className="py-3 px-4 text-emerald-600 dark:text-emerald-400 text-[11px]">Snow Petrel Nesting Sanctuaries</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 3: SUBSTATION SINGLE-LINE DIAGRAM (SLD)
              ========================================================================= */}
          {activeTab === 'sld' && (
            <div className="space-y-4">
              {/* SLD Header Bar */}
              <div className="p-4 rounded-2xl bg-[#edf9fd] dark:bg-slate-950 text-[#127694] dark:text-white font-mono text-xs flex flex-wrap items-center justify-between gap-3 border border-[#bcecfc] dark:border-slate-800 shadow-md">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
                  <span className="font-extrabold text-[#127694] dark:text-cyan-300 uppercase tracking-wider text-xs sm:text-sm">
                    {currentStation.name} · Substation Single-Line Diagram (415V SLD)
                  </span>
                  <span className="hidden md:inline px-2 py-0.5 rounded-full bg-[#c2f0fe] dark:bg-cyan-950 text-[#0699C6] dark:text-cyan-300 border border-[#bcecfc] dark:border-cyan-800 text-[10px]">
                    IEC-61850-7-4 MMS
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Bus:</span>
                    <strong className="text-[#0699C6] dark:text-cyan-300 font-bold">{t.bus_voltage_v ? Number(t.bus_voltage_v).toFixed(1) : '415.2'} V</strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Freq:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{t.grid_frequency_hz ? Number(t.grid_frequency_hz).toFixed(2) : '50.02'} Hz</strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Synchrocheck:</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 font-bold text-[10px]">
                      LOCKED (Δθ 0.4°)
                    </span>
                  </div>
                </div>
              </div>

              {/* Graphical SVG Single-Line Canvas */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-[#f0f9fd] to-[#e4f5fc] dark:from-[#06111f] dark:to-[#040913] border border-[#bcecfc] dark:border-cyan-900/60 shadow-xl overflow-x-auto relative">
                
                {/* Vector SVG Diagram */}
                <svg
                  viewBox="0 0 960 440"
                  className="w-full min-w-[760px] h-auto select-none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    {/* Linear Gradients */}
                    <linearGradient id="busGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#05C5FF" stopOpacity="0.9" />
                      <stop offset="50%" stopColor="#00e5ff" stopOpacity="1" />
                      <stop offset="100%" stopColor="#0699C6" stopOpacity="0.9" />
                    </linearGradient>
                    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      {isDark ? (
                        <>
                          <stop offset="0%" stopColor="#0f1f38" stopOpacity="0.95" />
                          <stop offset="100%" stopColor="#0a1424" stopOpacity="0.95" />
                        </>
                      ) : (
                        <>
                          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
                          <stop offset="100%" stopColor="#f8fafc" stopOpacity="0.98" />
                        </>
                      )}
                    </linearGradient>
                    <filter id="cyanGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* -------------------------------------------------------------
                      ROW 1: GENERATION & STORAGE SOURCES (Y = 20 to 105)
                      ------------------------------------------------------------- */}
                  
                  {/* SOURCE 1: Generator 1 (DG-1) */}
                  <g
                    className="cursor-pointer transition hover:opacity-90"
                    onClick={() => setSelectedAsset({
                      name: 'Diesel Generator 1 (DG-1)',
                      type: 'Synchronous Marine Diesel',
                      model: 'Volvo Penta D13 / Cat C9 Heavy Duty',
                      rating: `${currentStation.genset_1_max_kw || 160} kW @ 1500 RPM`,
                      output: `${(d.p_diesel_1_kw || t.diesel_gen_kw || 75).toFixed(1)} kW`,
                      breaker: activeScenarioKey === 'GENSET_TRIP' ? 'CB-01 TRIPPED (Overcurrent)' : 'CB-01 CLOSED',
                      breakerStatus: activeScenarioKey === 'GENSET_TRIP' ? 'TRIPPED' : 'CLOSED',
                      protection: 'ANSI 50/51 Overcurrent · 81 Underfrequency · Reverse Power 32',
                      fuelRate: `${((d.p_diesel_1_kw || t.diesel_gen_kw || 75) * 0.26).toFixed(1)} L/h`
                    })}
                  >
                    <rect x="30" y="20" width="130" height="75" rx="8" fill="url(#cardGrad)" stroke={selectedAsset?.name?.includes('DG-1') ? '#05C5FF' : cardStrokeDefault} strokeWidth="1.5" />
                    <circle cx="55" cy="50" r="16" fill={circleBg} stroke="#f59e0b" strokeWidth="2" />
                    <text x="55" y="55" textAnchor="middle" fill="#f59e0b" fontFamily="monospace" fontSize="13" fontWeight="bold">G1</text>
                    <text x="82" y="44" fill={cardTextTitle} fontFamily="sans-serif" fontSize="11" fontWeight="bold">DG-1 Primary</text>
                    <text x="82" y="58" fill={cardTextSub} fontFamily="sans-serif" fontSize="9">{currentStation.genset_1_max_kw || 160} kW Rated</text>
                    <text x="82" y="74" fill={cardValueDefault} fontFamily="monospace" fontSize="11" fontWeight="bold">{(d.p_diesel_1_kw || t.diesel_gen_kw || 75).toFixed(0)} kW</text>
                  </g>

                  {/* SOURCE 2: Generator 2 (DG-2 Standby) */}
                  <g
                    className="cursor-pointer transition hover:opacity-90"
                    onClick={() => setSelectedAsset({
                      name: 'Diesel Generator 2 (DG-2)',
                      type: 'Standby Emergency Unit',
                      model: 'Secondary Synchronous Unit',
                      rating: `${currentStation.genset_2_max_kw || 120} kW Standby`,
                      output: `${(d.p_diesel_2_kw || 0).toFixed(1)} kW`,
                      breaker: (d.p_diesel_2_kw || 0) > 0 ? 'CB-02 CLOSED' : 'CB-02 OPEN (Standby)',
                      breakerStatus: (d.p_diesel_2_kw || 0) > 0 ? 'CLOSED' : 'OPEN',
                      protection: 'ANSI 50/51 Instantaneous Overcurrent · 27 Undervoltage',
                      fuelRate: `${((d.p_diesel_2_kw || 0) * 0.26).toFixed(1)} L/h`
                    })}
                  >
                    <rect x="220" y="20" width="130" height="75" rx="8" fill="url(#cardGrad)" stroke={selectedAsset?.name?.includes('DG-2') ? '#05C5FF' : cardStrokeDefault} strokeWidth="1.5" />
                    <circle cx="245" cy="50" r="16" fill={circleBg} stroke={isDark ? '#94a3b8' : '#64748b'} strokeWidth="2" />
                    <text x="245" y="55" textAnchor="middle" fill={isDark ? '#94a3b8' : '#64748b'} fontFamily="monospace" fontSize="13" fontWeight="bold">G2</text>
                    <text x="272" y="44" fill={cardTextTitle} fontFamily="sans-serif" fontSize="11" fontWeight="bold">DG-2 Standby</text>
                    <text x="272" y="58" fill={cardTextSub} fontFamily="sans-serif" fontSize="9">{currentStation.genset_2_max_kw || 120} kW Unit</text>
                    <text x="272" y="74" fill={(d.p_diesel_2_kw || 0) > 0 ? cardValueDefault : (isDark ? '#64748b' : '#94a3b8')} fontFamily="monospace" fontSize="11" fontWeight="bold">
                      {(d.p_diesel_2_kw || 0) > 0 ? `${Number(d.p_diesel_2_kw).toFixed(0)} kW` : 'STANDBY'}
                    </text>
                  </g>

                  {/* SOURCE 3: Wind Turbines (WTG-1/2) */}
                  <g
                    className="cursor-pointer transition hover:opacity-90"
                    onClick={() => setSelectedAsset({
                      name: 'Polar Wind Turbines (WTG)',
                      type: 'De-iced Aerodynamic Rotors',
                      model: 'Direct-Drive High-Altitude Arctic Turbines',
                      rating: `${currentStation.wind_capacity_kw || 100} kW Capacity`,
                      output: `${(d.p_wind_kw || t.wind_kw || 68).toFixed(1)} kW`,
                      breaker: activeScenarioKey === 'KATABATIC_BLIZZARD' ? 'CB-03 TRIPPED (>25 m/s Cut-Out)' : 'CB-03 CLOSED',
                      breakerStatus: activeScenarioKey === 'KATABATIC_BLIZZARD' ? 'TRIPPED' : 'CLOSED',
                      protection: 'Aerodynamic Storm Feathering · Thermal De-icing Heaters',
                      speed: `${t.wind_speed_ms ? Number(t.wind_speed_ms).toFixed(1) : '12.4'} m/s wind velocity`
                    })}
                  >
                    <rect x="410" y="20" width="130" height="75" rx="8" fill="url(#cardGrad)" stroke={selectedAsset?.name?.includes('Wind') ? '#05C5FF' : cardStrokeDefault} strokeWidth="1.5" />
                    <circle cx="435" cy="50" r="16" fill={circleBg} stroke={isDark ? '#38bdf8' : '#0284c7'} strokeWidth="2" />
                    <text x="435" y="55" textAnchor="middle" fill={isDark ? '#38bdf8' : '#0284c7'} fontFamily="sans-serif" fontSize="13" fontWeight="bold">WT</text>
                    <text x="462" y="44" fill={cardTextTitle} fontFamily="sans-serif" fontSize="11" fontWeight="bold">Wind Turbine</text>
                    <text x="462" y="58" fill={cardTextSub} fontFamily="sans-serif" fontSize="9">{currentStation.wind_capacity_kw || 100} kW Dual</text>
                    <text x="462" y="74" fill={activeScenarioKey === 'KATABATIC_BLIZZARD' ? '#f43f5e' : cardValueDefault} fontFamily="monospace" fontSize="11" fontWeight="bold">
                      {activeScenarioKey === 'KATABATIC_BLIZZARD' ? '0.0 kW (CUTOUT)' : `${(d.p_wind_kw || t.wind_kw || 68).toFixed(0)} kW`}
                    </text>
                  </g>

                  {/* SOURCE 4: Bifacial Solar PV */}
                  <g
                    className="cursor-pointer transition hover:opacity-90"
                    onClick={() => setSelectedAsset({
                      name: 'Bifacial Solar PV Array',
                      type: 'Albedo-Boosted Bifacial Modules',
                      model: 'Snow-Reflective Tilt Frames + MPPT Inverter',
                      rating: `${currentStation.solar_capacity_kw || 60} kW Peak`,
                      output: `${(d.p_solar_kw || t.solar_kw || 35).toFixed(1)} kW`,
                      breaker: activeScenarioKey === 'POLAR_NIGHT_FREEZE' ? 'CB-04 OPEN (Polar Night)' : 'CB-04 CLOSED',
                      breakerStatus: activeScenarioKey === 'POLAR_NIGHT_FREEZE' ? 'OPEN' : 'CLOSED',
                      protection: 'Rapid Shutdown Contactor · Anti-Islanding IEEE 1547',
                      albedo: '+20% Albedo reflection gain from Antarctic snowpack'
                    })}
                  >
                    <rect x="600" y="20" width="130" height="75" rx="8" fill="url(#cardGrad)" stroke={selectedAsset?.name?.includes('Solar') ? '#05C5FF' : cardStrokeDefault} strokeWidth="1.5" />
                    <circle cx="625" cy="50" r="16" fill={circleBg} stroke="#facc15" strokeWidth="2" />
                    <text x="625" y="55" textAnchor="middle" fill="#facc15" fontFamily="sans-serif" fontSize="13" fontWeight="bold">PV</text>
                    <text x="652" y="44" fill={cardTextTitle} fontFamily="sans-serif" fontSize="11" fontWeight="bold">Bifacial Solar</text>
                    <text x="652" y="58" fill={cardTextSub} fontFamily="sans-serif" fontSize="9">{currentStation.solar_capacity_kw || 60} kW Array</text>
                    <text x="652" y="74" fill={activeScenarioKey === 'POLAR_NIGHT_FREEZE' ? (isDark ? '#94a3b8' : '#64748b') : '#f59e0b'} fontFamily="monospace" fontSize="11" fontWeight="bold">
                      {activeScenarioKey === 'POLAR_NIGHT_FREEZE' ? '0.0 kW (NIGHT)' : `${(d.p_solar_kw || t.solar_kw || 35).toFixed(0)} kW`}
                    </text>
                  </g>

                  {/* SOURCE 5: BESS Energy Storage Hub */}
                  <g
                    className="cursor-pointer transition hover:opacity-90"
                    onClick={() => setSelectedAsset({
                      name: 'BESS Lithium Iron Phosphate Hub',
                      type: 'LiFePO4 Storage & Grid-Forming PCS',
                      model: `${currentStation.battery_capacity_kwh || 400} kWh Core with Thermal Hydronic Heating`,
                      rating: `${currentStation.inverter_rating_kw || 80} kW Inverter PCS`,
                      output: `${((d.p_battery_discharge_kw || 0) - (d.p_battery_charge_kw || 0)).toFixed(1)} kW (Net Flow)`,
                      breaker: 'CB-05 CLOSED (Grid-Forming Master)',
                      breakerStatus: 'CLOSED',
                      protection: 'Cell BMS Over/Under Voltage · Protected 20% Reserve Floor',
                      soc: `${t.battery_soc_pct ? Number(t.battery_soc_pct).toFixed(1) : '76.5'}% SoC`
                    })}
                  >
                    <rect x="790" y="20" width="140" height="75" rx="8" fill="url(#cardGrad)" stroke={selectedAsset?.name?.includes('BESS') ? '#05C5FF' : cardStrokeDefault} strokeWidth="1.5" />
                    <circle cx="815" cy="50" r="16" fill={circleBg} stroke="#10b981" strokeWidth="2" />
                    <text x="815" y="55" textAnchor="middle" fill="#10b981" fontFamily="sans-serif" fontSize="11" fontWeight="bold">BAT</text>
                    <text x="842" y="44" fill={cardTextTitle} fontFamily="sans-serif" fontSize="11" fontWeight="bold">BESS Hub</text>
                    <text x="842" y="58" fill={cardTextSub} fontFamily="sans-serif" fontSize="9">{currentStation.battery_capacity_kwh || 400} kWh Core</text>
                    <text x="842" y="74" fill={isDark ? '#10b981' : '#059669'} fontFamily="monospace" fontSize="11" fontWeight="bold">
                      {t.battery_soc_pct ? `${Number(t.battery_soc_pct).toFixed(0)}% SoC` : '77% SoC'}
                    </text>
                  </g>

                  {/* -------------------------------------------------------------
                      FEEDER LINES & CIRCUIT BREAKERS (TOP -> BUSBAR)
                      ------------------------------------------------------------- */}

                  {/* Feeder 1 (DG-1 to CB-01 to Busbar) */}
                  <line x1="95" y1="95" x2="95" y2="135" stroke={feederActiveColor} strokeWidth="2.5" />
                  <g className="cursor-pointer" onClick={() => setSelectedAsset({ name: 'Breaker CB-01', type: 'Molded Case Circuit Breaker (MCCB)', rating: '400A / 10kA Icu', status: activeScenarioKey === 'GENSET_TRIP' ? 'TRIPPED (ANSI 51)' : 'CLOSED', function: 'Generator 1 Main Bus Intertie' })}>
                    <rect x="83" y="135" width="24" height="24" rx="4" fill={activeScenarioKey === 'GENSET_TRIP' ? (isDark ? '#450a0a' : '#fff1f2') : (isDark ? '#022c22' : '#ecfdf5')} stroke={activeScenarioKey === 'GENSET_TRIP' ? '#f43f5e' : '#10b981'} strokeWidth="2" />
                    <text x="95" y="151" textAnchor="middle" fill={activeScenarioKey === 'GENSET_TRIP' ? '#f43f5e' : '#10b981'} fontFamily="monospace" fontSize="9" fontWeight="bold">
                      {activeScenarioKey === 'GENSET_TRIP' ? 'X' : '||'}
                    </text>
                    <text x="95" y="172" textAnchor="middle" fill={cbLabelColor} fontFamily="monospace" fontSize="9">CB-01</text>
                  </g>
                  <line x1="95" y1="159" x2="95" y2="215" stroke={activeScenarioKey === 'GENSET_TRIP' ? feederInactiveColor : feederActiveColor} strokeWidth="2.5" strokeDasharray={activeScenarioKey === 'GENSET_TRIP' ? '4,4' : 'none'} />

                  {/* Feeder 2 (DG-2 to CB-02 to Busbar) */}
                  <line x1="285" y1="95" x2="285" y2="135" stroke={feederInactiveColor} strokeWidth="2.5" />
                  <g className="cursor-pointer" onClick={() => setSelectedAsset({ name: 'Breaker CB-02', type: 'MCCB Intertie', rating: '300A / 10kA Icu', status: (d.p_diesel_2_kw || 0) > 0 ? 'CLOSED' : 'OPEN (Standby)', function: 'Generator 2 Backup Bus Intertie' })}>
                    <rect x="273" y="135" width="24" height="24" rx="4" fill={(d.p_diesel_2_kw || 0) > 0 ? (isDark ? '#022c22' : '#ecfdf5') : (isDark ? '#1e293b' : '#f1f5f9')} stroke={(d.p_diesel_2_kw || 0) > 0 ? '#10b981' : (isDark ? '#64748b' : '#94a3b8')} strokeWidth="2" />
                    <text x="285" y="151" textAnchor="middle" fill={(d.p_diesel_2_kw || 0) > 0 ? '#10b981' : cbLabelColor} fontFamily="monospace" fontSize="9" fontWeight="bold">
                      {(d.p_diesel_2_kw || 0) > 0 ? '||' : 'O'}
                    </text>
                    <text x="285" y="172" textAnchor="middle" fill={cbLabelColor} fontFamily="monospace" fontSize="9">CB-02</text>
                  </g>
                  <line x1="285" y1="159" x2="285" y2="215" stroke={(d.p_diesel_2_kw || 0) > 0 ? feederActiveColor : feederInactiveColor} strokeWidth="2.5" strokeDasharray={(d.p_diesel_2_kw || 0) > 0 ? 'none' : '4,4'} />

                  {/* Feeder 3 (Wind to CB-03 to Busbar) */}
                  <line x1="475" y1="95" x2="475" y2="135" stroke={feederActiveColor} strokeWidth="2.5" />
                  <g className="cursor-pointer" onClick={() => setSelectedAsset({ name: 'Breaker CB-03', type: 'Wind Intertie Contactor', rating: '250A / 10kA', status: activeScenarioKey === 'KATABATIC_BLIZZARD' ? 'TRIPPED (>25 m/s Gale)' : 'CLOSED', function: 'Wind Generation Sync Contactor' })}>
                    <rect x="463" y="135" width="24" height="24" rx="4" fill={activeScenarioKey === 'KATABATIC_BLIZZARD' ? (isDark ? '#450a0a' : '#fff1f2') : (isDark ? '#022c22' : '#ecfdf5')} stroke={activeScenarioKey === 'KATABATIC_BLIZZARD' ? '#f43f5e' : '#10b981'} strokeWidth="2" />
                    <text x="475" y="151" textAnchor="middle" fill={activeScenarioKey === 'KATABATIC_BLIZZARD' ? '#f43f5e' : '#10b981'} fontFamily="monospace" fontSize="9" fontWeight="bold">
                      {activeScenarioKey === 'KATABATIC_BLIZZARD' ? 'X' : '||'}
                    </text>
                    <text x="475" y="172" textAnchor="middle" fill={cbLabelColor} fontFamily="monospace" fontSize="9">CB-03</text>
                  </g>
                  <line x1="475" y1="159" x2="475" y2="215" stroke={activeScenarioKey === 'KATABATIC_BLIZZARD' ? feederInactiveColor : feederActiveColor} strokeWidth="2.5" strokeDasharray={activeScenarioKey === 'KATABATIC_BLIZZARD' ? '4,4' : 'none'} />

                  {/* Feeder 4 (Solar to CB-04 to Busbar) */}
                  <line x1="665" y1="95" x2="665" y2="135" stroke="#facc15" strokeWidth="2.5" />
                  <g className="cursor-pointer" onClick={() => setSelectedAsset({ name: 'Breaker CB-04', type: 'Solar PV DC/AC Inverter Breaker', rating: '160A / 10kA', status: activeScenarioKey === 'POLAR_NIGHT_FREEZE' ? 'OPEN (0.0 kW Night)' : 'CLOSED', function: 'Solar Inverter Bus Feeder' })}>
                    <rect x="653" y="135" width="24" height="24" rx="4" fill={activeScenarioKey === 'POLAR_NIGHT_FREEZE' ? (isDark ? '#1e293b' : '#f1f5f9') : (isDark ? '#022c22' : '#ecfdf5')} stroke={activeScenarioKey === 'POLAR_NIGHT_FREEZE' ? (isDark ? '#64748b' : '#94a3b8') : '#10b981'} strokeWidth="2" />
                    <text x="665" y="151" textAnchor="middle" fill={activeScenarioKey === 'POLAR_NIGHT_FREEZE' ? cbLabelColor : '#10b981'} fontFamily="monospace" fontSize="9" fontWeight="bold">
                      {activeScenarioKey === 'POLAR_NIGHT_FREEZE' ? 'O' : '||'}
                    </text>
                    <text x="665" y="172" textAnchor="middle" fill={cbLabelColor} fontFamily="monospace" fontSize="9">CB-04</text>
                  </g>
                  <line x1="665" y1="159" x2="665" y2="215" stroke={activeScenarioKey === 'POLAR_NIGHT_FREEZE' ? feederInactiveColor : '#facc15'} strokeWidth="2.5" strokeDasharray={activeScenarioKey === 'POLAR_NIGHT_FREEZE' ? '4,4' : 'none'} />

                  {/* Feeder 5 (BESS to CB-05 to Busbar) */}
                  <line x1="860" y1="95" x2="860" y2="135" stroke={feederGreenColor} strokeWidth="2.5" />
                  <g className="cursor-pointer" onClick={() => setSelectedAsset({ name: 'Breaker CB-05', type: 'BESS Bi-Directional High-Speed Static Switch', rating: '250A / 15kA Fast Transfer', status: 'CLOSED (GRID FORMING)', function: 'Primary Frequency Master & Synthetic Inertia Injection' })}>
                    <rect x="848" y="135" width="24" height="24" rx="4" fill={isDark ? '#022c22' : '#ecfdf5'} stroke="#10b981" strokeWidth="2" />
                    <text x="860" y="151" textAnchor="middle" fill="#10b981" fontFamily="monospace" fontSize="9" fontWeight="bold">||</text>
                    <text x="860" y="172" textAnchor="middle" fill={cbLabelColor} fontFamily="monospace" fontSize="9">CB-05</text>
                  </g>
                  <line x1="860" y1="159" x2="860" y2="215" stroke={feederGreenColor} strokeWidth="2.5" />

                  {/* -------------------------------------------------------------
                      CENTRAL MAIN 415V SYNCHRONIZATION BUSBAR (HORIZONTAL)
                      ------------------------------------------------------------- */}
                  <line x1="40" y1="215" x2="920" y2="215" stroke="url(#busGrad)" strokeWidth="6" strokeLinecap="round" filter="url(#cyanGlow)" />
                  <rect x="360" y="202" width="240" height="26" rx="13" fill={busBadgeBg} stroke={busBadgeStroke} strokeWidth="1.5" />
                  <text x="480" y="219" textAnchor="middle" fill={busBadgeText} fontFamily="monospace" fontSize="10" fontWeight="bold">
                    MAIN 415V AC 3-PHASE BUSBAR &middot; 50.02 Hz
                  </text>

                  {/* Busbar Tap Points */}
                  <circle cx="95" cy="215" r="4.5" fill={feederActiveColor} />
                  <circle cx="285" cy="215" r="4.5" fill={feederActiveColor} />
                  <circle cx="475" cy="215" r="4.5" fill={feederActiveColor} />
                  <circle cx="665" cy="215" r="4.5" fill="#facc15" />
                  <circle cx="860" cy="215" r="4.5" fill="#10b981" />

                  {/* Tap points down to loads */}
                  <circle cx="190" cy="215" r="4.5" fill="#10b981" />
                  <circle cx="480" cy="215" r="4.5" fill={feederActiveColor} />
                  <circle cx="770" cy="215" r="4.5" fill="#f59e0b" />

                  {/* -------------------------------------------------------------
                      ROW 2: DOWNSTREAM LOAD FEEDERS (BUSBAR -> LOADS)
                      ------------------------------------------------------------- */}

                  {/* FEEDER L1: Tier 1 Life Support Habitat */}
                  <line x1="190" y1="215" x2="190" y2="255" stroke={feederGreenColor} strokeWidth="2.5" />
                  <g className="cursor-pointer" onClick={() => setSelectedAsset({ name: 'Breaker CB-L1', type: 'Life-Support Critical Feeder Breaker', rating: '300A / Zero-Trip Shunt Interlock', status: 'CLOSED (INVIOLABLE)', function: 'Primary Life-Support Habitat Heating & Clean Air Loop' })}>
                    <rect x="178" y="255" width="24" height="24" rx="4" fill={isDark ? '#022c22' : '#ecfdf5'} stroke="#10b981" strokeWidth="2" />
                    <text x="190" y="271" textAnchor="middle" fill="#10b981" fontFamily="monospace" fontSize="9" fontWeight="bold">||</text>
                    <text x="190" y="292" textAnchor="middle" fill={cbLabelColor} fontFamily="monospace" fontSize="9">CB-L1</text>
                  </g>
                  <line x1="190" y1="279" x2="190" y2="330" stroke={feederGreenColor} strokeWidth="2.5" />
                  
                  <g
                    className="cursor-pointer transition hover:opacity-90"
                    onClick={() => setSelectedAsset({
                      name: 'Tier 1: Life-Support Habitat & Medical',
                      type: 'Critical Survival Bus (Priority 1)',
                      demand: '142 kW Hydronic Base',
                      sheddable: 'NON-SHEDDABLE (Protected Life-Support Guarantee)',
                      components: 'Hydronic Boiler Circulation Pumps, Habitat HVAC, Medical Bay, Cryo-O2 Plant',
                      reserve: 'Zero-outage tolerance; priority diesel commit if deficit occurs'
                    })}
                  >
                    <rect x="100" y="330" width="180" height="75" rx="8" fill="url(#cardGrad)" stroke={selectedAsset?.name?.includes('Tier 1') ? '#10b981' : cardStrokeDefault} strokeWidth="1.5" />
                    <circle cx="125" cy="360" r="14" fill={isDark ? '#022c22' : '#ecfdf5'} stroke="#10b981" strokeWidth="1.5" />
                    <text x="125" y="364" textAnchor="middle" fill="#10b981" fontFamily="sans-serif" fontSize="11" fontWeight="bold">L1</text>
                    <text x="148" y="354" fill={cardTextTitle} fontFamily="sans-serif" fontSize="11" fontWeight="bold">Life-Support Habitat</text>
                    <text x="148" y="368" fill={isDark ? '#10b981' : '#059669'} fontFamily="sans-serif" fontSize="9" fontWeight="bold">INVIOLABLE PRIORITY</text>
                    <text x="148" y="384" fill={cardValueDefault} fontFamily="monospace" fontSize="11" fontWeight="bold">142 kW Base Load</text>
                  </g>

                  {/* FEEDER L2: Tier 2 Water Production & Deep-Space SatCom */}
                  <line x1="480" y1="215" x2="480" y2="255" stroke={feederActiveColor} strokeWidth="2.5" />
                  <g className="cursor-pointer" onClick={() => setSelectedAsset({ name: 'Breaker CB-L2', type: 'Essential Mission Feeder Breaker', rating: '160A / Priority 2', status: 'CLOSED', function: 'Snow Melters, Reverse Osmosis & Deep-Space Uplink' })}>
                    <rect x="468" y="255" width="24" height="24" rx="4" fill={isDark ? '#022c22' : '#ecfdf5'} stroke="#10b981" strokeWidth="2" />
                    <text x="480" y="271" textAnchor="middle" fill="#10b981" fontFamily="monospace" fontSize="9" fontWeight="bold">||</text>
                    <text x="480" y="292" textAnchor="middle" fill={cbLabelColor} fontFamily="monospace" fontSize="9">CB-L2</text>
                  </g>
                  <line x1="480" y1="279" x2="480" y2="330" stroke={feederActiveColor} strokeWidth="2.5" />

                  <g
                    className="cursor-pointer transition hover:opacity-90"
                    onClick={() => setSelectedAsset({
                      name: 'Tier 2: Water Production & SatCom',
                      type: 'Essential Mission Operations (Priority 2)',
                      demand: '45 kW Operating Demand',
                      sheddable: 'Delayed Shedding Permitted (Up to 4h Buffer)',
                      components: 'Electric Snow Melters, Reverse Osmosis Plant, ISRO Deep-Space Satellite Dish',
                      buffer: 'Water storage tanks provide 48h emergency reserve buffer'
                    })}
                  >
                    <rect x="390" y="330" width="180" height="75" rx="8" fill="url(#cardGrad)" stroke={selectedAsset?.name?.includes('Tier 2') ? '#38bdf8' : cardStrokeDefault} strokeWidth="1.5" />
                    <circle cx="415" cy="360" r="14" fill={circleBg} stroke={isDark ? '#38bdf8' : '#0284c7'} strokeWidth="1.5" />
                    <text x="415" y="364" textAnchor="middle" fill={isDark ? '#38bdf8' : '#0284c7'} fontFamily="sans-serif" fontSize="11" fontWeight="bold">L2</text>
                    <text x="438" y="354" fill={cardTextTitle} fontFamily="sans-serif" fontSize="11" fontWeight="bold">Water &amp; SatCom</text>
                    <text x="438" y="368" fill={isDark ? '#38bdf8' : '#0284c7'} fontFamily="sans-serif" fontSize="9">ESSENTIAL MISSION</text>
                    <text x="438" y="384" fill={cardValueDefault} fontFamily="monospace" fontSize="11" fontWeight="bold">45 kW Load</text>
                  </g>

                  {/* FEEDER L3: Tier 3 Scientific Labs & Auxiliary Contactor */}
                  <line x1="770" y1="215" x2="770" y2="255" stroke="#f59e0b" strokeWidth="2.5" />
                  <g className="cursor-pointer" onClick={() => setSelectedAsset({ name: 'Breaker CB-L3', type: 'Automated Demand Shedding Contactor', rating: '125A / Underfrequency Trip', status: (activeScenarioKey === 'ISLAND_BLACKSTART' || (t.unmet_load_kw > 0)) ? 'TRIPPED (SHED)' : 'CLOSED', function: 'Fast automated disconnection during extreme generation deficit' })}>
                    <rect x="758" y="255" width="24" height="24" rx="4" fill={(activeScenarioKey === 'ISLAND_BLACKSTART' || (t.unmet_load_kw > 0)) ? (isDark ? '#450a0a' : '#fff1f2') : (isDark ? '#022c22' : '#ecfdf5')} stroke={(activeScenarioKey === 'ISLAND_BLACKSTART' || (t.unmet_load_kw > 0)) ? '#f43f5e' : '#10b981'} strokeWidth="2" />
                    <text x="770" y="271" textAnchor="middle" fill={(activeScenarioKey === 'ISLAND_BLACKSTART' || (t.unmet_load_kw > 0)) ? '#f43f5e' : '#10b981'} fontFamily="monospace" fontSize="9" fontWeight="bold">
                      {(activeScenarioKey === 'ISLAND_BLACKSTART' || (t.unmet_load_kw > 0)) ? 'X' : '||'}
                    </text>
                    <text x="770" y="292" textAnchor="middle" fill={cbLabelColor} fontFamily="monospace" fontSize="9">CB-L3</text>
                  </g>
                  <line x1="770" y1="279" x2="770" y2="330" stroke={(activeScenarioKey === 'ISLAND_BLACKSTART' || (t.unmet_load_kw > 0)) ? feederInactiveColor : '#f59e0b'} strokeWidth="2.5" strokeDasharray={(activeScenarioKey === 'ISLAND_BLACKSTART' || (t.unmet_load_kw > 0)) ? '4,4' : 'none'} />

                  <g
                    className="cursor-pointer transition hover:opacity-90"
                    onClick={() => setSelectedAsset({
                      name: 'Tier 3: Science & Auxiliary Equipment',
                      type: 'Controllable Shedding Bus (Priority 3)',
                      demand: '35 kW Non-Critical Demand',
                      sheddable: 'SHEDDABLE UNDER DEFICIT (<50ms contactor trip)',
                      components: 'Atmospheric LIDAR, Seismic Arrays, Auroral Cameras, Auxiliary Heaters',
                      tripCondition: 'Automatic trip if system frequency drops below 49.5 Hz or spinning reserve falls under 10 kW'
                    })}
                  >
                    <rect x="680" y="330" width="180" height="75" rx="8" fill="url(#cardGrad)" stroke={selectedAsset?.name?.includes('Tier 3') ? '#f59e0b' : cardStrokeDefault} strokeWidth="1.5" />
                    <circle cx="705" cy="360" r="14" fill={isDark ? '#291e10' : '#fef3c7'} stroke="#f59e0b" strokeWidth="1.5" />
                    <text x="705" y="364" textAnchor="middle" fill="#f59e0b" fontFamily="sans-serif" fontSize="11" fontWeight="bold">L3</text>
                    <text x="728" y="354" fill={cardTextTitle} fontFamily="sans-serif" fontSize="11" fontWeight="bold">Science &amp; Auxiliary</text>
                    <text x="728" y="368" fill={(activeScenarioKey === 'ISLAND_BLACKSTART' || (t.unmet_load_kw > 0)) ? '#f43f5e' : '#f59e0b'} fontFamily="sans-serif" fontSize="9" fontWeight="bold">
                      {(activeScenarioKey === 'ISLAND_BLACKSTART' || (t.unmet_load_kw > 0)) ? 'SHEDDED CONTINGENCY' : 'SHEDDABLE CONTACTOR'}
                    </text>
                    <text x="728" y="384" fill={cardValueDefault} fontFamily="monospace" fontSize="11" fontWeight="bold">35 kW Load</text>
                  </g>

                </svg>

                {/* Substation Legend & Interaction Guide */}
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-4 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block"></span>
                      <span>CB Closed (Energized)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-rose-500 inline-block"></span>
                      <span>CB Tripped / Locked</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-slate-400 dark:bg-slate-500 inline-block"></span>
                      <span>CB Open (Standby)</span>
                    </div>
                  </div>
                  <div className="text-[10px] font-mono text-[#0699C6] dark:text-cyan-400">
                    &bull; CLICK ANY GENERATOR, BREAKER OR LOAD TO INSPECT RELAY SETTINGS
                  </div>
                </div>

              </div>

              {/* Interactive Selected Asset Inspector Card */}
              {selectedAsset && (
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-[#bcecfc] dark:border-cyan-800/80 text-slate-800 dark:text-white space-y-2 animate-fadeIn shadow-xl">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-microchip text-[#0699C6] dark:text-cyan-400"></i>
                      <strong className="text-xs sm:text-sm text-[#127694] dark:text-cyan-300 font-mono uppercase">{selectedAsset.name}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedAsset(null)}
                      className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-1">
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase block font-bold">Subsystem Type</span>
                      <strong className="text-slate-800 dark:text-slate-200 font-bold">{selectedAsset.type || 'Electrical Component'}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase block font-bold">Hardware Rating</span>
                      <strong className="text-[#0699C6] dark:text-cyan-300 font-mono font-bold">{selectedAsset.rating || '400V Nominal'}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase block font-bold">Breaker Status</span>
                      <strong className={selectedAsset.breakerStatus === 'TRIPPED' ? 'text-rose-600 dark:text-rose-400 font-mono font-bold' : 'text-emerald-600 dark:text-emerald-400 font-mono font-bold'}>
                        {selectedAsset.breaker || selectedAsset.status || 'CLOSED'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase block font-bold">Protective Relaying</span>
                      <strong className="text-slate-800 dark:text-slate-200 text-[11px]">{selectedAsset.protection || selectedAsset.function || 'IEC 60255'}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 4: IEC-61850 TELEMETRY LOGS
              ========================================================================= */}
          {activeTab === 'iec_log' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Substation Sub-Second Time-Stamped Telemetry Feed:</span>
                <span className="font-mono text-[10px]">PROTOCOL: IEC-61850-8-1 MMS</span>
              </div>

              <div className="rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 font-mono text-xs text-slate-700 dark:text-slate-300 space-y-2 max-h-[450px] overflow-y-auto shadow-inner">
                {scadaEvents.map((evt) => (
                  <div key={evt.id} className="flex items-start gap-2.5 py-1 border-b border-slate-100 dark:border-slate-900">
                    <span className="text-slate-400 shrink-0 text-[10px]">{evt.time}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                      evt.type === 'ALARM'
                        ? 'bg-rose-50 text-rose-700 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                        : evt.type === 'RESTORE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-[#edf9fd] text-[#127694] border border-[#bcecfc] dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800'
                    }`}>
                      {evt.code}
                    </span>
                    <span className="text-slate-700 dark:text-slate-300 leading-snug">{evt.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}


        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-[#bcecfc]/60 dark:border-[#1e3a5f] bg-[#f8fdff] dark:bg-[#0a0f1d] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 text-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <i className="fa-solid fa-shield-halved text-emerald-500"></i>
            <span>Deterministic IEEE 1547.4 &middot; IEC 61850 Polar Microgrid Compliant</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 font-bold transition cursor-pointer"
            >
              Close Benchmark
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
