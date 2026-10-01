import React, { useState, useEffect } from 'react';
import { calculateBaselineComparison } from '../utils/evaluationEngine';

export default function EvaluationSection({ stationId = 'MAITRI', latestData, onOpenModal }) {
  const [horizon, setHorizon] = useState('24h'); // '24h' | '7d' | '21d'
  const [evalData, setEvalData] = useState(() => calculateBaselineComparison(stationId, '24h'));
  const [isLoading, setIsLoading] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  // Fetch from backend API with fallback to local physics calculation
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const fetchEval = async () => {
      try {
        const res = await fetch(`/api/evaluation/baseline-comparison?horizon=${horizon}&station_id=${stationId}`);
        if (res.ok) {
          const json = await res.json();
          if (isMounted) {
            setEvalData(json);
            setIsLoading(false);
            return;
          }
        }
      } catch (e) {
        // Fallback to local deterministic calculation
      }
      if (isMounted) {
        setEvalData(calculateBaselineComparison(stationId, horizon));
        setIsLoading(false);
      }
    };

    fetchEval();
    return () => {
      isMounted = false;
    };
  }, [horizon, stationId]);

  const m = evalData?.metrics || {};
  const diesel = m.diesel_fuel || m.fuel_consumption_liters || {};
  const ren = m.renewable_utilization || m.renewable_penetration_pct || {};
  const cost = m.operating_cost || m.operating_cost_usd || {};
  const co2 = m.co2_emissions || m.co2_emissions_kg || {};
  const unserved = m.unserved_energy || m.unserved_energy_kwh || {};
  const battViol = m.battery_reserve_violations || {};

  return (
    <div className="novara-card p-4 sm:p-5 bg-gradient-to-br from-white via-[#f4fbfe] to-white border-2 border-[#bcecfc] shadow-sm flex flex-col gap-4">
      {/* 1. Header & Horizon Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#bcecfc]/70">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs sm:text-sm font-black text-[#127694] tracking-tight uppercase">
              Baseline vs PolarOPS Impact Evaluation
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
              Calibrated Physics Benchmark
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Comparative analysis based on calibrated Antarctic physics models &amp; NCPOR expedition logistics. (Simulation benchmark, not physical hardware telemetry).
          </p>
        </div>

        {/* Horizon Selector Pill Group */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100/90 border border-slate-200/80">
          <button
            type="button"
            onClick={() => setHorizon('24h')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
              horizon === '24h'
                ? 'bg-white text-[#127694] shadow-xs border border-[#bcecfc]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            24h Lookahead
          </button>
          <button
            type="button"
            onClick={() => setHorizon('7d')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
              horizon === '7d'
                ? 'bg-white text-[#127694] shadow-xs border border-[#bcecfc]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            7-Day Cold Snap
          </button>
          <button
            type="button"
            onClick={() => setHorizon('21d')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
              horizon === '21d'
                ? 'bg-white text-[#127694] shadow-xs border border-[#bcecfc]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            21-Day Benchmark (Project A)
          </button>
        </div>
      </div>

      {/* 2. Strategy Definition Bar (Clear Engineering Differentiation) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs p-3 rounded-2xl bg-white/80 border border-[#bcecfc]/80 shadow-xs">
        <div className="border-l-3 border-slate-400 pl-2.5">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
            [A] Conventional Baseline Strategy:
          </span>
          <span className="text-slate-700 leading-snug">
            Continuous fixed-governor diesel generation, electric resistance heating load penalty (0% waste heat recovered), unmanaged battery hysteresis, and active renewable curtailment during surges.
          </span>
        </div>
        <div className="border-l-3 border-[#0699C6] pl-2.5">
          <span className="text-[10px] font-black text-[#0699C6] uppercase tracking-wider block">
            [B] PolarOPS 3-Tier MILP Strategy:
          </span>
          <span className="text-slate-700 leading-snug">
            HiGHS MILP unit commitment, 1.20 kWth/kWe CHP engine waste heat recovery, strict ≥20% emergency BESS reserve floor protection, and prioritized 100% renewable absorption.
          </span>
        </div>
      </div>

      {/* 3. The 6 Required Real Calculated KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Metric 1: Diesel / Fuel Consumption */}
        <div className="p-3.5 rounded-2xl bg-white border border-[#bcecfc] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <i className="fa-solid fa-gas-pump text-[#0699C6]"></i>
                Diesel Consumption
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                ▼ -{diesel.improvement_pct || 0}%
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <div>
                <span className="text-[9px] text-slate-400 block font-medium">Conventional Baseline</span>
                <span className="text-sm font-mono font-bold text-slate-600 line-through">
                  {(diesel.baseline || 0).toLocaleString()} L
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-emerald-600 block font-bold">PolarOPS Optimized</span>
                <span className="text-xl font-mono font-black text-emerald-600">
                  {(diesel.polarops || 0).toLocaleString()} L
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100 text-[10px] font-semibold text-slate-600 flex justify-between">
            <span>Verified Savings:</span>
            <strong className="text-emerald-700 font-mono">{(diesel.saved || 0).toLocaleString()} L saved</strong>
          </div>
        </div>

        {/* Metric 2: Renewable Energy Utilization */}
        <div className="p-3.5 rounded-2xl bg-white border border-[#bcecfc] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <i className="fa-solid fa-solar-panel text-emerald-500"></i>
                Renewable Utilization
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                ▲ +{ren.saved || 0}%
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <div>
                <span className="text-[9px] text-slate-400 block font-medium">Conventional Baseline</span>
                <span className="text-sm font-mono font-bold text-slate-600">
                  {ren.baseline || 0}% Harvested
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-emerald-600 block font-bold">PolarOPS Absorbed</span>
                <span className="text-xl font-mono font-black text-[#127694]">
                  {ren.polarops || 0}%
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100 text-[10px] font-semibold text-slate-600 flex justify-between">
            <span>Renewable Capture Gain:</span>
            <strong className="text-[#127694] font-mono">+{ren.saved || 0}% pts absorbed</strong>
          </div>
        </div>

        {/* Metric 3: Fuel / Operating Cost */}
        <div className="p-3.5 rounded-2xl bg-white border border-[#bcecfc] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <i className="fa-solid fa-dollar-sign text-amber-500"></i>
                Fuel &amp; Logistics Cost
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                ▼ -{cost.improvement_pct || 0}%
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <div>
                <span className="text-[9px] text-slate-400 block font-medium">Baseline ($3.00/L delivered)</span>
                <span className="text-sm font-mono font-bold text-slate-600 line-through">
                  ${(cost.baseline || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-[#127694] block font-bold">PolarOPS Total Cost</span>
                <span className="text-xl font-mono font-black text-[#127694]">
                  ${(cost.polarops || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100 text-[10px] font-semibold text-slate-600 flex justify-between">
            <span>Cost Reduction:</span>
            <strong className="text-emerald-700 font-mono">
              ${(cost.saved || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} saved
            </strong>
          </div>
        </div>

        {/* Metric 4: CO2 Emissions */}
        <div className="p-3.5 rounded-2xl bg-white border border-[#bcecfc] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <i className="fa-solid fa-leaf text-emerald-600"></i>
                CO₂ Emissions
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                ▼ -{co2.improvement_pct || 0}%
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <div>
                <span className="text-[9px] text-slate-400 block font-medium">Baseline (2.68 kg/L)</span>
                <span className="text-sm font-mono font-bold text-slate-600 line-through">
                  {(co2.baseline ? co2.baseline / 1000 : 0).toFixed(2)} T CO₂
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-emerald-600 block font-bold">PolarOPS Footprint</span>
                <span className="text-xl font-mono font-black text-emerald-600">
                  {(co2.polarops ? co2.polarops / 1000 : 0).toFixed(2)} T CO₂
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100 text-[10px] font-semibold text-slate-600 flex justify-between">
            <span>Carbon Avoided:</span>
            <strong className="text-emerald-700 font-mono">
              {(co2.saved ? co2.saved / 1000 : 0).toFixed(2)} Tonnes CO₂
            </strong>
          </div>
        </div>

        {/* Metric 5: Unserved Energy */}
        <div className="p-3.5 rounded-2xl bg-white border border-[#bcecfc] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <i className="fa-solid fa-triangle-exclamation text-rose-500"></i>
                Unserved Energy
              </span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                (unserved.polarops || 0) > 0
                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-200'
              }`}>
                {(unserved.polarops || 0) > 0 ? `SHEDDING: ${(unserved.polarops || 0).toFixed(1)} kWh` : '100% UPTIME'}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <div>
                <span className="text-[9px] text-slate-400 block font-medium">Baseline Load-Shedding</span>
                <span className="text-sm font-mono font-bold text-rose-600">
                  {(unserved.baseline || 0).toFixed(1)} kWh deficit
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-500 block font-bold">PolarOPS Optimized</span>
                <span className={`text-xl font-mono font-black ${
                  (unserved.polarops || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'
                }`}>
                  {(unserved.polarops || 0).toFixed(1)} kWh
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100 text-[10px] font-semibold text-slate-600 flex justify-between">
            <span>Life-Support Guarantee:</span>
            <strong className={`font-mono ${
              (unserved.polarops || 0) > 0 ? 'text-rose-600' : 'text-emerald-700'
            }`}>
              {(unserved.polarops || 0) > 0 ? `${(unserved.polarops || 0).toFixed(1)} kWh deficit` : 'Zero unserved energy'}
            </strong>
          </div>
        </div>

        {/* Metric 6: Battery Reserve Violations */}
        <div className="p-3.5 rounded-2xl bg-white border border-[#bcecfc] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <i className="fa-solid fa-battery-half text-[#0699C6]"></i>
                Reserve Floor Violations
              </span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                (battViol.polarops || 0) > 0
                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-200'
              }`}>
                {(battViol.polarops || 0) > 0 ? `${(battViol.polarops || 0).toFixed(0)}h BREACH` : '≥20% HELD'}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <div>
                <span className="text-[9px] text-slate-400 block font-medium">Baseline (Deep Discharge)</span>
                <span className="text-sm font-mono font-bold text-rose-600">
                  {(battViol.baseline || 0).toFixed(0)} Hours &lt; 20%
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-500 block font-bold">PolarOPS Reserve Floor</span>
                <span className={`text-xl font-mono font-black ${
                  (battViol.polarops || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'
                }`}>
                  {(battViol.polarops || 0).toFixed(0)} Hours
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100 text-[10px] font-semibold text-slate-600 flex justify-between">
            <span>Reserve Floor Status:</span>
            <strong className={`font-mono ${
              (battViol.polarops || 0) > 0 ? 'text-rose-600' : 'text-emerald-700'
            }`}>
              {(battViol.polarops || 0) > 0 ? `${(battViol.polarops || 0).toFixed(0)}h below 20% reserve` : 'Strictly ≥ 20.0% protected'}
            </strong>
          </div>
        </div>
      </div>

      {/* 4. Side-by-Side Comparison Visualization (Relative Proportional Performance) */}
      <div className="p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-chart-bar text-[#0699C6]"></i>
            <span className="text-xs font-black text-slate-800 uppercase tracking-tight">
              Relative Performance Visualization (Baseline 100% Index vs PolarOPS)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowTimeline(!showTimeline)}
            className="text-[11px] font-bold text-[#0699C6] hover:text-[#127694] flex items-center gap-1"
          >
            <i className={`fa-solid ${showTimeline ? 'fa-chevron-up' : 'fa-chevron-down'} text-[10px]`}></i>
            <span>{showTimeline ? 'Hide Simulation Step Records' : 'Inspect Simulation Step Records'}</span>
          </button>
        </div>

        {/* Comparative Bars */}
        <div className="space-y-3 pt-1">
          {/* Bar 1: Fuel Burn */}
          <div>
            <div className="flex justify-between text-xs font-bold mb-1">
              <span className="text-slate-700">Fuel Consumption Index</span>
              <span className="font-mono text-emerald-600">
                {diesel.baseline ? Math.round((diesel.polarops / diesel.baseline) * 100) : 100}% of baseline (-{diesel.improvement_pct || 0}%)
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{
                  width: `${diesel.baseline ? Math.min(100, Math.round((diesel.polarops / diesel.baseline) * 100)) : 100}%`
                }}
              ></div>
              <div
                className="h-full bg-emerald-100 transition-all duration-500"
                style={{
                  width: `${diesel.improvement_pct || 0}%`
                }}
                title="Fuel Saved"
              ></div>
            </div>
          </div>

          {/* Bar 2: Renewable Utilization */}
          <div>
            <div className="flex justify-between text-xs font-bold mb-1">
              <span className="text-slate-700">Renewable Harvest Absorption</span>
              <span className="font-mono text-[#0699C6]">
                {ren.polarops}% absorbed (vs {ren.baseline}% baseline)
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
              <div
                className="h-full bg-[#0699C6] transition-all duration-500"
                style={{ width: `${Math.min(100, ren.polarops || 0)}%` }}
              ></div>
            </div>
          </div>

          {/* Bar 3: Cost Reduction */}
          <div>
            <div className="flex justify-between text-xs font-bold mb-1">
              <span className="text-slate-700">Operating Logistics Cost</span>
              <span className="font-mono text-[#127694]">
                {cost.baseline ? Math.round((cost.polarops / cost.baseline) * 100) : 100}% of baseline (-{cost.improvement_pct || 0}%)
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
              <div
                className="h-full bg-[#127694] transition-all duration-500"
                style={{
                  width: `${cost.baseline ? Math.min(100, Math.round((cost.polarops / cost.baseline) * 100)) : 100}%`
                }}
              ></div>
            </div>
          </div>
        </div>

        {/* 5. Detailed Hour-by-Hour Timeline Drawer */}
        {showTimeline && evalData?.hourly_timeline && evalData.hourly_timeline.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 animate-fadeIn">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">
              Simulation Checkpoints ({evalData.horizonLabel})
            </span>
            <div className="overflow-x-auto max-h-56 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-[11px] font-mono">
                <thead className="bg-slate-50 text-slate-500 font-bold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-2.5">Time</th>
                    <th className="py-2 px-2">Base Load</th>
                    <th className="py-2 px-2">PolarOPS Load</th>
                    <th className="py-2 px-2">Renewables</th>
                    <th className="py-2 px-2">Base Gen</th>
                    <th className="py-2 px-2">Polar Gen</th>
                    <th className="py-2 px-2 text-emerald-700">Fuel Delta</th>
                    <th className="py-2 px-2">Base SoC</th>
                    <th className="py-2 px-2">Polar SoC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {evalData.hourly_timeline.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80">
                      <td className="py-1.5 px-2.5 font-bold text-slate-800">{row.label || `+${row.hour}h`}</td>
                      <td className="py-1.5 px-2 text-slate-500">{row.baseline_load_kw || row.baselineLoadKw} kW</td>
                      <td className="py-1.5 px-2 font-bold text-slate-800">{row.polarops_load_kw || row.polaropsLoadKw} kW</td>
                      <td className="py-1.5 px-2 text-[#0699C6]">{row.renewable_potential_kw || row.renewablePotentialKw} kW</td>
                      <td className="py-1.5 px-2 text-rose-600">{row.baseline_diesel_kw || row.baselineDieselKw} kW</td>
                      <td className="py-1.5 px-2 text-emerald-600 font-bold">{row.polarops_diesel_kw || row.polaropsDieselKw} kW</td>
                      <td className="py-1.5 px-2 text-emerald-700 font-bold">
                        -{((row.baseline_fuel_l || row.baselineFuelL || 0) - (row.polarops_fuel_l || row.polaropsFuelL || 0)).toFixed(1)} L
                      </td>
                      <td className="py-1.5 px-2 text-slate-500">{(row.baseline_soc_pct || row.baselineSocPct)}%</td>
                      <td className="py-1.5 px-2 text-emerald-600 font-bold">{(row.polarops_soc_pct || row.polaropsSocPct)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
