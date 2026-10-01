import React from 'react';
import EvaluationSection from './EvaluationSection';
import OptimizationStatusPanel from './OptimizationStatusPanel';

const SCENARIOS = [
  {
    id: 'NORMAL',
    name: 'Normal Operation',
    tag: 'Nominal',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: 'fa-check-circle',
    color: 'slate',
    severity: 'NOMINAL',
    cause: 'Nominal Antarctic conditions (-24°C, 11 m/s wind, 180 W/m² solar irradiance).',
    effect: 'Standard MILP Tier-3 dispatch balancing wind, solar PV, BESS peak shaving, and G1 CHP heat recovery.',
    subsystems: ['MILP Tier-3: Optimal', 'BESS: 20% Reserve Intact', 'G1: 72 kW Base', 'Zero Curtailed Wind']
  },
  {
    id: 'EXTREME_COLD',
    name: 'Extreme Cold (-45°C)',
    tag: 'Thermal Surge',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-300',
    icon: 'fa-snowflake',
    color: 'rose',
    severity: 'CRITICAL',
    cause: 'Polar vortex plunges ambient temperature to -45.0°C; habitat thermal deficit surges +48%.',
    effect: 'BESS throughput derated to 80 kW. Thermal load surges to 145 kWth. G1 CHP maxed; G2 jacket pre-heaters engaged.',
    subsystems: ['Thermal Load: +48%', 'BESS Inverter Derated 80kW', 'G1 CHP Recovery: 72 kWth', 'G2 Jacket Pre-Warm Active']
  },
  {
    id: 'BLIZZARD_HIGH_WIND',
    name: 'Blizzard / High Wind',
    tag: 'Wind Cutout',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-300',
    icon: 'fa-wind',
    color: 'rose',
    severity: 'CRITICAL',
    cause: 'Katabatic blizzard wind accelerates to 28.5 m/s, exceeding 25.0 m/s structural cutout threshold.',
    effect: 'Turbines trigger aerodynamic feathering & emergency brakes (0.0 kW). BESS catches grid frequency; G2 dispatched at 85 kW.',
    subsystems: ['Wind Output: 0.0 kW', 'Deficit: -36.0 kW', 'BESS Fast Discharge Active', 'G2 Fast Dispatch: 85 kW']
  },
  {
    id: 'LOW_SOLAR',
    name: 'Low Solar (Polar Night)',
    tag: 'Solar 0 W/m²',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    icon: 'fa-moon',
    color: 'amber',
    severity: 'WARNING',
    cause: 'Polar night and cloud cover reduce solar irradiance to 0.0 W/m².',
    effect: 'Solar array produces 0.0 kW. Unit commitment redistributes baseload to wind and diesel with BESS diurnal buffering.',
    subsystems: ['Solar PV: 0.0 kW', 'BESS Peak Shifting Active', 'Genset Baseload Shift', 'Renewable Share: 58%']
  },
  {
    id: 'BATTERY_DEGRADATION',
    name: 'Battery Degradation',
    tag: 'SOH 62%',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    icon: 'fa-battery-quarter',
    color: 'amber',
    severity: 'WARNING',
    cause: 'Sub-zero cycling age drops LiFePO4 battery SOH to 62%, halving effective capacity to 200 kWh.',
    effect: 'Available energy buffer halved. High dSoC/dt triggers conservative 30% reserve floor and elevated diesel run hours.',
    subsystems: ['Effective BESS: 200 kWh', 'Reserve Floor: 30%', 'Health Score: 62% DEGRADED', 'Gen Minimum Up: +2h']
  },
  {
    id: 'GENERATOR_FAILURE',
    name: 'Generator Failure (G1)',
    tag: 'N-1 Trip',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-300',
    icon: 'fa-triangle-exclamation',
    color: 'rose',
    severity: 'CRITICAL',
    cause: 'Primary Generator G1 suffers mechanical trip (oil pressure loss) dropping from 72 kW to 0.0 kW instantly.',
    effect: 'Grid-forming BESS injects power in 15 ms to halt frequency drop. Standby G2 auto-starts, synchronizes, and ramps to 120 kW.',
    subsystems: ['G1 Output: 0.0 kW (FAULT)', 'BESS RoCoF Arrest: 15ms', 'G2 Auto-Sync Active', 'Tier-3 Shed Armed']
  },
  {
    id: 'MICROGRID_ISOLATION',
    name: 'Microgrid Isolation',
    tag: 'Islanded',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    icon: 'fa-shield-halved',
    color: 'amber',
    severity: 'WARNING',
    cause: 'Inter-tie breaker open; station microgrid isolated in autonomous self-sustaining islanded mode.',
    effect: 'Grid-forming BESS establishes 50.0 Hz voltage reference. Spinning reserve target raised to 30% for contingency containment.',
    subsystems: ['Mode: ISLANDED', 'Spinning Reserve: 30%', 'Grid-Forming Inverter: V-F Master', 'Frequency Lock: 50.0Hz']
  }
];

