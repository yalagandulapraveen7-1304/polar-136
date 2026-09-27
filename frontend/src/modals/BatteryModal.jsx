import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export default function BatteryModal({
  isOpen,
  onClose,
  latestData,
  stationId = 'MAITRI'
}) {
  const [activeTab, setActiveTab] = useState('electrothermal'); // 'electrothermal' | 'sizing' | 'curtailment' | 'historical' | 'advisor'
  const [timeRange, setTimeRange] = useState('7D'); // '24H' | '7D' | '30D' | '12M'
  const [sizingData, setSizingData] = useState(null);
  const [historicalData, setHistoricalData] = useState(null);
  const [simTemp, setSimTemp] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const chartCanvasRef = useRef(null);
  const chartInstanceRef = useRef(null);

  const b = latestData?.battery_management || {};
  const t = latestData?.telemetry || {};
  const d = latestData?.dispatch || {};

  // Fetch Sizing Analysis
  useEffect(() => {
    if (!isOpen) return;
    const fetchSizing = async () => {
      try {
        const res = await fetch('/api/battery/sizing');
        if (res.ok) {
          const json = await res.json();
          setSizingData(json);
        }
      } catch (e) {
        console.warn('Sizing fetch error:', e);
      }
    };
    fetchSizing();
  }, [isOpen]);

  // Fetch Historical Analytics on range change
  useEffect(() => {
    if (!isOpen) return;
    const fetchHistorical = async () => {
      try {
        const res = await fetch(`/api/battery/analytics?range=${timeRange}`);
        if (res.ok) {
          const json = await res.json();
          setHistoricalData(json);
        }
      } catch (e) {
        console.warn('Battery analytics fetch error:', e);
      }
    };
    fetchHistorical();
  }, [isOpen, timeRange]);

  // Temperature Simulation Handlers
  const handleSimulateTemperature = async (tempC) => {
    setIsSimulating(true);
    setSimTemp(tempC);
    try {
      await fetch('/api/battery/temperature-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temperature_c: tempC })
      });
    } catch (e) {
      console.warn('Temperature override error:', e);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleResetTemperature = async () => {
    setIsSimulating(true);
    setSimTemp(null);
    try {
      await fetch('/api/battery/temperature-reset', { method: 'POST' });
    } catch (e) {
      console.warn('Temperature reset error:', e);
    } finally {
      setIsSimulating(false);
    }
  };

  // Render Historical SoC Chart
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      const ctx = chartCanvasRef.current;
      if (!ctx) return;

      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }

      if (activeTab === 'historical') {
        const h = historicalData;
        const labels = h?.timeline_labels || ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];
        const socCurve = h?.soc_curve || [76, 74, 78, 85, 80, 77];
        const reserveLine = new Array(labels.length).fill(20.0);

        chartInstanceRef.current = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Battery State of Charge (%)',
                data: socCurve,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                borderWidth: 2.5,
                pointRadius: 3,
                fill: true,
                tension: 0.3
              },
              {
                label: '20% Inviolable Reserve Floor',
                data: reserveLine,
                borderColor: '#f43f5e',
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
                tension: 0
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
              y: {
                min: 0,
                max: 100,
                title: { display: true, text: 'SoC (%)', font: { size: 10, weight: 'bold' } },
                grid: { color: '#f1f5f9' },
                ticks: { font: { size: 9 } }
              },
              x: {
                grid: { display: false },
                ticks: { font: { size: 9 } }
              }
            },
            plugins: {
              legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10, weight: 'bold' } } }
            }
          }
        });
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [isOpen, activeTab, historicalData]);

  if (!isOpen) return null;

  // Extracted Battery Telemetry
  const soc = b.state_of_charge_pct ?? 77.0;
  const soh = b.state_of_health_pct ?? 91.4;
  const tempC = b.cell_temperature_c ?? -12.4;
  const stateMachine = b.safety_state_machine || {
    state: 'NORMAL',
    label: 'SAFE / NOMINAL',
    color: 'emerald',
    description: 'Cell temperature within safe operating envelope (-20°C to +25°C).'
  };
  const isLockedOut = stateMachine.state === 'LOCKOUT';
  const cap = b.capacities || {
    nominal_capacity_kwh: 400.0,
    available_capacity_kwh: 325.6,
    current_stored_kwh: 250.7,
    reserve_floor_pct: 20.0,
    reserve_floor_kwh: 65.1,
    usable_energy_above_reserve_kwh: 185.6
  };
  const pLimits = b.power_limits || {
    nominal_inverter_kw: 80.0,
    max_charge_kw: 65.1,
    max_discharge_kw: 97.7,
    current_charge_kw: 0.0,
    current_discharge_kw: 42.0,
    net_flow_kw: 42.0
  };
  const emReserve = b.emergency_reserve || {
    status: 'SAFE',
    label: 'RESERVE SAFE (+57% buffer)',
    color: 'emerald',
    margin_pct: 57.0,
    available_emergency_kwh: 185.6,
    low_reserve_alert: false
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-50/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-[#bcecfc] w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* 1. HEADER */}
        <div className="px-6 py-4 border-b border-[#bcecfc]/60 bg-gradient-to-r from-[#f0faff] via-white to-[#f0faff] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#10b981] to-[#0699C6] text-white flex items-center justify-center font-black text-lg shadow-md shrink-0">
              <i className="fa-solid fa-car-battery"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-[#127694] tracking-tight">
                  POLAR BATTERY MANAGEMENT &amp; STORAGE SIZING CENTER
                </h2>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                  stateMachine.state === 'LOCKOUT'
                    ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
                    : stateMachine.state === 'COLD_DERATING'
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}>
                  {stateMachine.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Electro-Thermal Physics &middot; Sub-Zero Derating State Machine &middot; Inverter Bottleneck Analysis
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm transition"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* 2. NAVIGATION TABS */}
        <div className="px-6 py-2 bg-[#f8fcfe] border-b border-[#bcecfc]/40 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 p-1 bg-white rounded-xl border border-[#bcecfc] shadow-xs">
            <button
              type="button"
              onClick={() => setActiveTab('electrothermal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'electrothermal'
                  ? 'bg-[#127694] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0699C6]'
              }`}
            >
              <i className="fa-solid fa-temperature-half text-xs"></i>
              <span>1. Electro-Thermal &amp; Safety State</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sizing')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'sizing'
                  ? 'bg-[#127694] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0699C6]'
              }`}
            >
              <i className="fa-solid fa-scale-balanced text-xs"></i>
              <span>2. Inverter Bottleneck &amp; Sizing</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('curtailment')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'curtailment'
                  ? 'bg-[#127694] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0699C6]'
              }`}
            >
              <i className="fa-solid fa-leaf text-xs"></i>
              <span>3. Renewable Storage Accounting</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('historical')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'historical'
                  ? 'bg-[#127694] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0699C6]'
              }`}
            >
              <i className="fa-solid fa-clock-rotate-left text-xs"></i>
              <span>4. Storage Analytics</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('advisor')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'advisor'
                  ? 'bg-[#0699C6] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0699C6]'
              }`}
            >
              <i className="fa-solid fa-brain text-xs"></i>
              <span>5. AI Storage Advisory</span>
            </button>
          </div>

          {activeTab === 'historical' && (
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#bcecfc] shadow-xs">
              {['24H', '7D', '30D', '12M'].map((rng) => (
                <button
                  key={rng}
                  type="button"
                  onClick={() => setTimeRange(rng)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition ${
                    timeRange === rng
                      ? 'bg-[#0699C6] text-white shadow-xs'
                      : 'text-slate-500 hover:text-[#0699C6]'
                  }`}
                >
                  {rng}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3. CONTENT BODY */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">

          {/* TAB 1: ELECTRO-THERMAL OPERATIONS & SAFETY STATE MACHINE */}
          {activeTab === 'electrothermal' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              
              {/* Emergency Reserve Warning Alert (Section 4.J) */}
              {emReserve.low_reserve_alert && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-900 flex items-center justify-between gap-3 shadow-xs animate-pulse">
                  <div className="flex items-center gap-2.5">
                    <i className="fa-solid fa-triangle-exclamation text-amber-600 text-base"></i>
                    <div>
                      <span className="text-xs font-black uppercase">LOW BATTERY RESERVE WARNING</span>
                      <p className="text-[11px] text-amber-800 font-medium">
                        Current SoC ({Math.round(soc)}%) is within 5% of the 20% reserve floor. Only <strong>{cap.usable_energy_above_reserve_kwh} kWh</strong> usable energy remains before emergency lock.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-amber-200 text-amber-900 px-2 py-1 rounded-lg">
                    MILP Pre-Empting Genset G2
                  </span>
                </div>
              )}

              {/* Freezing Lockout Warning Banner (Section 4.B) */}
              {isLockedOut && (
                <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-950 flex flex-wrap items-center justify-between gap-3 shadow-md animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black text-sm shrink-0">
                      <i className="fa-solid fa-snowflake"></i>
                    </div>
                    <div>
                      <div className="text-xs font-black tracking-tight flex items-center gap-2">
                        <span>⚠ BATTERY PROTECTION ACTIVE (FREEZE LOCKOUT)</span>
                        <span className="text-[9px] bg-rose-200 text-rose-800 px-2 py-0.5 rounded-full uppercase">
                          Temp: {tempC}°C ≤ -35°C
                        </span>
                      </div>
                      <p className="text-xs text-rose-800 font-medium mt-0.5">
                        Battery operation restricted because cell temperature is below the configured safe operating threshold. Discharge is inhibited to prevent irreversible cathode damage.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetTemperature}
                    className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-rose-700 font-bold text-xs border border-rose-200 shadow-xs"
                  >
                    Restore Heating (+8.0°C)
                  </button>
                </div>
              )}

              {/* Main Battery Visualizer (Section 4.L) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Visual Battery Cylinder */}
                <div className="lg:col-span-5 p-5 rounded-2xl bg-gradient-to-br from-white via-[#f0faff] to-[#e6f7fc] border border-[#bcecfc] shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between pb-2 border-b border-[#bcecfc]/40">
                    <span className="text-xs font-extrabold text-[#127694] uppercase tracking-tight">
                      BESS LiFePO4 Pack Monitor
                    </span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white text-[#0699C6] border border-[#bcecfc]">
                      480V DC Bus
                    </span>
                  </div>

                  {/* Battery Cylinder Center Stage */}
                  <div className="my-4 flex flex-col items-center">
                    <div className="text-4xl font-black text-slate-800 tracking-tight flex items-baseline gap-1">
                      <span>{Math.round(soc)}%</span>
                      <span className="text-xs font-bold text-slate-400 uppercase">State of Charge</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-[#127694] mt-0.5">
                      {Math.round(cap.current_stored_kwh)} / {Math.round(cap.nominal_capacity_kwh)} kWh
                    </span>

                    {/* Cylinder Fill Visual */}
                    <div className="w-full max-w-xs mt-3 relative">
                      <div className="h-9 rounded-2xl bg-slate-200 border-2 border-slate-300 p-1 relative overflow-hidden flex items-center">
                        <div
                          className={`h-full rounded-xl transition-all duration-500 ${
                            isLockedOut
                              ? 'bg-rose-500'
                              : soc <= 25
                              ? 'bg-amber-500'
                              : 'bg-gradient-to-r from-emerald-500 to-[#0699C6]'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(5, soc))}%` }}
                        />
                        {/* 20% Reserve Floor Marker */}
                        <div
                          className="absolute top-0 bottom-0 border-r-2 border-dashed border-rose-600 z-10"
                          style={{ left: '20%' }}
                          title="20% Protected Reserve Floor (Life-Support Safe)"
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mt-1 px-1">
                        <span>0%</span>
                        <span className="text-rose-600">▲ 20% Floor</span>
                        <span>100%</span>
                      </div>
                    </div>
                  </div>

                  {/* Flow Direction Indicator */}
                  <div className="grid grid-cols-2 gap-2 text-center pt-3 border-t border-[#bcecfc]/40">
                    <div className={`p-2 rounded-xl border ${
                      pLimits.current_discharge_kw > 0.5
                        ? 'bg-[#c2f0fe] border-[#0699C6] text-[#127694]'
                        : 'bg-white border-slate-100 text-slate-400'
                    }`}>
                      <span className="text-[9px] font-bold uppercase block">◄ DISCHARGE</span>
                      <span className="text-xs font-black">{pLimits.current_discharge_kw} kW</span>
                    </div>
                    <div className={`p-2 rounded-xl border ${
                      pLimits.current_charge_kw > 0.5
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                        : 'bg-white border-slate-100 text-slate-400'
                    }`}>
                      <span className="text-[9px] font-bold uppercase block">CHARGE ►</span>
                      <span className="text-xs font-black">{pLimits.current_charge_kw} kW</span>
                    </div>
                  </div>
                </div>

                {/* Electro-Thermal Physics Matrix (Section 4.A & 4.C) */}
                <div className="lg:col-span-7 flex flex-col gap-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <div className="p-3 rounded-2xl bg-white border border-[#bcecfc] shadow-xs">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">State of Health (SoH)</span>
                      <span className="text-xl font-black text-emerald-600">{soh}%</span>
                      <span className="text-[9px] text-slate-500 block mt-0.5">LiFePO4 Core Stable</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-white border border-[#bcecfc] shadow-xs">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Cell Temperature</span>
                      <span className={`text-xl font-black ${
                        tempC <= -35 ? 'text-rose-600' : tempC <= -20 ? 'text-amber-600' : 'text-slate-800'
                      }`}>
                        {tempC > 0 ? `+${tempC}` : tempC}°C
                      </span>
                      <span className="text-[9px] text-slate-500 block mt-0.5">
                        {tempC < -20 ? 'Sub-Zero Derated' : 'Heated Envelope'}
                      </span>
                    </div>
                    <div className="p-3 rounded-2xl bg-white border border-[#bcecfc] shadow-xs">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Derated Usable Energy</span>
                      <span className="text-xl font-black text-[#127694]">{Math.round(cap.usable_energy_above_reserve_kwh)} kWh</span>
                      <span className="text-[9px] text-emerald-600 font-bold block mt-0.5">Above 20% Floor</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-white border border-[#bcecfc] shadow-xs">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Max Discharge Rate</span>
                      <span className="text-xl font-black text-slate-800">{pLimits.max_discharge_kw} kW</span>
                      <span className="text-[9px] text-slate-500 block mt-0.5">
                        {isLockedOut ? 'Prohibited by Lockout' : 'Derated Peak Limit'}
                      </span>
                    </div>
                    <div className="p-3 rounded-2xl bg-white border border-[#bcecfc] shadow-xs">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Max Charge Rate</span>
                      <span className="text-xl font-black text-slate-800">{pLimits.max_charge_kw} kW</span>
                      <span className="text-[9px] text-slate-500 block mt-0.5">80 kW Inverter Inviolable</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-white border border-[#bcecfc] shadow-xs">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Roundtrip Efficiency</span>
                      <span className="text-xl font-black text-emerald-600">92.0%</span>
                      <span className="text-[9px] text-slate-500 block mt-0.5">Chg 95% / Disch 98%</span>
                    </div>
                  </div>

                  {/* Safety State Machine Diagram (Section 4.K) */}
                  <div className="p-3.5 rounded-2xl bg-white border border-[#bcecfc] shadow-xs flex flex-col justify-between">
                    <span className="text-xs font-black text-[#127694] uppercase tracking-tight block mb-2">
                      Polar Safety State Machine (Temperature Boundary Transitions)
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                      <div className={`p-2 rounded-xl border ${
                        stateMachine.state === 'NORMAL'
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-black ring-2 ring-emerald-300'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                        <span className="text-[9px] uppercase font-bold block">1. NORMAL</span>
                        <span>T &gt; -20°C</span>
                        <span className="text-[8.5px] block text-slate-400">100% Power</span>
                      </div>
                      <div className={`p-2 rounded-xl border ${
                        stateMachine.state === 'COLD_DERATING'
                          ? 'bg-amber-50 border-amber-400 text-amber-900 font-black ring-2 ring-amber-300'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                        <span className="text-[9px] uppercase font-bold block">2. DERATING</span>
                        <span>-20°C to -28°C</span>
                        <span className="text-[8.5px] block text-slate-400">70% Power</span>
                      </div>
                      <div className={`p-2 rounded-xl border ${
                        stateMachine.state === 'RESTRICTED'
                          ? 'bg-orange-50 border-orange-400 text-orange-900 font-black ring-2 ring-orange-300'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                        <span className="text-[9px] uppercase font-bold block">3. RESTRICTED</span>
                        <span>-28°C to -35°C</span>
                        <span className="text-[8.5px] block text-slate-400">40% Power</span>
                      </div>
                      <div className={`p-2 rounded-xl border ${
                        stateMachine.state === 'LOCKOUT'
                          ? 'bg-rose-50 border-rose-400 text-rose-900 font-black ring-2 ring-rose-300'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                        <span className="text-[9px] uppercase font-bold block">4. LOCKOUT</span>
                        <span>T ≤ -35°C</span>
                        <span className="text-[8.5px] block text-slate-400">0 kW Discharge</span>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Temperature Test Buttons (Section 4.B) */}
                  <div className="p-3 rounded-2xl bg-[#f0faff] border border-[#bcecfc]/60 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold text-[#127694]">
                      <i className="fa-solid fa-vial text-xs text-[#0699C6] mr-1.5"></i>
                      Simulate Sub-Zero Battery Thermal Shock:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSimulateTemperature(-10.0)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white hover:bg-emerald-50 text-emerald-700 border border-[#bcecfc] transition"
                      >
                        Nominal (-10°C)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSimulateTemperature(-25.0)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white hover:bg-amber-50 text-amber-700 border border-[#bcecfc] transition"
                      >
                        Derate (-25°C)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSimulateTemperature(-36.0)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 transition"
                      >
                        Lockout (-36°C)
                      </button>
                      <button
                        type="button"
                        onClick={handleResetTemperature}
                        className="px-2 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: INVERTER BOTTLENECK ANALYSIS & SIZING ADVISOR (Section 4.G & 4.H) */}
          {activeTab === 'sizing' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              {/* Engineering Insight Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#e5f6fd] via-white to-[#e5f6fd] border border-[#bcecfc] shadow-xs">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#0699C6] text-white flex items-center justify-center font-black text-sm shrink-0">
                    <i className="fa-solid fa-lightbulb"></i>
                  </div>
                  <div>
                    <span className="text-xs font-black text-[#127694] uppercase tracking-tight block">
                      Core Engineering Insight: Inverter vs Storage Bottlenecks
                    </span>
                    <p className="text-xs text-slate-700 leading-relaxed mt-0.5">
                      {sizingData?.key_engineering_takeaway || (
                        "Increasing battery capacity alone produces negligible return (+0.04% fuel saved) because the 80 kW inverter restricts discharge power. Upgrading inverter power to 120 kW unlocks an additional $51,268/yr by eliminating renewable curtailment and enabling peak shaving."
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Comparative Table of Configurations A, B, C, D */}
              <div className="p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-xs overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase">
                      <th className="pb-2.5">Configuration</th>
                      <th className="pb-2.5">Battery</th>
                      <th className="pb-2.5">Inverter</th>
                      <th className="pb-2.5">Annual Savings</th>
                      <th className="pb-2.5">Diesel Red.</th>
                      <th className="pb-2.5">Curtailment</th>
                      <th className="pb-2.5">Payback</th>
                      <th className="pb-2.5">Winter Res.</th>
                      <th className="pb-2.5">Limiting Constraint</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {sizingData?.configurations?.map((cfg) => (
                      <tr key={cfg.config_id} className="hover:bg-[#f8fcfe] transition">
                        <td className="py-3 font-bold text-slate-800">
                          {cfg.name}
                        </td>
                        <td className="py-3 font-mono text-[#127694] font-bold">{cfg.battery_kwh} kWh</td>
                        <td className="py-3 font-mono text-[#0699C6] font-bold">{cfg.inverter_kw} kW</td>
                        <td className="py-3 font-mono font-black text-emerald-600">
                          ${cfg.annual_savings_usd.toLocaleString()}
                        </td>
                        <td className="py-3 font-bold text-slate-700">{cfg.diesel_reduction_pct}%</td>
                        <td className="py-3 font-mono text-slate-500">{cfg.curtailment_kwh.toLocaleString()} kWh</td>
                        <td className="py-3 font-bold text-slate-800">{cfg.payback_years} yrs</td>
                        <td className="py-3">
                          <span className="font-bold text-[#127694]">{cfg.winter_resilience_score}/100</span>
                        </td>
                        <td className="py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${cfg.limiting_factor_badge}`}>
                            {cfg.limiting_factor_label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Recommendation Callout */}
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-circle-check text-emerald-600 text-sm"></i>
                  <span className="font-bold text-emerald-900">
                    Recommended Sizing Path: Upgrade Inverter from 80 kW &rarr; 120 kW (Config C).
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono text-xs font-black text-emerald-800">
                  <span>Marginal CapEx: $35,000</span>
                  <span>Marginal Savings: +$51,268/yr</span>
                  <span className="bg-emerald-200 px-2 py-0.5 rounded-md">Payback: 0.68 Years</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: RENEWABLE ENERGY STORAGE & CURTAILMENT ACCOUNTING (Section 4.F) */}
          {activeTab === 'curtailment' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-xs">
                <h3 className="text-xs font-black text-[#127694] uppercase tracking-tight mb-1">
                  Renewable Energy Curtailment vs Storage Inverter Clamping
                </h3>
                <p className="text-[10px] text-slate-500 font-medium mb-3">
                  Illustrates why excess generation cannot be 100% captured without sufficient inverter throughput
                </p>

                {/* Example Walkthrough Card (Section 4.F) */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-center my-3">
                  <div className="p-3 rounded-2xl bg-cyan-50 border border-cyan-200">
                    <span className="text-[10px] font-bold text-[#0699C6] uppercase block">Renewable Generation</span>
                    <span className="text-2xl font-black text-slate-800 mt-1 block">420 kW</span>
                    <span className="text-[10px] text-[#0699C6] block">Wind (320k) + Solar (100k)</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Station Demand</span>
                    <span className="text-2xl font-black text-slate-800 mt-1 block">300 kW</span>
                    <span className="text-[10px] text-slate-500 block">Life-Support &amp; Labs</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase block">Battery Absorption</span>
                    <span className="text-2xl font-black text-emerald-800 mt-1 block">80 kW</span>
                    <span className="text-[10px] text-emerald-700 font-bold block">Inverter Max Clamp</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200">
                    <span className="text-[10px] font-bold text-rose-700 uppercase block">Curtailed Clean Energy</span>
                    <span className="text-2xl font-black text-rose-800 mt-1 block">40 kW</span>
                    <span className="text-[10px] text-rose-600 font-bold block">Spilled Katabatic Power</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc]/60 text-xs text-[#127694] leading-relaxed">
                  <strong>Physics Proof:</strong> Out of 120 kW excess renewable power (420 kW - 300 kW), the microgrid can only store <strong>80 kW</strong> into the BESS because the bidirectional inverter is clamped at 80 kW rating. The remaining <strong>40 kW is forcibly feathered/curtailed</strong>. An upgraded 120 kW inverter would capture 100% of this clean energy!
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: HISTORICAL STORAGE ANALYTICS (Section 4.N) */}
          {activeTab === 'historical' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-2xl bg-white border border-[#bcecfc]/60 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Full Cycles (EFC)</span>
                  <span className="text-xl font-black text-emerald-600">
                    {historicalData?.equivalent_full_cycles || 5.2}
                  </span>
                  <span className="text-[10px] text-slate-500 block">Nominal Life: 4,000</span>
                </div>
                <div className="p-3 rounded-2xl bg-white border border-[#bcecfc]/60 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Energy Throughput</span>
                  <span className="text-xl font-black text-[#127694]">
                    {historicalData?.energy_throughput_kwh?.toLocaleString() || '2,140'} kWh
                  </span>
                  <span className="text-[10px] text-slate-500 block">{timeRange} Cumulative</span>
                </div>
                <div className="p-3 rounded-2xl bg-white border border-[#bcecfc]/60 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Cold Derating Time</span>
                  <span className="text-xl font-black text-amber-600">
                    {historicalData?.thermal_exposure?.hours_in_cold_derating || 14.5} hrs
                  </span>
                  <span className="text-[10px] text-slate-500 block">Jacket Maintained Safe</span>
                </div>
                <div className="p-3 rounded-2xl bg-white border border-[#bcecfc]/60 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Peak Shaved</span>
                  <span className="text-xl font-black text-emerald-600">
                    {historicalData?.renewable_integration?.peak_shaving_contribution_kw || 55} kW
                  </span>
                  <span className="text-[10px] text-slate-500 block">Genset G2 Mitigated</span>
                </div>
              </div>

              {/* Chart: SoC Trajectory with 20% Reserve Floor */}
              <div className="p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black text-[#127694] uppercase tracking-tight">
                    Historical Battery State of Charge Trajectory ({timeRange})
                  </span>
                  <span className="text-[10px] font-mono text-rose-600 font-bold">
                    -- 20% Emergency Floor (Safe)
                  </span>
                </div>
                <div className="w-full h-64 sm:h-72">
                  <canvas ref={chartCanvasRef} />
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: AI BATTERY ADVISORY (Section 4.I) */}
          {activeTab === 'advisor' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#e5f6fd] via-white to-[#e5f6fd] border border-[#bcecfc] shadow-xs">
                <span className="text-xs font-black text-[#127694] uppercase tracking-tight block mb-2">
                  Autonomous AI Storage Reasoning Engine
                </span>
                <p className="text-xs text-slate-700 leading-relaxed">
                  The Polar AI Copilot evaluates electro-thermal constraints, inverter bottlenecks, and life-support emergency reserves before issuing storage recommendations.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-white border border-[#bcecfc] shadow-xs flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#0699C6] text-white flex items-center justify-center text-sm font-bold shrink-0">
                    <i className="fa-solid fa-microchip"></i>
                  </div>
                  <div>
                    <span className="text-xs font-black text-slate-800 block">Inverter Constraint Advisory</span>
                    <p className="text-xs text-slate-600 mt-1 italic">
                      "Battery capacity is not currently the primary constraint. The 80 kW inverter is limiting discharge power. Increasing storage capacity alone to 600 or 800 kWh is unlikely to significantly improve annual fuel savings without an inverter power upgrade."
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-white border border-amber-200 shadow-xs flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                    <i className="fa-solid fa-temperature-arrow-down"></i>
                  </div>
                  <div>
                    <span className="text-xs font-black text-slate-800 block">Sub-Zero Thermal Derating Explanation</span>
                    <p className="text-xs text-slate-600 mt-1 italic">
                      "Battery temperature has fallen below the configured operating threshold (-20°C). Usable capacity and discharge capability have been derated to 70% to protect the LiFePO4 cells from lithium plating."
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-white border border-rose-200 shadow-xs flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                    <i className="fa-solid fa-leaf"></i>
                  </div>
                  <div>
                    <span className="text-xs font-black text-slate-800 block">Excess Renewable Curtailment Explanation</span>
                    <p className="text-xs text-slate-600 mt-1 italic">
                      "Excess wind generation is currently available (120 kW surplus), but battery charging is limited by the 80 kW inverter. The remaining 40 kW has been flagged and curtailed."
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* 4. MODAL FOOTER */}
        <div className="px-6 py-3 border-t border-[#bcecfc]/60 bg-gradient-to-r from-[#f0faff] via-white to-[#f0faff] flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">
            Polar Storage System &middot; 400 kWh LiFePO4 &middot; 80 kW Bidirectional Inverter &middot; 20% Floor Safe
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition text-xs"
          >
            Close Storage Center
          </button>
        </div>

      </div>
    </div>
  );
}
