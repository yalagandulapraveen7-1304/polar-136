import React, { useState, useEffect } from 'react';
import { STATIONS } from '../constants/stations';

export default function WeatherModal({
  isOpen,
  onClose,
  latestData,
  stationId = 'MAITRI'
}) {
  const [activeTab, setActiveTab] = useState('current'); // 'current' | 'forecast' | 'timeline' | 'simulator' | 'correlations'
  const [forecastHorizon, setForecastHorizon] = useState(24); // 6 | 24 | 72
  const [forecastData, setForecastData] = useState(null);
  const [timelineData, setTimelineData] = useState([]);
  const [alertsData, setAlertsData] = useState([]);
  
  // Custom Simulator Sliders
  const [simTemp, setSimTemp] = useState(-25.0);
  const [simWind, setSimWind] = useState(14.0);
  const [simSolar, setSimSolar] = useState(120.0);
  const [simToast, setSimToast] = useState(null);

  const currentStation = STATIONS[stationId] || STATIONS.MAITRI;
  const w = latestData?.weather_intelligence || {};
  const m = w.meteorology || {};
  const prov = w.data_provenance || {};
  const op = w.operational_impacts || {};

  // Fetch forecast and timeline on open or horizon switch
  useEffect(() => {
    if (!isOpen) return;
    const fetchWeatherExtras = async () => {
      try {
        const fcRes = await fetch(`/api/weather/forecast?horizon=${forecastHorizon}`);
        if (fcRes.ok) setForecastData(await fcRes.json());

        const tlRes = await fetch('/api/weather/timeline');
        if (tlRes.ok) setTimelineData(await tlRes.json());

        const altRes = await fetch('/api/weather/alerts');
        if (altRes.ok) setAlertsData(await altRes.json());
      } catch (e) {
        console.warn('Weather extra fetch error:', e);
      }
    };
    fetchWeatherExtras();
  }, [isOpen, forecastHorizon]);

  if (!isOpen) return null;

  // Handlers
  const handleStressPreset = async (scenario) => {
    try {
      const res = await fetch('/api/weather/stress-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      if (res.ok) {
        setSimToast(`Scenario '${scenario}' applied to Antarctic environmental engine.`);
        setTimeout(() => setSimToast(null), 4000);
      }
    } catch (e) {
      console.warn('Stress preset error:', e);
    }
  };

  const handleCustomSimulate = async () => {
    try {
      const res = await fetch('/api/weather/simulate-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          temperature_c: parseFloat(simTemp),
          wind_speed_ms: parseFloat(simWind),
          solar_irradiance_wm2: parseFloat(simSolar)
        })
      });
      if (res.ok) {
        setSimToast(`Custom stress weather applied: ${simTemp}°C, ${simWind} m/s, ${simSolar} W/m²`);
        setTimeout(() => setSimToast(null), 4000);
      }
    } catch (e) {
      console.warn('Custom simulate error:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900/95 border border-cyan-500/40 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col text-slate-100 overflow-hidden font-sans">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/20 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold text-lg">
              <i className="fa-solid fa-cloud-bolt"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-wide text-cyan-300">POLAR WEATHER & ENVIRONMENTAL INTELLIGENCE</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-500/30">
                  {currentStation.name}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  prov.source === 'LIVE' ? 'bg-emerald-950 text-emerald-400 border-emerald-500/30' : 'bg-amber-950 text-amber-400 border-amber-500/30'
                }`}>
                  ● {prov.source || 'SYNTHETIC'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Coupling Antarctic Meteorology directly into Renewable Potential, Building Heat Loss ($UA \times \Delta T$), and Microgrid Dispatch
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-700"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Global Toast */}
        {simToast && (
          <div className="px-6 py-2.5 bg-cyan-500/20 border-b border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-circle-check text-cyan-400"></i>
              <span>{simToast}</span>
            </div>
            <button onClick={() => setSimToast(null)} className="text-cyan-400 hover:text-white">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-800 bg-slate-900/40 overflow-x-auto">
          {[
            { id: 'current', label: '1. Live Environmental Status', icon: 'fa-temperature-low' },
            { id: 'forecast', label: '2. Multi-Horizon Quantiles', icon: 'fa-chart-area' },
            { id: 'timeline', label: '3. Impact Timeline & Alerts', icon: 'fa-timeline' },
            { id: 'simulator', label: '4. Weather Stress Simulator', icon: 'fa-sliders' },
            { id: 'correlations', label: '5. Physics Correlations', icon: 'fa-code-compare' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition whitespace-nowrap border-b-2 ${
                activeTab === tab.id
                  ? 'border-cyan-400 text-cyan-300 bg-slate-800/80 shadow-sm'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <i className={`fa-solid ${tab.icon} text-xs`}></i>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* ============================================================== */}
          {/* TAB 1: LIVE ENVIRONMENTAL STATUS & OPERATIONAL IMPACT          */}
          {/* ============================================================== */}
          {activeTab === 'current' && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Tactical Weather HUD Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ambient Temp</div>
                  <div className="text-2xl font-mono font-black text-cyan-300 mt-1">
                    {m.temperature_c !== undefined ? m.temperature_c : -22.4}°C
                  </div>
                  <div className="text-[10px] text-cyan-400 font-semibold mt-0.5">
                    Target: 21.0°C (ΔT = {Math.abs(21.0 - (m.temperature_c || -22.4)).toFixed(1)}°C)
                  </div>
                </div>

                <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Wind Speed</div>
                  <div className="text-2xl font-mono font-black text-blue-300 mt-1">
                    {m.wind_speed_ms !== undefined ? m.wind_speed_ms : 12.0} <span className="text-xs font-sans text-slate-400">m/s</span>
                  </div>
                  <div className="text-[10px] text-blue-400 font-semibold mt-0.5">
                    Gusts: {m.wind_gust_ms !== undefined ? m.wind_gust_ms : 16.5} m/s
                  </div>
                </div>

                <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Wind Direction</div>
                  <div className="text-2xl font-mono font-black text-purple-300 mt-1">
                    {m.wind_direction_deg !== undefined ? m.wind_direction_deg : 135}°
                  </div>
                  <div className="text-[10px] text-purple-400 font-semibold mt-0.5">
                    Katabatic Escarpment Flow
                  </div>
                </div>

                <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Solar Radiation</div>
                  <div className="text-2xl font-mono font-black text-amber-300 mt-1">
                    {m.solar_irradiance_wm2 !== undefined ? m.solar_irradiance_wm2 : 120} <span className="text-xs font-sans text-slate-400">W/m²</span>
                  </div>
                  <div className="text-[10px] text-amber-400 font-semibold mt-0.5">
                    {m.is_polar_night ? 'POLAR NIGHT ACTIVE' : 'Snow Albedo Reflection'}
                  </div>
                </div>

                <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Surface Pressure</div>
                  <div className="text-2xl font-mono font-black text-emerald-300 mt-1">
                    {m.surface_pressure_hpa !== undefined ? m.surface_pressure_hpa : 985} <span className="text-xs font-sans text-slate-400">hPa</span>
                  </div>
                  <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                    Elev: {currentStation.elevation_m || 117}m AMSL
                  </div>
                </div>
              </div>

              {/* Data Provenance & Quality Bar */}
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 uppercase">Data Source: </span>
                    <strong className="text-cyan-300">{prov.source || 'SYNTHETIC'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 uppercase">Last Updated: </span>
                    <strong className="text-white">{prov.last_updated_utc || '12:41:08 UTC'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 uppercase">Sensor Quality: </span>
                    <strong className="text-emerald-400">{prov.confidence_score_pct || 96}% Confidence</strong>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-emerald-500/30 text-emerald-400">Temp: ✓</span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-emerald-500/30 text-emerald-400">Wind: ✓</span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-emerald-500/30 text-emerald-400">Solar: ✓</span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-emerald-500/30 text-emerald-400">Pressure: ✓</span>
                </div>
              </div>

              {/* Direct Operational Energy Impacts */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Heating Demand</div>
                  <div className="text-lg font-mono font-bold text-amber-300">
                    {op.heating_demand_kwth || 120.0} kWth
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-500/30 mt-1 inline-block">
                    LEVEL: {op.heating_demand_level || 'HIGH'}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-2 font-mono">
                    Driven by UA building heat loss and convective wind-chill stripping.
                  </p>
                </div>

                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Wind Turbine Status</div>
                  <div className="text-lg font-mono font-bold text-cyan-300">
                    {op.wind_turbine_output_kw || 0} kW
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded mt-1 inline-block border ${
                    op.wind_turbine_status === 'STORM_CUT_OUT' ? 'bg-rose-950 text-rose-400 border-rose-500/30' : 'bg-emerald-950 text-emerald-400 border-emerald-500/30'
                  }`}>
                    {op.wind_turbine_status || 'ONLINE'}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-2 font-mono">
                    Hard safety cut-out strictly enforced at &gt; 25.0 m/s wind speed.
                  </p>
                </div>

                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Solar PV Potential</div>
                  <div className="text-lg font-mono font-bold text-amber-300">
                    {m.solar_irradiance_wm2 || 0} W/m²
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-900 text-amber-400 border border-amber-500/30 mt-1 inline-block">
                    {op.solar_potential_level || 'MODERATE'}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-2 font-mono">
                    Astronomical solar position and snow albedo reflection multiplier.
                  </p>
                </div>

                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Battery Condition</div>
                  <div className="text-lg font-mono font-bold text-purple-300">
                    {m.temperature_c || -22.0}°C Cell
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-950 text-purple-400 border border-purple-500/30 mt-1 inline-block">
                    {op.battery_operating_state || 'NORMAL'}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-2 font-mono">
                    Arrhenius impedance derating active below -20°C; lockout at -35°C.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: MULTI-HORIZON FORECASTS & PROBABILISTIC QUANTILES     */}
          {/* ============================================================== */}
          {activeTab === 'forecast' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider font-mono">
                  Probabilistic Weather Quantiles (P10 Stress / P50 Median / P90 High)
                </h3>
                <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
                  {[6, 24, 72].map((h) => (
                    <button
                      key={h}
                      onClick={() => setForecastHorizon(h)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold font-mono transition ${
                        forecastHorizon === h ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {h} Hours
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantile Curves Display */}
              {forecastData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Temperature Curve */}
                  <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-cyan-300">Temperature Forecast (°C)</span>
                      <span className="text-[10px] font-mono text-slate-400">P10 (Cold Stress) vs P50 vs P90</span>
                    </div>
                    <div className="space-y-2 font-mono text-xs">
                      {forecastData.timestamps.slice(0, 6).map((ts, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-slate-900/60 p-2 rounded border border-slate-800">
                          <span className="text-slate-400">{ts}</span>
                          <span className="text-cyan-400 font-bold">P10: {forecastData.temperature_c.p10[idx]}°C</span>
                          <span className="text-white font-bold">P50: {forecastData.temperature_c.p50[idx]}°C</span>
                          <span className="text-amber-400 font-bold">P90: {forecastData.temperature_c.p90[idx]}°C</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Wind Speed Curve */}
                  <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-blue-300">Wind Speed Forecast (m/s)</span>
                      <span className="text-[10px] font-mono text-slate-400">P10 (Drop Risk) vs P50 vs P90</span>
                    </div>
                    <div className="space-y-2 font-mono text-xs">
                      {forecastData.timestamps.slice(0, 6).map((ts, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-slate-900/60 p-2 rounded border border-slate-800">
                          <span className="text-slate-400">{ts}</span>
                          <span className="text-blue-400 font-bold">P10: {forecastData.wind_speed_ms.p10[idx]} m/s</span>
                          <span className="text-white font-bold">P50: {forecastData.wind_speed_ms.p50[idx]} m/s</span>
                          <span className="text-purple-400 font-bold">P90: {forecastData.wind_speed_ms.p90[idx]} m/s</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: WEATHER IMPACT TIMELINE & EXPLAINABLE ALERTS          */}
          {/* ============================================================== */}
          {activeTab === 'timeline' && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Chronological Timeline */}
              <div>
                <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-3 font-mono">
                  Chronological Weather-to-Energy Operational Timeline
                </h3>
                <div className="space-y-2.5 font-mono text-xs">
                  {timelineData.map((item, idx) => (
                    <div key={idx} className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/60 flex items-start gap-4">
                      <span className="px-2.5 py-1 rounded bg-cyan-950 text-cyan-400 font-bold text-xs shrink-0 border border-cyan-500/30">
                        {item.time_offset}
                      </span>
                      <div className="space-y-1 flex-1">
                        <div className="text-white font-bold">{item.condition}</div>
                        <div className="text-slate-300 text-[11px]"><span className="text-cyan-400 font-bold">Impact: </span>{item.impact}</div>
                        <div className="text-emerald-300 text-[11px]"><span className="text-emerald-400 font-bold">Action: </span>{item.action}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Explainable Alerts Section */}
              {alertsData.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-rose-300 uppercase tracking-wider mb-3 font-mono">
                    Active Environmental Risk Alerts
                  </h3>
                  <div className="space-y-3">
                    {alertsData.map((alt) => (
                      <div key={alt.id} className="bg-slate-900/80 p-4 rounded-xl border border-rose-500/40 text-xs font-mono space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-rose-400 flex items-center gap-2">
                            <i className="fa-solid fa-triangle-exclamation"></i>
                            {alt.title}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 text-[10px] font-bold border border-rose-500/40">
                            {alt.severity}
                          </span>
                        </div>
                        <div className="text-slate-300"><span className="text-slate-500 font-bold">Trigger: </span>{alt.condition}</div>
                        <div className="text-slate-300"><span className="text-slate-500 font-bold">Impact: </span>{alt.impact}</div>
                        <div className="text-emerald-300 font-bold"><span className="text-emerald-400">Action: </span>{alt.recommended_action}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: WEATHER STRESS SCENARIO SIMULATOR                     */}
          {/* ============================================================== */}
          {activeTab === 'simulator' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Presets */}
              <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
                <span className="text-xs font-mono font-bold text-cyan-300 uppercase block mb-3">
                  Antarctic Stress Test Presets:
                </span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  <button
                    onClick={() => handleStressPreset('NORMAL_WINTER')}
                    className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left transition"
                  >
                    <div className="font-bold text-xs text-white">Normal Winter</div>
                    <div className="text-[10px] text-slate-400 mt-1">-22°C · 12 m/s Wind</div>
                  </button>

                  <button
                    onClick={() => handleStressPreset('EXTREME_COLD')}
                    className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-cyan-500/40 text-left transition"
                  >
                    <div className="font-bold text-xs text-cyan-300">Extreme Cold Snap</div>
                    <div className="text-[10px] text-slate-400 mt-1">-41.5°C · Heat Surging</div>
                  </button>

                  <button
                    onClick={() => handleStressPreset('HIGH_WIND_CUTOUT')}
                    className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-left transition"
                  >
                    <div className="font-bold text-xs text-amber-300">Gale Storm Cut-Out</div>
                    <div className="text-[10px] text-slate-400 mt-1">28.4 m/s · Turbine Trip</div>
                  </button>

                  <button
                    onClick={() => handleStressPreset('POLAR_VORTEX')}
                    className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-rose-500/40 text-left transition"
                  >
                    <div className="font-bold text-xs text-rose-400">Polar Vortex Stress</div>
                    <div className="text-[10px] text-slate-400 mt-1">-44°C · Compound Shock</div>
                  </button>
                </div>
              </div>

              {/* Custom Sliders */}
              <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/60 space-y-4">
                <span className="text-xs font-mono font-bold text-white uppercase block">
                  Interactive Environmental Parameter Sliders:
                </span>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-slate-400">Ambient Temperature:</span>
                      <span className="font-bold text-cyan-300">{simTemp}°C</span>
                    </div>
                    <input
                      type="range"
                      min="-45"
                      max="-10"
                      step="0.5"
                      value={simTemp}
                      onChange={(e) => setSimTemp(e.target.value)}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-slate-400">Wind Velocity (Cut-Out at &gt; 25 m/s):</span>
                      <span className={`font-bold ${simWind > 25 ? 'text-rose-400' : 'text-blue-300'}`}>
                        {simWind} m/s {simWind > 25 ? '(CUT-OUT ENGAGED)' : ''}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="38"
                      step="0.5"
                      value={simWind}
                      onChange={(e) => setSimWind(e.target.value)}
                      className="w-full accent-blue-400 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-slate-400">Solar Irradiance (W/m²):</span>
                      <span className="font-bold text-amber-300">{simSolar} W/m²</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="600"
                      step="10"
                      value={simSolar}
                      onChange={(e) => setSimSolar(e.target.value)}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>
                </div>

                <button
                  onClick={handleCustomSimulate}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs transition active:scale-95 shadow-lg shadow-cyan-500/20"
                >
                  APPLY CUSTOM WEATHER & RECALCULATE ENERGY IMPACTS
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 5: PHYSICAL CORRELATIONS & ANALYTICS                      */}
          {/* ============================================================== */}
          {activeTab === 'correlations' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Correlation 1: Temperature vs Heating Load */}
                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 space-y-3">
                  <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider font-mono">
                    Correlation 1: Outdoor Temperature vs Building Heating Demand
                  </h4>
                  <p className="text-[11px] text-slate-300 font-mono leading-relaxed">
                    Physical relationship: $Q_\text{heat} = UA \cdot (21^\circ\text{C} - T_\text{outdoor}) + C_\text{wind} \cdot v_\text{wind} \cdot \Delta T - Q_\text{internal}$
                  </p>
                  <div className="space-y-1.5 font-mono text-xs">
                    <div className="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
                      <span>Ambient -10°C (Mild Summer)</span>
                      <span className="text-cyan-300 font-bold">52.4 kWth</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
                      <span>Ambient -25°C (Average Winter)</span>
                      <span className="text-amber-300 font-bold">88.5 kWth</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
                      <span>Ambient -38°C (Extreme Cold Snap)</span>
                      <span className="text-rose-400 font-bold">118.2 kWth (+125% Surge)</span>
                    </div>
                  </div>
                </div>

                {/* Correlation 2: Wind Speed vs Turbine Power */}
                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 space-y-3">
                  <h4 className="text-xs font-bold text-blue-300 uppercase tracking-wider font-mono">
                    Correlation 2: Wind Speed vs Turbine Power Output
                  </h4>
                  <p className="text-[11px] text-slate-300 font-mono leading-relaxed">
                    Cubic power curve $P \propto v^3$ with cut-in ($3.0\text{ m/s}$), rated ($12.0\text{ m/s}$), and storm cut-out ($&gt; 25.0\text{ m/s}$).
                  </p>
                  <div className="space-y-1.5 font-mono text-xs">
                    <div className="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
                      <span>Wind 2.5 m/s (Below Cut-In)</span>
                      <span className="text-slate-400 font-bold">0.0 kW (Idle)</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
                      <span>Wind 8.0 m/s (Cubic Ramp)</span>
                      <span className="text-cyan-300 font-bold">34.2 kW</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
                      <span>Wind 12.0 - 24.9 m/s (Rated Plateau)</span>
                      <span className="text-emerald-400 font-bold">{currentStation.windCapacity} kW (100% Green)</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-slate-900/60 border border-rose-500/40">
                      <span className="text-rose-400 font-bold">Wind &gt; 25.0 m/s (Storm Cut-Out)</span>
                      <span className="text-rose-400 font-black">0.0 kW (FEATHERED & BRAKED)</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>

        {/* Modal Bottom Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-900/60 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-3">
            <span>STATION: <strong className="text-white">{currentStation.name}</strong></span>
            <span>SOURCE: <strong className="text-cyan-400">{prov.source || 'SYNTHETIC'}</strong></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition border border-slate-700"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
