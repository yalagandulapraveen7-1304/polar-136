import React, { useState, useEffect } from 'react';
import { STATIONS } from '../constants/stations';

export default function Header({
  stationId,
  onStationChange,
  mode,
  onModeChange,
  onOpenModal,
  clockTime,
  connectionStatus = 'SATELLITE LINK ACTIVE'
}) {
  const [isStationMenuOpen, setIsStationMenuOpen] = useState(false);
  const currentStation = STATIONS[stationId] || STATIONS.MAITRI;

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (!e.target.closest('#stationDropdownContainer')) {
        setIsStationMenuOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <header id="mainNavHeader" className="w-full floating-nav px-4 py-2.5 z-40 relative transition-all duration-300">
      <div className="flex items-center justify-between w-full flex-wrap gap-2">
        {/* Brand Identity & System Tag */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0698c4] to-[#127694] text-white flex items-center justify-center shadow-md shrink-0">
            <i className="fa-solid fa-snowflake text-sm text-white"></i>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold tracking-tight text-lg text-[#127694] leading-none">POLAR EMS</span>
            <span className="text-[10px] tracking-wider uppercase font-bold px-2 py-0.5 rounded-full bg-[#c2f0fe] text-[#0698c4] border border-[#9ae5fe]">
              MISSION CONTROL
            </span>
          </div>
        </div>

        {/* Station Selector Dropdown: "MAITRI ▼" */}
        <div className="relative" id="stationDropdownContainer">
          <button
            type="button"
            onClick={() => setIsStationMenuOpen(!isStationMenuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e5f6fd] hover:bg-[#c2f0fe] border border-[#9ae5fe] transition text-[#127694] font-bold text-xs shadow-sm"
          >
            <i className="fa-solid fa-location-dot text-[#0698c4]"></i>
            <span>Station:</span>
            <span className="text-slate-900 font-extrabold uppercase">{currentStation.name.split(' ')[0]}</span>
            <i className={`fa-solid fa-chevron-down text-[10px] transition-transform duration-200 ${isStationMenuOpen ? 'rotate-180' : ''}`}></i>
          </button>

          {isStationMenuOpen && (
            <div className="absolute left-0 mt-1.5 w-64 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-[#9ae5fe] p-1.5 z-50 animate-fadeIn">
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
                      : 'text-slate-700 hover:bg-[#e5f6fd] hover:text-[#0698c4]'
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
            </div>
          )}
        </div>

        {/* Operational Mode Toggle: DEMO vs SCADA */}
        <div className="flex items-center gap-1 bg-[#e5f6fd] p-1 rounded-full border border-[#9ae5fe]">
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

        {/* System Status Pill: "● OPERATIONAL" */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"></span>
          <span>OPERATIONAL</span>
          <span className="hidden xl:inline text-[10px] text-emerald-600 font-semibold border-l border-emerald-300 pl-2">
            Balance: 0.00 kW residual
          </span>
        </div>

        {/* Center / Action Pills for Modals */}
        <nav className="hidden lg:flex items-center gap-1 bg-white/80 p-1 rounded-full border border-[#9ae5fe]/60 shadow-inner">
          <button
            className="nav-pill active"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <i className="fa-solid fa-table-cells-large text-xs"></i> Overview
          </button>
          <button
            className="nav-pill text-[#127694] hover:text-[#0698c4]"
            onClick={() => onOpenModal('monitoring')}
          >
            <i className="fa-solid fa-chart-pie text-xs"></i> Monitor
          </button>
          <button
            className="nav-pill text-emerald-700 hover:text-emerald-800"
            onClick={() => onOpenModal('battery')}
          >
            <i className="fa-solid fa-car-battery text-xs text-emerald-600"></i> Storage
          </button>
          <button
            className="nav-pill text-cyan-700 hover:text-cyan-800"
            onClick={() => onOpenModal('microgrid')}
          >
            <i className="fa-solid fa-network-wired text-xs text-cyan-600"></i> Microgrid
          </button>
          <button
            className="nav-pill text-sky-700 hover:text-sky-800"
            onClick={() => onOpenModal('weather')}
          >
            <i className="fa-solid fa-cloud-bolt text-xs text-sky-600"></i> Weather
          </button>
          <button
            className="nav-pill"
            onClick={() => onOpenModal('forecast')}
          >
            <i className="fa-solid fa-chart-line text-xs"></i> Forecast
          </button>
          <button
            className="nav-pill"
            onClick={() => onOpenModal('dispatch')}
          >
            <i className="fa-solid fa-code-fork text-xs"></i> Dispatch
          </button>
          <button
            className="nav-pill"
            onClick={() => onOpenModal('copilot')}
          >
            <i className="fa-solid fa-robot text-xs"></i> AI Copilot
          </button>
          <button
            className="nav-pill"
            onClick={() => onOpenModal('maintenance')}
          >
            <i className="fa-solid fa-shield-halved text-xs"></i> Maintenance
          </button>
          <button
            className="nav-pill text-amber-700 hover:text-amber-800"
            onClick={() => onOpenModal('manual')}
          >
            <i className="fa-solid fa-sliders text-xs text-amber-600"></i> Override
          </button>
        </nav>

        {/* Live Antarctic Time & Operator Profile */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col text-right">
            <span className="font-mono text-xs font-bold text-slate-800 tracking-tight">
              {clockTime || 'ANTARCTIC UTC'}
            </span>
            <span className="text-[9px] font-semibold text-cyan-700 flex items-center gap-1 justify-end">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
              {connectionStatus}
            </span>
          </div>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="w-7 h-7 rounded-full bg-slate-800 text-cyan-300 flex items-center justify-center font-bold text-[10px] ring-2 ring-[#0698c4]/40 shadow-sm" title="Cmdr. E. Vance · SIH Lead">
              EV
            </div>
            <div className="hidden xl:flex flex-col text-left">
              <span className="text-[11px] font-bold text-slate-800 leading-none">Cmdr. Vance</span>
              <span className="text-[9px] font-semibold text-slate-400">SIH Lead Op</span>
            </div>
          </div>
        </div>

      </div>
    </header>
  );
}
