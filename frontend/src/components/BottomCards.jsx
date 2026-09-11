import React from 'react';

export default function BottomCards({
  latestData,
  currentScenario,
  onScenarioChange,
  onResetScenario,
  onOpenModal
}) {
  const t = latestData?.telemetry || {};
  const d = latestData?.dispatch || {};

  const windKw = d.p_wind_kw !== undefined ? d.p_wind_kw : 44.88;
  const solarKw = d.p_solar_kw !== undefined ? d.p_solar_kw : 1.34;
  const totalRenewables = windKw + solarKw;

  const battDischargeKw = d.p_battery_discharge_kw || 0.0;
  const battChargeKw = d.p_battery_charge_kw || 0.0;
  const batteryBufferVal = battChargeKw > 0.1 ? battChargeKw : battDischargeKw;

  const loadKw = t.load_elec_kw !== undefined ? t.load_elec_kw : 40.4;
  const genOutputKw = (d.p_diesel_1_kw || 0) + (d.p_diesel_2_kw || 0);

  let scenarioLabelText = 'Live Normal';
  let scenarioLabelClass = 'text-[9px] font-bold text-[#0698c4] bg-[#c2f0fe] px-2 py-0.5 rounded-full';

  if (currentScenario === 'blizzard') {
    scenarioLabelText = 'Cat-3 Blizzard Active';
    scenarioLabelClass = 'text-[9px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200';
  } else if (currentScenario === 'trip') {
    scenarioLabelText = 'Gen-Set Trip Active';
    scenarioLabelClass = 'text-[9px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200';
  } else if (currentScenario === 'night') {
    scenarioLabelText = 'Polar Night Active';
    scenarioLabelClass = 'text-[9px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200';
  } else if (currentScenario === 'dawn') {
    scenarioLabelText = 'Spring Sunrise Active';
    scenarioLabelClass = 'text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200';
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
      {/* CARD B1: AI Fuel Optimization */}
      <div className="novara-card p-4 sm:p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-lg bg-[#c2f0fe] text-[#0698c4] flex items-center justify-center">
                <i className="fa-solid fa-chart-pie text-xs"></i>
              </div>
              <span className="font-bold text-xs text-[#127694]">AI Fuel Optimization</span>
            </div>
            <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              7-Day Sim
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mb-3">LP dispatch optimization vs naive baseline generator burn.</p>
        </div>

        {/* Big Percentage Metric */}
        <div className="text-center my-1 bg-[#f0faff] py-2.5 px-3 rounded-2xl border border-[#9ae5fe]/60">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Fuel Saved</div>
          <div id="fuelSavedPct" className="text-2xl font-black text-emerald-600 my-0.5">+9.4%</div>
          <div className="text-[10px] font-semibold text-slate-600">
            <span id="fuelSavedLiters">133.0 L</span> conserved • <span id="co2SavedKg">352 kg</span> CO₂
          </div>
        </div>

        {/* Side-by-Side Comparison */}
        <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-slate-100 text-center">
          <div className="p-1.5 rounded-xl bg-white border border-[#9ae5fe]/70">
            <div className="text-[9px] font-bold text-[#0698c4] uppercase">With AI</div>
            <div id="fuelOptimizedLiters" className="text-xs font-black text-slate-800">1,280 L</div>
          </div>
          <div className="p-1.5 rounded-xl bg-white border border-slate-200">
            <div className="text-[9px] font-bold text-slate-400 uppercase">Without AI</div>
            <div id="fuelBaselineLiters" className="text-xs font-black text-slate-600">1,413 L</div>
          </div>
        </div>
      </div>

      {/* CARD B2: Demo Scenarios */}
      <div className="novara-card p-4 sm:p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-lg bg-[#c2f0fe] text-[#0698c4] flex items-center justify-center">
                <i className="fa-solid fa-bolt text-xs"></i>
              </div>
              <span className="font-bold text-xs text-[#127694]">Demo Scenarios</span>
            </div>
            <span id="activeScenarioLabel" className={scenarioLabelClass}>
              {scenarioLabelText}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mb-2.5">Simulate extreme polar contingencies in 1-tap.</p>
        </div>

        {/* 2x2 Interactive Scenario Buttons */}
        <div className="grid grid-cols-2 gap-2 my-1">
          <button
            type="button"
            className={`scenario-btn p-2 rounded-xl border border-[#9ae5fe] bg-white hover:bg-[#f0faff] text-left transition flex flex-col gap-1 shadow-sm ${
              currentScenario === 'blizzard' ? 'active' : ''
            }`}
            data-scenario="blizzard"
            onClick={() => onScenarioChange('blizzard')}
          >
            <div className="flex items-center justify-between">
              <i className="fa-solid fa-wind text-xs text-[#0698c4]"></i>
              <span className="text-[8px] font-extrabold uppercase px-1 rounded bg-rose-50 text-rose-600">Storm</span>
            </div>
            <span className="text-[11px] font-bold text-slate-800">Cat-3 Blizzard</span>
            <span className="text-[9px] text-slate-400">-52°C, 34 m/s</span>
          </button>

          <button
            type="button"
            className={`scenario-btn p-2 rounded-xl border border-[#9ae5fe] bg-white hover:bg-[#f0faff] text-left transition flex flex-col gap-1 shadow-sm ${
              currentScenario === 'trip' ? 'active' : ''
            }`}
            data-scenario="trip"
            onClick={() => onScenarioChange('trip')}
          >
            <div className="flex items-center justify-between">
              <i className="fa-solid fa-triangle-exclamation text-xs text-amber-500"></i>
              <span className="text-[8px] font-extrabold uppercase px-1 rounded bg-amber-50 text-amber-600">Fault</span>
            </div>
            <span className="text-[11px] font-bold text-slate-800">Gen-Set Trip</span>
            <span className="text-[9px] text-slate-400">Battery Takeover</span>
          </button>

          <button
            type="button"
            className={`scenario-btn p-2 rounded-xl border border-[#9ae5fe] bg-white hover:bg-[#f0faff] text-left transition flex flex-col gap-1 shadow-sm ${
              currentScenario === 'night' ? 'active' : ''
            }`}
            data-scenario="night"
            onClick={() => onScenarioChange('night')}
          >
            <div className="flex items-center justify-between">
              <i className="fa-solid fa-moon text-xs text-[#127694]"></i>
              <span className="text-[8px] font-extrabold uppercase px-1 rounded bg-slate-100 text-slate-600">Winter</span>
            </div>
            <span className="text-[11px] font-bold text-slate-800">Polar Night</span>
            <span className="text-[9px] text-slate-400">Zero Solar, Deficit</span>
          </button>

          <button
            type="button"
            className={`scenario-btn p-2 rounded-xl border border-[#9ae5fe] bg-white hover:bg-[#f0faff] text-left transition flex flex-col gap-1 shadow-sm ${
              currentScenario === 'dawn' ? 'active' : ''
            }`}
            data-scenario="dawn"
            onClick={() => onScenarioChange('dawn')}
          >
            <div className="flex items-center justify-between">
              <i className="fa-solid fa-sun text-xs text-amber-500"></i>
              <span className="text-[8px] font-extrabold uppercase px-1 rounded bg-emerald-50 text-emerald-600">Harvest</span>
            </div>
            <span className="text-[11px] font-bold text-slate-800">Spring Sunrise</span>
            <span className="text-[9px] text-slate-400">High PV, Recharging</span>
          </button>
        </div>

        {/* Footer Action */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
          <button
            id="btnResetScenario"
            type="button"
            onClick={onResetScenario}
            className="text-[10px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition"
          >
            <i className="fa-solid fa-rotate-left text-xs"></i> Reset Auto
          </button>
          <button
            id="btnOpenForecastModal"
            type="button"
            onClick={() => onOpenModal('forecast')}
            className="text-[10px] font-bold text-[#0698c4] hover:text-[#05c5ff] flex items-center gap-1 transition bg-[#e5f6fd] px-2.5 py-1 rounded-full border border-[#9ae5fe]"
          >
            <span>Full Forecast Modal</span>
            <i className="fa-solid fa-arrow-right text-[10px]"></i>
          </button>
        </div>
      </div>

      {/* CARD B3: Microgrid Energy Flow */}
      <div className="novara-card p-4 sm:p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-lg bg-[#c2f0fe] text-[#0698c4] flex items-center justify-center">
                <i className="fa-solid fa-diagram-project text-xs"></i>
              </div>
              <span className="font-bold text-xs text-[#127694]">Microgrid Energy Flow</span>
            </div>
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Balanced
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mb-2">Real-time bus dispatch from sources to station load.</p>
        </div>

        {/* Clean Abstract Flow Pipeline */}
        <div className="flex items-center justify-between gap-1 my-1 bg-[#f0faff] p-2 sm:p-2.5 rounded-2xl border border-[#9ae5fe]/60">
          {/* Source: Renewables */}
          <div className="flex flex-col items-center text-center">
            <div className="w-8 h-8 rounded-xl bg-white border border-[#9ae5fe] flex items-center justify-center text-[#0698c4] shadow-sm">
              <i className="fa-solid fa-sun text-xs text-[#0698c4]"></i>
            </div>
            <span className="text-[9px] font-bold text-slate-500 mt-1">Renewables</span>
            <span id="flowRenewablesKw" className="text-[10px] font-black text-[#0698c4]">{totalRenewables.toFixed(1)} kW</span>
          </div>

          {/* Flow Arrow 1 */}
          <div className="flex items-center text-[#05c5ff]">
            <i className="fa-solid fa-arrow-right text-xs animate-pulse"></i>
          </div>

          {/* Node: Battery Buffer */}
          <div className="flex flex-col items-center text-center">
            <div className="w-8 h-8 rounded-xl bg-white border border-[#9ae5fe] flex items-center justify-center text-[#127694] shadow-sm">
              <i className="fa-solid fa-car-battery text-xs text-[#127694]"></i>
            </div>
            <span className="text-[9px] font-bold text-slate-500 mt-1">Battery Buffer</span>
            <span id="flowBatteryKw" className="text-[10px] font-black text-[#127694]">{batteryBufferVal.toFixed(1)} kW</span>
          </div>

          {/* Flow Arrow 2 */}
          <div className="flex items-center text-[#05c5ff]">
            <i className="fa-solid fa-arrow-right text-xs animate-pulse"></i>
          </div>

          {/* Sink: Station Load */}
          <div className="flex flex-col items-center text-center">
            <div className="w-8 h-8 rounded-xl bg-white border border-[#9ae5fe] flex items-center justify-center text-slate-800 shadow-sm">
              <i className="fa-solid fa-house-signal text-xs text-slate-800"></i>
            </div>
            <span className="text-[9px] font-bold text-slate-500 mt-1">Station Load</span>
            <span id="flowLoadKw" className="text-[10px] font-black text-slate-800">{loadKw.toFixed(1)} kW</span>
          </div>
        </div>

        <div className="text-[9px] text-slate-400 pt-2 border-t border-slate-100 flex items-center justify-between">
          <span>Diesel Gen Support: <strong id="flowGenKw" className="text-slate-700">{genOutputKw.toFixed(1)} kW</strong></span>
          <button
            id="btnOpenDispatchModal"
            type="button"
            onClick={() => onOpenModal('dispatch')}
            className="text-[10px] font-bold text-[#0698c4] hover:text-[#05c5ff] flex items-center gap-1 transition bg-[#e5f6fd] px-2 py-0.5 rounded-full border border-[#9ae5fe]"
          >
            <span>Full Matrix</span>
            <i className="fa-solid fa-arrow-right text-[10px]"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
