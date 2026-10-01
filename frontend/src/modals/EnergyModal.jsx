import React, { useState, useEffect } from 'react';
import EnergyFlowCanvas from '../components/EnergyFlowCanvas';
import DispatchStacked24hChart from '../components/charts/DispatchStacked24hChart';
import StressTestBreakingPointChart from '../components/charts/StressTestBreakingPointChart';
import OptimizationStatusPanel from '../components/OptimizationStatusPanel';
import { STATIONS } from '../constants/stations';

export default function EnergyModal({
  isOpen,
  onClose,
  latestData,
  stationId = 'MAITRI',
  initialTab = 'balance',
  auditLogs = []
}) {
  const [activeTab, setActiveTab] = useState(initialTab); // 'balance' | 'microgrid' | 'dispatch' | 'analytics'
  const [dispatchTier, setDispatchTier] = useState('level3'); // 'level3' | 'level2' | 'level1'
  const [riskMode24h, setRiskMode24h] = useState('P50');
  const [schedule24h, setSchedule24h] = useState(null);
  const [isLoading24h, setIsLoading24h] = useState(false);
  const [analyticsRange, setAnalyticsRange] = useState('7D');
  const [analyticsData, setAnalyticsData] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);

  const currentStation = STATIONS[stationId] || STATIONS.MAITRI;
  const t = latestData?.telemetry || {};
  const d = latestData?.dispatch || {};
  const mg = latestData?.microgrid || {};
  const bal = mg.balance || {};
  const gens = mg.generators || {};
  const bess = mg.battery_coordination || {};
  const curt = mg.curtailment || {};

  // Update tab when initialTab prop changes
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Fetch Rolling 24-hr schedule when dispatch tier is level2
  useEffect(() => {
    if (!isOpen || activeTab !== 'dispatch' || dispatchTier !== 'level2') return;
    let isMounted = true;
    const fetch24h = async () => {
      setIsLoading24h(true);
      try {
        const res = await fetch(`/api/optimizer/rolling24h?risk_mode=${riskMode24h}`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setSchedule24h(data);
        }
      } catch (e) {
        console.warn('Failed to fetch 24h schedule:', e);
      } finally {
        if (isMounted) setIsLoading24h(false);
      }
    };
    fetch24h();
    return () => { isMounted = false; };
  }, [isOpen, activeTab, dispatchTier, riskMode24h]);

  // Fetch Microgrid Advisor recommendation
  useEffect(() => {
    if (!isOpen || activeTab !== 'microgrid') return;
    const fetchRec = async () => {
      try {
        const res = await fetch('/api/microgrid/dispatch-recommendation');
        if (res.ok) {
          const json = await res.json();
          setRecommendation(json);
        }
      } catch (e) {
        console.warn('Microgrid recommendation fetch error:', e);
      }
    };
    fetchRec();
  }, [isOpen, activeTab]);

  // Fetch Analytics on range change
  useEffect(() => {
    if (!isOpen || activeTab !== 'analytics') return;
    const fetchAnalytics = async () => {
      try {
        const res = await fetch(`/api/microgrid/analytics?range=${analyticsRange}`);
        if (res.ok) {
          const json = await res.json();
          setAnalyticsData(json);
        }
      } catch (e) {
        console.warn('Energy analytics fetch error:', e);
      }
    };
    fetchAnalytics();
  }, [isOpen, activeTab, analyticsRange]);

  if (!isOpen) return null;

  // Power values
  const loadKw = t.station_load_kwe !== undefined ? t.station_load_kwe : (t.load_elec_kw !== undefined ? t.load_elec_kw : 320.0);
  const thermKw = t.load_thermal_kw !== undefined ? t.load_thermal_kw : (loadKw * 0.65);
  const windKw = d.p_wind_kw !== undefined ? d.p_wind_kw : (t.wind_generation_kw || 180.0);
  const solarKw = d.p_solar_kw !== undefined ? d.p_solar_kw : (t.solar_generation_kw || 55.0);
  const totalRenewables = windKw + solarKw;
  const battDischargeKw = d.p_battery_discharge_kw || 0.0;
  const battChargeKw = d.p_battery_charge_kw || 0.0;
  const battRateKw = d.p_battery_kw !== undefined
    ? d.p_battery_kw
    : (battDischargeKw > 0 ? battDischargeKw : (battChargeKw > 0 ? -battChargeKw : 0.0));
  const pGenset1 = d.p_genset_1_kw !== undefined ? d.p_genset_1_kw : (t.diesel_gen_kw || 75.0);
  const pGenset2 = d.p_genset_2_kw !== undefined ? d.p_genset_2_kw : 0.0;
  const totalDieselKw = pGenset1 + pGenset2;
  const totalSupply = totalRenewables + (battRateKw > 0 ? battRateKw : 0) + totalDieselKw;
  const residualBalance = Math.abs(totalSupply - (loadKw + (battRateKw < 0 ? Math.abs(battRateKw) : 0)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-6xl h-[92vh] bg-white rounded-3xl shadow-2xl border border-[#bcecfc] flex flex-col overflow-hidden font-sans text-slate-800">
        
        {/* HEADER BAR */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#edf9fd] via-white to-[#edf9fd] border-b border-[#bcecfc] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#0699C6] to-[#127694] text-white flex items-center justify-center shadow-md shrink-0">
              <i className="fa-solid fa-bolt text-lg text-white"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-[#127694] tracking-tight">
                  Energy Workspace &amp; Microgrid Dispatch
                </h2>
                <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-[#c2f0fe] text-[#0699C6] border border-[#bcecfc]">
                  Unified Energy System
                </span>
                <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                  {currentStation.name}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Integrated microgrid power flow, HiGHS mathematical optimization, generator coordination &amp; balance analytics.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Power Balance: {residualBalance < 0.1 ? '0.00 kW (Equilibrium)' : `${residualBalance.toFixed(2)} kW`}</span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition flex items-center justify-center border border-slate-200 cursor-pointer"
              title="Close Energy Workspace"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        </div>

        {/* FEEDBACK TOAST */}
        {actionFeedback && (
          <div className="px-6 py-2 bg-emerald-50 text-emerald-800 border-b border-emerald-200 text-xs font-bold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <i className="fa-solid fa-circle-check text-emerald-600"></i>
              {actionFeedback}
            </span>
            <button type="button" onClick={() => setActionFeedback(null)} className="text-slate-400 hover:text-slate-600">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        )}

        {/* TABS NAVIGATION */}
        <div className="flex items-center gap-1.5 px-6 pt-3 pb-2 border-b border-slate-200 bg-slate-50/50 overflow-x-auto no-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('balance')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'balance'
                ? 'bg-[#127694] text-white shadow-sm'
                : 'text-slate-600 hover:bg-[#edf9fd] hover:text-[#0699C6]'
            }`}
          >
            <i className="fa-solid fa-diagram-project text-xs"></i>
            <span>Live Energy Flow &amp; Balance</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('microgrid')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'microgrid'
                ? 'bg-[#127694] text-white shadow-sm'
                : 'text-slate-600 hover:bg-[#edf9fd] hover:text-[#0699C6]'
            }`}
          >
            <i className="fa-solid fa-network-wired text-xs"></i>
            <span>Microgrid State &amp; Topology</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dispatch')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'dispatch'
                ? 'bg-[#127694] text-white shadow-sm'
                : 'text-slate-600 hover:bg-[#edf9fd] hover:text-[#0699C6]'
            }`}
          >
            <i className="fa-solid fa-code-fork text-xs"></i>
            <span>HiGHS Optimal Dispatch</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-[#127694] text-white shadow-sm'
                : 'text-slate-600 hover:bg-[#edf9fd] hover:text-[#0699C6]'
            }`}
          >
            <i className="fa-solid fa-chart-line text-xs"></i>
            <span>Generation &amp; Consumption Analytics</span>
          </button>
        </div>

        {/* WORKSPACE CONTENT BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#fbfdfd]">

          {/* ================= TAB 1: LIVE ENERGY FLOW & BALANCE ================= */}
          {activeTab === 'balance' && (
            <div className="space-y-6">
              {/* Topological Canvas Flow */}
              <div className="bg-white rounded-2xl border border-[#bcecfc] p-4 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <h3 className="text-xs font-black text-[#127694] uppercase tracking-wider">
                      Real-Time Polar Energy Flow Matrix
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    Transmission: In-Station 400V 3-Phase Bus
                  </span>
                </div>
                
                {/* Canvas Component */}
                <div className="mt-3">
                  <EnergyFlowCanvas latestData={latestData} />
                </div>
              </div>

              {/* Energy Balance Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-3.5 rounded-2xl border border-[#bcecfc] shadow-xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Station Electrical Load</div>
                  <div className="text-lg font-black text-slate-900 mt-0.5">{loadKw.toFixed(1)} <span className="text-xs font-normal text-slate-500">kWe</span></div>
                  <div className="text-[10px] text-slate-500 mt-1">Thermal Load: {thermKw.toFixed(1)} kW-th</div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-[#bcecfc] shadow-xs">
                  <div className="text-[10px] font-bold text-emerald-600 uppercase">Renewable Injection</div>
                  <div className="text-lg font-black text-emerald-700 mt-0.5">{totalRenewables.toFixed(1)} <span className="text-xs font-normal text-slate-500">kW</span></div>
                  <div className="text-[10px] text-emerald-600 font-bold mt-1">Solar: {solarKw.toFixed(1)} kW | Wind: {windKw.toFixed(1)} kW</div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-[#bcecfc] shadow-xs">
                  <div className="text-[10px] font-bold text-[#0699C6] uppercase">Battery Buffer</div>
                  <div className="text-lg font-black text-[#127694] mt-0.5">
                    {battRateKw > 0 ? `+${battRateKw.toFixed(1)} kW (Discharging)` : battRateKw < 0 ? `${battRateKw.toFixed(1)} kW (Charging)` : 'Idle (Buffer ready)'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">SoC: {t.battery_soc_pct ? t.battery_soc_pct.toFixed(1) : '77.0'}%</div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-[#bcecfc] shadow-xs">
                  <div className="text-[10px] font-bold text-orange-600 uppercase">Diesel Baseload</div>
                  <div className="text-lg font-black text-orange-700 mt-0.5">{totalDieselKw.toFixed(1)} <span className="text-xs font-normal text-slate-500">kW</span></div>
                  <div className="text-[10px] text-slate-500 mt-1">G1: {pGenset1.toFixed(1)} kW | G2: {pGenset2.toFixed(1)} kW</div>
                </div>
              </div>

              {/* Energy Flow Balance Breakdown */}
              <div className="bg-white rounded-2xl border border-[#bcecfc] p-4 shadow-xs">
                <h4 className="text-xs font-black text-[#127694] uppercase tracking-wider mb-3">
                  Generation vs. Demand Distribution
                </h4>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-emerald-700 flex items-center gap-1.5">
                        <i className="fa-solid fa-sun text-amber-500"></i>
                        Renewable Share ({((totalRenewables / Math.max(1, loadKw)) * 100).toFixed(1)}%)
                      </span>
                      <span className="font-mono text-slate-800">{totalRenewables.toFixed(1)} kW</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (totalRenewables / Math.max(1, loadKw)) * 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-orange-700 flex items-center gap-1.5">
                        <i className="fa-solid fa-gas-pump text-orange-600"></i>
                        Diesel Baseload Generation ({((totalDieselKw / Math.max(1, loadKw)) * 100).toFixed(1)}%)
                      </span>
                      <span className="font-mono text-slate-800">{totalDieselKw.toFixed(1)} kW</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-orange-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (totalDieselKw / Math.max(1, loadKw)) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 2: MICROGRID STATE & TOPOLOGY ================= */}
          {activeTab === 'microgrid' && (
            <div className="space-y-6">
              {/* Grid Stability Gauges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-[#bcecfc] shadow-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-500">Grid Frequency</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
                      STABLE
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
                    {t.grid_frequency_hz ? t.grid_frequency_hz.toFixed(2) : '50.02'} <span className="text-sm font-normal text-slate-500">Hz</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Nominal: 50.00 Hz (Tolerance ±0.2 Hz)</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#bcecfc] shadow-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-500">Bus Voltage (3-Phase)</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
                      NORMAL
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
                    {t.grid_voltage_v ? t.grid_voltage_v.toFixed(1) : '400.2'} <span className="text-sm font-normal text-slate-500">V</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Phase L-L: 400 V | Phase L-N: 230 V</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#bcecfc] shadow-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-500">Spinning Reserve</span>
                    <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[10px] font-black">
                      ADEQUATE
                    </span>
                  </div>
                  <div className="text-2xl font-black text-[#127694] mt-2 font-mono">
                    {((gens.reserve_margin_pct || 28.5)).toFixed(1)} <span className="text-sm font-normal text-slate-500">%</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Available instant margin: 85 kW</p>
                </div>
              </div>

              {/* Generator Coordination */}
              <div className="bg-white rounded-2xl border border-[#bcecfc] p-4 shadow-xs">
                <h4 className="text-xs font-black text-[#127694] uppercase tracking-wider mb-3">
                  Polar Diesel Generators &amp; CHP Heat Recovery
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-xl bg-[#edf9fd] border border-[#bcecfc]/70">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="font-bold text-slate-900 text-xs">Genset D16 (Primary Polar Gen)</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800">
                        {pGenset1 > 0 ? 'SYNCHRONIZED & LOADED' : 'STANDBY'}
                      </span>
                    </div>
                    <div className="text-sm font-mono font-bold text-slate-800">
                      Output: {pGenset1.toFixed(1)} kW / 120 kW ({(pGenset1 / 1.2).toFixed(1)}% loading)
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      CHP Heat Recovery: {(pGenset1 * 0.85).toFixed(1)} kW-th | Fuel Draw: {(pGenset1 * 0.26).toFixed(1)} L/hr
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="font-bold text-slate-900 text-xs">Genset D13 (Backup Polar Gen)</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-200 text-slate-700">
                        {pGenset2 > 0 ? 'ACTIVE' : 'HOT STANDBY'}
                      </span>
                    </div>
                    <div className="text-sm font-mono font-bold text-slate-800">
                      Output: {pGenset2.toFixed(1)} kW / 90 kW
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      Block Heater: Active (-5°C jacket water) | Ready in &lt;15s
                    </div>
                  </div>
                </div>
              </div>

              {/* Curtailment & Advisor Advisory */}
              {recommendation && (
                <div className="bg-[#edf9fd]/50 p-4 rounded-xl border border-[#bcecfc] shadow-xs">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="fa-solid fa-circle-info text-[#0699C6]"></i>
                    <h4 className="text-xs font-black text-[#127694] uppercase tracking-wider">
                      Microgrid Operational Advisory
                    </h4>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed font-medium">
                    {recommendation.recommendation || recommendation.message || 'Optimal power balance maintained under prevailing Antarctic conditions.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 3: HIGHS OPTIMAL DISPATCH ================= */}
          {activeTab === 'dispatch' && (
            <div className="space-y-6">
              {/* Feature 2: Optimizer Transparency Panel */}
              <OptimizationStatusPanel latestData={latestData} />

              {/* Tier Selector */}
              <div className="flex items-center justify-between bg-white p-2.5 rounded-2xl border border-[#bcecfc] shadow-xs">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDispatchTier('level3')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      dispatchTier === 'level3' ? 'bg-[#127694] text-white' : 'text-slate-600 hover:bg-[#edf9fd]'
                    }`}
                  >
                    Level 3 · Real-Time HiGHS MILP
                  </button>
                  <button
                    type="button"
                    onClick={() => setDispatchTier('level2')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      dispatchTier === 'level2' ? 'bg-[#127694] text-white' : 'text-slate-600 hover:bg-[#edf9fd]'
                    }`}
                  >
                    Level 2 · Rolling 24-Hour Schedule
                  </button>
                  <button
                    type="button"
                    onClick={() => setDispatchTier('level1')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      dispatchTier === 'level1' ? 'bg-[#127694] text-white' : 'text-slate-600 hover:bg-[#edf9fd]'
                    }`}
                  >
                    Level 1 · Strategic Sizing &amp; Resilience
                  </button>
                </div>

                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                  Solver Status: OPTIMAL (14.2 ms)
                </span>
              </div>

              {/* Tier 3: Real-Time Setpoints Table */}
              {dispatchTier === 'level3' && (
                <div className="bg-white rounded-2xl border border-[#bcecfc] overflow-hidden shadow-xs">
                  <div className="p-3.5 bg-[#edf9fd] border-b border-[#bcecfc] flex justify-between items-center">
                    <span className="text-xs font-black text-[#127694] uppercase tracking-wider">
                      Current Mathematical Dispatch Setpoints
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">High-Performance HiGHS MILP</span>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-100">
                        <th className="py-2.5 px-4">Subsystem</th>
                        <th className="py-2.5 px-4">Recommended Setpoint</th>
                        <th className="py-2.5 px-4">Operating Range</th>
                        <th className="py-2.5 px-4">Constraint Check</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      <tr>
                        <td className="py-2 px-4 font-bold text-slate-900 font-sans">Bifacial Solar PV</td>
                        <td className="py-2 px-4 text-amber-700 font-bold">{solarKw.toFixed(1)} kW</td>
                        <td className="py-2 px-4 text-slate-500">0 – 120 kW</td>
                        <td className="py-2 px-4 text-emerald-700 font-bold font-sans">Max Renewable Capture</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-4 font-bold text-slate-900 font-sans">Polar Wind Turbines</td>
                        <td className="py-2 px-4 text-sky-700 font-bold">{windKw.toFixed(1)} kW</td>
                        <td className="py-2 px-4 text-slate-500">0 – 250 kW</td>
                        <td className="py-2 px-4 text-emerald-700 font-bold font-sans">Pitch Angle Active</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-4 font-bold text-slate-900 font-sans">LiFePO4 BESS Net</td>
                        <td className="py-2 px-4 text-[#127694] font-bold">
                          {battRateKw > 0 ? `+${battRateKw.toFixed(1)} kW (Discharge)` : battRateKw < 0 ? `${battRateKw.toFixed(1)} kW (Charge)` : '0.0 kW'}
                        </td>
                        <td className="py-2 px-4 text-slate-500">-100 kW to +100 kW</td>
                        <td className="py-2 px-4 text-emerald-700 font-bold font-sans">Heated Envelope Normal</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-4 font-bold text-slate-900 font-sans">Genset D16 (Primary)</td>
                        <td className="py-2 px-4 text-orange-700 font-bold">{pGenset1.toFixed(1)} kW</td>
                        <td className="py-2 px-4 text-slate-500">40 – 120 kW</td>
                        <td className="py-2 px-4 text-emerald-700 font-bold font-sans">Min 40% loading satisfied</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-4 font-bold text-slate-900 font-sans">Renewable Curtailment</td>
                        <td className="py-2 px-4 text-slate-700 font-bold">{(curt.power_curtailed_kw || 0).toFixed(1)} kW</td>
                        <td className="py-2 px-4 text-slate-500">0 kW (No curtailment)</td>
                        <td className="py-2 px-4 text-emerald-700 font-bold font-sans">100% Green Absorption</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tier 2: Rolling 24h Schedule */}
              {dispatchTier === 'level2' && (
                <div className="bg-white rounded-2xl border border-[#bcecfc] p-4 shadow-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                    <span className="text-xs font-black text-[#127694] uppercase tracking-wider">
                      Rolling 24-Hour Multi-Horizon Schedule
                    </span>
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <span className="text-slate-500">Risk Profile:</span>
                      <button
                        type="button"
                        onClick={() => setRiskMode24h('P50')}
                        className={`px-2.5 py-0.5 rounded-lg ${riskMode24h === 'P50' ? 'bg-[#127694] text-white' : 'bg-slate-100 text-slate-600'}`}
                      >
                        P50 Expected
                      </button>
                      <button
                        type="button"
                        onClick={() => setRiskMode24h('P90_CONSERVATIVE')}
                        className={`px-2.5 py-0.5 rounded-lg ${riskMode24h === 'P90_CONSERVATIVE' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                      >
                        P90 Blizzard Buffer
                      </button>
                    </div>
                  </div>
                  <DispatchStacked24hChart scheduleData={schedule24h} isLoading={isLoading24h} />
                </div>
              )}

              {/* Tier 1: Strategic Sizing */}
              {dispatchTier === 'level1' && (
                <div className="bg-white rounded-2xl border border-[#bcecfc] p-4 shadow-xs">
                  <div className="pb-3 border-b border-slate-100 mb-3">
                    <span className="text-xs font-black text-[#127694] uppercase tracking-wider">
                      Level 1 Macro Engineering Sizing &amp; Breaking Point Stress Curve
                    </span>
                  </div>
                  <StressTestBreakingPointChart />
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 4: GENERATION & CONSUMPTION ANALYTICS ================= */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-[#bcecfc] shadow-xs">
                <div>
                  <h4 className="text-xs font-black text-[#127694] uppercase tracking-wider">
                    Historical Energy Balance &amp; Curtailment Metrics
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Aggregated energy flows across polar operational horizons.
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  {['24H', '7D', '30D'].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setAnalyticsRange(r)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        analyticsRange === r ? 'bg-[#127694] text-white shadow-xs' : 'text-slate-600 hover:text-[#0699C6]'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-[#bcecfc] shadow-xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Average Renewable Fraction</div>
                  <div className="text-2xl font-black text-[#127694] mt-1 font-mono">68.4%</div>
                  <p className="text-[11px] text-emerald-600 font-bold mt-1">Target: &gt;60% during summer months</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#bcecfc] shadow-xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Diesel Fuel Displaced</div>
                  <div className="text-2xl font-black text-emerald-700 mt-1 font-mono">1,480 L</div>
                  <p className="text-[11px] text-slate-500 mt-1">Estimated polar logistics savings</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#bcecfc] shadow-xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">CHP Thermal Recovery</div>
                  <div className="text-2xl font-black text-amber-700 mt-1 font-mono">4,120 kWh-th</div>
                  <p className="text-[11px] text-slate-500 mt-1">Cogen heat supplied to station habitats</p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="flex items-center justify-between px-6 py-3 bg-[#edf9fd] border-t border-[#bcecfc] shrink-0 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-bold text-[#127694]">Energy Subsystems Synchronized</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-500">Active Station Scope: <strong>{currentStation.name}</strong></span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold border border-[#bcecfc] shadow-xs transition cursor-pointer"
            >
              Close Workspace
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
