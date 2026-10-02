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
  isDarkMode = false,
  onToggleDarkMode = () => {},
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
    <header id="mainNavHeader" className="w-full floating-nav px-2.5 sm:px-4 py-2 sm:py-2.5 z-40 relative transition-all duration-300 flex flex-col gap-2">
      
      {/* =========================================================================
          ROW 1: TOP COMMAND UTILITY BAR
          Station + Status + Operating Mode [DEMO | SCADA] + [OVERRIDE] + Global Status
          ========================================================================= */}
      <div className="flex items-center justify-between w-full gap-2 lg:gap-3">
        
        {/* Left Section: Brand, Station Selector, Operating Mode & OVERRIDE */}
        <div className="flex items-center gap-2 lg:gap-2.5 shrink-0">
          {/* Brand Identity & Polar System Tag */}
          <div
            className="flex items-center gap-2 sm:gap-2.5 cursor-pointer"
            onClick={() => {
              onOpenModal(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            title="Click to view Operational Overview HUD"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0699C6] to-[#127694] text-white flex items-center justify-center shadow-md shrink-0">
              <i className="fa-solid fa-snowflake text-sm text-white"></i>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="flex flex-col justify-center">
                <span className="font-black tracking-tight text-base sm:text-lg text-[#127694] leading-none">
                  Novara
                </span>
                <span className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase text-[#0699C6] leading-none mt-0.5">
                  Polar EMS
                </span>
              </div>
              <span className="hidden 2xl:flex text-[10px] tracking-wider uppercase font-extrabold px-2.5 py-0.5 rounded-full bg-[#c2f0fe] text-[#0699C6] border border-[#bcecfc] items-center gap-1.5 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                {currentStation.name.split(' ')[0]} · OPERATIONAL
              </span>
            </div>
          </div>

          {/* Station Selector Dropdown (Desktop Only) */}
          <div className="hidden lg:block relative" id="stationDropdownContainer">
            <button
              type="button"
              onClick={() => setIsStationMenuOpen(!isStationMenuOpen)}
              aria-label="Select Antarctic Station"
              aria-expanded={isStationMenuOpen}
              className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#e5f6fd] hover:bg-[#c2f0fe] border border-[#bcecfc] transition text-[#127694] font-bold text-xs shadow-xs cursor-pointer shrink-0"
            >
              <i className="fa-solid fa-location-dot text-[#0699C6]"></i>
              <span className="hidden xs:inline">Station:</span>
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

          {/* Operational Mode Toggle: DEMO vs SCADA (Desktop Only - In Mobile Drawer on Mobile) */}
          <div className="hidden lg:flex items-center gap-1 bg-[#e5f6fd] p-0.5 rounded-full border border-[#bcecfc]">
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

          {/* Operational Control: OVERRIDE positioned immediately after DEMO / SCADA (Desktop Only - In Mobile Drawer on Mobile) */}
          <button
            type="button"
            onClick={() => onOpenModal('manual')}
            className={`hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border transition shadow-xs cursor-pointer ${
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

        {/* Desktop Right Section: System Operational Badge, UTC Clock, Telemetry Status, Operator Profile */}
        <div className="hidden lg:flex items-center gap-2 lg:gap-2.5 shrink-0 justify-end flex-nowrap ml-auto">
          
          {/* System Status Pill: "● OPERATIONAL" */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-xs shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
            <span>OPERATIONAL</span>
            <span className="hidden xl:inline text-[10px] text-emerald-600 font-semibold border-l border-emerald-300 pl-2">
              Balance: 0.00 kW residual
            </span>
          </div>

          {/* Simulated SCADA Hardware Gateway Status (IEC-61850 / Modbus-TCP) */}
          <div 
            className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/90 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono shadow-xs shrink-0 cursor-default"
            title="Substation PLC Gateway (IEC 61850 MMS / Modbus-TCP) Active - 120ms Heartbeat Sync"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            <span className="font-extrabold text-white tracking-wider">IEC-61850</span>
            <span className="text-cyan-400 font-semibold">GW:ONLINE</span>
            <span className="text-[9px] text-slate-400 border-l border-slate-700 pl-1.5">120ms PLC</span>
          </div>

          {/* Live Antarctic Time & Connection Diagnostic Pill */}
          <div className="flex flex-col text-right shrink-0">
            <span className="font-mono text-xs font-bold text-slate-800 tracking-tight leading-tight">
              {clockTime || 'ANTARCTIC UTC'}
            </span>
            
            {/* Real-Time Telemetry & Connection Status Pill with Interactive Diagnostic Popover */}
            <div className="relative inline-block mt-0.5" id="diagPopoverContainer">
              <button
                type="button"
                onClick={() => setIsDiagOpen(!isDiagOpen)}
                className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border transition flex items-center gap-1.5 justify-end shadow-xs cursor-pointer ${
                  telemetryMeta.isBackendWaking
                    ? 'bg-sky-50 text-sky-800 border-sky-300'
                    : telemetryMeta.connectionState === 'RECONNECTING'
                    ? 'bg-sky-50 text-sky-800 border-sky-300'
                    : telemetryMeta.isAutonomousTwin
                    ? 'bg-[#e5f6fd] text-[#127694] border-[#9ae5fe]'
                    : telemetryMeta.isStale
                    ? 'bg-rose-50 text-rose-800 border-rose-300'
                    : mode === 'SCADA_MODE'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-[#edf9fd] text-[#127694] border-[#bcecfc]'
                }`}
                title={
                  telemetryMeta.isAutonomousTwin
                    ? 'Autonomous Client Digital Twin Active (Calibrated Physics)'
                    : 'Click to view live telemetry diagnostics'
                }
              >
                <span className={`w-1.5 h-1.5 rounded-full ${
                  telemetryMeta.isBackendWaking
                    ? 'bg-sky-500 animate-pulse'
                    : telemetryMeta.connectionState === 'RECONNECTING'
                    ? 'bg-sky-500 animate-pulse'
                    : telemetryMeta.isAutonomousTwin
                    ? 'bg-[#05C5FF] animate-pulse'
                    : telemetryMeta.isStale
                    ? 'bg-rose-500'
                    : mode === 'SCADA_MODE'
                    ? 'bg-emerald-500'
                    : 'bg-[#05C5FF]'
                }`}></span>
                <span>
                  {telemetryMeta.isBackendWaking
                    ? 'WAKING SERVER...'
                    : telemetryMeta.connectionState === 'RECONNECTING'
                    ? `RECONNECTING (${telemetryMeta.retryCount || 1}/5)`
                    : telemetryMeta.isAutonomousTwin
                    ? '● AUTONOMOUS TWIN (1 Hz)'
                    : telemetryMeta.isStale
                    ? `● DATA STALE (${telemetryMeta.staleSeconds}s ago)`
                    : mode === 'SCADA_MODE'
                    ? '● LIVE SCADA'
                    : '● LIVE STREAM (1 Hz)'}
                </span>
                <span className="text-[8px] font-mono text-slate-400">
                  ({telemetryMeta.isAutonomousTwin ? '0ms' : `${telemetryMeta.latencyMs || 12}ms`})
                </span>
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
                      telemetryMeta.isAutonomousTwin
                        ? 'bg-[#c2f0fe] text-[#127694]'
                        : telemetryMeta.isStale
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {telemetryMeta.isAutonomousTwin ? 'AUTONOMOUS TWIN' : (telemetryMeta.connectionState || 'CONNECTED')}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[11px]">Stream Engine:</span>
                      <strong className={`font-bold text-[11px] ${telemetryMeta.isAutonomousTwin ? 'text-[#0699C6]' : 'text-emerald-700'}`}>
                        {telemetryMeta.isAutonomousTwin ? 'Autonomous Digital Twin' : 'FastAPI Live Telemetry'}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[11px]">Station Stream:</span>
                      <strong className="font-bold text-[#127694]">{stationId}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[11px]">Round-Trip Latency:</span>
                      <span className="font-mono font-bold text-slate-800">
                        {telemetryMeta.isAutonomousTwin ? '0 ms (Client Math)' : `${telemetryMeta.latencyMs || 12} ms`}
                      </span>
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
                        {telemetryMeta.isAutonomousTwin ? 'Real-time (Active Twin)' : (telemetryMeta.staleSeconds < 2 ? 'Just now (<1s)' : `${telemetryMeta.staleSeconds}s ago`)}
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

                    {/* Hardware SCADA Gateway Telemetry */}
                    <div className="pt-2 border-t border-slate-100 mt-2 space-y-1">
                      <div className="text-[9px] font-black uppercase text-[#0699C6] tracking-wider flex items-center justify-between">
                        <span>Hardware SCADA Gateway</span>
                        <span className="text-emerald-600 font-bold">● ONLINE</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Field Protocol:</span>
                        <span className="font-mono font-bold text-slate-800">IEC 61850 MMS / Modbus-TCP</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Substation Bus:</span>
                        <span className="font-mono text-slate-700">400V 3-Phase · 50.02 Hz</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>PLC Registers:</span>
                        <span className="font-mono text-slate-700">40001-40028 (Sync Active)</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">Cadence: ~1.0 Hz High-Speed</span>
                      <span className="text-[9px] font-mono text-slate-400">
                        {telemetryMeta.isAutonomousTwin ? 'Client Digital Twin' : 'FastAPI Stream'}
                      </span>
                    </div>
                    {telemetryMeta.reconnectNow && (
                      <button
                        type="button"
                        onClick={telemetryMeta.reconnectNow}
                        className="w-full mt-1 px-3 py-1.5 rounded-lg bg-[#127694] hover:bg-[#0699C6] text-white font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                      >
                        <i className={`fa-solid fa-rotate text-xs ${telemetryMeta.isBackendWaking ? 'animate-spin' : ''}`}></i>
                        <span>{telemetryMeta.isBackendWaking ? 'Waking Cloud Backend...' : 'Wake / Reconnect Backend'}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Polar Night / Aurora Dark Mode Toggle */}
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={isDarkMode ? 'Switch to Arctic Day Ice Theme' : 'Switch to Aurora Polar Night Mode'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition shadow-xs cursor-pointer border ${
              isDarkMode
                ? 'bg-[#162a45] text-cyan-300 border-cyan-500/50 hover:bg-[#1e3a5f]'
                : 'bg-[#e5f6fd] text-[#127694] border-[#bcecfc] hover:bg-[#c2f0fe]'
            }`}
            title={isDarkMode ? 'Switch to Arctic Day Ice Theme' : 'Switch to Aurora Polar Night Mode'}
          >
            <i className={`fa-solid ${isDarkMode ? 'fa-sun text-amber-400' : 'fa-moon text-[#0699C6]'}`} aria-hidden="true"></i>
            <span className="hidden sm:inline font-mono text-[10px] uppercase font-extrabold">{isDarkMode ? 'DAY ICE' : 'AURORA NIGHT'}</span>
          </button>
        </div>

        {/* Mobile Right Section: Compact Status Badge & Burger Menu Button */}
        <div className="flex lg:hidden items-center gap-1.5 sm:gap-2 shrink-0 ml-auto" id="mobileNavContainer">
          {/* Compact Telemetry & Mode Badge */}
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#e5f6fd] border border-[#bcecfc] text-[#127694] text-[10px] font-extrabold shadow-xs">
            <span className={`w-1.5 h-1.5 rounded-full ${
              telemetryMeta?.isAutonomousTwin ? 'bg-[#05C5FF]' : telemetryMeta?.isStale ? 'bg-rose-500' : 'bg-emerald-500'
            } animate-pulse`}></span>
            <span className="uppercase">{currentStation.name.split(' ')[0]}</span>
            <span className="text-slate-400 font-normal">·</span>
            <span className="text-[#0699C6]">{mode === 'SCADA_MODE' ? 'SCADA' : 'DEMO'}</span>
          </div>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={isDarkMode ? 'Switch to Arctic Day Ice Theme' : 'Switch to Aurora Polar Night Mode'}
            className={`w-8 h-8 rounded-xl border flex items-center justify-center transition shadow-xs cursor-pointer ${
              isDarkMode
                ? 'bg-[#162a45] text-cyan-300 border-cyan-500/50 hover:bg-[#1e3a5f]'
                : 'bg-[#e5f6fd] text-[#127694] border-[#bcecfc] hover:bg-[#c2f0fe]'
            }`}
            title={isDarkMode ? 'Switch to Arctic Day Theme' : 'Switch to Aurora Night Mode'}
          >
            <i className={`fa-solid ${isDarkMode ? 'fa-sun text-amber-400' : 'fa-moon text-[#0699C6]'} text-xs`} aria-hidden="true"></i>
          </button>

          {/* Burger Menu Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle Mission Controls Menu"
            aria-expanded={isMobileMenuOpen}
            className={`w-8 h-8 rounded-xl border flex items-center justify-center transition shadow-xs cursor-pointer ${
              isMobileMenuOpen
                ? 'bg-[#127694] text-white border-[#127694]'
                : 'bg-[#edf9fd] hover:bg-[#c2f0fe] text-[#127694] border-[#bcecfc]'
            }`}
            title="Open Mission Controls Menu"
          >
            <i className={`fa-solid ${isMobileMenuOpen ? 'fa-xmark' : 'fa-bars'} text-sm`}></i>
          </button>
        </div>
      </div>

      {/* =========================================================================
          ROW 2: 5 PRIMARY USER-FACING POLAR EMS FEATURES
          1. LOAD FORECAST  2. DIGITAL TWIN  3. ENERGY MATRIX  4. COPILOT  5. EXPORT REPORTS
          ========================================================================= */}
      <div className="w-full pt-1.5 border-t border-[#bcecfc]/50">
        <div className="hidden lg:flex items-center justify-between gap-3 py-0.5">
          {/* Under Logo on Left: Real-Time Alerts Quick Action */}
          <div className="shrink-0 flex items-center">
            <button
              type="button"
              onClick={() => onOpenModal('alerts')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold shadow-xs transition cursor-pointer ${
                telemetryMeta?.alertCount > 0
                  ? 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100 animate-pulse'
                  : 'bg-[#edf9fd] border-[#bcecfc] text-[#127694] hover:bg-[#c2f0fe]'
              }`}
              title="SCADA Alarms & Real-Time Operational Alerts"
            >
              <i className={`fa-solid fa-triangle-exclamation text-xs ${telemetryMeta?.alertCount > 0 ? 'text-rose-600' : 'text-[#0699C6]'}`}></i>
              <span className="font-extrabold uppercase">ALERTS</span>
              {telemetryMeta?.alertCount > 0 && (
                <span className="bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full">
                  {telemetryMeta.alertCount}
                </span>
              )}
            </button>
          </div>

          {/* Center: Navigation Pills */}
          <nav className="flex items-center gap-1.5 xl:gap-2 justify-center flex-1">
          
          {/* Overview HUD Tab */}
          <button
            type="button"
            className={`nav-pill font-bold ${(!activeModal || activeModal === 'overview') ? 'active' : ''}`}
            onClick={() => {
              onOpenModal(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            title="Operational Overview HUD & Live Polar Gauges"
          >
            <i className="fa-solid fa-table-cells-large text-xs"></i>
            <span>OVERVIEW</span>
          </button>

          {/* 1. LOAD FORECAST */}
          <button
            type="button"
            className={`nav-pill font-black ${activeModal === 'forecast' ? 'active' : ''}`}
            onClick={() => onOpenModal('forecast')}
            title="Feature 1: Probabilistic Load & Renewable Predictions (P10/P50/P90), Multi-Horizon & Weather Inputs"
          >
            <i className="fa-solid fa-chart-line text-xs text-[#0699C6]"></i>
            <span>LOAD FORECAST</span>
          </button>

          {/* 2. DIGITAL TWIN */}
          <button
            type="button"
            className={`nav-pill font-black ${(activeModal === 'digital_twin' || activeModal === 'monitoring' || activeModal === 'devices' || activeModal === 'maintenance') ? 'active' : ''}`}
            onClick={() => onOpenModal('digital_twin')}
            title="Feature 2: Equipment SCADA Registers, Asset Degradation, Electro-Thermal Twin & Cause-and-Effect Analysis"
          >
            <i className="fa-solid fa-cube text-xs text-[#0699C6]"></i>
            <span>DIGITAL TWIN</span>
          </button>

          {/* 3. ENERGY MATRIX */}
          <button
            type="button"
            className={`nav-pill font-black ${(activeModal === 'energy' || activeModal === 'microgrid' || activeModal === 'dispatch' || activeModal === 'battery') ? 'active' : ''}`}
            onClick={() => onOpenModal('energy')}
            title="Feature 3: 3-Tier HiGHS MILP Optimizer, Power Balance Flow, Storage Coordination & Safety Constraints"
          >
            <i className="fa-solid fa-bolt text-xs text-[#0699C6]"></i>
            <span>ENERGY MATRIX</span>
          </button>

          {/* 4. COPILOT */}
          <button
            type="button"
            className={`nav-pill font-black ${activeModal === 'copilot' ? 'active' : ''}`}
            onClick={() => onOpenModal('copilot')}
            title="Feature 4: Autonomous Polar Operational Assistant & Grounded 6-Part Decision Explanations"
          >
            <i className="fa-solid fa-microchip text-xs text-[#0699C6]"></i>
            <span>COPILOT</span>
            {telemetryMeta?.recommendationsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-[#0699C6] text-white text-[9px] font-black shadow-xs">
                {telemetryMeta.recommendationsCount}
              </span>
            )}
          </button>

          {/* 5. EXPORT REPORTS */}
          <button
            type="button"
            className={`nav-pill font-black ${(activeModal === 'reports' || activeModal === 'analytics') ? 'active' : ''}`}
            onClick={() => onOpenModal('reports')}
            title="Feature 5: Logistics Savings Evidence, Baseline vs PolarOPS Evaluation, Printable HTML & CSV/JSON Data Exports"
          >
            <i className="fa-solid fa-file-invoice text-xs text-[#0699C6]"></i>
            <span>EXPORT REPORTS</span>
          </button>

        </nav>

        {/* Right: 415V Single-Line Diagram & 1-Click Polar Crisis Simulator */}
        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenModal('sld')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition shadow-xs cursor-pointer border ${
              activeModal === 'sld'
                ? 'bg-[#0699C6] text-white border-[#05C5FF] shadow-md ring-2 ring-[#05C5FF]/40'
                : 'bg-[#e5f6fd] hover:bg-[#c2f0fe] text-[#127694] border-[#bcecfc]'
            }`}
            title="Open Substation Single-Line Diagram (SLD) - Physical 415V Busbar & Protection Topology"
          >
            <i className="fa-solid fa-diagram-project text-xs text-[#0699C6]"></i>
            <span className="uppercase tracking-tight">415V SLD</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('crisis')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold transition shadow-xs cursor-pointer border ${
              activeModal === 'crisis'
                ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white border-rose-500 shadow-md ring-2 ring-rose-400/40'
                : 'bg-gradient-to-r from-rose-50 via-amber-50 to-rose-50 dark:from-rose-950/40 dark:via-amber-950/30 dark:to-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800/80 hover:border-rose-400'
            }`}
            title="Open 1-Click Polar Emergency Stress-Test & NCPOR Fiscal ROI Ledger"
          >
            <i className="fa-solid fa-bolt-lightning text-amber-500 text-xs animate-pulse"></i>
            <span className="font-black uppercase tracking-tight">CRISIS SIM</span>
            <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full bg-rose-600 text-white shadow-xs">
              LIVE BENCH
            </span>
          </button>
        </div>
      </div>

        {/* Mobile / Tablet Responsive Drawer Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden mt-2 p-3 bg-white rounded-2xl border border-[#bcecfc] shadow-xl animate-fadeIn space-y-3 font-sans max-h-[85vh] overflow-y-auto">
            {/* Mobile Mission Controls: Station Selector */}
            <div className="space-y-1.5 pb-2 border-b border-slate-100">
              <div className="flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <span>Antarctic Station</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenModal('comparison');
                  }}
                  className="text-[#0699C6] font-extrabold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <i className="fa-solid fa-code-compare text-[9px]"></i> Compare Bases
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.values(STATIONS).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      onStationChange(st.id);
                    }}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                      stationId === st.id
                        ? 'bg-[#127694] text-white border-[#127694] shadow-xs'
                        : 'bg-[#edf9fd] hover:bg-[#c2f0fe] text-[#127694] border-[#bcecfc]'
                    }`}
                  >
                    <i className="fa-solid fa-location-dot text-[10px]"></i>
                    <span>{st.name.split(' ')[0]} Base</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile Operational Mode [DEMO | SCADA] & [OVERRIDE] */}
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1 bg-[#e5f6fd] p-0.5 rounded-full border border-[#bcecfc] flex-1">
                <button
                  type="button"
                  className={`mode-pill flex-1 text-center py-1 text-[11px] ${mode === 'DEMO_MODE' ? 'active' : ''}`}
                  onClick={() => onModeChange('DEMO_MODE')}
                >
                  DEMO
                </button>
                <button
                  type="button"
                  className={`mode-pill flex-1 text-center py-1 text-[11px] ${mode === 'SCADA_MODE' ? 'active' : ''}`}
                  onClick={() => onModeChange('SCADA_MODE')}
                >
                  SCADA
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenModal('manual');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border transition shadow-xs cursor-pointer shrink-0 ${
                  mode === 'DEMO_MODE'
                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-300'
                }`}
              >
                <i className={`fa-solid fa-sliders text-xs ${mode === 'DEMO_MODE' ? 'text-amber-600' : 'text-rose-600'}`}></i>
                <span>OVERRIDE</span>
              </button>
            </div>

            {/* Live Clock & Stream Status Bar */}
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-mono">
              <span className="font-bold flex items-center gap-1.5 text-[11px]">
                <i className="fa-regular fa-clock text-slate-400"></i>
                {clockTime || 'ANTARCTIC UTC'}
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${
                  telemetryMeta?.isAutonomousTwin ? 'bg-[#05C5FF]' : telemetryMeta?.isStale ? 'bg-rose-500' : 'bg-emerald-500'
                } animate-pulse`}></span>
                <span className="text-[10px] font-bold">
                  {telemetryMeta?.isAutonomousTwin ? 'AUTONOMOUS TWIN' : telemetryMeta?.isStale ? 'STALE' : 'LIVE'}
                </span>
                {telemetryMeta?.reconnectNow && (
                  <button
                    type="button"
                    onClick={telemetryMeta.reconnectNow}
                    className="ml-1 text-[9px] font-sans font-bold text-[#127694] underline cursor-pointer"
                  >
                    Resync
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-slate-100 pb-1 pt-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                Primary Polar EMS Workspaces
              </span>
              <span className="text-[9px] font-mono text-[#0699C6] font-bold">
                8 MODULES
              </span>
            </div>

            {/* The 5 Primary Views in Mobile Drawer */}
            <div className="space-y-1.5">
              
              {/* Overview HUD */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenModal(null);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs font-bold transition ${
                  (!activeModal || activeModal === 'overview')
                    ? 'bg-[#edf9fd] text-[#127694] border border-[#bcecfc]'
                    : 'bg-slate-50 hover:bg-[#edf9fd] text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-table-cells-large text-[#127694]"></i>
                  <span>OVERVIEW HUD</span>
                </div>
                <span className="text-[10px] text-slate-400 font-normal">Real-Time Gauges</span>
              </button>

              {/* 1. LOAD FORECAST */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenModal('forecast');
                }}
                className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs font-bold transition ${
                  activeModal === 'forecast'
                    ? 'bg-[#edf9fd] text-[#127694] border border-[#bcecfc]'
                    : 'bg-slate-50 hover:bg-[#edf9fd] text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-chart-line text-sky-500"></i>
                  <span>1. LOAD FORECAST</span>
                </div>
                <span className="text-[10px] text-slate-400 font-normal">P10/P50/P90 Predictions</span>
              </button>

              {/* 2. DIGITAL TWIN */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenModal('digital_twin');
                }}
                className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs font-bold transition ${
                  activeModal === 'digital_twin'
                    ? 'bg-[#edf9fd] text-[#127694] border border-[#bcecfc]'
                    : 'bg-slate-50 hover:bg-[#edf9fd] text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-cube text-[#0699C6]"></i>
                  <span>2. DIGITAL TWIN</span>
                </div>
                <span className="text-[10px] text-slate-400 font-normal">Assets &amp; What-If</span>
              </button>

              {/* 3. ENERGY MATRIX */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenModal('energy');
                }}
                className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs font-bold transition ${
                  activeModal === 'energy'
                    ? 'bg-[#edf9fd] text-[#127694] border border-[#bcecfc]'
                    : 'bg-slate-50 hover:bg-[#edf9fd] text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-bolt text-[#0699C6]"></i>
                  <span>3. ENERGY MATRIX</span>
                </div>
                <span className="text-[10px] text-slate-400 font-normal">HiGHS Dispatch &amp; Flow</span>
              </button>

              {/* 4. COPILOT */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenModal('copilot');
                }}
                className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs font-bold transition ${
                  activeModal === 'copilot'
                    ? 'bg-[#edf9fd] text-[#127694] border border-[#bcecfc]'
                    : 'bg-slate-50 hover:bg-[#edf9fd] text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-microchip text-[#0699C6]"></i>
                  <span>4. COPILOT</span>
                </div>
                <span className="text-[10px] text-slate-400 font-normal">Decision Explanations</span>
              </button>

              {/* 5. EXPORT REPORTS */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenModal('reports');
                }}
                className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs font-bold transition ${
                  activeModal === 'reports'
                    ? 'bg-[#edf9fd] text-[#127694] border border-[#bcecfc]'
                    : 'bg-slate-50 hover:bg-[#edf9fd] text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-file-invoice text-[#0699C6]"></i>
                  <span>5. EXPORT REPORTS</span>
                </div>
                <span className="text-[10px] text-slate-400 font-normal">Savings &amp; Evidence</span>
              </button>

              {/* 5.5 SUBSTATION SINGLE-LINE DIAGRAM (SLD) */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenModal('sld');
                }}
                className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs font-bold transition ${
                  activeModal === 'sld'
                    ? 'bg-[#edf9fd] text-[#127694] border border-[#bcecfc]'
                    : 'bg-slate-50 hover:bg-[#edf9fd] text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-diagram-project text-[#0699C6]"></i>
                  <span>415V SUBSTATION SLD</span>
                </div>
                <span className="text-[10px] text-slate-400 font-normal">Physical Busbar &amp; CBs</span>
              </button>

              {/* 6. CRISIS SIMULATOR (LIVE BENCH) */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenModal('crisis');
                }}
                className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs font-bold transition ${
                  activeModal === 'crisis'
                    ? 'bg-rose-50 text-rose-700 border border-rose-300'
                    : 'bg-gradient-to-r from-rose-50 to-amber-50 hover:from-rose-100 hover:to-amber-100 text-rose-800 border border-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-bolt-lightning text-amber-500"></i>
                  <span>CRISIS SIMULATOR</span>
                </div>
                <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full bg-rose-600 text-white">
                  LIVE BENCH
                </span>
              </button>
            </div>

            {/* Quick Diagnostic / Safety Utilities in Mobile Drawer */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenModal('alerts');
                }}
                className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1"
              >
                <i className="fa-solid fa-triangle-exclamation text-rose-600 text-[10px]"></i> Alerts
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenModal('manual');
                }}
                className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1"
              >
                <i className="fa-solid fa-sliders text-amber-600 text-[10px]"></i> Override
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenModal('database');
                }}
                className="px-2 py-1 rounded-lg bg-[#edf9fd] hover:bg-[#c2f0fe] text-[#127694] border border-[#bcecfc] flex items-center gap-1"
              >
                <i className="fa-solid fa-database text-[#0699C6] text-[10px]"></i> Database
              </button>
            </div>
          </div>
        )}

      </div>
    </header>
  );
}
