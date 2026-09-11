import React from 'react';
import { STATIONS } from '../constants/stations';

export default function MetricCards({
  stationId,
  latestData,
  activeOverrides,
  onOpenModal
}) {
  const t = latestData?.telemetry || {};
  const d = latestData?.dispatch || {};
  const h = latestData?.hardware_health || {};

  const stationInfo = STATIONS[stationId] || STATIONS.BHARATI;

  // Battery calculations
  const soc = activeOverrides?.battery_soc_pct !== undefined && activeOverrides?.battery_soc_pct !== null
    ? parseFloat(activeOverrides.battery_soc_pct)
    : (t.battery_soc_pct !== undefined && t.battery_soc_pct !== null ? t.battery_soc_pct : 76.5);

  const battReserve = activeOverrides?.battery_reserve_pct !== undefined && activeOverrides?.battery_reserve_pct !== null
    ? parseFloat(activeOverrides.battery_reserve_pct)
    : (t.battery_reserve_pct !== undefined && t.battery_reserve_pct !== null ? t.battery_reserve_pct : 20.0);

  const battTemp = t.battery_temp_c !== undefined ? t.battery_temp_c : -6.1;
  const battDischargeKw = d.p_battery_discharge_kw || 0.0;
  const battChargeKw = d.p_battery_charge_kw || 0.0;
  const battRateKw = d.p_battery_kw !== undefined
    ? d.p_battery_kw
    : (battDischargeKw > 0 ? battDischargeKw : (battChargeKw > 0 ? -battChargeKw : 0.0));

  let battStatusText = 'Buffer Standby';
  let battStatusClass = 'text-[9px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full';

  if (battChargeKw > 0.5 || battRateKw < -0.5) {
    battStatusText = 'Charging';
    battStatusClass = 'text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200';
  } else if (battDischargeKw > 0.5 || battRateKw > 0.5) {
    battStatusText = 'Discharging';
    battStatusClass = 'text-[9px] font-bold text-[#0698c4] bg-[#c2f0fe] px-2 py-0.5 rounded-full';
  }

  let rateStr = '0.00 kW';
  if (battChargeKw > 0.1) {
    rateStr = `+${battChargeKw.toFixed(2)} kW`;
  } else if (battDischargeKw > 0.1) {
    rateStr = `-${battDischargeKw.toFixed(2)} kW`;
  }

  // Diesel fuel calculations
  const fuelLiters = t.diesel_fuel_liters !== undefined ? t.diesel_fuel_liters : 4477;
  const maxFuel = stationInfo.fuelCapacity || 60000.0;
  const fuelPct = Math.min(100, Math.max(0, (fuelLiters / maxFuel) * 100));
  const genOutputKw = (d.p_diesel_1_kw || 0) + (d.p_diesel_2_kw || 0);
  const burnRate = t.fuel_burn_rate_lh !== undefined ? t.fuel_burn_rate_lh : (genOutputKw * 0.26);
  const autonomyDays = burnRate > 0.05 ? Math.min(60, fuelLiters / (burnRate * 24)) : 26.6;

  const isGenRunning = genOutputKw > 0.1;

  // Health
  const deviceHealth = h.overall_score_pct !== undefined ? h.overall_score_pct : 84;

  return (
    <div className="lg:col-span-4 xl:col-span-3 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-1 gap-3.5 sm:gap-4 lg:gap-5">
      {/* CARD R1: Station Battery & Reserve */}
      <div className="novara-card p-4 sm:p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-lg bg-[#c2f0fe] text-[#0698c4] flex items-center justify-center">
                <i className="fa-solid fa-car-battery text-xs"></i>
              </div>
              <span className="font-bold text-xs text-[#127694]">Station Battery & Reserve</span>
            </div>
            <span id="batteryStatusSub" className={battStatusClass}>
              {battStatusText}
            </span>
          </div>

          <div className="flex items-baseline justify-between my-2">
            <div className="flex items-baseline gap-2">
              <span id="batterySocBig" className="text-2xl font-black text-slate-800">{Math.round(soc)}%</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current SoC</span>
            </div>
            <span className="text-xs font-semibold text-slate-400">
              Capacity: <strong id="batteryCapacityKwh" className="text-slate-700">{stationInfo.batteryCapacity} kWh</strong>
            </span>
          </div>
        </div>

        {/* Cylinder Battery Bar */}
        <div className="space-y-1.5 my-2">
          <div className="cylinder-battery-container">
            <div
              id="batteryFillBar"
              className="cylinder-battery-fill"
              style={{ width: `${Math.min(100, Math.max(5, soc))}%` }}
            >
              <span id="batteryPctText" className="battery-pct-label">{Math.round(soc)}%</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>Cell Temp: <strong id="batteryCellTemp">{battTemp.toFixed(1)}°C</strong></span>
            <span className="flex items-center gap-1">
              Protected Floor: <strong id="batteryReservePctText" className="text-[#127694] font-black">{Math.round(battReserve)}% Reserve</strong>
              <button
                type="button"
                id="btnQuickAdjustReserve"
                title="Adjust protected battery reserve floor"
                onClick={() => onOpenModal('manual')}
                className="text-[9px] font-bold text-[#0698c4] hover:text-[#05c5ff] bg-[#e0f7fe] hover:bg-[#c2f0fe] px-1.5 py-0.5 rounded transition"
              >
                Manual
              </button>
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <span>Rate: <strong id="batteryRateKw" className="text-[#0698c4]">{rateStr}</strong></span>
          <span>LiFePO4 Thermal Pack</span>
        </div>
      </div>

      {/* CARD R2: Diesel Fuel Reserves & Generator */}
      <div className="novara-card p-4 sm:p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-lg bg-[#c2f0fe] text-[#0698c4] flex items-center justify-center">
                <i className="fa-solid fa-gas-pump text-xs"></i>
              </div>
              <span className="font-bold text-xs text-[#127694]">Diesel Fuel & Gen-Set</span>
            </div>
            <span
              id="genStatusBadge"
              className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                isGenRunning
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : 'text-slate-600 bg-slate-100 border-slate-200'
              }`}
            >
              {isGenRunning ? 'GEN RUNNING' : 'GEN STANDBY'}
            </span>
          </div>

          <div className="flex items-baseline justify-between my-2">
            <span id="valFuelLitersBig" className="text-2xl font-black text-slate-800">
              {Math.round(fuelLiters).toLocaleString()} L
            </span>
            <span id="valFuelPctText" className="text-xs font-bold text-[#0698c4]">
              {Math.round(fuelPct)}% Capacity
            </span>
          </div>
        </div>

        {/* Fuel Progress Bar */}
        <div className="space-y-1.5 my-2">
          <div className="w-full h-2 rounded-full bg-[#e5f6fd] overflow-hidden border border-[#9ae5fe]/60">
            <div
              id="fuelProgressFill"
              className="h-full bg-gradient-to-r from-[#0698c4] to-[#05c5ff] rounded-full transition-all duration-500"
              style={{ width: `${fuelPct}%` }}
            ></div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>Burn Rate: <strong id="valFuelBurnRate">{burnRate.toFixed(2)} L/h</strong></span>
            <span>Efficiency: <strong id="valGenEfficiency" className="text-[#0698c4]">85%</strong></span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <span>Gen Output: <strong id="valGenKw" className="text-slate-700">{genOutputKw.toFixed(1)} kW</strong></span>
          <span>Autonomy: <strong id="valFuelDaysRight" className="text-[#127694]">{autonomyDays.toFixed(1)} Days</strong></span>
        </div>
      </div>

      {/* CARD R3: Station Health & Contingency Manual Override */}
      <div className="novara-card p-4 sm:p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-lg bg-[#c2f0fe] text-[#0698c4] flex items-center justify-center">
                <i className="fa-solid fa-shield-halved text-xs"></i>
              </div>
              <span className="font-bold text-xs text-[#127694]">Station Health & Controls</span>
            </div>
            <button
              id="btnOpenMaintenanceDirect"
              type="button"
              onClick={() => onOpenModal('maintenance')}
              className="text-[9px] font-bold text-[#0698c4] bg-[#c2f0fe] px-2 py-0.5 rounded-full hover:bg-[#9ae5fe] transition"
            >
              Diagnostics ➔
            </button>
          </div>

          {/* Health Score & Comms */}
          <div className="space-y-2 my-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Device Health Score:</span>
              <span id="valDeviceHealth" className="font-black text-emerald-600">{deviceHealth}% (Optimal)</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Satellite Telemetry:</span>
              <span id="valCommStatus" className="font-bold text-[#0698c4] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Connected
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Active Polar Crew:</span>
              <span id="valCrewCount" className="font-bold text-slate-700">{stationInfo.crew} Personnel</span>
            </div>
          </div>
        </div>

        {/* Open Manual Override Modal Button */}
        <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
          <button
            id="btnTriggerModalSecondary"
            type="button"
            onClick={() => onOpenModal('manual')}
            className="w-full py-2 px-3 rounded-xl text-xs font-bold border border-[#9ae5fe] bg-white hover:bg-[#f0faff] text-[#127694] transition flex items-center justify-center gap-2 shadow-sm"
          >
            <i className="fa-solid fa-sliders text-xs text-[#05c5ff]"></i>
            <span>Inject Contingency / Override</span>
          </button>
        </div>
      </div>
    </div>
  );
}
