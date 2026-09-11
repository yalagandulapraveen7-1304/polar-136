import React from 'react';
import EnergyFlowCanvas from '../components/EnergyFlowCanvas';
import AuditLogTable from '../components/AuditLogTable';

export default function DispatchModal({
  isOpen,
  onClose,
  latestData,
  auditLogs,
  stationId
}) {
  if (!isOpen) return null;

  const t = latestData?.telemetry || {};
  const d = latestData?.dispatch || {};

  const loadKw = t.load_elec_kw !== undefined ? t.load_elec_kw : 40.4;
  const thermKw = t.load_thermal_kw !== undefined ? t.load_thermal_kw : 62.0;

  const windKw = d.p_wind_kw !== undefined ? d.p_wind_kw : 44.88;
  const solarKw = d.p_solar_kw !== undefined ? d.p_solar_kw : 1.34;
  const totalRenewables = windKw + solarKw;

  const battDischargeKw = d.p_battery_discharge_kw || 0.0;
  const battChargeKw = d.p_battery_charge_kw || 0.0;
  const battRateKw = d.p_battery_kw !== undefined
    ? d.p_battery_kw
    : (battDischargeKw > 0 ? battDischargeKw : (battChargeKw > 0 ? -battChargeKw : 0.0));

  const genOutputKw = (d.p_diesel_1_kw || 0) + (d.p_diesel_2_kw || 0);

  // Percentages
  const totalGen = Math.max(0.1, windKw + solarKw + Math.max(0, battRateKw) + genOutputKw);
  const solarPct = Math.round((solarKw / totalGen) * 100);
  const windPct = Math.round((windKw / totalGen) * 100);
  const battPct = Math.round((Math.max(0, battRateKw) / totalGen) * 100);
  const genPct = Math.max(0, 100 - (solarPct + windPct + battPct));

  const explanationText = latestData?.explanation ||
    `Meeting ${loadKw.toFixed(2)}kW load with ${totalRenewables.toFixed(2)}kW renewables, 0.0kW battery, ${genOutputKw.toFixed(2)}kW generator. Operating in conservative mode - battery reserve increased for safety.`;

  return (
    <div
      id="modal-dispatch-full"
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target.id === 'modal-dispatch-full') onClose();
      }}
    >
      <div className="modal-content p-5 sm:p-6 max-w-[960px] max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#05c5ff] to-[#127694] text-white flex items-center justify-center font-bold text-xs shadow-sm">
              <i className="fa-solid fa-code-fork text-xs"></i>
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#127694]">
                Autonomous AI Microgrid Power Dispatch Matrix
              </h2>
              <p className="text-xs text-slate-500">
                Linear Programming (LP) real-time bus balance, generation mix, and circuit routing
              </p>
            </div>
          </div>
          <button
            id="btnCloseDispatchModal"
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Active LP Optimization Reasoning Banner */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#e5f6fd] to-[#f0faff] border border-[#9ae5fe] mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-[#127694] flex items-center gap-1.5">
              <i className="fa-solid fa-microchip text-xs text-[#0698c4]"></i>
              Active LP Optimization Reasoning
            </span>
            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
              Optimal Solution Found
            </span>
          </div>
          <p id="dispatchFullExplanation" className="text-xs text-slate-700 leading-relaxed font-medium">
            {explanationText}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-2.5 border-t border-[#9ae5fe]/60 text-center">
            <div className="p-2 bg-white rounded-xl border border-[#9ae5fe]/60">
              <div className="text-[9px] font-bold text-slate-400 uppercase">Renewable Dispatch</div>
              <div id="dispRenewableKw" className="text-sm font-black text-[#0698c4]">{totalRenewables.toFixed(2)} kW</div>
            </div>
            <div className="p-2 bg-white rounded-xl border border-[#9ae5fe]/60">
              <div className="text-[9px] font-bold text-slate-400 uppercase">Battery Buffer</div>
              <div
                id="dispBatteryKw"
                className={`text-sm font-black ${
                  battChargeKw > 0.1
                    ? 'text-emerald-600'
                    : battDischargeKw > 0.1
                    ? 'text-[#0698c4]'
                    : 'text-[#127694]'
                }`}
              >
                {battChargeKw > 0.1
                  ? `+${battChargeKw.toFixed(2)} kW`
                  : battDischargeKw > 0.1
                  ? `-${battDischargeKw.toFixed(2)} kW`
                  : '0.00 kW'}
              </div>
            </div>
            <div className="p-2 bg-white rounded-xl border border-[#9ae5fe]/60">
              <div className="text-[9px] font-bold text-slate-400 uppercase">Generator Output</div>
              <div id="dispGenKw" className="text-sm font-black text-slate-800">{genOutputKw.toFixed(2)} kW</div>
            </div>
            <div className="p-2 bg-white rounded-xl border border-[#9ae5fe]/60">
              <div className="text-[9px] font-bold text-slate-400 uppercase">Generator Saved</div>
              <div id="dispFuelSavedKw" className="text-sm font-black text-emerald-600">~0.00 kW</div>
            </div>
          </div>
        </div>

        {/* Live Source Mix Distribution */}
        <div className="mb-4">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
            Live Source Mix Distribution
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
            <div className="p-3 rounded-2xl bg-white border border-[#9ae5fe] shadow-sm">
              <div className="text-[9px] font-bold text-slate-400 uppercase">Solar PV</div>
              <div id="dispSolarPct" className="text-lg font-black text-[#4499b3] my-0.5">{solarPct}%</div>
              <div className="text-[10px] text-slate-500">
                <span id="dispSolarKw">{solarKw.toFixed(2)}</span> kW active
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-white border border-[#9ae5fe] shadow-sm">
              <div className="text-[9px] font-bold text-slate-400 uppercase">Wind Turbines</div>
              <div id="dispWindPct" className="text-lg font-black text-[#05c5ff] my-0.5">{windPct}%</div>
              <div className="text-[10px] text-slate-500">
                <span id="dispWindKw">{windKw.toFixed(2)}</span> kW active
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-white border border-[#9ae5fe] shadow-sm">
              <div className="text-[9px] font-bold text-slate-400 uppercase">Battery Buffer</div>
              <div id="dispBattPct" className="text-lg font-black text-[#127694] my-0.5">{battPct}%</div>
              <div className="text-[10px] text-slate-500">
                <span id="dispBattKw">
                  {battDischargeKw > 0.05
                    ? battDischargeKw.toFixed(2)
                    : battChargeKw > 0.05
                    ? `+${battChargeKw.toFixed(2)} (chg)`
                    : '0.00'}
                </span> kW active
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-white border border-[#9ae5fe] shadow-sm">
              <div className="text-[9px] font-bold text-slate-400 uppercase">Diesel Gen-Set</div>
              <div id="dispGenPct" className="text-lg font-black text-slate-800 my-0.5">{genPct}%</div>
              <div className="text-[10px] text-slate-500">
                <span id="dispGenKwVal">{genOutputKw.toFixed(2)}</span> kW active
              </div>
            </div>
          </div>
        </div>

        {/* Real-Time Energy Flow Matrix */}
        <div className="mb-4 bg-[#f8fcfe] p-3.5 rounded-2xl border border-[#9ae5fe]">
          <div className="flex items-center justify-between pb-2 border-b border-[#9ae5fe]/60">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-[#c2f0fe] text-[#0698c4] flex items-center justify-center">
                <i className="fa-solid fa-diagram-project text-xs"></i>
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#127694]">
                Real-Time Energy Flow Matrix
              </h3>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-slate-500">
                Elec Load: <strong id="matrix-elec-load" className="text-[#0698c4] font-bold">{loadKw.toFixed(1)} kWe</strong>
              </span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-500">
                Thermal Load: <strong id="matrix-thermal-load" className="text-rose-500 font-bold">{thermKw.toFixed(1)} kWth</strong>
              </span>
            </div>
          </div>

          {/* Canvas for dynamic particle flow vectors */}
          <EnergyFlowCanvas latestData={latestData} />

          {/* Matrix Power Gauges Bottom Bar with Dedicated Icons */}
          <div className="grid grid-cols-4 gap-2 pt-2 border-t border-[#9ae5fe]/60 text-center font-mono">
            <div className="bg-white p-2 rounded-xl border border-[#05c5ff]/40 shadow-sm flex flex-col items-center justify-center">
              <div className="flex items-center gap-1.5 text-[#05c5ff] text-xs font-bold mb-0.5">
                <i className="fa-solid fa-fan text-xs"></i>
                <span className="text-[10px] tracking-wider uppercase">Windmill</span>
              </div>
              <span id="flow-wind-val" className="text-xs sm:text-sm font-black text-slate-800">
                {windKw.toFixed(2)} kW
              </span>
            </div>
            <div className="bg-white p-2 rounded-xl border border-amber-500/40 shadow-sm flex flex-col items-center justify-center">
              <div className="flex items-center gap-1.5 text-amber-500 text-xs font-bold mb-0.5">
                <i className="fa-solid fa-solar-panel text-xs"></i>
                <span className="text-[10px] tracking-wider uppercase">Solar PV</span>
              </div>
              <span id="flow-solar-val" className="text-xs sm:text-sm font-black text-slate-800">
                {solarKw.toFixed(2)} kW
              </span>
            </div>
            <div className="bg-white p-2 rounded-xl border border-emerald-500/40 shadow-sm flex flex-col items-center justify-center">
              <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold mb-0.5">
                <i className="fa-solid fa-car-battery text-xs"></i>
                <span className="text-[10px] tracking-wider uppercase">Battery</span>
              </div>
              <span id="flow-battery-val" className="text-xs sm:text-sm font-black text-slate-800">
                {battChargeKw > 0.1
                  ? `+${battChargeKw.toFixed(2)}`
                  : battDischargeKw > 0.1
                  ? `-${battDischargeKw.toFixed(2)}`
                  : '0.00'} kW
              </span>
            </div>
            <div className="bg-white p-2 rounded-xl border border-rose-500/40 shadow-sm flex flex-col items-center justify-center">
              <div className="flex items-center gap-1.5 text-rose-500 text-xs font-bold mb-0.5">
                <i className="fa-solid fa-gears text-xs"></i>
                <span className="text-[10px] tracking-wider uppercase">Generator</span>
              </div>
              <span id="flow-diesel-val" className="text-xs sm:text-sm font-black text-slate-800">
                {genOutputKw.toFixed(2)} kW
              </span>
            </div>
          </div>
        </div>

        {/* Microgrid Bus Circuit Routing */}
        <div className="mb-4">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
            Microgrid Bus Circuit Routing
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="p-3 rounded-2xl bg-white border border-emerald-200 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-800 mb-1">
                <span>Priority 1: Life Support</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                  Non-Curtailable
                </span>
              </div>
              <div className="text-sm font-extrabold text-slate-800">
                <span id="dispLoadHeat">{(loadKw * 0.65).toFixed(1)}</span> kW
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Habitat HVAC, water recovery, emergency medical</p>
            </div>
            <div className="p-3 rounded-2xl bg-white border border-amber-200 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-amber-800 mb-1">
                <span>Priority 2: Science Labs</span>
                <span className="text-[9px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                  Sheddable
                </span>
              </div>
              <div className="text-sm font-extrabold text-slate-800">
                <span id="dispLoadLab">{(loadKw * 0.28).toFixed(1)}</span> kW
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Atmospheric lidar, core drill refrigeration, telemetry</p>
            </div>
            <div className="p-3 rounded-2xl bg-white border border-cyan-200 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-[#0698c4] mb-1">
                <span>Priority 3: Lighting</span>
                <span className="text-[9px] bg-[#c2f0fe] text-[#0698c4] px-2 py-0.5 rounded-full font-bold">
                  Essential
                </span>
              </div>
              <div className="text-sm font-extrabold text-slate-800">
                <span id="dispLoadLight">{(loadKw * 0.07).toFixed(1)}</span> kW
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Perimeter lighting, runway beacon, crew galley</p>
            </div>
          </div>
        </div>

        {/* Automated Decision Audit Log Table */}
        <AuditLogTable auditLogs={auditLogs} stationId={stationId} />
      </div>
    </div>
  );
}
