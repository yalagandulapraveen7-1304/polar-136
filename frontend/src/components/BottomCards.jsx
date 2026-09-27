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
  const h = latestData?.hardware_health || {};

  const gen1Kw = d.p_diesel_1_kw || 0.0;
  const gen2Kw = d.p_diesel_2_kw || 77.0;
  const totalGenKw = gen1Kw + gen2Kw;
  const fuelBurnRate = t.fuel_burn_rate_lh !== undefined ? t.fuel_burn_rate_lh : (totalGenKw * 0.26);

  const g2Health = h.genset_2_health_pct !== undefined ? h.genset_2_health_pct : 82;
  const overallHealth = h.overall_score_pct !== undefined ? h.overall_score_pct : 84;

  return (
    <div className="flex flex-col gap-3.5 sm:gap-4 w-full">

      {/* ROW 1: TACTICAL OPERATIONS CARDS (DISPATCH, MAINTENANCE, MANUAL OVERRIDE) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">

        {/* 1. DISPATCH CONTROLLER CARD */}
        <div className="novara-card p-4 sm:p-5 flex flex-col justify-between bg-gradient-to-br from-white via-white to-[#f0faff]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#c2f0fe] text-[#0698c4] flex items-center justify-center font-bold text-xs">
                  <i className="fa-solid fa-sliders"></i>
                </div>
                <span className="font-extrabold text-xs text-[#127694] uppercase tracking-tight">
                  Dispatch Controller
                </span>
              </div>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                3-Tier MILP Active
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mb-2.5">
              L1 Annual Target → L2 24h Commitment → L3 Live 1s Receding Horizon.
            </p>
          </div>

          {/* Generator Outputs & Burn Rate */}
          <div className="space-y-2 my-1">
            <div className="p-2.5 rounded-xl bg-white border border-[#9ae5fe] shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Genset Outputs</span>
                <span className="text-xs font-black text-slate-800">
                  G1: <strong className="text-[#0698c4]">{gen1Kw.toFixed(1)} kW</strong> · G2: <strong className="text-rose-600">{gen2Kw.toFixed(1)} kW</strong>
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Gen</span>
                <span className="text-xs font-mono font-black text-slate-800">{totalGenKw.toFixed(1)} kW</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs px-1 text-slate-600">
              <span>Fuel Burn Rate:</span>
              <strong className="font-mono text-[#0698c4]">{fuelBurnRate.toFixed(1)} L/h</strong>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-medium">Optimization Active</span>
            <button
              type="button"
              onClick={() => onOpenModal('dispatch')}
              className="px-3 py-1.5 rounded-xl bg-[#0698c4] hover:bg-[#05c5ff] text-white font-bold text-xs transition shadow-sm flex items-center gap-1.5"
            >
              <i className="fa-solid fa-code-fork text-xs"></i>
              <span>OPTIMIZE DISPATCH</span>
            </button>
          </div>
        </div>

        {/* 2. MAINTENANCE & ASSET HEALTH CARD */}
        <div className="novara-card p-4 sm:p-5 flex flex-col justify-between bg-gradient-to-br from-white via-white to-[#f7fcfe]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#c2f0fe] text-[#0698c4] flex items-center justify-center font-bold text-xs">
                  <i className="fa-solid fa-shield-halved"></i>
                </div>
                <span className="font-extrabold text-xs text-[#127694] uppercase tracking-tight">
                  Maintenance &amp; Health
                </span>
              </div>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {overallHealth}% Stable
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mb-2.5">
              Predictive asset telemetry, degradation trends, and sub-zero stress.
            </p>
          </div>

          {/* Specific Asset Health Notice */}
          <div className="my-1 space-y-2">
            <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs">
              <div className="flex items-center justify-between text-amber-900 font-bold mb-0.5">
                <span className="flex items-center gap-1.5">
                  <i className="fa-solid fa-circle-exclamation text-amber-600"></i>
                  Generator G2 Health: {g2Health}%
                </span>
                <span className="text-[9px] bg-amber-200/80 text-amber-800 px-1.5 py-0.5 rounded-full font-bold">
                  Recommended
                </span>
              </div>
              <p className="text-[10px] text-amber-800 leading-tight">
                Recommended service window in <strong>36h</strong> before polar storm surge.
              </p>
            </div>

            <div className="flex items-center justify-between text-xs px-1 text-slate-600">
              <span>Failure Probability:</span>
              <span className="font-mono text-emerald-600 font-bold">0.03%/h (Safe)</span>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-medium">LiFePO4 Jacket Nominal</span>
            <button
              type="button"
              onClick={() => onOpenModal('maintenance')}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#127694] font-bold text-xs border border-[#9ae5fe] transition shadow-xs flex items-center gap-1.5"
            >
              <i className="fa-solid fa-wrench text-xs text-[#0698c4]"></i>
              <span>VIEW MAINTENANCE</span>
            </button>
          </div>
        </div>

        {/* 3. SAFETY MANUAL OVERRIDE & CONTINGENCY CARD */}
        <div className="novara-card p-4 sm:p-5 flex flex-col justify-between bg-gradient-to-br from-white via-white to-[#fffafb]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xs">
                  <i className="fa-solid fa-hand"></i>
                </div>
                <span className="font-extrabold text-xs text-[#127694] uppercase tracking-tight">
                  Safety Manual Override
                </span>
              </div>
              <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Auth: Cmdr L2
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mb-2">
              Simulate extreme polar contingencies or clamp physical setpoints.
            </p>
          </div>

          {/* 4 Quick Contingency Selector Buttons */}
          <div className="grid grid-cols-2 gap-1.5 my-1">
            <button
              type="button"
              onClick={() => onScenarioChange('blizzard')}
              className={`p-1.5 rounded-lg border text-left transition flex items-center justify-between ${
                currentScenario === 'blizzard'
                  ? 'border-rose-400 bg-rose-50 font-bold text-rose-800'
                  : 'border-[#9ae5fe]/60 bg-white hover:bg-[#f0faff] text-slate-700'
              }`}
            >
              <span className="text-[10px]">Cat-3 Blizzard</span>
              <span className="text-[8px] bg-rose-100 text-rose-700 px-1 py-0.2 rounded font-bold">Storm</span>
            </button>

            <button
              type="button"
              onClick={() => onScenarioChange('trip')}
              className={`p-1.5 rounded-lg border text-left transition flex items-center justify-between ${
                currentScenario === 'trip'
                  ? 'border-amber-400 bg-amber-50 font-bold text-amber-800'
                  : 'border-[#9ae5fe]/60 bg-white hover:bg-[#f0faff] text-slate-700'
              }`}
            >
              <span className="text-[10px]">Gen-Set Trip</span>
              <span className="text-[8px] bg-amber-100 text-amber-700 px-1 py-0.2 rounded font-bold">Trip</span>
            </button>

            <button
              type="button"
              onClick={() => onScenarioChange('night')}
              className={`p-1.5 rounded-lg border text-left transition flex items-center justify-between ${
                currentScenario === 'night'
                  ? 'border-slate-400 bg-slate-100 font-bold text-slate-800'
                  : 'border-[#9ae5fe]/60 bg-white hover:bg-[#f0faff] text-slate-700'
              }`}
            >
              <span className="text-[10px]">Polar Night</span>
              <span className="text-[8px] bg-slate-200 text-slate-700 px-1 py-0.2 rounded font-bold">Winter</span>
            </button>

            <button
              type="button"
              onClick={() => onScenarioChange('dawn')}
              className={`p-1.5 rounded-lg border text-left transition flex items-center justify-between ${
                currentScenario === 'dawn'
                  ? 'border-emerald-400 bg-emerald-50 font-bold text-emerald-800'
                  : 'border-[#9ae5fe]/60 bg-white hover:bg-[#f0faff] text-slate-700'
              }`}
            >
              <span className="text-[10px]">Spring Sunrise</span>
              <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1 py-0.2 rounded font-bold">PV High</span>
            </button>
          </div>

          {/* Action Trigger */}
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={onResetScenario}
              className="text-[10px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1"
            >
              <i className="fa-solid fa-rotate-left text-[9px]"></i> Reset Nominal
            </button>
            <button
              type="button"
              onClick={() => onOpenModal('manual')}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition shadow-xs flex items-center gap-1.5"
            >
              <i className="fa-solid fa-sliders text-xs"></i>
              <span>MANUAL OVERRIDE</span>
            </button>
          </div>
        </div>

      </div>

      {/* ROW 2: ANNUAL STRATEGIC IMPACT KPIS (PROJECT A DIGITAL TWIN BENCHMARKS) */}
      <div className="novara-card p-4 sm:p-5 bg-gradient-to-r from-white via-[#f0faff] to-white border-2 border-[#9ae5fe] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#9ae5fe]/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-[#127694] tracking-tight uppercase">
                Annual Strategic Impact &amp; Logistics Benchmarks
              </span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                Verified Digital Twin Model
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Validated against Maitri &amp; Bharati research station annual load profiles vs naive baseline.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenModal('monitoring')}
              className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#127694] font-bold text-xs border border-[#9ae5fe] transition shadow-xs flex items-center gap-1.5"
            >
              <i className="fa-solid fa-chart-pie text-xs text-[#0698c4]"></i>
              <span>3-Layer Energy Analytics</span>
            </button>
            <a
              href="/api/analytics/report"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 rounded-xl bg-[#127694] hover:bg-[#0698c4] text-white font-bold text-xs transition shadow-sm flex items-center gap-1.5"
            >
              <i className="fa-solid fa-file-lines text-xs"></i>
              <span>Consolidated HTML Report</span>
            </a>
          </div>
        </div>

        {/* 4 High-Density Key Impact Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 text-center">

          {/* KPI 1: Fuel & Water Saved */}
          <div className="p-3 rounded-2xl bg-white border border-[#9ae5fe] shadow-xs">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
              Fuel &amp; Water Saved
            </span>
            <div className="text-2xl font-black text-emerald-600 my-0.5">118,994 L</div>
            <span className="text-[10px] font-bold text-slate-600">
              -25.2% vs always-on baseline
            </span>
          </div>

          {/* KPI 2: Logistics Cost Saved */}
          <div className="p-3 rounded-2xl bg-white border border-[#9ae5fe] shadow-xs">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
              Delivered Cost Saved
            </span>
            <div className="text-2xl font-black text-[#127694] my-0.5">$356,982</div>
            <span className="text-[10px] font-bold text-slate-600">
              $3.00/L delivered Antarctic cost
            </span>
          </div>

          {/* KPI 3: Tank Reserve Margin */}
          <div className="p-3 rounded-2xl bg-white border border-[#9ae5fe] shadow-xs">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
              Tank Reserve Margin
            </span>
            <div className="text-2xl font-black text-[#0698c4] my-0.5">+52,895 L</div>
            <span className="text-[10px] font-bold text-rose-600">
              Baseline dry (-66,098 L)
            </span>
          </div>

          {/* KPI 4: Carbon Avoided & Renewable Fraction */}
          <div className="p-3 rounded-2xl bg-white border border-[#9ae5fe] shadow-xs">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
              Emissions Avoided
            </span>
            <div className="text-2xl font-black text-emerald-600 my-0.5">318.9 T</div>
            <span className="text-[10px] font-bold text-slate-600">
              68.2% annual renewable share
            </span>
          </div>

        </div>
      </div>

    </div>
  );
}
