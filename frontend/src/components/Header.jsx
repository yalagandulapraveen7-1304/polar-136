import React, { useState, useEffect } from 'react';
import { STATIONS } from '../constants/stations';

export default function Header({
  stationId,
  onStationChange,
  mode,
  onModeChange,
  onOpenModal,
  clockTime,
  connectionStatus = 'SATELLITE LINK ACTIVE',
  telemetryMeta = {}
}) {
  const [isStationMenuOpen, setIsStationMenuOpen] = useState(false);
  const [isDiagOpen, setIsDiagOpen] = useState(false);
  const currentStation = STATIONS[stationId] || STATIONS.MAITRI;

  // Close dropdown and diag on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (!e.target.closest('#stationDropdownContainer')) {
        setIsStationMenuOpen(false);
      }
      if (!e.target.closest('#diagPopoverContainer')) {
        setIsDiagOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <header id="mainNavHeader" className="w-full floating-nav px-4 py-2.5 z-40 relative transition-all duration-300 flex flex-col gap-2">
      {/* ROW 1: TOP COMMAND UTILITY BAR (Brand, Station, Mode on Left; Status, UTC Clock, Telemetry, Profile on Right) */}
      <div className="flex items-center justify-between w-full flex-wrap gap-2.5">
        
        {/* Left Section: Brand, Station Dropdown, Mode Toggle */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Brand Identity & System Tag */}
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
              className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#e5f6fd] hover:bg-[#c2f0fe] border border-[#bcecfc] transition text-[#127694] font-bold text-xs shadow-xs"
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
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition ${
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
                    className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold text-[#127694] hover:bg-[#e5f6fd] hover:text-[#0699C6] flex items-center gap-2 transition"
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
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Cadence: ~1.0 Hz WebSocket</span>
                    {telemetryMeta.reconnectNow && (
                      <button
                        type="button"
                        onClick={telemetryMeta.reconnectNow}
                        className="px-2 py-1 rounded-lg bg-[#edf9fd] hover:bg-[#c2f0fe] text-[#127694] font-bold text-[10px] border border-[#bcecfc] transition"
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

        </div>
      </div>

      {/* ROW 2: DEDICATED CLEAN NAVIGATION BAR (NO METADATA WRAPPING UNDERNEATH) */}
      <div className="w-full pt-1.5 border-t border-[#bcecfc]/50">
        <nav className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 justify-start lg:justify-center">
          <button
            className="nav-pill active shrink-0"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <i className="fa-solid fa-table-cells-large text-xs"></i> Overview
          </button>
          <button
            className="nav-pill text-[#127694] hover:text-[#0699C6] shrink-0"
            onClick={() => onOpenModal('monitoring')}
          >
            <i className="fa-solid fa-chart-pie text-xs"></i> Monitor
          </button>
          <button
            className="nav-pill text-[#127694] hover:text-[#0699C6] shrink-0"
            onClick={() => onOpenModal('devices')}
            title="SCADA-Level Device Monitoring & PLC Telemetry"
          >
            <i className="fa-solid fa-server text-xs text-[#0699C6]"></i> Devices
          </button>
          <button
            className="nav-pill text-[#127694] hover:text-[#0699C6] shrink-0"
            onClick={() => onOpenModal('comparison')}
            title="Multi-Station Side-by-Side Comparison"
          >
            <i className="fa-solid fa-code-compare text-xs text-[#0699C6]"></i> Compare
          </button>
          <button
            className="nav-pill text-emerald-700 hover:text-emerald-800 shrink-0"
            onClick={() => onOpenModal('battery')}
          >
            <i className="fa-solid fa-car-battery text-xs text-emerald-600"></i> Storage
          </button>
          <button
            className="nav-pill text-cyan-700 hover:text-cyan-800 shrink-0"
            onClick={() => onOpenModal('microgrid')}
          >
            <i className="fa-solid fa-network-wired text-xs text-cyan-600"></i> Microgrid
          </button>
          <button
            className="nav-pill text-sky-700 hover:text-sky-800 shrink-0"
            onClick={() => onOpenModal('weather')}
          >
            <i className="fa-solid fa-cloud-bolt text-xs text-sky-600"></i> Weather
          </button>
          <button
            className="nav-pill shrink-0"
            onClick={() => onOpenModal('forecast')}
          >
            <i className="fa-solid fa-chart-line text-xs"></i> Forecast
          </button>
          <button
            className="nav-pill shrink-0"
            onClick={() => onOpenModal('dispatch')}
          >
            <i className="fa-solid fa-code-fork text-xs"></i> Dispatch
          </button>
          <button
            className="nav-pill shrink-0"
            onClick={() => onOpenModal('copilot')}
          >
            <i className="fa-solid fa-robot text-xs"></i> AI Copilot
          </button>
          <button
            className="nav-pill text-rose-700 hover:text-rose-800 shrink-0"
            onClick={() => onOpenModal('alerts')}
            title="Real-Time SCADA Alerts & Compound Risk Intelligence"
          >
            <i className="fa-solid fa-triangle-exclamation text-xs text-rose-600"></i> Alerts
          </button>
          <button
            className="nav-pill shrink-0"
            onClick={() => onOpenModal('maintenance')}
          >
            <i className="fa-solid fa-shield-halved text-xs"></i> Maintenance
          </button>
          <button
            className="nav-pill text-amber-700 hover:text-amber-800 shrink-0"
            onClick={() => onOpenModal('manual')}
          >
            <i className="fa-solid fa-sliders text-xs text-amber-600"></i> Override
          </button>
        </nav>
      </div>
    </header>
  );
}