export default function BottomCards({
  stationId = 'MAITRI',
  latestData,
  currentScenario = 'NORMAL',
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

  const g1Health = h.genset_1_health_pct !== undefined ? h.genset_1_health_pct : 94;
  const g2Health = h.genset_2_health_pct !== undefined ? h.genset_2_health_pct : 82;
  const overallHealth = h.overall_score_pct !== undefined ? h.overall_score_pct : 84;

  // Resolve currently active scenario
  const normScenario = (currentScenario || 'NORMAL').toUpperCase().trim();
  const activeScenario = SCENARIOS.find(
    (s) => s.id === normScenario || normScenario.includes(s.id) || s.id.includes(normScenario)
  ) || SCENARIOS[0];

  return (
    <div className="flex flex-col gap-3.5 sm:gap-4 w-full">

      {/* ROW 1: TACTICAL OPERATIONS CARDS (DISPATCH, MAINTENANCE, SCENARIO ENGINE) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">

        {/* 1. COMPACT OPTIMIZATION STATUS & DISPATCH PANEL */}
        <OptimizationStatusPanel
          latestData={latestData}
          onOpenModal={onOpenModal}
        />

        {/* 2. MAINTENANCE & ASSET HEALTH CARD */}
        <div className="novara-card p-4 sm:p-5 flex flex-col justify-between bg-white">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#c2f0fe] text-[#0699C6] flex items-center justify-center font-bold text-xs">
                  <i className="fa-solid fa-shield-halved"></i>
                </div>
                <span className="font-extrabold text-xs text-[#127694] uppercase tracking-tight">
                  Maintenance &amp; Health
                </span>
              </div>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                ● {overallHealth}% Stable
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mb-2">
              Predictive asset telemetry, degradation trends, and sub-zero stress.
            </p>
          </div>

          {/* Specific Asset Health Notices: G1 Base & G2 Standby */}
          <div className="my-1 space-y-2">
            {/* Generator G1 Health (Base Runner) */}
            <div className={`p-2 rounded-xl border text-xs ${
              g1Health <= 0
                ? 'bg-rose-50/90 border-rose-200 text-rose-950'
                : g1Health < 80
                ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                : 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
            }`}>
              <div className="flex items-center justify-between font-bold mb-0.5">
                <span className="flex items-center gap-1.5">
                  <i className={`fa-solid ${g1Health <= 0 ? 'fa-triangle-exclamation text-rose-600' : 'fa-gas-pump text-[#0699C6]'}`}></i>
                  Generator G1 Health: {g1Health}%
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                  g1Health <= 0
                    ? 'bg-rose-200 text-rose-800'
                    : g1Health < 80
                    ? 'bg-amber-200 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {g1Health <= 0 ? 'Fault / Offline' : g1Health >= 85 ? 'Nominal Base' : 'Service Due'}
                </span>
              </div>
              <p className="text-[10px] text-slate-600 leading-tight">
                {g1Health <= 0
                  ? 'G1 mechanical trip detected. Standby G2 auto-synchronized.'
                  : 'Primary continuous runner · Oil pressure & cooling loops nominal.'}
              </p>
            </div>

            {/* Generator G2 Health (Standby / Peaking) */}
            <div className={`p-2 rounded-xl border text-xs ${
              g2Health < 85
                ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}>
              <div className="flex items-center justify-between font-bold mb-0.5">
                <span className="flex items-center gap-1.5">
                  <i className={`fa-solid ${g2Health < 85 ? 'fa-circle-exclamation text-amber-600' : 'fa-circle-check text-emerald-600'}`}></i>
                  Generator G2 Health: {g2Health}%
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                  g2Health < 85
                    ? 'bg-amber-200/80 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {g2Health < 85 ? 'Recommended' : 'Standby Ready'}
                </span>
              </div>
              <p className="text-[10px] text-amber-800 leading-tight">
                {g2Health < 85
                  ? <>Recommended service window in <strong>36h</strong> before polar storm surge.</>
                  : 'Standby generator synced · Pre-heaters active.'}
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
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#127694] font-bold text-xs border border-[#bcecfc] transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-wrench text-xs text-[#0699C6]"></i>
              <span>VIEW MAINTENANCE</span>
            </button>
          </div>
        </div>

        {/* 3. EXTREME POLAR SCENARIO ENGINE */}
        <div className="novara-card p-4 sm:p-5 flex flex-col justify-between bg-white border border-[#bcecfc] transition">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#c2f0fe] text-[#0699C6] flex items-center justify-center font-bold text-xs">
                  <i className="fa-solid fa-flask-vial"></i>
                </div>
                <span className="font-extrabold text-xs text-[#127694] uppercase tracking-tight">
                  Extreme Polar Scenario Engine
                </span>
              </div>
              <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${activeScenario.badgeClass}`}>
                {activeScenario.severity} ● {activeScenario.name}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mb-2">
              Inject dynamic environmental &amp; physical contingencies to test automated dispatch resilience.
            </p>
          </div>

          {/* 7 Canonical Polar Scenario Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-1.5 my-1 max-h-[160px] overflow-y-auto pr-0.5">
            {SCENARIOS.map((scen) => {
              const isSelected = activeScenario.id === scen.id;
              return (
                <button
                  key={scen.id}
                  type="button"
                  onClick={() => onScenarioChange(scen.id)}
                  className={`p-1.5 rounded-lg border text-left transition flex items-center justify-between gap-1 text-[10px] ${
                    isSelected
                      ? 'border-[#0699C6] bg-[#f0faff] font-bold text-[#127694] shadow-xs ring-1 ring-[#0699C6]'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                  title={scen.cause}
                >
                  <span className="truncate flex items-center gap-1">
                    <i className={`fa-solid ${scen.icon} text-[9px] ${isSelected ? 'text-[#0699C6]' : 'text-slate-400'}`}></i>
                    <span>{scen.name}</span>
                  </span>
                  <span className={`text-[8px] px-1 py-0.2 rounded font-bold shrink-0 ${scen.badgeClass}`}>
                    {scen.tag}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Real Cause -> Effect Banner */}
          <div className="my-1.5 p-2 rounded-xl bg-slate-50 border border-slate-200 text-[10px] space-y-1">
            <div className="flex items-start gap-1.5 text-slate-700">
              <span className="font-bold text-amber-700 uppercase tracking-tight shrink-0 flex items-center gap-1">
                <i className="fa-solid fa-bolt text-[9px]"></i> Cause:
              </span>
              <span className="text-slate-600 line-clamp-1">{activeScenario.cause}</span>
            </div>
            <div className="flex items-start gap-1.5 text-slate-700">
              <span className="font-bold text-[#0699C6] uppercase tracking-tight shrink-0 flex items-center gap-1">
                <i className="fa-solid fa-arrow-right text-[9px]"></i> Effect:
              </span>
              <span className="text-slate-700 font-medium line-clamp-1">{activeScenario.effect}</span>
            </div>
            {/* Subsystem impact tags */}
            <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-200/60">
              {activeScenario.subsystems.map((sub, idx) => (
                <span
                  key={idx}
                  className="text-[8px] font-mono font-semibold px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200 shadow-2xs"
                >
                  {sub}
                </span>
              ))}
            </div>
          </div>

          {/* Action Triggers */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={onResetScenario}
              className="text-[10px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition"
            >
              <i className="fa-solid fa-rotate-left text-[9px]"></i> Reset Nominal
            </button>
            <button
              type="button"
              onClick={() => onOpenModal('manual')}
              className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-[10px] transition shadow-xs flex items-center gap-1.5"
            >
              <i className="fa-solid fa-sliders text-[10px]"></i>
              <span>Fine Sliders</span>
            </button>
          </div>
        </div>

      </div>

      {/* ROW 2: DEDICATED BASELINE VS POLAROPS EVALUATION SECTION */}
      <EvaluationSection
        stationId={stationId}
        latestData={latestData}
        onOpenModal={onOpenModal}
      />

    </div>
  );
}
