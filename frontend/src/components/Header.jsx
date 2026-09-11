import React, { useState, useEffect } from 'react';

export default function Header({
  stationId,
  onStationChange,
  mode,
  onModeChange,
  onOpenModal,
  clockTime
}) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Close drawer on escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isDrawerOpen) {
        setIsDrawerOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen]);

  return (
    <header id="mainNavHeader" className="w-full floating-nav px-3.5 sm:px-5 py-2.5 z-30 relative transition-all duration-300">
      <div className="flex items-center justify-between w-full">
        {/* Brand Identity */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-[#0698c4] to-[#127694] text-white flex items-center justify-center shadow-sm shrink-0">
            <i className="fa-solid fa-snowflake text-xs sm:text-sm text-white"></i>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold tracking-tight text-base sm:text-lg text-[#127694] leading-none">NOVARA</span>
            <span className="text-[9px] sm:text-[10px] tracking-wider uppercase font-bold px-1.5 py-0.5 rounded-full bg-[#c2f0fe] text-[#0698c4]">POLAR EMS</span>
          </div>
        </div>

        {/* Station Selector Pills (Visible on md+ tablets and desktop) */}
        <div className="hidden md:flex items-center gap-1 bg-[#e5f6fd] p-1 rounded-full border border-[#9ae5fe]">
          <button
            id="btn-bharati"
            className={`station-pill ${stationId === 'BHARATI' ? 'active' : ''}`}
            data-station="BHARATI"
            onClick={() => onStationChange('BHARATI')}
          >
            Bharati
          </button>
          <button
            id="btn-maitri"
            className={`station-pill ${stationId === 'MAITRI' ? 'active' : ''}`}
            data-station="MAITRI"
            onClick={() => onStationChange('MAITRI')}
          >
            Maitri
          </button>
        </div>

        {/* Center Navigation Links (Visible on lg+) */}
        <nav className="hidden lg:flex items-center gap-1 bg-white/80 p-1 rounded-full border border-[#9ae5fe]/60 shadow-inner">
          <button
            className="nav-pill active"
            data-nav="overview"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <i className="fa-solid fa-table-cells-large text-xs"></i> Overview
          </button>
          <button
            className="nav-pill"
            id="navBtnForecast"
            data-nav="forecast"
            onClick={() => onOpenModal('forecast')}
          >
            <i className="fa-solid fa-chart-line text-xs"></i> Forecast (Full)
          </button>
          <button
            className="nav-pill"
            id="navBtnDispatch"
            data-nav="dispatch"
            onClick={() => onOpenModal('dispatch')}
          >
            <i className="fa-solid fa-code-fork text-xs"></i> Dispatch
          </button>
          <button
            className="nav-pill"
            id="navBtnAssistant"
            data-nav="assistant"
            onClick={() => onOpenModal('copilot')}
          >
            <i className="fa-solid fa-robot text-xs"></i> Assistant
          </button>
          <button
            className="nav-pill"
            id="navBtnMaintenance"
            data-nav="maintenance"
            onClick={() => onOpenModal('maintenance')}
          >
            <i className="fa-solid fa-shield-halved text-xs"></i> Maintenance
          </button>
        </nav>

        {/* Right Header Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Dual Mode Pill Toggle (Desktop & Tablet) */}
          <div className="hidden sm:flex items-center bg-[#f0faff] p-0.5 rounded-full border border-[#9ae5fe]/80 text-[10px]">
            <button
              id="btn-mode-demo"
              className={`mode-pill ${mode === 'DEMO_MODE' ? 'active' : ''}`}
              title="Live NASA/Open-Meteo Antarctic Weather API"
              onClick={() => onModeChange('DEMO_MODE')}
            >
              API
            </button>
            <button
              id="btn-mode-scada"
              className={`mode-pill ${mode === 'SCADA_MODE' ? 'active' : ''}`}
              title="Modbus TCP / MQTT Registers"
              onClick={() => onModeChange('SCADA_MODE')}
            >
              SCADA
            </button>
          </div>

          {/* Manual Override Entry Button (Desktop & Tablet) */}
          <button
            id="btnOpenManualModal"
            className="hidden sm:flex text-[11px] font-bold text-[#127694] hover:text-[#0698c4] transition items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-[#9ae5fe] shadow-sm"
            onClick={() => onOpenModal('manual')}
          >
            <i className="fa-solid fa-sliders text-xs text-[#05c5ff]"></i>
            <span>Manual Entry</span>
          </button>

          {/* Live UTC Station Clock (Desktop only) */}
          <div className="hidden xl:flex items-center gap-1.5 text-slate-500 font-mono text-[10px] bg-white/90 px-3 py-1.5 rounded-full border border-[#9ae5fe]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot"></span>
            <span id="stationClock">{clockTime || '2026-09-07 16:11:29 UTC'}</span>
          </div>

          {/* Mobile Station Badge Pill (< md) */}
          <div className="flex md:hidden items-center gap-0.5 bg-[#e5f6fd] p-0.5 rounded-full border border-[#9ae5fe] text-[10px]">
            <button
              id="btn-bharati-mobile-pill"
              className={`station-pill-mini ${stationId === 'BHARATI' ? 'active' : ''}`}
              data-station="BHARATI"
              onClick={() => onStationChange('BHARATI')}
            >
              Bharati
            </button>
            <button
              id="btn-maitri-mobile-pill"
              className={`station-pill-mini ${stationId === 'MAITRI' ? 'active' : ''}`}
              data-station="MAITRI"
              onClick={() => onStationChange('MAITRI')}
            >
              Maitri
            </button>
          </div>

          {/* BURGER BUTTON (Visible on mobile & tablet: < lg) */}
          <button
            id="btnBurgerMenu"
            className="lg:hidden p-2 rounded-xl bg-white/95 hover:bg-[#e5f6fd] active:scale-95 border border-[#9ae5fe] text-[#127694] transition-all flex items-center justify-center shadow-sm"
            aria-label="Toggle navigation menu"
            aria-expanded={isDrawerOpen}
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          >
            <i
              id="burgerIcon"
              className={`fa-solid ${isDrawerOpen ? 'fa-xmark rotate-90' : 'fa-bars'} text-sm transition-transform duration-200`}
            ></i>
          </button>
        </div>
      </div>

      {/* COLLAPSIBLE MOBILE & TABLET DRAWER */}
      <div
        id="mobileNavDrawer"
        className={`mobile-drawer-overlay lg:hidden flex flex-col gap-3 p-3.5 sm:p-4 ${isDrawerOpen ? 'is-open' : ''}`}
      >
        {/* Navigation Grid: 2 columns on mobile, 3 columns on tablet */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <button
            type="button"
            className="mobile-nav-btn active"
            id="mobileNavOverview"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setIsDrawerOpen(false);
            }}
          >
            <i className="fa-solid fa-table-cells-large text-base text-[#0698c4]"></i>
            <span>Overview</span>
          </button>
          <button
            type="button"
            className="mobile-nav-btn"
            id="mobileNavForecast"
            onClick={() => {
              onOpenModal('forecast');
              setIsDrawerOpen(false);
            }}
          >
            <i className="fa-solid fa-chart-line text-base text-[#0698c4]"></i>
            <span>Full Forecast</span>
          </button>
          <button
            type="button"
            className="mobile-nav-btn"
            id="mobileNavDispatch"
            onClick={() => {
              onOpenModal('dispatch');
              setIsDrawerOpen(false);
            }}
          >
            <i className="fa-solid fa-code-fork text-base text-[#0698c4]"></i>
            <span>Dispatch Matrix</span>
          </button>
          <button
            type="button"
            className="mobile-nav-btn"
            id="mobileNavAssistant"
            onClick={() => {
              onOpenModal('copilot');
              setIsDrawerOpen(false);
            }}
          >
            <i className="fa-solid fa-robot text-base text-[#0698c4]"></i>
            <span>AI Assistant</span>
          </button>
          <button
            type="button"
            className="mobile-nav-btn"
            id="mobileNavMaintenance"
            onClick={() => {
              onOpenModal('maintenance');
              setIsDrawerOpen(false);
            }}
          >
            <i className="fa-solid fa-shield-halved text-base text-[#0698c4]"></i>
            <span>Maintenance</span>
          </button>
          <button
            type="button"
            className="mobile-nav-btn"
            id="mobileNavManual"
            onClick={() => {
              onOpenModal('manual');
              setIsDrawerOpen(false);
            }}
          >
            <i className="fa-solid fa-sliders text-base text-[#05c5ff]"></i>
            <span>Manual Entry</span>
          </button>
        </div>

        {/* Quick Switch Bar for Station & Mode (Mobile & Tablet) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-[#9ae5fe]/40">
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Station:</span>
            <div className="flex items-center gap-1 bg-[#e5f6fd] p-1 rounded-full border border-[#9ae5fe]">
              <button
                id="btn-bharati-mobile"
                className={`station-pill ${stationId === 'BHARATI' ? 'active' : ''}`}
                data-station="BHARATI"
                onClick={() => {
                  onStationChange('BHARATI');
                  setIsDrawerOpen(false);
                }}
              >
                Bharati
              </button>
              <button
                id="btn-maitri-mobile"
                className={`station-pill ${stationId === 'MAITRI' ? 'active' : ''}`}
                data-station="MAITRI"
                onClick={() => {
                  onStationChange('MAITRI');
                  setIsDrawerOpen(false);
                }}
              >
                Maitri
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Stream:</span>
            <div className="flex items-center bg-[#f0faff] p-0.5 rounded-full border border-[#9ae5fe]/80 text-[10px]">
              <button
                id="btn-mode-demo-mobile"
                className={`mode-pill ${mode === 'DEMO_MODE' ? 'active' : ''}`}
                onClick={() => {
                  onModeChange('DEMO_MODE');
                  setIsDrawerOpen(false);
                }}
              >
                API Weather
              </button>
              <button
                id="btn-mode-scada-mobile"
                className={`mode-pill ${mode === 'SCADA_MODE' ? 'active' : ''}`}
                onClick={() => {
                  onModeChange('SCADA_MODE');
                  setIsDrawerOpen(false);
                }}
              >
                SCADA PLC
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Clock & Live Status */}
        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono bg-white/80 px-3 py-1.5 rounded-xl border border-[#9ae5fe]/60">
          <span className="flex items-center gap-1.5 font-sans font-semibold text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot"></span>
            Microgrid Online
          </span>
          <span id="stationClockMobile">{clockTime || '--:--:-- UTC'}</span>
        </div>
      </div>
    </header>
  );
}
