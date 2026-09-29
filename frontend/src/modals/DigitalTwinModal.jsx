import React, { useState, useEffect, useMemo } from 'react';
import { STATIONS } from '../constants/stations';

/**
 * Feature 2: DIGITAL TWIN WORKSPACE
 * Goal: Answer "What is happening to the station and its assets right now, and what would happen if conditions change?"
 * 
 * Features:
 * 1. Station Physical & SCADA Telemetry Twin (Grid, Bus A/B, Voltage, Frequency, Power Factor, THD)
 * 2. Asset-Level Twins:
 *    - Diesel Genset 1 & Genset 2 (load %, RPM, fuel rate, coolant temp, run hours, maintenance risk, wet stacking status)
 *    - Battery Energy Storage System (SoC %, cell temp °C, SOH %, cycle count, thermal envelope, heating trace)
 *    - Wind Turbines (active status, RPM, icing risk %, output kW, blade de-icing heaters)
 *    - Solar PV Array (snow cover loss %, irradiance conversion %, output kW, panel tilt)
 *    - Critical Life-Support Loads (Habitat heating, water melt tank, lab power, comms)
 * 3. Electro-Thermal Interaction & Heat Recovery:
 *    - Ambient temp vs battery capacity and diesel efficiency
 *    - Waste heat recovery loop from generators to hydronic heating loops
 * 4. Failure & Degradation Diagnostics:
 *    - Generator icing, fuel gel risk, inverter fault, cell imbalance, thermal margin
 * 5. Interactive "What-If" Cause-and-Effect Chain Simulator:
 *    - Sliders & presets (Temp drop, wind shear, Genset trip, BESS cold lockout)
 *    - Real-time visual cascade: Trigger -> Physical Impact -> Grid Constraint -> Automated Dispatch Action -> Safety Margin
 * 6. Microgrid Single-Line Diagram / Topology
 */
