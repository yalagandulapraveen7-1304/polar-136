import React from 'react';

// Mini SVG Sparkline Component
function MiniSparkline({ data = [40, 42, 41, 45, 44, 46], color = '#0699C6', height = 24, width = 64 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min === 0 ? 1 : max - min;
  
  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible shrink-0 opacity-85">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export default function PowerBalanceBanner({
  latestData,
  onOpenMonitoring
}) {
  const m = latestData?.monitoring || {};
  const d = latestData?.dispatch || {};
  const t = latestData?.telemetry || {};

  // Sources
  const solarKw = m.sources?.solar_kw ?? (d.p_solar_kw !== undefined ? Math.round(d.p_solar_kw) : 86);
  const windKw = m.sources?.wind_kw ?? (d.p_wind_kw !== undefined ? Math.round(d.p_wind_kw) : 104);
  const battKw = m.sources?.battery_kw ?? (d.p_battery_discharge_kw !== undefined ? Math.round(d.p_battery_discharge_kw) : 42);
  const battMode = m.sources?.battery_mode ?? (battKw > 0 ? 'DISCHARGING' : 'CHARGING');
  const dieselKw = m.sources?.diesel_kw ?? (Math.round((d.p_diesel_1_kw || 180) + (d.p_diesel_2_kw || 0)));
  const loadKw = m.consumption?.electrical_load_kw ?? (t.station_load_kwe ? Math.round(t.station_load_kwe) : 412);
  const thermalKw = m.consumption?.thermal_load_kwth ?? (t.load_thermal_kw ? Math.round(t.load_thermal_kw) : 268);

  // Power Balance
  const totalGenKw = m.power_balance?.total_generation_kw ?? (solarKw + windKw + dieselKw + (battKw > 0 ? battKw : 0));
  const totalDemandKw = m.power_balance?.total_demand_kw ?? (loadKw + (battKw < 0 ? -battKw : 0));
  const netResidualKw = m.power_balance?.net_residual_kw ?? 0.0;
  const balanceStatus = m.power_balance?.status ?? 'STABLE';
  const renSharePct = m.power_balance?.renewable_share_pct ?? Math.round(((solarKw + windKw) / (totalGenKw || 1)) * 100);

  // Curtailment
  const curtailedKw = m.curtailment?.curtailed_kw ?? 0.0;
  const curtailmentReason = m.curtailment?.active_reason ?? '100% Green Harvest';

  // Sparklines
  const sp = m.sparklines || {
    solar: [82, 84, 85, 86, 86, 85, 86],
    wind: [108, 106, 105, 104, 103, 104, 104],
    battery: [38, 40, 41, 42, 42, 41, 42],
    diesel: [182, 181, 180, 180, 180, 180, 180],
    load: [410, 411, 412, 412, 411, 412, 412]
  };

  return (
    <div className="w-full novara-card p-3 sm:p-4 bg-gradient-to-r from-white via-[#f4fafc] to-white border border-[#bcecfc] shadow-sm flex flex-col gap-3">
      {/* 1. Tactical Title & Quick Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#bcecfc]/40 pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#0699C6] to-[#127694] text-white flex items-center justify-center font-black text-xs shadow-sm">
            <i className="fa-solid fa-gauge-high"></i>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xs text-[#127694] tracking-tight uppercase">
                Real-Time Energy Generation &amp; Consumption Monitor
              </span>
              <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>50.02 Hz Synced</span>
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">
              Layer 1: What is happening now? · Continuous high-frequency microgrid balancing
            </span>
          </div>
        </div>

        {/* Live Power Balance Indicator Pill */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-[#bcecfc] shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Power Balance:</span>
            <div className="flex items-center gap-1.5 font-mono text-xs font-black">
              <span className="text-[#0699C6]">{totalGenKw} kW Gen</span>
              <span className="text-slate-300">/</span>
              <span className="text-[#127694]">{totalDemandKw} kW Dem</span>
            </div>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${
              balanceStatus === 'STABLE'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-rose-100 text-rose-800'
            }`}>
              <i className="fa-solid fa-check text-[9px]"></i>
              <span>{Math.abs(netResidualKw).toFixed(2)} kW · STABLE</span>
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenMonitoring}
            className="px-3 py-1.5 rounded-xl bg-[#127694] hover:bg-[#0699C6] text-white font-extrabold text-xs transition shadow-sm flex items-center gap-1.5"
            title="Open comprehensive 3-layer monitoring and historical analytics"
          >
            <i className="fa-solid fa-chart-pie text-xs"></i>
            <span>3-Layer Energy Center</span>
            <i className="fa-solid fa-arrow-up-right-from-square text-[9px] ml-0.5"></i>
          </button>
        </div>
      </div>

      {/* 2. Tactical Reading Strip: SOLAR | WIND | BATTERY | DIESEL | LOAD with Sparklines */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 w-full">
        {/* SOLAR */}
        <div className="p-2.5 rounded-xl bg-white border border-[#bcecfc]/60 shadow-xs flex flex-col justify-between hover:border-[#0699C6] transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-amber-600 uppercase flex items-center gap-1">
              <i className="fa-solid fa-sun text-xs"></i>
              SOLAR
            </span>
            <span className="text-[9px] font-mono text-slate-400">Bifacial PV</span>
          </div>
          <div className="flex items-baseline justify-between mt-1 mb-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-slate-800 tracking-tight">{solarKw}</span>
              <span className="text-[10px] font-bold text-slate-400">kW</span>
            </div>
            <MiniSparkline data={sp.solar} color="#f59e0b" width={56} height={20} />
          </div>
          <div className="text-[9px] text-slate-500 font-semibold flex items-center justify-between pt-1 border-t border-slate-100">
            <span>Harvest: 100%</span>
            <span className="text-amber-600 font-bold">No Curtailment</span>
          </div>
        </div>

        {/* WIND */}
        <div className="p-2.5 rounded-xl bg-white border border-[#bcecfc]/60 shadow-xs flex flex-col justify-between hover:border-[#0699C6] transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-[#0699C6] uppercase flex items-center gap-1">
              <i className="fa-solid fa-wind text-xs"></i>
              WIND
            </span>
            <span className="text-[9px] font-mono text-slate-400">Katabatic</span>
          </div>
          <div className="flex items-baseline justify-between mt-1 mb-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-slate-800 tracking-tight">{windKw}</span>
              <span className="text-[10px] font-bold text-slate-400">kW</span>
            </div>
            <MiniSparkline data={sp.wind} color="#0699C6" width={56} height={20} />
          </div>
          <div className="text-[9px] text-slate-500 font-semibold flex items-center justify-between pt-1 border-t border-slate-100">
            <span>Turbines: 2 Active</span>
            <span className="text-[#0699C6] font-bold">&lt; 25 m/s Safe</span>
          </div>
        </div>

        {/* BATTERY */}
        <div className="p-2.5 rounded-xl bg-white border border-[#bcecfc]/60 shadow-xs flex flex-col justify-between hover:border-[#0699C6] transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-emerald-600 uppercase flex items-center gap-1">
              <i className="fa-solid fa-car-battery text-xs"></i>
              BATTERY
            </span>
            <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 rounded">
              {battMode}
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-1 mb-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-slate-800 tracking-tight">
                {battKw > 0 ? `+${battKw}` : battKw}
              </span>
              <span className="text-[10px] font-bold text-slate-400">kW</span>
            </div>
            <MiniSparkline data={sp.battery} color="#10b981" width={56} height={20} />
          </div>
          <div className="text-[9px] text-slate-500 font-semibold flex items-center justify-between pt-1 border-t border-slate-100">
            <span>Buffer Flow</span>
            <span className="text-emerald-700 font-bold">20% Floor Safe</span>
          </div>
        </div>

        {/* DIESEL / CHP */}
        <div className="p-2.5 rounded-xl bg-white border border-[#bcecfc]/60 shadow-xs flex flex-col justify-between hover:border-[#0699C6] transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-rose-600 uppercase flex items-center gap-1">
              <i className="fa-solid fa-gas-pump text-xs"></i>
              DIESEL / CHP
            </span>
            <span className="text-[9px] font-mono text-slate-400">Gen-Set</span>
          </div>
          <div className="flex items-baseline justify-between mt-1 mb-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-slate-800 tracking-tight">{dieselKw}</span>
              <span className="text-[10px] font-bold text-slate-400">kW</span>
            </div>
            <MiniSparkline data={sp.diesel} color="#f43f5e" width={56} height={20} />
          </div>
          <div className="text-[9px] text-slate-500 font-semibold flex items-center justify-between pt-1 border-t border-slate-100">
            <span>G1: 180 kW · G2: Idle</span>
            <span className="text-rose-600 font-bold">CHP: {Math.round(dieselKw * 1.15)} kWth</span>
          </div>
        </div>

        {/* TOTAL ELECTRICAL LOAD */}
        <div className="p-2.5 rounded-xl bg-white border border-[#bcecfc]/60 shadow-xs flex flex-col justify-between hover:border-[#0699C6] transition col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-[#127694] uppercase flex items-center gap-1">
              <i className="fa-solid fa-bolt text-xs"></i>
              STATION LOAD
            </span>
            <span className="text-[9px] font-mono text-slate-400">Demand</span>
          </div>
          <div className="flex items-baseline justify-between mt-1 mb-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-slate-800 tracking-tight">{loadKw}</span>
              <span className="text-[10px] font-bold text-slate-400">kW</span>
            </div>
            <MiniSparkline data={sp.load} color="#127694" width={56} height={20} />
          </div>
          <div className="text-[9px] text-slate-500 font-semibold flex items-center justify-between pt-1 border-t border-slate-100">
            <span>20 kW Non-Shed Floor</span>
            <span className="text-[#0699C6] font-bold">{renSharePct}% Green</span>
          </div>
        </div>
      </div>

      {/* 3. Sub-bar: Curtailment Accounting & Thermal Loop Integration */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#e5f6fd]/60 border border-[#bcecfc]/50 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-extrabold text-[#127694] flex items-center gap-1.5">
            <i className="fa-solid fa-leaf text-emerald-600 text-xs"></i>
            <span>Renewable Curtailment:</span>
            <strong className="text-slate-800 font-mono">{curtailedKw.toFixed(1)} kW ({curtailmentReason})</strong>
          </span>
          <span className="hidden md:inline text-slate-300">|</span>
          <span className="hidden md:inline text-[11px] text-slate-600 font-medium">
            Thermal Co-Generation: <strong className="text-slate-800 font-mono">{thermalKw} kWth</strong> required · <strong className="text-emerald-700 font-mono">{Math.round(dieselKw * 1.15)} kWth</strong> recovered via CHP
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono text-[#127694]">
          <span className="px-2 py-0.5 rounded-md bg-white border border-[#bcecfc]/60 font-bold">
            Solar: {solarKw} kW + Wind: {windKw} kW = {solarKw + windKw} kW Green
          </span>
        </div>
      </div>
    </div>
  );
}
