import React from 'react';
import { STATIONS } from '../constants/stations';
import Sparkline from './Sparkline';
import { useTelemetryBuffer } from '../context/TelemetryContext';


export default function MetricCards({
  stationId,
  latestData,
  activeOverrides,
  onOpenModal
}) {
  const t = latestData?.telemetry || {};
  const d = latestData?.dispatch || {};
  const h = latestData?.hardware_health || {};

  const stationInfo = STATIONS[stationId] || STATIONS.MAITRI;
  const { buffer } = useTelemetryBuffer();

  // Extract rolling trend series for sparklines (padded with current val if buffer is fresh)
  const socHistory = buffer.length > 3 ? buffer.map(p => p.soc_pct) : [soc - 1, soc, soc];
  const loadHistory = buffer.length > 3 ? buffer.map(p => p.load_kw) : [currentLoadKw - 2, currentLoadKw + 1, currentLoadKw];
  const renHistory = buffer.length > 3 ? buffer.map(p => (p.wind_kw || 0) + (p.solar_kw || 0)) : [totalRenewablesKw - 3, totalRenewablesKw + 1, totalRenewablesKw];
  const tempHistory = buffer.length > 3 ? buffer.map(p => p.temp_c) : [tempC + 0.2, tempC - 0.1, tempC];


  // 1. Battery Reserve Calculations
  const soc = activeOverrides?.battery_soc_pct !== undefined && activeOverrides?.battery_soc_pct !== null
    ? parseFloat(activeOverrides.battery_soc_pct)
    : (t.battery_soc_pct !== undefined && t.battery_soc_pct !== null ? t.battery_soc_pct : 77.0);

  const reserveFloor = activeOverrides?.battery_reserve_pct !== undefined && activeOverrides?.battery_reserve_pct !== null
    ? parseFloat(activeOverrides.battery_reserve_pct)
    : 20.0;

  const battTemp = t.battery_temp_c !== undefined ? t.battery_temp_c : 6.5;
  const battDischargeKw = d.p_battery_discharge_kw || (d.p_battery_kw > 0 ? d.p_battery_kw : 0.0);
  const battChargeKw = d.p_battery_charge_kw || (d.p_battery_kw < 0 ? -d.p_battery_kw : 0.0);

  let battFlowStatus = 'Buffer Standby';
  let battFlowClass = 'text-slate-600 bg-slate-100';
  let battFlowRate = '0.0 kW';

  if (battChargeKw > 0.5) {
    battFlowStatus = 'Charging';
    battFlowClass = 'text-emerald-700 bg-emerald-50 border border-emerald-200';
    battFlowRate = `+${battChargeKw.toFixed(1)} kW`;
  } else if (battDischargeKw > 0.5) {
    battFlowStatus = 'Discharging';
    battFlowClass = 'text-[#0699C6] bg-[#c2f0fe] border border-[#bcecfc]';
    battFlowRate = `-${battDischargeKw.toFixed(1)} kW`;
  }

  const battHealth = h.bess_thermal_health_pct !== undefined ? h.bess_thermal_health_pct : 96;

  // 2. Current Station Load Calculations
  const rawLoad = t.station_load_kwe !== undefined ? t.station_load_kwe : (t.load_elec_kw !== undefined ? t.load_elec_kw : stationInfo.baseLoad);
  const loadMult = activeOverrides?.load_multiplier || 1.0;
  const currentLoadKw = Math.round(rawLoad * loadMult);
  const peakLoadKw = stationInfo.peakLoad || 457.0;
  const loadPctOfPeak = Math.min(100, Math.round((currentLoadKw / peakLoadKw) * 100));

  // 3. Renewable Generation Calculations
  const windKw = d.p_wind_kw !== undefined ? d.p_wind_kw : 218.0;
  const solarKw = d.p_solar_kw !== undefined ? d.p_solar_kw : 68.0;
  const totalRenewablesKw = Math.round(windKw + solarKw);
  const totalGenKw = totalRenewablesKw + (d.p_diesel_1_kw || 0) + (d.p_diesel_2_kw || 0) + battDischargeKw;
  const renewablePct = totalGenKw > 0 ? Math.min(100, Math.round((totalRenewablesKw / totalGenKw) * 100)) : 69;

  // 4. Environmental Conditions Calculations
  const tempC = activeOverrides?.ambient_temp_c !== undefined
    ? activeOverrides.ambient_temp_c
    : (t.ambient_temp_c !== undefined ? t.ambient_temp_c : -42.0);

  const windMs = activeOverrides?.wind_speed_ms !== undefined
    ? activeOverrides.wind_speed_ms
    : (t.wind_speed_ms !== undefined ? t.wind_speed_ms : 25.9);

  const solarIrr = activeOverrides?.solar_irradiance_wm2 !== undefined
    ? activeOverrides.solar_irradiance_wm2
    : (t.solar_irradiance_wm2 !== undefined ? t.solar_irradiance_wm2 : 131.0);

  const isCutoutActive = windMs >= 25.0;
  const isPolarNight = solarIrr <= 0.0;
  const weatherLabel = isCutoutActive ? 'Cat-3 Blizzard Gale' : (tempC < -35 ? 'Extreme Polar Cold' : 'Nominal Polar Winds');

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 w-full">

      {/* 1. BATTERY RESERVE GAUGE CARD */}
      {/* 1. BATTERY RESERVE GAUGE CARD (Section 4 Battery Management) */}
      <div
        onClick={() => onOpenModal('battery')}
        className="novara-card p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-white via-white to-[#f0faff] cursor-pointer hover:border-[#0699C6] hover:shadow-md transition group"
        title="Click to open Battery Management & Storage Sizing Center"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#c2f0fe] text-[#0699C6] flex items-center justify-center font-bold text-xs group-hover:scale-105 transition-transform">
              <i className="fa-solid fa-car-battery"></i>
            </div>
            <span className="font-extrabold text-xs text-[#127694] tracking-tight uppercase">Battery Storage</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
              latestData?.battery_management?.safety_state_machine?.state === 'LOCKOUT'
                ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                : latestData?.battery_management?.safety_state_machine?.state === 'COLD_DERATING'
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              {latestData?.battery_management?.safety_state_machine?.label || 'SAFE'}
            </span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${battFlowClass}`}>
              {battFlowStatus}
            </span>
          </div>
        </div>

        {/* Big Number & Telemetry */}
        <div className="my-2.5">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-800 tracking-tight">{Math.round(soc)}%</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase">SoC</span>
            </div>
            <div className="text-right">
              <span className="font-mono text-xs font-bold text-[#0699C6]">{battFlowRate}</span>
              <div className="text-[9px] text-slate-400 font-semibold">
                {latestData?.battery_management?.capacities?.usable_energy_above_reserve_kwh || 185} kWh usable
              </div>
            </div>
          </div>

          {/* Visual Cylinder Battery Gauge with Protected Floor */}
          <div className="relative mt-2">
            <div className="cylinder-battery-container">
              <div
                className={`cylinder-battery-fill ${
                  latestData?.battery_management?.safety_state_machine?.state === 'LOCKOUT'
                    ? 'bg-rose-500'
                    : soc <= 25
                    ? 'bg-amber-500'
                    : ''
                }`}
                style={{ width: `${Math.min(100, Math.max(5, soc))}%` }}
              >
                <span className="battery-pct-label">{Math.round(soc)}%</span>
              </div>
            </div>
            {/* 20% Reserve Floor Marker */}
            <div
              className="absolute top-0 bottom-0 border-r-2 border-dashed border-rose-500 z-10 pointer-events-none"
              style={{ left: `${reserveFloor}%` }}
              title="20% Protected Reserve Floor"
            ></div>
          </div>
          <div className="mt-2.5 pt-1 border-t border-slate-100/80">
            <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 mb-0.5">
              <span>60s SoC Trend</span>
              <span className="text-rose-500 font-bold">20% Reserve Floor</span>
            </div>
            <Sparkline
              data={socHistory}
              color="#0699C6"
              fillColor="rgba(6, 153, 198, 0.12)"
              height={28}
              referenceValue={reserveFloor}
              referenceColor="#e11d48"
              minVal={0}
              maxVal={100}
            />
          </div>
        </div>

        {/* Footer Meta: Health & Limits */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
          <span className="text-slate-500 font-medium">
            Core: <strong className={battTemp <= -35 ? 'text-rose-600 font-black' : battTemp <= -20 ? 'text-amber-600 font-bold' : 'text-slate-700'}>
              {battTemp > 0 ? `+${battTemp.toFixed(1)}` : battTemp.toFixed(1)}°C
            </strong>
          </span>
          <span className="text-slate-500 font-medium">
            Health: <strong className="text-emerald-600">{battHealth}%</strong>
          </span>
          <span className="text-slate-500 font-medium flex items-center gap-1 text-[#0699C6] font-bold">
            <span>Sizing &amp; Derating</span>
            <i className="fa-solid fa-arrow-up-right-from-square text-[8px]"></i>
          </span>
        </div>
      </div>

      {/* 2. CURRENT LOAD CARD */}
      <div className="novara-card p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-white via-white to-[#f7fcfe]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
              <i className="fa-solid fa-bolt"></i>
            </div>
            <span className="font-extrabold text-xs text-[#127694] tracking-tight uppercase">Current Load</span>
          </div>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
            {loadPctOfPeak}% Peak
          </span>
        </div>

        <div className="my-2.5">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-800 tracking-tight">{currentLoadKw}</span>
              <span className="text-xs font-bold text-slate-400">kW</span>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-emerald-600">+3.2%</span>
              <div className="text-[9px] text-slate-400 font-semibold">Load Trend</div>
            </div>
          </div>

          {/* Progress bar towards peak */}
          <div className="w-full bg-slate-100 rounded-full h-2 mt-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 transition-all duration-500"
              style={{ width: `${Math.min(100, (currentLoadKw / peakLoadKw) * 100)}%` }}
            ></div>
          </div>
          <div className="mt-2.5 pt-1 border-t border-slate-100/80">
            <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 mb-0.5">
              <span>60s Load Curve</span>
              <span className="text-indigo-600 font-bold">{currentLoadKw} kW</span>
            </div>
            <Sparkline
              data={loadHistory}
              color="#6366f1"
              fillColor="rgba(99, 102, 241, 0.12)"
              height={28}
              referenceValue={peakLoadKw}
              referenceColor="#94a3b8"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
          <span className="text-slate-500 font-medium">
            Peak: <strong className="text-slate-800">{peakLoadKw} kW</strong>
          </span>
          <span className="text-slate-500 font-medium">
            Life Support: <strong className="text-rose-600">20 kW Inviolable</strong>
          </span>
        </div>
      </div>

      {/* 3. RENEWABLE GENERATION CARD */}
      <div className="novara-card p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-white via-white to-[#f0fdf4]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
              <i className="fa-solid fa-leaf"></i>
            </div>
            <span className="font-extrabold text-xs text-[#127694] tracking-tight uppercase">Renewables</span>
          </div>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            {renewablePct}% Share
          </span>
        </div>

        <div className="my-2.5">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-800 tracking-tight">{totalRenewablesKw}</span>
              <span className="text-xs font-bold text-slate-400">kW</span>
            </div>
            <div className="text-right">
              <span className="font-mono text-xs font-bold text-slate-600">Wind + Solar</span>
              <div className="text-[9px] text-slate-400 font-semibold">Active Supply</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="p-1 rounded-lg bg-[#e5f6fd] text-center border border-[#bcecfc]/60">
              <span className="text-[9px] font-bold text-[#0699C6]">Wind: {Math.round(windKw)} kW</span>
            </div>
            <div className="p-1 rounded-lg bg-amber-50 text-center border border-amber-200">
              <span className="text-[9px] font-bold text-amber-700">Solar: {Math.round(solarKw)} kW</span>
            </div>
          </div>
          <div className="mt-2.5 pt-1 border-t border-slate-100/80">
            <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 mb-0.5">
              <span>60s Renewable Harvest</span>
              <span className="text-emerald-600 font-bold">{totalRenewablesKw} kW</span>
            </div>
            <Sparkline
              data={renHistory}
              color="#10b981"
              fillColor="rgba(16, 185, 129, 0.12)"
              height={28}
            />
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
          <span className="text-slate-500 font-medium">
            Albedo Gain: <strong className="text-amber-600">+20% Snow</strong>
          </span>
          <span className="text-slate-500 font-medium">
            Curtailment: <strong className="text-slate-700">0.0 kW</strong>
          </span>
        </div>
      </div>

      {/* 4. ENVIRONMENTAL CONDITIONS CARD */}
      <div className="novara-card p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-white via-white to-[#eff6ff]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-xs">
              <i className="fa-solid fa-temperature-arrow-down"></i>
            </div>
            <span className="font-extrabold text-xs text-[#127694] tracking-tight uppercase">Environment</span>
          </div>
          {isCutoutActive ? (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
              Gale Cut-out
            </span>
          ) : (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
              {weatherLabel}
            </span>
          )}
        </div>

        <div className="my-2.5">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-800 tracking-tight">{tempC.toFixed(1)}°</span>
              <span className="text-xs font-bold text-slate-400">C</span>
            </div>
            <div className="text-right">
              <span className="font-mono text-xs font-bold text-slate-800">{windMs.toFixed(1)} m/s</span>
              <div className="text-[9px] text-slate-400 font-semibold">Wind Velocity</div>
            </div>
          </div>

          <div className="w-full mt-2 flex items-center justify-between text-[11px] font-mono bg-slate-50 p-1.5 rounded-lg border border-slate-100">
            <span className="text-slate-500">Solar Irradiance:</span>
            <span className="font-bold text-slate-800">{solarIrr.toFixed(0)} W/m²</span>
          </div>
          <div className="mt-2.5 pt-1 border-t border-slate-100/80">
            <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 mb-0.5">
              <span>60s Thermal Drift</span>
              <span className="text-sky-600 font-bold">{tempC.toFixed(1)}°C</span>
            </div>
            <Sparkline
              data={tempHistory}
              color="#0284c7"
              fillColor="rgba(2, 132, 199, 0.10)"
              height={28}
            />
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
          <span className="text-slate-500 font-medium">
            Cut-out Limit: <strong className="text-slate-700">25.0 m/s</strong>
          </span>
          <span className="text-slate-500 font-medium">
            Polar Night: <strong className={isPolarNight ? 'text-amber-600' : 'text-emerald-600'}>{isPolarNight ? 'Active' : 'Sunlit'}</strong>
          </span>
        </div>
      </div>

    </div>
  );
}