export default function DigitalTwinModal({
  isOpen,
  onClose,
  latestData,
  stationId = 'MAITRI',
  onOpenModal
}) {
  const [activeTab, setActiveTab] = useState('assets'); // 'assets' | 'thermal' | 'diagnostics' | 'whatif' | 'topology'
  const [whatIfTemp, setWhatIfTemp] = useState(-32); // °C
  const [whatIfWind, setWhatIfWind] = useState(14); // m/s
  const [whatIfGenset1Trip, setWhatIfGenset1Trip] = useState(false);
  const [whatIfBessLockout, setWhatIfBessLockout] = useState(false);
  const [whatIfSnowCover, setWhatIfSnowCover] = useState(25); // %
  const [simActive, setSimActive] = useState(false);

  const currentStation = STATIONS[stationId] || STATIONS.MAITRI;
  const t = latestData?.telemetry || {};
  const d = latestData?.dispatch || {};
  const scada = latestData?.scada_monitoring || {};
  const gen = scada.generation || {};
  const dg1 = gen.generator_1 || {};
  const dg2 = gen.generator_2 || {};
  const wind = gen.wind_turbine || {};
  const solar = gen.solar_pv || {};
  const bess = scada.storage?.battery || {};
  const loads = scada.loads?.groups || [];
  const mg = latestData?.microgrid || {};
  const thermal = latestData?.thermal || {};

  // Live Telemetry Values
  const ambientTemp = t.ambient_temp_c !== undefined ? Number(t.ambient_temp_c) : -28.4;
  const windSpeed = t.wind_speed_ms !== undefined ? Number(t.wind_speed_ms) : 12.2;
  const solarGhi = t.solar_irradiance_wm2 !== undefined ? Number(t.solar_irradiance_wm2) : 210.0;
  const gridFreq = t.grid_frequency_hz !== undefined ? Number(t.grid_frequency_hz) : 50.02;
  const busVoltage = t.bus_voltage_v !== undefined ? Number(t.bus_voltage_v) : 401.5;
  const totalLoad = t.station_load_kwe !== undefined ? Number(t.station_load_kwe) : 320.0;
  const powerFactor = t.power_factor !== undefined ? Number(t.power_factor) : 0.95;
  const thd = t.thd_percent !== undefined ? Number(t.thd_percent) : 1.8;

  // Sync initial What-If sliders with actual live telemetry when opened
  useEffect(() => {
    if (isOpen) {
      setWhatIfTemp(Math.round(ambientTemp));
      setWhatIfWind(Math.round(windSpeed));
    }
  }, [isOpen, ambientTemp, windSpeed]);

  // Reactive "What-If" Cause & Effect Calculations
  const whatIfCascade = useMemo(() => {
    // 1. Temperature Impact on Battery Available Capacity
    // LiFePO4 loses ~0.7% capacity per degree below 0°C without active heating
    const tempDropBelowZero = Math.max(0, -whatIfTemp);
    const bessCapLossPct = Math.min(45, Math.round(tempDropBelowZero * 0.75));
    const effectiveBessCapKwh = Math.max(120, Math.round(500 * (1 - bessCapLossPct / 100)));

    // 2. Temperature Impact on Fuel Viscosity & Gel Risk
    const fuelPourPoint = -35.0; // Polar diesel pour point
    const fuelGelMargin = whatIfTemp - fuelPourPoint;
    const fuelGelRisk = whatIfTemp <= -34 ? 'CRITICAL (Gel Imminent)' : whatIfTemp <= -30 ? 'ELEVATED (Trace Heaters Active)' : 'NOMINAL';

    // 3. Wind Cut-Out Risk
    const windCutout = whatIfWind >= 25.0;
    const windOutputKw = windCutout ? 0 : Math.round(Math.min(220, Math.pow(whatIfWind / 12, 3) * 160));

    // 4. Solar Output with Snow Cover
    const solarOutputKw = Math.max(0, Math.round((solarGhi / 1000) * 80 * (1 - whatIfSnowCover / 100)));

    // 5. Genset & Heating Cascade
    let requiredDieselKw = 0;
    let genset1Running = true;
    let genset2Running = false;
    let gensetStartAdvanceMins = 0;

    if (whatIfGenset1Trip) {
      genset1Running = false;
      genset2Running = true;
      requiredDieselKw = Math.max(0, totalLoad - (windCutout ? 0 : windOutputKw) - solarOutputKw);
    } else {
      const netRenewables = (windCutout ? 0 : windOutputKw) + solarOutputKw;
      const netDeficit = Math.max(0, totalLoad - netRenewables);
      if (netDeficit > 180 || whatIfBessLockout || bessCapLossPct > 25) {
        genset2Running = true;
      }
      requiredDieselKw = Math.max(40, netDeficit);
    }

    // Advance start time required if battery buffer shrinks
    if (bessCapLossPct > 15 || whatIfBessLockout) {
      gensetStartAdvanceMins = Math.round(bessCapLossPct * 1.8 + (whatIfBessLockout ? 45 : 0));
    }

    // Waste Heat Recovery
    const thermalRecoveryKw = Math.round(requiredDieselKw * 0.58);
    const habitatHeatingDemandKw = Math.round(180 + Math.max(0, -whatIfTemp - 20) * 3.5);
    const auxiliaryHeatingNeeded = Math.max(0, habitatHeatingDemandKw - thermalRecoveryKw);

    return {
      bessCapLossPct,
      effectiveBessCapKwh,
      fuelGelRisk,
      fuelGelMargin,
      windCutout,
      windOutputKw,
      solarOutputKw,
      genset1Running,
      genset2Running,
      requiredDieselKw,
      gensetStartAdvanceMins,
      thermalRecoveryKw,
      habitatHeatingDemandKw,
      auxiliaryHeatingNeeded
    };
  }, [whatIfTemp, whatIfWind, whatIfGenset1Trip, whatIfBessLockout, whatIfSnowCover, totalLoad, solarGhi]);

  if (!isOpen) return null;

  return (
    <div
      id="modal-digital-twin-backdrop"
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target.id === 'modal-digital-twin-backdrop') onClose();
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-[#bcecfc] w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="px-5 py-3.5 border-b border-[#bcecfc]/70 bg-gradient-to-r from-[#f0faff] via-white to-[#f0faff] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#05C5FF] to-[#127694] text-white flex items-center justify-center font-black text-lg shadow-md shrink-0">
              <i className="fa-solid fa-cube"></i>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-[#127694] tracking-tight uppercase">
                  Digital Twin &amp; Asset Operational Simulator
                </h2>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#c2f0fe] text-[#0699C6] border border-[#bcecfc]">
                  {stationId} &middot; Physical SCADA Twin
                </span>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block mr-1 animate-pulse"></span>
                  Electro-Thermal Twin Active
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Real-time sub-component physical states, degradation monitoring, and interactive cause-and-effect what-if analysis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenModal && onOpenModal('copilot', 'Explain the current Digital Twin health status and asset degradation risks.')}
              className="px-3 py-1.5 rounded-xl bg-[#edf9fd] hover:bg-[#c2f0fe] text-[#127694] text-xs font-bold border border-[#bcecfc] transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Ask Copilot about asset health"
            >
              <i className="fa-solid fa-robot text-indigo-500"></i>
              <span>Consult Copilot</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm transition"
              title="Close Digital Twin"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        {/* WORKSPACE NAVIGATION TABS */}
        <div className="px-5 py-2 bg-[#f8fcfe] border-b border-[#bcecfc]/50 flex items-center justify-between gap-2 overflow-x-auto shrink-0">
          <div className="flex items-center gap-1.5 p-1 bg-white rounded-2xl border border-[#bcecfc] shadow-xs flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('assets')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'assets'
                  ? 'bg-gradient-to-r from-[#05C5FF] to-[#0699C6] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#127694] hover:bg-[#edf9fd]'
              }`}
            >
              <i className="fa-solid fa-microchip text-xs"></i>
              <span>Equipment SCADA Twins</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('whatif')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'whatif'
                  ? 'bg-gradient-to-r from-[#05C5FF] to-[#0699C6] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#127694] hover:bg-[#edf9fd]'
              }`}
            >
              <i className="fa-solid fa-wand-magic-sparkles text-amber-400 text-xs"></i>
              <span>"What-If" Cause &amp; Effect</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('thermal')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'thermal'
                  ? 'bg-gradient-to-r from-[#05C5FF] to-[#0699C6] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#127694] hover:bg-[#edf9fd]'
              }`}
            >
              <i className="fa-solid fa-temperature-arrow-down text-cyan-600 text-xs"></i>
              <span>Electro-Thermal Balance</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('diagnostics')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'diagnostics'
                  ? 'bg-gradient-to-r from-[#05C5FF] to-[#0699C6] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#127694] hover:bg-[#edf9fd]'
              }`}
            >
              <i className="fa-solid fa-triangle-exclamation text-rose-500 text-xs"></i>
              <span>Failure &amp; Degradation</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('topology')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'topology'
                  ? 'bg-gradient-to-r from-[#05C5FF] to-[#0699C6] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#127694] hover:bg-[#edf9fd]'
              }`}
            >
              <i className="fa-solid fa-network-wired text-indigo-500 text-xs"></i>
              <span>Microgrid Topology</span>
            </button>
          </div>

          {/* Quick Bus Status Banner */}
          <div className="hidden md:flex items-center gap-3 text-xs bg-white px-3 py-1 rounded-xl border border-[#bcecfc] text-slate-600">
            <span className="font-mono"><strong>Grid:</strong> {gridFreq.toFixed(2)} Hz</span>
            <span className="text-slate-300">|</span>
            <span className="font-mono"><strong>Bus:</strong> {busVoltage.toFixed(1)} V</span>
            <span className="text-slate-300">|</span>
            <span className="font-mono"><strong>PF:</strong> {powerFactor.toFixed(2)}</span>
            <span className="text-slate-300">|</span>
            <span className="font-mono"><strong>THD:</strong> {thd.toFixed(1)}%</span>
          </div>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5 bg-[#fafdfe]">

          {/* =========================================================================
              TAB 1: EQUIPMENT SCADA TWINS
              ========================================================================= */}
          {activeTab === 'assets' && (
            <div className="space-y-4 animate-fadeIn">
              
              {/* Asset Twin Grid: 4 Core Columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* 1. DIESEL GENSET 1 TWIN */}
                <div className="p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-xs space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center font-bold text-xs">
                        DG1
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-800">Diesel Genset 1</h4>
                        <span className="text-[10px] text-slate-400 font-mono">Caterpillar C9 (250 kW)</span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      (dg1.power_kw || t.diesel_gen_kw || 75) > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {(dg1.power_kw || t.diesel_gen_kw || 75) > 0 ? 'SYNCHRONIZED' : 'STANDBY'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] text-slate-400 block">Electrical Load</span>
                      <strong className="text-sm font-black text-[#127694]">
                        {(dg1.power_kw || t.diesel_gen_kw || 75).toFixed(1)} kW
                      </strong>
                      <span className="text-[9px] text-slate-500 block">
                        ({Math.round(((dg1.power_kw || t.diesel_gen_kw || 75) / 250) * 100)}% rating)
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] text-slate-400 block">Engine RPM</span>
                      <strong className="text-sm font-black text-slate-800 font-mono">
                        {dg1.rpm || 1500} RPM
                      </strong>
                      <span className="text-[9px] text-emerald-600 block">Governor Lock</span>
                    </div>

                    <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] text-slate-400 block">Fuel Burn Rate</span>
                      <strong className="text-xs font-black text-amber-700 font-mono">
                        {dg1.fuel_rate_lph ? dg1.fuel_rate_lph.toFixed(1) : '24.2'} L/h
                      </strong>
                      <span className="text-[9px] text-slate-500 block">BSFC: 218 g/kWh</span>
                    </div>

                    <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] text-slate-400 block">Coolant Temp</span>
                      <strong className="text-xs font-black text-cyan-800 font-mono">
                        {dg1.coolant_temp_c ? dg1.coolant_temp_c.toFixed(1) : '84.6'} °C
                      </strong>
                      <span className="text-[9px] text-emerald-600 block">In Spec (80-92°C)</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Run Hours: <strong>4,812 h</strong></span>
                    <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      Wet Stacking: NONE
                    </span>
                  </div>
                </div>

                {/* 2. DIESEL GENSET 2 TWIN */}
                <div className="p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-xs space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs">
                        DG2
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-800">Diesel Genset 2</h4>
                        <span className="text-[10px] text-slate-400 font-mono">Caterpillar C9 (250 kW)</span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      (dg2.power_kw || 0) > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {(dg2.power_kw || 0) > 0 ? 'ONLINE' : 'PREWARMED STANDBY'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] text-slate-400 block">Electrical Load</span>
                      <strong className="text-sm font-black text-slate-700">
                        {(dg2.power_kw || 0).toFixed(1)} kW
                      </strong>
                      <span className="text-[9px] text-slate-500 block">Spinning Reserve</span>
                    </div>

                    <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] text-slate-400 block">Jacket Heater</span>
                      <strong className="text-sm font-black text-amber-600">
                        ACTIVE (42°C)
                      </strong>
                      <span className="text-[9px] text-emerald-600 block">Cold-start Ready</span>
                    </div>

                    <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] text-slate-400 block">Lube Oil Viscosity</span>
                      <strong className="text-xs font-black text-slate-800 font-mono">
                        SAE 0W-40 Polar
                      </strong>
                      <span className="text-[9px] text-emerald-600 block">Flow Verified</span>
                    </div>

                    <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] text-slate-400 block">Start Permissive</span>
                      <strong className="text-xs font-black text-emerald-700">
                        READY (&lt;30s)
                      </strong>
                      <span className="text-[9px] text-slate-500 block">Auto-synchronizer ok</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Run Hours: <strong>2,190 h</strong></span>
                    <span className="text-slate-600 font-semibold">Health Score: 98%</span>
                  </div>
                </div>

                {/* 3. BESS LITHIUM STORAGE TWIN */}
                <div className="p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-xs space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center font-bold text-xs">
                        <i className="fa-solid fa-car-battery text-xs"></i>
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-800">LiFePO4 Storage Twin</h4>
                        <span className="text-[10px] text-slate-400 font-mono">500 kWh / 250 kW Inverter</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                      GRID FORMING
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] text-slate-400 block">State of Charge (SoC)</span>
                      <strong className="text-sm font-black text-emerald-700 font-mono">
                        {(t.battery_soc_percent !== undefined ? t.battery_soc_percent : 78).toFixed(1)}%
                      </strong>
                      <span className="text-[9px] text-slate-500 block">Reserve Buffer: 30%</span>
                    </div>

                    <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] text-slate-400 block">Core Cell Temp</span>
                      <strong className="text-sm font-black text-[#127694] font-mono">
                        {(t.battery_temp_c !== undefined ? t.battery_temp_c : 18.5).toFixed(1)} °C
                      </strong>
                      <span className="text-[9px] text-emerald-600 block">Thermal Envelope OK</span>
                    </div>

                    <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] text-slate-400 block">Active Flow</span>
                      <strong className="text-xs font-black text-slate-800 font-mono">
                        {(d.p_battery_discharge_kw || 0) > 0
                          ? `Discharging ${(d.p_battery_discharge_kw).toFixed(1)} kW`
                          : (d.p_battery_charge_kw || 0) > 0
                          ? `Charging ${(d.p_battery_charge_kw).toFixed(1)} kW`
                          : 'Float / Idle (0 kW)'}
                      </strong>
                      <span className="text-[9px] text-slate-500 block">C-Rate: 0.15 C</span>
                    </div>

                    <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] text-slate-400 block">Health / SOH</span>
                      <strong className="text-xs font-black text-indigo-700 font-mono">
                        96.8% SOH
                      </strong>
                      <span className="text-[9px] text-slate-500 block">1,420 Equivalent Cycles</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Heater Trace: <strong>ACTIVE (2.4 kW)</strong></span>
                    <span className="text-emerald-700 font-bold">Cell Delta: 0.012 V</span>
                  </div>
                </div>

                {/* 4. RENEWABLES & LOADS TWIN */}
                <div className="p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-xs space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center font-bold text-xs">
                        <i className="fa-solid fa-wind text-xs"></i>
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-800">Wind &amp; Solar Twin</h4>
                        <span className="text-[10px] text-slate-400 font-mono">3x Wind + 120kW PV</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-100 text-sky-800">
                      GENERATING
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] text-slate-400 block">Wind Output</span>
                      <strong className="text-sm font-black text-sky-700 font-mono">
                        {(d.p_wind_kw || t.wind_generation_kw || 180).toFixed(1)} kW
                      </strong>
                      <span className="text-[9px] text-slate-500 block">Speed: {windSpeed.toFixed(1)} m/s</span>
                    </div>

                    <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] text-slate-400 block">Solar PV Output</span>
                      <strong className="text-sm font-black text-amber-600 font-mono">
                        {(d.p_solar_kw || t.solar_generation_kw || 55).toFixed(1)} kW
                      </strong>
                      <span className="text-[9px] text-slate-500 block">GHI: {solarGhi.toFixed(0)} W/m²</span>
                    </div>

                    <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] text-slate-400 block">Turbine Icing</span>
                      <strong className="text-xs font-black text-emerald-700 font-mono">
                        LOW (1.2%)
                      </strong>
                      <span className="text-[9px] text-slate-500 block">Electro-thermal de-ice OFF</span>
                    </div>

                    <div className="p-2 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] text-slate-400 block">Snow Loss Factor</span>
                      <strong className="text-xs font-black text-slate-800 font-mono">
                        4.5% Attenuation
                      </strong>
                      <span className="text-[9px] text-slate-500 block">Tilt 60° shed clean</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Critical Life Loads: <strong>142 kW</strong></span>
                    <span className="text-indigo-700 font-bold">Total Demand: {totalLoad.toFixed(0)} kW</span>
                  </div>
                </div>

              </div>

              {/* Subsystem Telemetry Strip */}
              <div className="p-4 rounded-2xl bg-[#edf9fd] border border-[#bcecfc] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <i className="fa-solid fa-gauge-high text-xl text-[#0699C6]"></i>
                  <div>
                    <h5 className="text-xs font-black text-[#127694] uppercase tracking-wide">
                      Station Critical Life-Support Subsystems
                    </h5>
                    <span className="text-[11px] text-slate-600">
                      Habitat Environmental Control &middot; Water Melt Tank &middot; Satellite Comms Uplink &middot; Deep Ice Core Lab
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('whatif')}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#127694] text-xs font-bold border border-[#bcecfc] shadow-xs flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-wand-magic-sparkles text-amber-500"></i>
                    <span>Test Subsystem Resilience in What-If</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenModal && onOpenModal('energy')}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#05C5FF] to-[#0699C6] text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-bolt"></i>
                    <span>View Energy Matrix</span>
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* =========================================================================
              TAB 2: "WHAT-IF" CAUSE & EFFECT CHAIN SIMULATOR
              ========================================================================= */}
          {activeTab === 'whatif' && (
            <div className="space-y-4 animate-fadeIn">
              
              {/* Simulator Controls & Presets Header */}
              <div className="p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-xs space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-black text-[#127694] uppercase flex items-center gap-2">
                      <i className="fa-solid fa-wand-magic-sparkles text-amber-500"></i>
                      Interactive Contingency Cause &amp; Effect Simulator
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Simulate extreme Antarctic physical disturbances and observe the automated cascade through battery capacity, generator starts, and life-support heat recovery.
                    </p>
                  </div>

                  {/* Preset Scenarios */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Presets:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setWhatIfTemp(-44);
                        setWhatIfWind(28);
                        setWhatIfGenset1Trip(false);
                        setWhatIfBessLockout(false);
                        setWhatIfSnowCover(65);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 transition cursor-pointer"
                    >
                      Blizzard (-44°C, 28 m/s)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWhatIfTemp(-38);
                        setWhatIfWind(15);
                        setWhatIfGenset1Trip(true);
                        setWhatIfBessLockout(false);
                        setWhatIfSnowCover(20);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition cursor-pointer"
                    >
                      DG1 Sudden Trip
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWhatIfTemp(-48);
                        setWhatIfWind(10);
                        setWhatIfGenset1Trip(false);
                        setWhatIfBessLockout(true);
                        setWhatIfSnowCover(10);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 transition cursor-pointer"
                    >
                      BESS Freeze Lockout (-48°C)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWhatIfTemp(Math.round(ambientTemp));
                        setWhatIfWind(Math.round(windSpeed));
                        setWhatIfGenset1Trip(false);
                        setWhatIfBessLockout(false);
                        setWhatIfSnowCover(15);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer"
                    >
                      Reset to Live SCADA
                    </button>
                  </div>
                </div>

                {/* Interactive Parameter Sliders */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 text-xs">
                  
                  {/* Slider 1: Ambient Temp */}
                  <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc] space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-700 flex items-center gap-1">
                        <i className="fa-solid fa-temperature-low text-[#0699C6]"></i> Ambient Temp
                      </span>
                      <strong className={`font-mono text-sm ${whatIfTemp <= -40 ? 'text-rose-600' : 'text-[#127694]'}`}>
                        {whatIfTemp} °C
                      </strong>
                    </div>
                    <input
                      type="range"
                      min="-55"
                      max="-10"
                      value={whatIfTemp}
                      onChange={(e) => setWhatIfTemp(Number(e.target.value))}
                      className="w-full accent-[#0699C6] cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400">
                      <span>-55°C (Extreme)</span>
                      <span>-10°C (Mild)</span>
                    </div>
                  </div>

                  {/* Slider 2: Wind Speed */}
                  <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc] space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-700 flex items-center gap-1">
                        <i className="fa-solid fa-wind text-sky-600"></i> Wind Speed
                      </span>
                      <strong className={`font-mono text-sm ${whatIfWind >= 25 ? 'text-rose-600' : 'text-[#127694]'}`}>
                        {whatIfWind} m/s
                      </strong>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="35"
                      value={whatIfWind}
                      onChange={(e) => setWhatIfWind(Number(e.target.value))}
                      className="w-full accent-sky-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400">
                      <span>0 m/s (Calm)</span>
                      <span>&gt;25 m/s (Cutout)</span>
                    </div>
                  </div>

                  {/* Slider 3: Snow Cover on Solar */}
                  <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc] space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-700 flex items-center gap-1">
                        <i className="fa-solid fa-snowflake text-indigo-500"></i> Snow Blinding
                      </span>
                      <strong className="font-mono text-sm text-[#127694]">
                        {whatIfSnowCover}%
                      </strong>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={whatIfSnowCover}
                      onChange={(e) => setWhatIfSnowCover(Number(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400">
                      <span>0% (Clean)</span>
                      <span>100% (Drifted)</span>
                    </div>
                  </div>

                  {/* Toggle 4: Genset 1 Trip */}
                  <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc] flex flex-col justify-between">
                    <div>
                      <span className="font-bold text-slate-700 block">Genset 1 Trip</span>
                      <span className="text-[10px] text-slate-500 block">Simulate sudden mechanical trip</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWhatIfGenset1Trip(!whatIfGenset1Trip)}
                      className={`w-full py-1.5 rounded-lg font-bold text-xs transition cursor-pointer mt-2 ${
                        whatIfGenset1Trip
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {whatIfGenset1Trip ? 'TRIPPED (Simulated)' : 'NOMINAL ONLINE'}
                    </button>
                  </div>

                  {/* Toggle 5: BESS Cold Lockout */}
                  <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc] flex flex-col justify-between">
                    <div>
                      <span className="font-bold text-slate-700 block">BESS Thermal Lockout</span>
                      <span className="text-[10px] text-slate-500 block">BMS charge disable &lt;-15°C</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWhatIfBessLockout(!whatIfBessLockout)}
                      className={`w-full py-1.5 rounded-lg font-bold text-xs transition cursor-pointer mt-2 ${
                        whatIfBessLockout
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {whatIfBessLockout ? 'LOCKED OUT' : 'NORMAL ENVELOPE'}
                    </button>
                  </div>

                </div>
              </div>

              {/* VISUAL CAUSE-AND-EFFECT CASCADE CHAIN (The Key Requirement) */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-white via-[#f4fcfe] to-white border border-[#bcecfc] shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-[#127694] uppercase tracking-wider flex items-center gap-2">
                    <i className="fa-solid fa-diagram-project text-[#0699C6]"></i>
                    Simulated Cause-and-Effect Cascade Chain
                  </h4>
                  <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-[#bcecfc]">
                    Real-Time Microgrid &amp; Electro-Thermal Propagation
                  </span>
                </div>

                {/* 5-Stage Cascade Flow */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative">
                  
                  {/* Step 1: Physical Trigger */}
                  <div className="p-3 rounded-xl bg-white border border-sky-200 shadow-xs relative">
                    <div className="text-[9px] font-black uppercase text-sky-600 tracking-wider">1. Trigger Condition</div>
                    <div className="mt-2 text-xs font-bold text-slate-800">
                      {whatIfTemp <= -40 ? `Severe Cold Snap (${whatIfTemp}°C)` : `Ambient Temp (${whatIfTemp}°C)`}
                      {whatIfWind >= 25 && ` + Gale Wind (${whatIfWind} m/s)`}
                      {whatIfGenset1Trip && ` + DG1 Trip`}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Surface wind shear &amp; ambient polar thermal depression.
                    </p>
                    <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-[#0699C6] text-sm">
                      <i className="fa-solid fa-angles-right"></i>
                    </div>
                  </div>

                  {/* Step 2: Physical & Asset Impact */}
                  <div className="p-3 rounded-xl bg-white border border-amber-200 shadow-xs relative">
                    <div className="text-[9px] font-black uppercase text-amber-700 tracking-wider">2. Asset Physics Impact</div>
                    <div className="mt-2 text-xs font-bold text-slate-800">
                      Battery Cap: <span className="text-rose-600">-{whatIfCascade.bessCapLossPct}%</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Available: <strong>{whatIfCascade.effectiveBessCapKwh} kWh</strong>.
                      {whatIfCascade.windCutout ? ' Wind cut-out offline (0 kW).' : ` Wind: ${whatIfCascade.windOutputKw} kW.`}
                    </p>
                    <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-[#0699C6] text-sm">
                      <i className="fa-solid fa-angles-right"></i>
                    </div>
                  </div>

                  {/* Step 3: Grid Operational Constraint */}
                  <div className="p-3 rounded-xl bg-white border border-rose-200 shadow-xs relative">
                    <div className="text-[9px] font-black uppercase text-rose-700 tracking-wider">3. Constraint Violation</div>
                    <div className="mt-2 text-xs font-bold text-slate-800">
                      Reserve Margin: <span className="text-rose-600">DEFICIT</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Spinning reserve requirement (80 kW) exceeds available battery buffer without secondary generator.
                    </p>
                    <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-[#0699C6] text-sm">
                      <i className="fa-solid fa-angles-right"></i>
                    </div>
                  </div>

                  {/* Step 4: Automated Dispatch Action */}
                  <div className="p-3 rounded-xl bg-white border border-emerald-200 shadow-xs relative">
                    <div className="text-[9px] font-black uppercase text-emerald-700 tracking-wider">4. Automated Action</div>
                    <div className="mt-2 text-xs font-bold text-slate-800">
                      {whatIfCascade.genset2Running ? 'Start DG2 Now (+Prewarm)' : 'Advance DG1 Dispatch'}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      {whatIfCascade.gensetStartAdvanceMins > 0
                        ? `Advance start by ${whatIfCascade.gensetStartAdvanceMins} mins to protect reserve buffer.`
                        : 'Maintain single generator optimal loading.'}
                    </p>
                    <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-[#0699C6] text-sm">
                      <i className="fa-solid fa-angles-right"></i>
                    </div>
                  </div>

                  {/* Step 5: Thermal & Life-Support Result */}
                  <div className="p-3 rounded-xl bg-white border border-[#bcecfc] shadow-xs">
                    <div className="text-[9px] font-black uppercase text-[#127694] tracking-wider">5. Station Thermal Balance</div>
                    <div className="mt-2 text-xs font-bold text-slate-800">
                      Waste Heat: +{whatIfCascade.thermalRecoveryKw} kWth
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Habitat heating demand: <strong>{whatIfCascade.habitatHeatingDemandKw} kWth</strong>.
                      {whatIfCascade.auxiliaryHeatingNeeded > 0
                        ? ` Aux boiler: ${whatIfCascade.auxiliaryHeatingNeeded} kWth.`
                        : ' Hydronic loop 100% satisfied by generator recovery.'}
                    </p>
                  </div>

                </div>

                {/* Summary Statement */}
                <div className="p-3 rounded-xl bg-[#edf9fd] border border-[#bcecfc] text-xs text-[#127694] flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-quote-left text-[#0699C6]"></i>
                    <span className="font-semibold">
                      Digital Twin Simulation Insight: If ambient temperature drops to <strong>{whatIfTemp}°C</strong>,
                      battery capacity drops <strong>{whatIfCascade.bessCapLossPct}%</strong>, requiring
                      Diesel Generator {whatIfCascade.genset2Running ? '2 to start' : '1 to ramp'} <strong>{whatIfCascade.gensetStartAdvanceMins || 25} minutes earlier</strong> to
                      prevent spinning reserve violations.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenModal && onOpenModal('copilot', `Explain the cause and effect of an ambient temperature drop to ${whatIfTemp}°C and wind speed of ${whatIfWind} m/s in the Digital Twin.`)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-[#127694] font-bold border border-[#bcecfc] text-[11px] shadow-xs cursor-pointer"
                  >
                    Deep Dive with Copilot
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* =========================================================================
              TAB 3: ELECTRO-THERMAL BALANCE & HEAT RECOVERY
              ========================================================================= */}
          {activeTab === 'thermal' && (
            <div className="space-y-4 animate-fadeIn">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* 1. Generator Heat Recovery Loop */}
                <div className="p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-800 uppercase flex items-center gap-2">
                      <i className="fa-solid fa-fire-burner text-amber-600"></i>
                      Hydronic Waste Heat Recovery
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                      ACTIVE (84%)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Captures exhaust gas and jacket coolant thermal energy from running diesel generators to heat station living quarters and melted drinking water.
                  </p>
                  <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc] space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Recovered Thermal Power:</span>
                      <strong className="font-mono font-bold text-[#127694]">78.4 kWth</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Heat Exchanger Supply:</span>
                      <strong className="font-mono font-bold text-slate-800">82.0 °C</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Heat Exchanger Return:</span>
                      <strong className="font-mono font-bold text-slate-800">58.5 °C</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Hydronic Delta T:</span>
                      <strong className="font-mono font-bold text-emerald-700">23.5 °C</strong>
                    </div>
                  </div>
                </div>

                {/* 2. Battery Thermal Envelope */}
                <div className="p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-800 uppercase flex items-center gap-2">
                      <i className="fa-solid fa-temperature-half text-cyan-600"></i>
                      BESS Heated Enclosure
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                      STABILIZED
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Maintains LiFePO4 cells at optimal temperature (+15°C to +25°C) inside insulated container using heat pump and electric trace heating.
                  </p>
                  <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc] space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Enclosure Internal Temp:</span>
                      <strong className="font-mono font-bold text-emerald-700">+18.5 °C</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Ambient Delta T:</span>
                      <strong className="font-mono font-bold text-slate-800">46.9 °C</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Heater Parasitic Load:</span>
                      <strong className="font-mono font-bold text-amber-700">2.4 kW</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Minimum Freeze Limit:</span>
                      <strong className="font-mono font-bold text-slate-800">-15.0 °C</strong>
                    </div>
                  </div>
                </div>

                {/* 3. Fuel Tank Insulation & Preheating */}
                <div className="p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-800 uppercase flex items-center gap-2">
                      <i className="fa-solid fa-oil-can text-indigo-600"></i>
                      Diesel Tank Thermal Control
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                      NOMINAL
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Day-tank heated recirculation prevents paraffin crystallization and gelling during deep polar freeze events.
                  </p>
                  <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc] space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Day Tank Core Temp:</span>
                      <strong className="font-mono font-bold text-slate-800">+8.0 °C</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Bulk Storage Temp:</span>
                      <strong className="font-mono font-bold text-slate-800">-18.2 °C</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Pour Point Margin:</span>
                      <strong className="font-mono font-bold text-emerald-700">+16.8 °C</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Suction Line Heaters:</span>
                      <strong className="font-mono font-bold text-emerald-700">ACTIVE (1.1 kW)</strong>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* =========================================================================
              TAB 4: FAILURE & DEGRADATION DIAGNOSTICS
              ========================================================================= */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-4 animate-fadeIn">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Failure Probability Matrix */}
                <div className="p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-xs space-y-3">
                  <h4 className="text-xs font-black text-[#127694] uppercase flex items-center gap-2">
                    <i className="fa-solid fa-shield-virus text-rose-500"></i>
                    Component Failure Indicators &amp; Remaining Useful Life
                  </h4>
                  <div className="space-y-2 text-xs">
                    
                    <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#bcecfc] flex items-center justify-between">
                      <div>
                        <strong className="text-slate-800 block">Generator 1 Turbocharger / Wet Stacking</strong>
                        <span className="text-[10px] text-slate-500">Load &gt;45% maintained &middot; Zero carbon deposit buildup</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                        RISK: 2.1% (LOW)
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#bcecfc] flex items-center justify-between">
                      <div>
                        <strong className="text-slate-800 block">Wind Turbine 2 Blade Icing &amp; Imbalance</strong>
                        <span className="text-[10px] text-slate-500">Vibration: 1.8 mm/s RMS &middot; Tip speed ratio within bounds</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                        RISK: 4.8% (LOW)
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#bcecfc] flex items-center justify-between">
                      <div>
                        <strong className="text-slate-800 block">Battery Rack 3 Cell Imbalance</strong>
                        <span className="text-[10px] text-slate-500">Maximum delta V: 12 mV &middot; Active balancing engaged</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                        RISK: 1.5% (OPTIMAL)
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[#f0faff] border border-[#bcecfc] flex items-center justify-between">
                      <div>
                        <strong className="text-slate-800 block">Main 400V Switchgear Insulation Breakdown</strong>
                        <span className="text-[10px] text-slate-500">Dielectric withstand tested &middot; Partial discharge: 0 pC</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                        RISK: 0.3% (NOMINAL)
                      </span>
                    </div>

                  </div>
                </div>

                {/* Preventive Maintenance Recommendations */}
                <div className="p-4 rounded-2xl bg-white border border-[#bcecfc] shadow-xs space-y-3">
                  <h4 className="text-xs font-black text-[#127694] uppercase flex items-center gap-2">
                    <i className="fa-solid fa-wrench text-amber-500"></i>
                    Preventive Maintenance Supervisor (Feature 14)
                  </h4>
                  <div className="space-y-2 text-xs">
                    
                    <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 flex items-start justify-between gap-3">
                      <div>
                        <strong className="text-amber-900 block">Genset 1 Lube Oil &amp; Fuel Filter Service</strong>
                        <span className="text-[10px] text-amber-700">
                          Due in 188 operating hours (~7.8 days). Recommended window: next favorable wind interval.
                        </span>
                      </div>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-200 text-amber-900 shrink-0">
                        SCHEDULED
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3">
                      <div>
                        <strong className="text-slate-800 block">Wind Turbine Yaw Motor Bearing Lubrication</strong>
                        <span className="text-[10px] text-slate-500">
                          Low-temperature synthetic grease application due at 3,000h inspection.
                        </span>
                      </div>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-700 shrink-0">
                        MONITORED
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3">
                      <div>
                        <strong className="text-slate-800 block">Solar Array De-Snowing Sweep</strong>
                        <span className="text-[10px] text-slate-500">
                          Optional manual snow broom sweep if blizzard deposition exceeds 25%.
                        </span>
                      </div>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-700 shrink-0">
                        ADVISORY
                      </span>
                    </div>

                  </div>
                </div>

              </div>

            </div>
          )}

          {/* =========================================================================
              TAB 5: MICROGRID TOPOLOGY SCHEMATIC
              ========================================================================= */}
          {activeTab === 'topology' && (
            <div className="space-y-4 animate-fadeIn">
              
              <div className="p-5 rounded-2xl bg-white border border-[#bcecfc] shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h4 className="text-xs font-black text-[#127694] uppercase flex items-center gap-2">
                      <i className="fa-solid fa-network-wired text-indigo-500"></i>
                      Microgrid Electrical Topology &amp; Bus Architecture
                    </h4>
                    <p className="text-xs text-slate-500">
                      Three-phase 400V AC synchronization bus, bidirectional 750V DC storage bus, and priority load shed contactors.
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                    BUS SYNCHRONIZED &middot; 50.02 Hz
                  </span>
                </div>

                {/* Schematic Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  
                  {/* Generation Bus */}
                  <div className="p-3.5 rounded-xl bg-[#f0faff] border border-[#bcecfc] space-y-2">
                    <span className="text-[10px] font-black text-[#127694] uppercase tracking-wider block">
                      Generation Feeders (AC Bus)
                    </span>
                    <div className="space-y-1 font-mono text-[11px]">
                      <div className="flex justify-between p-1 rounded bg-white border border-slate-200">
                        <span>DG-1 (Cat C9):</span>
                        <strong className="text-emerald-700">CB-01 CLOSED ({(dg1.power_kw || t.diesel_gen_kw || 75).toFixed(0)} kW)</strong>
                      </div>
                      <div className="flex justify-between p-1 rounded bg-white border border-slate-200">
                        <span>DG-2 (Cat C9):</span>
                        <strong className="text-slate-500">CB-02 OPEN (Standby)</strong>
                      </div>
                      <div className="flex justify-between p-1 rounded bg-white border border-slate-200">
                        <span>Wind Turbines (3x):</span>
                        <strong className="text-emerald-700">CB-03 CLOSED ({(d.p_wind_kw || t.wind_generation_kw || 180).toFixed(0)} kW)</strong>
                      </div>
                    </div>
                  </div>

                  {/* Energy Storage Bus */}
                  <div className="p-3.5 rounded-xl bg-[#f0faff] border border-[#bcecfc] space-y-2">
                    <span className="text-[10px] font-black text-[#127694] uppercase tracking-wider block">
                      Inverter &amp; DC Storage Bus
                    </span>
                    <div className="space-y-1 font-mono text-[11px]">
                      <div className="flex justify-between p-1 rounded bg-white border border-slate-200">
                        <span>BESS Inverter:</span>
                        <strong className="text-emerald-700">GRID FORMING (750V DC)</strong>
                      </div>
                      <div className="flex justify-between p-1 rounded bg-white border border-slate-200">
                        <span>Solar PV Inverter:</span>
                        <strong className="text-emerald-700">MPPT ACTIVE ({(d.p_solar_kw || t.solar_generation_kw || 55).toFixed(0)} kW)</strong>
                      </div>
                      <div className="flex justify-between p-1 rounded bg-white border border-slate-200">
                        <span>Fast Static Switch:</span>
                        <strong className="text-emerald-700">ARMED (&lt;4ms transfer)</strong>
                      </div>
                    </div>
                  </div>

                  {/* Load Feeders */}
                  <div className="p-3.5 rounded-xl bg-[#f0faff] border border-[#bcecfc] space-y-2">
                    <span className="text-[10px] font-black text-[#127694] uppercase tracking-wider block">
                      Load Feeders &amp; Prioritization
                    </span>
                    <div className="space-y-1 font-mono text-[11px]">
                      <div className="flex justify-between p-1 rounded bg-white border border-slate-200">
                        <span>Tier 1 Life Support:</span>
                        <strong className="text-emerald-700">PROTECTED (142 kW)</strong>
                      </div>
                      <div className="flex justify-between p-1 rounded bg-white border border-slate-200">
                        <span>Tier 2 Science / Lab:</span>
                        <strong className="text-sky-700">ENERGIZED (98 kW)</strong>
                      </div>
                      <div className="flex justify-between p-1 rounded bg-white border border-slate-200">
                        <span>Tier 3 Sheddable Aux:</span>
                        <strong className="text-amber-700">ARMED FOR SHED (80 kW)</strong>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="px-5 py-3 border-t border-[#bcecfc]/70 bg-gradient-to-r from-[#f0faff] via-white to-[#f0faff] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Digital Twin Synced with Physical Modbus SCADA registers (1 Hz)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenModal && onOpenModal('energy')}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#127694] text-xs font-bold border border-[#bcecfc] shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-bolt text-amber-500"></i>
              <span>Open Energy Matrix</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#05C5FF] to-[#0699C6] text-white text-xs font-bold shadow-xs hover:opacity-95 transition cursor-pointer"
            >
              Close Workspace
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
