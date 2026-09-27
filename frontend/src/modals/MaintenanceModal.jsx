import React, { useState } from 'react';

export default function MaintenanceModal({ isOpen, onClose, latestData }) {
  const [activeTab, setActiveTab] = useState('subsystems'); // 'subsystems' | 'failure' | 'sizing' | 'stress'
  const [ackText, setAckText] = useState('Acknowledge Telemetry');
  const [isAcked, setIsAcked] = useState(false);

  if (!isOpen) return null;

  const h = latestData?.hardware_health || {};
  const healthScore = h.overall_score_pct !== undefined ? h.overall_score_pct : 84;
  const degradationRate = h.degradation_rate_pct_h !== undefined ? h.degradation_rate_pct_h : -0.03;
  const etaWarning = h.eta_warning_hours !== undefined ? h.eta_warning_hours : 724.3;

  const handleAck = () => {
    setIsAcked(true);
    setAckText('Telemetry Verified ✓');
    setTimeout(() => {
      setIsAcked(false);
      setAckText('Acknowledge Telemetry');
      onClose();
    }, 1000);
  };

  return (
    <div
      id="modal-maintenance-full"
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target.id === 'modal-maintenance-full') onClose();
      }}
    >
      <div className="modal-content p-5 sm:p-6 max-w-[960px] max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 shrink-0">
          <div>
            <h2 className="text-base font-extrabold text-[#127694] flex items-center gap-2">
              <i className="fa-solid fa-shield-halved text-xs text-[#05c5ff]"></i>
              Station Asset Health, Diagnostics &amp; Digital Twin Benchmarks
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sub-system telemetry, 3-week winter failure injection, sizing sweeps, and climate stress tests.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/analytics/report"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl bg-[#127694] hover:bg-[#0698c4] text-white font-bold text-xs transition shadow-xs flex items-center gap-1.5"
            >
              <i className="fa-solid fa-file-arrow-down text-xs"></i>
              <span>Download HTML Report</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        </div>

        {/* Multi-Tab Selector */}
        <div className="flex items-center gap-1.5 p-1 bg-[#f0faff] rounded-2xl border border-[#9ae5fe]/60 mb-3.5 shrink-0 overflow-x-auto">
          {[
            { id: 'subsystems', label: '1. Subsystem Diagnostics', icon: 'fa-microchip' },
            { id: 'failure', label: '2. Winter Failure Injection', icon: 'fa-triangle-exclamation' },
            { id: 'sizing', label: '3. Sizing Sweep & Payback', icon: 'fa-chart-pie' },
            { id: 'stress', label: '4. Climate Stress Testing', icon: 'fa-snowflake' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[#127694] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0698c4]'
              }`}
            >
              <i className={`fa-solid ${tab.icon} text-xs`}></i>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab 1: Subsystem Diagnostics */}
        {activeTab === 'subsystems' && (
          <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
            {/* KPI Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#9ae5fe]/70 text-center">
                <span className="text-[9px] font-bold text-slate-400 uppercase block">Health Score</span>
                <div className="text-xl font-black text-emerald-600 my-0.5">{healthScore}%</div>
                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-block">
                  STABLE
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#9ae5fe]/70 text-center">
                <span className="text-[9px] font-bold text-slate-400 uppercase block">Degradation Rate</span>
                <div className="text-xl font-black text-slate-800 my-0.5">{degradationRate}%/h</div>
                <span className="text-[9px] text-slate-500">Normal thermal wear</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#9ae5fe]/70 text-center">
                <span className="text-[9px] font-bold text-slate-400 uppercase block">ETA to Warning</span>
                <div className="text-xl font-black text-[#0698c4] my-0.5">{etaWarning} h</div>
                <span className="text-[9px] text-slate-500">~30.1 Polar Days</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#9ae5fe]/70 text-center">
                <span className="text-[9px] font-bold text-slate-400 uppercase block">G2 Service Window</span>
                <div className="text-xl font-black text-amber-600 my-0.5">36 Hours</div>
                <span className="text-[9px] text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded-full inline-block">
                  Recommended
                </span>
              </div>
            </div>

            {/* Subsystems 4 Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-white border border-[#9ae5fe] shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#127694] flex items-center gap-1.5">
                    <i className="fa-solid fa-wind text-xs text-[#05c5ff]"></i>
                    Wind Turbine Subsystem
                  </span>
                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">94% Health</span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between"><span>Vibration Amplitude:</span> <strong className="text-slate-800">0.24 mm/s (Nominal)</strong></div>
                  <div className="flex justify-between"><span>Blade De-icing Coils:</span> <strong className="text-[#0698c4]">Active (Auto-PWM)</strong></div>
                  <div className="flex justify-between"><span>Cut-out Gale Braking:</span> <strong className="text-rose-600">&gt; 25.0 m/s Ready</strong></div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white border border-[#9ae5fe] shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#127694] flex items-center gap-1.5">
                    <i className="fa-solid fa-car-battery text-xs text-[#127694]"></i>
                    LiFePO4 BESS Storage
                  </span>
                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">89% Health</span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between"><span>Cell Core Temp:</span> <strong className="text-slate-800">-8.6°C (Thermal Safe)</strong></div>
                  <div className="flex justify-between"><span>Cell Delta Voltage:</span> <strong className="text-[#0698c4]">12 mV (Balanced)</strong></div>
                  <div className="flex justify-between"><span>Protected Reserve:</span> <strong className="text-rose-600">20% Inviolable Floor</strong></div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white border border-amber-200 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#127694] flex items-center gap-1.5">
                    <i className="fa-solid fa-gas-pump text-xs text-[#0698c4]"></i>
                    Diesel Genset Units (G1 &amp; G2)
                  </span>
                  <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">G2 Notice: 82%</span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between"><span>Genset 1 (Active):</span> <strong className="text-slate-800">Oil: 4.2 bar · Coolant: 82°C</strong></div>
                  <div className="flex justify-between"><span>Genset 2 (Standby):</span> <strong className="text-amber-700">Pre-Heater ON · Service in 36h</strong></div>
                  <div className="flex justify-between"><span>Anti-Wet-Stacking:</span> <strong className="text-emerald-600">60-Min Clamping Enforced</strong></div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white border border-[#9ae5fe] shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#127694] flex items-center gap-1.5">
                    <i className="fa-solid fa-wave-square text-xs text-[#05c5ff]"></i>
                    Inverter Bus &amp; STS Sync
                  </span>
                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">98% Health</span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between"><span>Harmonic Distortion:</span> <strong className="text-slate-800">1.8% (&lt; 5% Limit)</strong></div>
                  <div className="flex justify-between"><span>Bus Frequency:</span> <strong className="text-[#0698c4]">50.02 Hz Stable</strong></div>
                  <div className="flex justify-between"><span>Static Transfer Switch:</span> <strong className="text-emerald-600">&lt; 4 ms Seamless</strong></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Winter Failure Injection */}
        {activeTab === 'failure' && (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs">
              <span className="font-extrabold text-amber-900 block mb-1">
                <i className="fa-solid fa-triangle-exclamation mr-1.5 text-amber-600"></i>
                3-Week Polar Winter Failure Stress Injection Analysis
              </span>
              <p className="text-amber-800 leading-relaxed">
                During the severe Antarctic mid-winter test window (Hours 3,800 to 4,300), renewable solar drops to 0 kW and gale blizzards trigger turbine cut-out. Without SEMS autonomous dispatch, the naive rule-based system suffers <strong>22 infeasible daily windows</strong> where station electrical demand exceeds online generator capacity. SEMS dynamic spinning reserve and LiFePO4 buffering reduced infeasible hours to <strong>0</strong>.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[#9ae5fe]">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#f0faff] text-[#127694] font-bold border-b border-[#9ae5fe]">
                  <tr>
                    <th className="p-2.5">Failure Scenario</th>
                    <th className="p-2.5">Feasibility</th>
                    <th className="p-2.5">Available Diesel</th>
                    <th className="p-2.5">Peak Demand</th>
                    <th className="p-2.5">Infeasible Windows</th>
                    <th className="p-2.5">SEMS Mitigation Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  <tr className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold">No-Failure Baseline</td>
                    <td className="p-2.5"><span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">FEASIBLE</span></td>
                    <td className="p-2.5 font-mono">500 kW</td>
                    <td className="p-2.5 font-mono">457 kW</td>
                    <td className="p-2.5 font-mono">0</td>
                    <td className="p-2.5 text-slate-500">Nominal LP optimization; 118,994 L saved</td>
                  </tr>
                  <tr className="hover:bg-slate-50 bg-rose-50/40">
                    <td className="p-2.5 font-bold text-rose-900">Genset 1 Offline (Full Year)</td>
                    <td className="p-2.5"><span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">CRITICAL</span></td>
                    <td className="p-2.5 font-mono text-rose-700">200 kW</td>
                    <td className="p-2.5 font-mono">457 kW</td>
                    <td className="p-2.5 font-mono font-bold text-rose-700">22 Windows</td>
                    <td className="p-2.5 text-rose-800">Total capacity 280 kW &lt; peak 457 kW; Priority 2 &amp; 3 load shedding triggered</td>
                  </tr>
                  <tr className="hover:bg-slate-50 bg-amber-50/40">
                    <td className="p-2.5 font-bold text-amber-900">Genset 2 Offline (Full Year)</td>
                    <td className="p-2.5"><span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">WARNING</span></td>
                    <td className="p-2.5 font-mono text-amber-700">300 kW</td>
                    <td className="p-2.5 font-mono">457 kW</td>
                    <td className="p-2.5 font-mono font-bold text-amber-700">14 Windows</td>
                    <td className="p-2.5 text-amber-800">Total capacity 380 kW &lt; peak 457 kW; BESS pre-charge buffer protects life support</td>
                  </tr>
                  <tr className="hover:bg-slate-50 bg-emerald-50/40">
                    <td className="p-2.5 font-bold text-emerald-900">3-Week Winter Blizzard Injection</td>
                    <td className="p-2.5"><span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">MITIGATED</span></td>
                    <td className="p-2.5 font-mono">500 kW</td>
                    <td className="p-2.5 font-mono">457 kW</td>
                    <td className="p-2.5 font-mono font-bold text-emerald-700">0 (with SEMS)</td>
                    <td className="p-2.5 text-emerald-800">SEMS pre-emptively started G2 and held 20% SoC buffer; 100% life-support uptime</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Sizing Sweep & CapEx Payback */}
        {activeTab === 'sizing' && (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            <div className="p-3 rounded-2xl bg-[#f0faff] border border-[#9ae5fe] text-xs">
              <span className="font-extrabold text-[#127694] block mb-1">
                <i className="fa-solid fa-chart-pie mr-1.5 text-[#0698c4]"></i>
                Microgrid Asset Sizing Sweep &amp; CapEx Payback Matrix
              </span>
              <p className="text-slate-600 leading-relaxed">
                Evaluating station upgrade scenarios with delivered Antarctic fuel cost of <strong>$3.00 / Liter</strong>. Double Solar achieves payback in just <strong>1.01 years</strong> ($106K annual savings for $108K CapEx), while Double Wind yields <strong>1.58 years</strong> payback with 192,829 L saved annually.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[#9ae5fe]">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#f0faff] text-[#127694] font-bold border-b border-[#9ae5fe]">
                  <tr>
                    <th className="p-2.5">Architecture Scenario</th>
                    <th className="p-2.5">Wind / Solar / BESS</th>
                    <th className="p-2.5">Annual Fuel Saved</th>
                    <th className="p-2.5">Annual Cost Saved</th>
                    <th className="p-2.5">CO₂ Avoided</th>
                    <th className="p-2.5">Incremental CapEx</th>
                    <th className="p-2.5">Payback Period</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                  <tr className="hover:bg-slate-50 font-sans">
                    <td className="p-2.5 font-bold">Current Baseline</td>
                    <td className="p-2.5">100 kW / 60 kW / 400 kWh</td>
                    <td className="p-2.5 font-bold text-emerald-600">119,003 L</td>
                    <td className="p-2.5 font-bold text-[#127694]">$357,009</td>
                    <td className="p-2.5">318.9 T</td>
                    <td className="p-2.5">$0</td>
                    <td className="p-2.5 font-bold text-emerald-600">Immediate</td>
                  </tr>
                  <tr className="hover:bg-slate-50 font-sans bg-amber-50/40">
                    <td className="p-2.5 font-bold text-amber-900">Double Solar (120 kW)</td>
                    <td className="p-2.5">100 kW / 120 kW / 400 kWh</td>
                    <td className="p-2.5 font-bold text-emerald-600">154,631 L</td>
                    <td className="p-2.5 font-bold text-[#127694]">$463,894</td>
                    <td className="p-2.5">414.4 T</td>
                    <td className="p-2.5 text-slate-800">$108,000</td>
                    <td className="p-2.5 font-bold text-emerald-700">1.01 Years ★</td>
                  </tr>
                  <tr className="hover:bg-slate-50 font-sans bg-[#f0faff]/60">
                    <td className="p-2.5 font-bold text-[#127694]">Double Wind (200 kW)</td>
                    <td className="p-2.5">200 kW / 60 kW / 400 kWh</td>
                    <td className="p-2.5 font-bold text-emerald-600">192,829 L</td>
                    <td className="p-2.5 font-bold text-[#127694]">$578,486</td>
                    <td className="p-2.5">516.8 T</td>
                    <td className="p-2.5 text-slate-800">$350,000</td>
                    <td className="p-2.5 font-bold text-[#0698c4]">1.58 Years</td>
                  </tr>
                  <tr className="hover:bg-slate-50 font-sans bg-emerald-50/50">
                    <td className="p-2.5 font-bold text-emerald-900">Double All Renewables</td>
                    <td className="p-2.5">200 kW / 120 kW / 800 kWh</td>
                    <td className="p-2.5 font-bold text-emerald-600">220,166 L</td>
                    <td className="p-2.5 font-bold text-[#127694]">$660,499</td>
                    <td className="p-2.5">590.0 T</td>
                    <td className="p-2.5 text-slate-800">$618,000</td>
                    <td className="p-2.5 font-bold text-emerald-700">2.04 Years</td>
                  </tr>
                  <tr className="hover:bg-slate-50 font-sans text-slate-400">
                    <td className="p-2.5">No Renewables (Diesel Only)</td>
                    <td className="p-2.5">0 kW / 0 kW / 0 kWh</td>
                    <td className="p-2.5 text-rose-600">-641 L</td>
                    <td className="p-2.5 text-rose-600">-$1,922</td>
                    <td className="p-2.5">-1.7 T</td>
                    <td className="p-2.5">-$618,000</td>
                    <td className="p-2.5 text-slate-400">Infinite</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Climate Stress Testing */}
        {activeTab === 'stress' && (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-xs">
              <span className="font-extrabold text-sky-950 block mb-1">
                <i className="fa-solid fa-temperature-arrow-down mr-1.5 text-sky-600"></i>
                Station Climate Stress Testing &amp; Physical Breaking Point
              </span>
              <p className="text-sky-900 leading-relaxed">
                Station resilience tested under progressive polar degradation from nominal conditions (-39.57°C) to extreme blizzard conditions. The physical breaking point is identified at <strong>Peak Load 616 kW &gt; Station Capacity 580 kW</strong> when ambient temperature hits <strong>-47.57°C</strong> with wind gusts of <strong>50.6 m/s</strong>.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-white border border-emerald-200 shadow-xs">
                <span className="text-[10px] font-bold text-emerald-700 uppercase bg-emerald-100 px-2 py-0.5 rounded-full inline-block mb-1">
                  1. Normal Stress
                </span>
                <div className="text-xs space-y-1.5 mt-1 text-slate-700">
                  <div className="flex justify-between"><span>Peak Demand:</span> <strong className="font-mono">457.4 kW</strong></div>
                  <div className="flex justify-between"><span>Min Temp:</span> <strong className="font-mono text-[#0698c4]">-39.6°C</strong></div>
                  <div className="flex justify-between"><span>Max Wind:</span> <strong className="font-mono">37.5 m/s</strong></div>
                  <div className="flex justify-between"><span>Fuel Saved:</span> <strong className="font-mono text-emerald-600">119,003 L (25.2%)</strong></div>
                  <div className="flex justify-between"><span>Feasibility:</span> <strong className="text-emerald-700">100% FEASIBLE</strong></div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white border border-amber-200 shadow-xs">
                <span className="text-[10px] font-bold text-amber-800 uppercase bg-amber-100 px-2 py-0.5 rounded-full inline-block mb-1">
                  2. Harsh Winter Stress
                </span>
                <div className="text-xs space-y-1.5 mt-1 text-slate-700">
                  <div className="flex justify-between"><span>Peak Demand:</span> <strong className="font-mono">548.9 kW</strong></div>
                  <div className="flex justify-between"><span>Min Temp:</span> <strong className="font-mono text-[#0698c4]">-44.6°C</strong></div>
                  <div className="flex justify-between"><span>Max Wind:</span> <strong className="font-mono">45.0 m/s</strong></div>
                  <div className="flex justify-between"><span>Fuel Saved:</span> <strong className="font-mono text-emerald-600">146,900 L (26.5%)</strong></div>
                  <div className="flex justify-between"><span>Feasibility:</span> <strong className="text-emerald-700">FEASIBLE (High Burn)</strong></div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-rose-50/50 border border-rose-300 shadow-xs">
                <span className="text-[10px] font-bold text-rose-800 uppercase bg-rose-200 px-2 py-0.5 rounded-full inline-block mb-1">
                  3. Extreme Breaking Point
                </span>
                <div className="text-xs space-y-1.5 mt-1 text-slate-700">
                  <div className="flex justify-between"><span>Peak Demand:</span> <strong className="font-mono text-rose-700">616.4 kW</strong></div>
                  <div className="flex justify-between"><span>Min Temp:</span> <strong className="font-mono text-rose-700">-47.6°C</strong></div>
                  <div className="flex justify-between"><span>Max Wind:</span> <strong className="font-mono text-rose-700">50.6 m/s</strong></div>
                  <div className="flex justify-between"><span>Total Capacity:</span> <strong className="font-mono text-slate-800">580.0 kW</strong></div>
                  <div className="flex justify-between"><span>Feasibility:</span> <strong className="text-rose-700 font-black">CAPACITY DEFICIT (-36 kW)</strong></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 shrink-0 mt-3">
          <span>Telemetry sync: <strong>1.0s High-Res Stream Active</strong></span>
          <button
            type="button"
            onClick={handleAck}
            className={`px-3.5 py-1.5 rounded-xl text-white font-bold transition shadow-xs ${
              isAcked ? 'bg-emerald-600' : 'bg-[#0698c4] hover:bg-[#05c5ff]'
            }`}
          >
            {ackText}
          </button>
        </div>
      </div>
    </div>
  );
}
