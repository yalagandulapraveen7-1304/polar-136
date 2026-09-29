import React, { useState, useEffect } from 'react';
import { STATIONS } from '../constants/stations';

export default function Header({
  stationId,
  onStationChange,
  mode,
  onModeChange,
  onOpenModal,
  activeModal,
  clockTime,
  connectionStatus = 'SATELLITE LINK ACTIVE',
  telemetryMeta = {}
}) {
  const [isStationMenuOpen, setIsStationMenuOpen] = useState(false);
  const [isDiagOpen, setIsDiagOpen] = useState(false);
  const [isEnergyMenuOpen, setIsEnergyMenuOpen] = useState(false);
  const [isEnvironmentMenuOpen, setIsEnvironmentMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const currentStation = STATIONS[stationId] || STATIONS.MAITRI;

  // Close dropdowns on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(e) {
      if (!e.target.closest('#stationDropdownContainer')) {
        setIsStationMenuOpen(false);
      }
      if (!e.target.closest('#diagPopoverContainer')) {
        setIsDiagOpen(false);
      }
      if (!e.target.closest('#energyDropdownContainer')) {
        setIsEnergyMenuOpen(false);
      }
      if (!e.target.closest('#environmentDropdownContainer')) {
        setIsEnvironmentMenuOpen(false);
      }
      if (!e.target.closest('#mobileNavContainer')) {
        setIsMobileMenuOpen(false);
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsStationMenuOpen(false);
        setIsDiagOpen(false);
        setIsEnergyMenuOpen(false);
        setIsEnvironmentMenuOpen(false);
        setIsMobileMenuOpen(false);
      }
    }

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <header id="mainNavHeader" className="w-full floating-nav px-4 py-2.5 z-40 relative transition-all duration-300 flex flex-col gap-2">
      
      {/* =========================================================================
          ROW 1: TOP COMMAND UTILITY BAR
          Station + Status + Operating Mode [DEMO | SCADA] + [OVERRIDE] + Global Status
          ========================================================================= */}
      <div className="flex items-center justify-between w-full flex-wrap gap-2.5">
        
        {/* Left Section: Brand, Station Selector, Operating Mode & OVERRIDE */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Brand Identity & Polar System Tag */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0699C6] to-[#127694] text-white flex items-center justify-center shadow-md shrink-0">
              <i className="fa-solid fa-snowflake text-sm text-white"></i>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-tight text-lg text-[#127694] leading-none">POLAR EMS</span>
              <span className="text-[10px] tracking-wider uppercase font-extrabold px-2.5 py-0.5 rounded-full bg-[#c2f0fe] text-[#0699C6] border border-[#bcecfc] flex items-center gap-1.5 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                {currentStation.name.split(' ')[0]} · OPERATIONAL
              </span>
            </div>
          </div>

          {/* Station Selector Dropdown */}
          <div className="relative" id="stationDropdownContainer">
            <button
              type="button"
              onClick={() => setIsStationMenuOpen(!isStationMenuOpen)}
              className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#e5f6fd] hover:bg-[#c2f0fe] border border-[#bcecfc] transition text-[#127694] font-bold text-xs shadow-xs cursor-pointer"
            >
              <i className="fa-solid fa-location-dot text-[#0699C6]"></i>
              <span>Station:</span>
              <span className="text-slate-900 font-extrabold uppercase">{currentStation.name.split(' ')[0]}</span>
              <i className={`fa-solid fa-chevron-down text-[10px] transition-transform duration-200 ${isStationMenuOpen ? 'rotate-180' : ''}`}></i>
            </button>

            {isStationMenuOpen && (
              <div className="absolute left-0 mt-1.5 w-64 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-[#bcecfc] p-1.5 z-50 animate-fadeIn">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-2.5 py-1">
                  Antarctic Research Bases
                </div>
                {Object.values(STATIONS).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      onStationChange(st.id);
                      setIsStationMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                      stationId === st.id
                        ? 'bg-[#127694] text-white font-bold'
                        : 'text-slate-700 hover:bg-[#e5f6fd] hover:text-[#0699C6]'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-bold">{st.name}</span>
                      <span className={`text-[10px] ${stationId === st.id ? 'text-cyan-100' : 'text-slate-400'}`}>
                        {st.locationText.split('•')[1] || st.locationText}
                      </span>
                    </div>
                    {stationId === st.id && <i className="fa-solid fa-check text-xs text-white"></i>}
                  </button>
                ))}
                <div className="pt-1.5 mt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsStationMenuOpen(false);
                      onOpenModal('comparison');
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold text-[#127694] hover:bg-[#e5f6fd] hover:text-[#0699C6] flex items-center gap-2 transition cursor-pointer"
                  >
                    <i className="fa-solid fa-code-compare text-xs text-[#0699C6]"></i>
                    <span>Compare Stations Side-by-Side</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Operational Mode Toggle: DEMO vs SCADA */}
          <div className="flex items-center gap-1 bg-[#e5f6fd] p-0.5 rounded-full border border-[#bcecfc]">
            <button
              type="button"
              className={`mode-pill ${mode === 'DEMO_MODE' ? 'active' : ''}`}
              onClick={() => onModeChange('DEMO_MODE')}
              title="Simulated high-resolution test harness"
            >
              DEMO
            </button>
            <button
              type="button"
              className={`mode-pill ${mode === 'SCADA_MODE' ? 'active' : ''}`}
              onClick={() => onModeChange('SCADA_MODE')}
              title="Industrial PLC Modbus TCP registers (40001-40020)"
            >
              SCADA
            </button>
          </div>

          {/* Operational Control: OVERRIDE positioned immediately after DEMO / SCADA */}
          <button
            type="button"
            onClick={() => onOpenModal('manual')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border transition shadow-xs cursor-pointer ${
              mode === 'DEMO_MODE'
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-300'
            }`}
            title={
              mode === 'DEMO_MODE'
                ? 'Manual Scenario & Sensor Override (Simulation / Digital Twin sandbox)'
                : 'Authorized SCADA Control & Setpoint Override (Authorized Operator)'
            }
          >
            <i className={`fa-solid fa-sliders text-xs ${mode === 'DEMO_MODE' ? 'text-amber-600' : 'text-rose-600'}`}></i>
            <span>OVERRIDE</span>
            <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-full uppercase tracking-wider ${
              mode === 'DEMO_MODE' ? 'bg-amber-200/80 text-amber-950' : 'bg-rose-200/80 text-rose-950'
            }`}>
              {mode === 'DEMO_MODE' ? 'SIMULATION' : 'AUTHORIZED'}
            </span>
          </button>
        </div>

        {/* Right Section: System Operational Badge, UTC Clock, Telemetry Status, Operator Profile */}
        <div className="flex items-center gap-2.5 flex-wrap justify-end">
          
          {/* System Status Pill: "● OPERATIONAL" */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"></span>
            <span>OPERATIONAL</span>
            <span className="hidden xl:inline text-[10px] text-emerald-600 font-semibold border-l border-emerald-300 pl-2">
              Balance: 0.00 kW residual
            </span>
          </div>

          {/* Live Antarctic Time & Connection Diagnostic Pill */}
          <div className="flex flex-col text-right">
            <span className="font-mono text-xs font-bold text-slate-800 tracking-tight leading-tight">
              {clockTime || 'ANTARCTIC UTC'}
            </span>
            
            {/* Real-Time Telemetry & Connection Status Pill with Interactive Diagnostic Popover */}
            <div className="relative inline-block mt-0.5" id="diagPopoverContainer">
              <button
                type="button"
                onClick={() => setIsDiagOpen(!isDiagOpen)}
                className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border transition flex items-center gap-1.5 justify-end shadow-xs cursor-pointer ${
                  telemetryMeta.connectionState === 'RECONNECTING'
                    ? 'bg-sky-50 text-sky-800 border-sky-300 animate-pulse'
                    : telemetryMeta.isStale
                    ? 'bg-rose-50 text-rose-800 border-rose-300'
                    : mode === 'SCADA_MODE'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-[#edf9fd] text-[#127694] border-[#bcecfc]'
                }`}
                title="Click to view live telemetry diagnostics"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${
                  telemetryMeta.connectionState === 'RECONNECTING'
                    ? 'bg-sky-500 animate-ping'
                    : telemetryMeta.isStale
                    ? 'bg-rose-500'
                    : mode === 'SCADA_MODE'
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-[#05C5FF] animate-pulse'
                }`}></span>
                <span>
                  {telemetryMeta.connectionState === 'RECONNECTING'
                    ? `↻ RECONNECTING (${telemetryMeta.retryCount || 1}/5)`
                    : telemetryMeta.isStale
                    ? `● DATA STALE (${telemetryMeta.staleSeconds}s ago)`
                    : mode === 'SCADA_MODE'
                    ? '● LIVE SCADA'
                    : '● SIMULATION (1 Hz)'}
                </span>
                <span className="text-[8px] font-mono text-slate-400">({telemetryMeta.latencyMs || 12}ms)</span>
              </button>

              {/* Diagnostic Hover/Click Popover */}
              {isDiagOpen && (
                <div className="absolute right-0 mt-1.5 w-72 bg-white rounded-2xl shadow-xl border border-[#bcecfc] p-3 z-50 text-left animate-fadeIn font-sans">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                    <span className="text-[10px] font-black uppercase text-[#127694] tracking-wider flex items-center gap-1.5">
                      <i className="fa-solid fa-satellite-dish text-[#0699C6]"></i>
                      Telemetry Diagnostics
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      telemetryMeta.isStale ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {telemetryMeta.connectionState || 'CONNECTED'}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[11px]">Station Stream:</span>
                      <strong className="font-bold text-[#127694]">{stationId}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[11px]">Round-Trip Latency:</span>
                      <span className="font-mono font-bold text-slate-800">{telemetryMeta.latencyMs || 12} ms</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[11px]">Packets Ingested:</span>
                      <span className="font-mono font-bold text-slate-800">{telemetryMeta.packetCount || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[11px]">Session Uptime:</span>
                      <span className="font-mono font-bold text-slate-800">
                        {Math.floor((telemetryMeta.uptimeSeconds || 0) / 60)}m {(telemetryMeta.uptimeSeconds || 0) % 60}s
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[11px]">Data Quality:</span>
                      <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] border border-emerald-200">
                        {telemetryMeta.quality || (mode === 'DEMO_MODE' ? 'SIMULATED' : 'VALID')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[11px]">Last Valid Packet:</span>
                      <span className="font-mono text-slate-600 text-[10px]">
                        {telemetryMeta.staleSeconds < 2 ? 'Just now (<1s)' : `${telemetryMeta.staleSeconds}s ago`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[11px]">Database Layer:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDiagOpen(false);
                          onOpenModal('database');
                        }}
                        className="font-bold text-[#127694] hover:text-[#0699C6] bg-[#edf9fd] hover:bg-[#c2f0fe] px-1.5 py-0.5 rounded text-[10px] border border-[#bcecfc] flex items-center gap-1 transition cursor-pointer"
                        title="Open Database & Historical Explorer"
                      >
                        <i className="fa-solid fa-database text-[9px] text-[#0699C6]"></i>
                        SQLite WAL (Feature 24)
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Cadence: ~1.0 Hz WebSocket</span>
                    {telemetryMeta.reconnectNow && (
                      <button
                        type="button"
                        onClick={telemetryMeta.reconnectNow}
                        className="px-2 py-1 rounded-lg bg-[#edf9fd] hover:bg-[#c2f0fe] text-[#127694] font-bold text-[10px] border border-[#bcecfc] transition cursor-pointer"
                      >
                        Force Resync
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Operator Profile */}
          <div className="flex items-center gap-2 pl-2.5 border-l border-[#bcecfc]">
            <div className="w-8 h-8 rounded-full bg-slate-800 text-cyan-300 flex items-center justify-center font-bold text-xs ring-2 ring-[#0699C6]/40 shadow-xs" title="Cmdr. E. Vance · Station Lead">
              EV
            </div>
            <div className="hidden sm:flex flex-col text-left leading-tight">
              <span className="text-xs font-bold text-slate-800">Cmdr. Vance</span>
              <span className="text-[9px] font-semibold text-slate-400">Station Lead Op</span>
            </div>
          </div>

          {/* Mobile Navigation Drawer Trigger */}
          <div className="lg:hidden relative" id="mobileNavContainer">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="w-8 h-8 rounded-xl bg-[#edf9fd] hover:bg-[#c2f0fe] text-[#127694] border border-[#bcecfc] flex items-center justify-center transition cursor-pointer"
              title="Open Navigation Menu"
            >
              <i className={`fa-solid ${isMobileMenuOpen ? 'fa-xmark' : 'fa-bars'} text-sm`}></i>
            </button>
          </div>

        </div>
      </div>

      {/* =========================================================================
          ROW 2: UNIFIED PRIMARY NAVIGATION BAR (EXACT 12 ITEMS IN EXACT ORDER)
          Overview -> Monitor -> Devices -> Energy -> Environment -> Storage ->
          Compare -> Recommendations -> Database -> AI Copilot -> Alerts -> Maintenance
          ========================================================================= */}
      <div className="w-full pt-1.5 border-t border-[#bcecfc]/50">
        <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5 justify-center py-0.5">
          
          {/* 1. Overview */}
          <button
            type="button"
            className={`nav-pill ${(!activeModal || activeModal === 'overview') ? 'active' : ''}`}
            onClick={() => {
              onOpenModal(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            title="Operational Overview & HUD"
          >
            <i className="fa-solid fa-table-cells-large text-xs"></i>
            <span>Overview</span>
          </button>

          {/* 2. Monitor */}
          <button
            type="button"
            className={`nav-pill ${activeModal === 'monitoring' ? 'active' : ''}`}
            onClick={() => onOpenModal('monitoring')}
            title="Real-Time Grid & Subsystem Monitoring"
          >
            <i className="fa-solid fa-chart-pie text-xs"></i>
            <span>Monitor</span>
          </button>

          {/* 3. Devices */}
          <button
            type="button"
            className={`nav-pill ${activeModal === 'devices' ? 'active' : ''}`}
            onClick={() => onOpenModal('devices')}
            title="SCADA-Level Device Monitoring & PLC Telemetry"
          >
            <i className="fa-solid fa-server text-xs"></i>
            <span>Devices</span>
          </button>

          {/* 4. Energy (Unified Group: Microgrid + Dispatch + Flow) */}
          <div className="relative" id="energyDropdownContainer">
            <button
              type="button"
              onClick={() => setIsEnergyMenuOpen(!isEnergyMenuOpen)}
              className={`nav-pill cursor-pointer ${
                (activeModal === 'energy' || activeModal === 'microgrid' || activeModal === 'dispatch') ? 'active' : ''
              }`}
              title="Energy Workspace: Microgrid Topology, HiGHS Dispatch & Power Flow"
            >
              <i className="fa-solid fa-bolt text-xs text-amber-500"></i>
              <span>Energy</span>
              <i className={`fa-solid fa-chevron-down text-[9px] opacity-70 transition-transform duration-200 ${isEnergyMenuOpen ? 'rotate-180' : ''}`}></i>
            </button>

            {/* Energy Dropdown Menu */}
            {isEnergyMenuOpen && (
              <div className="absolute left-0 mt-1.5 w-60 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-[#bcecfc] p-1.5 z-50 animate-fadeIn text-left font-sans">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-2.5 py-1">
                  Energy Management Workspace
                </div>
                
                <button
                  type="button"
                  onClick={() => {
                    setIsEnergyMenuOpen(false);
                    onOpenModal('energy', 'balance');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-[#edf9fd] hover:text-[#127694] flex items-center gap-2.5 transition cursor-pointer"
                >
                  <i className="fa-solid fa-bolt text-amber-500 text-xs"></i>
                  <div>
                    <span className="block">Energy Workspace (All-in-One)</span>
                    <span className="text-[10px] text-slate-400 font-normal">Unified power balance &amp; dispatch</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsEnergyMenuOpen(false);
                    onOpenModal('energy', 'microgrid');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-[#edf9fd] hover:text-[#127694] flex items-center gap-2.5 transition cursor-pointer"
                >
                  <i className="fa-solid fa-network-wired text-[#0699C6] text-xs"></i>
                  <div>
                    <span className="block">Microgrid Topology &amp; State</span>
                    <span className="text-[10px] text-slate-400 font-normal">Grid frequency, bus voltage, genset sync</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsEnergyMenuOpen(false);
                    onOpenModal('energy', 'dispatch');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-[#edf9fd] hover:text-[#127694] flex items-center gap-2.5 transition cursor-pointer"
                >
                  <i className="fa-solid fa-code-fork text-emerald-600 text-xs"></i>
                  <div>
                    <span className="block">HiGHS Optimal Dispatch</span>
                    <span className="text-[10px] text-slate-400 font-normal">Level 3 MILP, 24h rolling schedule</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsEnergyMenuOpen(false);
                    onOpenModal('energy', 'balance');
                  }}
                  className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-[#edf9fd] hover:text-[#127694] flex items-center gap-2.5 transition cursor-pointer"
                >
                  <i className="fa-solid fa-diagram-project text-cyan-600 text-xs"></i>
                  <span>Live Energy Flow &amp; Balance</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsEnergyMenuOpen(false);
                    onOpenModal('energy', 'analytics');
                  }}
                  className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-[#edf9fd] hover:text-[#127694] flex items-center gap-2.5 transition cursor-pointer"
                >
                  <i className="fa-solid fa-chart-line text-sky-600 text-xs"></i>
                  <span>Generation &amp; Consumption Analytics</span>
                </button>
              </div>
            )}
          </div>

          {/* 5. Environment (Unified Group: Weather + Forecast) */}
          <div className="relative" id="environmentDropdownContainer">
            <button
              type="button"
              onClick={() => setIsEnvironmentMenuOpen(!isEnvironmentMenuOpen)}
              className={`nav-pill cursor-pointer ${
                (activeModal === 'environment' || activeModal === 'weather' || activeModal === 'forecast') ? 'active' : ''
              }`}
              title="Environment Workspace: Live Polar Weather & Probabilistic Forecasts"
            >
              <i className="fa-solid fa-cloud-sun text-xs text-sky-500"></i>
              <span>Environment</span>
              <i className={`fa-solid fa-chevron-down text-[9px] opacity-70 transition-transform duration-200 ${isEnvironmentMenuOpen ? 'rotate-180' : ''}`}></i>
            </button>

            {/* Environment Dropdown Menu */}
            {isEnvironmentMenuOpen && (
              <div className="absolute left-0 mt-1.5 w-60 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-[#bcecfc] p-1.5 z-50 animate-fadeIn text-left font-sans">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-2.5 py-1">
                  Environmental Intelligence
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsEnvironmentMenuOpen(false);
                    onOpenModal('environment', 'current');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-[#edf9fd] hover:text-[#127694] flex items-center gap-2.5 transition cursor-pointer"
                >
                  <i className="fa-solid fa-cloud-sun text-sky-500 text-xs"></i>
                  <div>
                    <span className="block">Environment Workspace (All-in-One)</span>
                    <span className="text-[10px] text-slate-400 font-normal">Live conditions &amp; probabilistic forecast</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsEnvironmentMenuOpen(false);
                    onOpenModal('environment', 'current');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-[#edf9fd] hover:text-[#127694] flex items-center gap-2.5 transition cursor-pointer"
                >
                  <i className="fa-solid fa-snowflake text-[#0699C6] text-xs"></i>
                  <div>
                    <span className="block">Live Polar Weather &amp; Conditions</span>
                    <span className="text-[10px] text-slate-400 font-normal">Ambient temp, wind speed, solar GHI</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsEnvironmentMenuOpen(false);
                    onOpenModal('environment', 'forecast');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-[#edf9fd] hover:text-[#127694] flex items-center gap-2.5 transition cursor-pointer"
                >
                  <i className="fa-solid fa-chart-line text-indigo-600 text-xs"></i>
                  <div>
                    <span className="block">Probabilistic Forecast (P10/P50/P90)</span>
                    <span className="text-[10px] text-slate-400 font-normal">Multi-horizon quantile predictions</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsEnvironmentMenuOpen(false);
                    onOpenModal('environment', 'impact');
                  }}
                  className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-[#edf9fd] hover:text-[#127694] flex items-center gap-2.5 transition cursor-pointer"
                >
                  <i className="fa-solid fa-plug-circle-bolt text-amber-600 text-xs"></i>
                  <span>Microgrid Energy Impacts</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsEnvironmentMenuOpen(false);
                    onOpenModal('environment', 'simulator');
                  }}
                  className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-[#edf9fd] hover:text-[#127694] flex items-center gap-2.5 transition cursor-pointer"
                >
                  <i className="fa-solid fa-wind text-cyan-600 text-xs"></i>
                  <span>Extreme Weather Scenario Simulator</span>
                </button>
              </div>
            )}
          </div>

          {/* 6. Storage */}
          <button
            type="button"
            className={`nav-pill ${activeModal === 'battery' ? 'active' : ''}`}
            onClick={() => onOpenModal('battery')}
            title="LiFePO4 Energy Storage Subsystem & Thermal Management"
          >
            <i className="fa-solid fa-car-battery text-xs text-emerald-600"></i>
            <span>Storage</span>
          </button>

          {/* 7. Compare */}
          <button
            type="button"
            className={`nav-pill ${activeModal === 'comparison' ? 'active' : ''}`}
            onClick={() => onOpenModal('comparison')}
            title="Multi-Station Comparative Benchmarking"
          >
            <i className="fa-solid fa-code-compare text-xs text-[#0699C6]"></i>
            <span>Compare</span>
          </button>

          {/* 8. Recommendations */}
          <button
            type="button"
            className={`nav-pill relative ${activeModal === 'recommendations' ? 'active' : ''}`}
            onClick={() => onOpenModal('recommendations')}
            title="Feature 18: Forecast-Based Recommendations & Engineering Support"
          >
            <i className="fa-solid fa-lightbulb text-xs text-amber-500"></i>
            <span>Recommendations</span>
            {telemetryMeta?.recommendationsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-black shadow-xs">
                {telemetryMeta.recommendationsCount}
              </span>
            )}
          </button>

          {/* 9. Database */}
          <button
            type="button"
            className={`nav-pill ${activeModal === 'database' ? 'active' : ''}`}
            onClick={() => onOpenModal('database')}
            title="Feature 24: Database & Historical Data Layer (SQLite WAL)"
          >
            <i className="fa-solid fa-database text-xs text-[#0699C6]"></i>
            <span>Database</span>
          </button>

          {/* 10. AI Copilot */}
          <button
            type="button"
            className={`nav-pill ${activeModal === 'copilot' ? 'active' : ''}`}
            onClick={() => onOpenModal('copilot')}
            title="Autonomous Polar Operational Assistant & RAG Query"
          >
            <i className="fa-solid fa-robot text-xs text-indigo-600"></i>
            <span>AI Copilot</span>
          </button>

          {/* 11. Alerts */}
          <button
            type="button"
            className={`nav-pill ${activeModal === 'alerts' ? 'active' : ''}`}
            onClick={() => onOpenModal('alerts')}
            title="Real-Time SCADA Alarms & Compound Polar Risk Intelligence"
          >
            <i className="fa-solid fa-triangle-exclamation text-xs text-rose-600"></i>
            <span>Alerts</span>
          </button>

          {/* 12. Maintenance */}
          <button
            type="button"
            className={`nav-pill ${activeModal === 'maintenance' ? 'active' : ''}`}
            onClick={() => onOpenModal('maintenance')}
            title="Preventive Maintenance & Arctic Asset Health Supervisor"
          >
            <i className="fa-solid fa-shield-halved text-xs text-slate-600"></i>
            <span>Maintenance</span>
          </button>

        </nav>

        {/* Mobile / Tablet Responsive Drawer Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden mt-2 p-3 bg-white rounded-2xl border border-[#bcecfc] shadow-xl animate-fadeIn space-y-3 font-sans">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1">
              Primary System Navigation
            </div>

            {/* Current State Group */}
            <div className="space-y-1">
              <span className="text-[9px] font-bold text-[#127694] uppercase tracking-wider block px-2">Operational State</span>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenModal(null);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-2 py-1.5 rounded-lg text-xs font-bold text-left bg-slate-50 hover:bg-[#edf9fd] flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-table-cells-large text-[11px] text-[#127694]"></i> Overview
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenModal('monitoring');
                  }}
                  className="px-2 py-1.5 rounded-lg text-xs font-bold text-left bg-slate-50 hover:bg-[#edf9fd] flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-chart-pie text-[11px] text-[#0699C6]"></i> Monitor
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenModal('devices');
                  }}
                  className="px-2 py-1.5 rounded-lg text-xs font-bold text-left bg-slate-50 hover:bg-[#edf9fd] flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-server text-[11px] text-[#0699C6]"></i> Devices
                </button>
              </div>
            </div>

            {/* Energy & Environment Workspaces */}
            <div className="space-y-1 pt-1 border-t border-slate-100">
              <span className="text-[9px] font-bold text-[#127694] uppercase tracking-wider block px-2">Core Workspaces</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenModal('energy');
                  }}
                  className="p-2 rounded-xl bg-[#edf9fd] hover:bg-[#c2f0fe] border border-[#bcecfc] text-left"
                >
                  <div className="text-xs font-black text-[#127694] flex items-center gap-1.5">
                    <i className="fa-solid fa-bolt text-amber-500"></i> Energy
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Microgrid + Dispatch</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenModal('environment');
                  }}
                  className="p-2 rounded-xl bg-[#edf9fd] hover:bg-[#c2f0fe] border border-[#bcecfc] text-left"
                >
                  <div className="text-xs font-black text-[#127694] flex items-center gap-1.5">
                    <i className="fa-solid fa-cloud-sun text-sky-500"></i> Environment
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Weather + Forecast</span>
                </button>
              </div>
            </div>

            {/* Analysis & System Modules */}
            <div className="space-y-1 pt-1 border-t border-slate-100">
              <span className="text-[9px] font-bold text-[#127694] uppercase tracking-wider block px-2">Analysis &amp; Governance</span>
              <div className="grid grid-cols-3 gap-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenModal('battery');
                  }}
                  className="px-2 py-1.5 rounded-lg bg-slate-50 hover:bg-[#edf9fd] text-left flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-car-battery text-emerald-600 text-[11px]"></i> Storage
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenModal('comparison');
                  }}
                  className="px-2 py-1.5 rounded-lg bg-slate-50 hover:bg-[#edf9fd] text-left flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-code-compare text-[#0699C6] text-[11px]"></i> Compare
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenModal('recommendations');
                  }}
                  className="px-2 py-1.5 rounded-lg bg-slate-50 hover:bg-[#edf9fd] text-left flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-lightbulb text-amber-500 text-[11px]"></i> Advisories
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenModal('database');
                  }}
                  className="px-2 py-1.5 rounded-lg bg-slate-50 hover:bg-[#edf9fd] text-left flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-database text-[#0699C6] text-[11px]"></i> Database
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenModal('copilot');
                  }}
                  className="px-2 py-1.5 rounded-lg bg-slate-50 hover:bg-[#edf9fd] text-left flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-robot text-indigo-600 text-[11px]"></i> AI Copilot
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenModal('alerts');
                  }}
                  className="px-2 py-1.5 rounded-lg bg-slate-50 hover:bg-[#edf9fd] text-left flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-triangle-exclamation text-rose-600 text-[11px]"></i> Alerts
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenModal('maintenance');
                  }}
                  className="px-2 py-1.5 rounded-lg bg-slate-50 hover:bg-[#edf9fd] text-left flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-shield-halved text-slate-600 text-[11px]"></i> Maintain
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </header>
  );
}
