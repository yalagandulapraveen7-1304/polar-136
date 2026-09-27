"""
PolarOPS - Polar-Aware Battery Management and Storage Sizing System (Section 4)
Implements:
1. Electro-Thermal Battery Modeling (Arrhenius impedance, sub-zero derating, Joule heating).
2. Polar Temperature Derating State Machine (NORMAL -> COLD DERATING -> RESTRICTED -> LOCKOUT).
3. 20% Inviolable Emergency Reserve Floor & Alert Coordination.
4. Charge / Discharge Exclusivity (udis + uchg <= 1).
5. Renewable Energy Storage & Curtailment Accounting (Excess vs Inverter Limit vs Curtailed).
6. Inverter Bottleneck Analysis (Project A insight: Configs A, B, C, D and Limiting Factor detection).
7. Historical Storage Analytics (24H | 7D | 30D | 12M).
"""
import os
import csv
import math
import datetime
from typing import Dict, Any, List, Optional
import numpy as np

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")


class PolarBatteryManager:
    """
    Comprehensive battery storage supervisor for polar microgrids.
    Combines real-time electro-thermal physics with annual sizing and inverter bottleneck analytics.
    """

    def __init__(
        self,
        nominal_capacity_kwh: float = 400.0,
        nominal_inverter_kw: float = 80.0,
        reserve_floor_pct: float = 20.0,
        max_soc_pct: float = 95.0,
        initial_soc_pct: float = 77.0,
        initial_cell_temp_c: float = -12.4
    ):
        self.nominal_capacity_kwh = nominal_capacity_kwh
        self.nominal_inverter_kw = nominal_inverter_kw
        self.reserve_floor_pct = reserve_floor_pct
        self.max_soc_pct = max_soc_pct
        self.soh_pct = 91.4

        self.current_soc_pct = initial_soc_pct
        self.current_cell_temp_c = initial_cell_temp_c
        self.temp_override_c: Optional[float] = None

        # Heating jacket: 8 kW thermal jacket around BESS insulation enclosure
        self.heating_jacket_active = True
        self.heating_jacket_power_kw = 8.0

        # Self-discharge: 0.05% per day
        self.daily_self_discharge_pct = 0.05

        # Pre-seed 60-second telemetry history
        self.soc_history: List[float] = [77.5, 77.4, 77.2, 77.1, 77.0, 77.0, 77.0]

    def set_cell_temperature_override(self, temp_c: float):
        """Allows testing cold derating (-25C) and freeze lockout (-36C) interactively"""
        self.temp_override_c = float(temp_c)

    def reset_cell_temperature(self):
        """Restores nominal thermal envelope"""
        self.temp_override_c = None

    def get_effective_cell_temp(self) -> float:
        return self.temp_override_c if self.temp_override_c is not None else self.current_cell_temp_c

    def compute_derating_factor(self, temp_c: float) -> float:
        """
        Antarctic Temperature Derating Curve:
        T >= 0C: 1.0 (Full 100% capacity)
        0C > T >= -20C: Mild derating (1.0 to 0.70)
        -20C > T >= -34.9C: Progressive restriction (0.70 to 0.15)
        T <= -35C: Severe sub-zero freeze lockout (0.05, discharge prohibited)
        """
        if temp_c >= 0.0:
            return 1.0
        elif temp_c >= -20.0:
            return round(max(0.70, 1.0 - 0.015 * abs(temp_c)), 3)
        elif temp_c > -35.0:
            # -20C to -35C: drops from 0.70 down to 0.15
            delta = abs(temp_c) - 20.0
            return round(max(0.15, 0.70 - 0.0366 * delta), 3)
        else:
            return 0.05

    def determine_safety_state(self, temp_c: float) -> Dict[str, str]:
        """
        Battery Safety State Machine:
        NORMAL -> COLD DERATING -> RESTRICTED -> LOCKOUT
        """
        if temp_c <= -35.0:
            return {
                "state": "LOCKOUT",
                "label": "LOCKOUT (FREEZE PROTECTION)",
                "color": "rose",
                "severity": "CRITICAL",
                "description": "Cell temperature <= -35C. Battery discharge prohibited to prevent irreversible lithium plating and cathode destruction. Heating jacket running at max 8 kW."
            }
        elif temp_c <= -28.0:
            return {
                "state": "RESTRICTED",
                "label": "RESTRICTED OPERATION",
                "color": "orange",
                "severity": "WARNING",
                "description": "Cell temperature between -28C and -35C. Usable capacity and C-rate heavily restricted. Charge current clamped to prevent cell degradation."
            }
        elif temp_c <= -20.0:
            return {
                "state": "COLD_DERATING",
                "label": "COLD DERATING ACTIVE",
                "color": "amber",
                "severity": "MODERATE",
                "description": "Cell temperature below -20C. Sub-zero derating active. Discharge capability reduced to 70% of nominal rating."
            }
        else:
            return {
                "state": "NORMAL",
                "label": "SAFE / NOMINAL",
                "color": "emerald",
                "severity": "NORMAL",
                "description": "Cell temperature within safe operating envelope (-20C to +25C). Full charge and discharge envelope permitted."
            }

    def compute_internal_resistance(self, temp_c: float) -> float:
        """Arrhenius impedance temperature dependence (Ohms)"""
        t_kelvin = max(210.0, temp_c + 273.15)
        r_ref = 0.045
        r_internal = r_ref * math.exp(2100.0 * (1.0 / t_kelvin - 1.0 / 298.15))
        return round(min(0.65, max(0.045, r_internal)), 4)

    def get_realtime_battery_status(
        self,
        telemetry: Optional[Dict[str, Any]] = None,
        dispatch: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Answers: 'Can the battery safely operate right now?'
        Returns complete electro-thermal state, derated limits, emergency reserve, and MILP mode.
        """
        t = telemetry or {}
        d = dispatch or {}

        # 1. State of Charge and Temperature
        soc = float(t.get("battery_soc_pct", self.current_soc_pct))
        cell_temp = self.get_effective_cell_temp()

        # 2. Temperature Derating and Safety State Machine
        derating_factor = self.compute_derating_factor(cell_temp)
        safety_machine = self.determine_safety_state(cell_temp)
        is_locked_out = safety_machine["state"] == "LOCKOUT"

        # 3. Capacity & Energy Calculations
        nominal_cap = self.nominal_capacity_kwh
        available_cap = round(nominal_cap * derating_factor, 1)
        current_stored_energy = round((soc / 100.0) * available_cap, 1)

        # 20% Protected Reserve Floor
        reserve_energy_kwh = round((self.reserve_floor_pct / 100.0) * available_cap, 1)
        usable_energy_above_reserve = max(0.0, round(current_stored_energy - reserve_energy_kwh, 1))

        # 4. Derated Power Limits
        # At nominal rating: 80 kW charge limit, 120 kW max peak discharge
        nominal_chg_limit = self.nominal_inverter_kw  # 80 kW
        nominal_disch_limit = 120.0  # 120 kW inverter peak

        if is_locked_out:
            max_discharge_kw = 0.0
            max_charge_kw = round(nominal_chg_limit * 0.15, 1)  # slow trickle heating only
        else:
            max_discharge_kw = round(nominal_disch_limit * derating_factor, 1)
            max_charge_kw = round(nominal_chg_limit * derating_factor, 1)

        # 5. Current Power Flow & Exclusivity (udis + uchg <= 1)
        raw_disch = float(d.get("p_battery_discharge_kw", 42.0))
        raw_chg = float(d.get("p_battery_charge_kw", 0.0))

        if is_locked_out:
            disch_kw = 0.0
            chg_kw = 0.0
            u_dis = 0
            u_chg = 0
            optimizer_mode = "PROTECT / LOCKOUT"
        elif raw_chg > 0.5:
            disch_kw = 0.0
            chg_kw = min(max_charge_kw, raw_chg)
            u_dis = 0
            u_chg = 1
            optimizer_mode = "CHARGE"
        elif raw_disch > 0.5:
            disch_kw = min(max_discharge_kw, raw_disch)
            chg_kw = 0.0
            u_dis = 1
            u_chg = 0
            optimizer_mode = "DISCHARGE"
        else:
            disch_kw = 0.0
            chg_kw = 0.0
            u_dis = 0
            u_chg = 0
            optimizer_mode = "HOLD"

        # Exclusivity check assertion: u_dis + u_chg <= 1
        assert (u_dis + u_chg) <= 1, "Battery charge/discharge exclusivity violated!"

        # 6. Emergency Reserve Status
        soc_margin_above_floor = round(soc - self.reserve_floor_pct, 1)
        if soc <= self.reserve_floor_pct:
            reserve_status = "CRITICAL_BREACH"
            reserve_label = "20% RESERVE FLOOR BREACHED"
            reserve_color = "rose"
        elif soc <= (self.reserve_floor_pct + 5.0):
            reserve_status = "LOW_RESERVE_WARNING"
            reserve_label = f"LOW RESERVE ({soc_margin_above_floor}% margin)"
            reserve_color = "amber"
        else:
            reserve_status = "SAFE"
            reserve_label = f"RESERVE SAFE (+{soc_margin_above_floor}% buffer)"
            reserve_color = "emerald"

        # 7. Internal Impedance & Joule Heating
        r_internal = self.compute_internal_resistance(cell_temp)
        net_kw = disch_kw - chg_kw
        est_current_a = (abs(net_kw) * 1000.0) / 480.0
        joule_heat_kw = round((est_current_a ** 2 * r_internal) / 1000.0, 2)

        return {
            "state_of_charge_pct": round(soc, 1),
            "state_of_health_pct": self.soh_pct,
            "cell_temperature_c": round(cell_temp, 1),
            "is_temperature_overridden": self.temp_override_c is not None,
            "internal_resistance_ohm": r_internal,
            "joule_heating_kw": joule_heat_kw,
            "capacities": {
                "nominal_capacity_kwh": nominal_cap,
                "derating_factor": derating_factor,
                "available_capacity_kwh": available_cap,
                "current_stored_kwh": current_stored_energy,
                "reserve_floor_pct": self.reserve_floor_pct,
                "reserve_floor_kwh": reserve_energy_kwh,
                "usable_energy_above_reserve_kwh": usable_energy_above_reserve,
                "usable_storage_fraction_pct": round((usable_energy_above_reserve / nominal_cap) * 100.0, 1)
            },
            "power_limits": {
                "nominal_inverter_kw": self.nominal_inverter_kw,
                "max_charge_kw": max_charge_kw,
                "max_discharge_kw": max_discharge_kw,
                "current_charge_kw": round(chg_kw, 1),
                "current_discharge_kw": round(disch_kw, 1),
                "net_flow_kw": round(disch_kw - chg_kw, 1),
                "binary_u_dis": u_dis,
                "binary_u_chg": u_chg,
                "exclusivity_satisfied": (u_dis + u_chg) <= 1
            },
            "safety_state_machine": safety_machine,
            "emergency_reserve": {
                "status": reserve_status,
                "label": reserve_label,
                "color": reserve_color,
                "margin_pct": soc_margin_above_floor,
                "available_emergency_kwh": usable_energy_above_reserve,
                "low_reserve_alert": soc <= (self.reserve_floor_pct + 5.0)
            },
            "milp_mode": optimizer_mode,
            "thermal_management": {
                "heating_jacket_active": self.heating_jacket_active,
                "heating_power_kw": self.heating_jacket_power_kw,
                "enclosure_ua_w_per_k": 42.0,
                "ambient_temp_c": float(t.get("ambient_temp_c", -42.0))
            }
        }

    def evaluate_inverter_bottlenecks(self) -> Dict[str, Any]:
        """
        Answers: 'Is the battery correctly sized for the station?'
        Implements Project A's core engineering insight:
        Increasing battery capacity does not increase savings if inverter power is the bottleneck.
        Evaluates Configurations A, B, C, D across annual savings, curtailment, payback, and winter resilience.
        """
        # Baseline annual diesel reference: 471,631 L ($1,414,893 USD at $3.00/L)
        configurations = [
            {
                "config_id": "CONFIG_A",
                "name": "Battery A (Current Baseline)",
                "battery_kwh": 400.0,
                "inverter_kw": 80.0,
                "usable_energy_kwh": 286.0,
                "peak_discharge_kw": 80.0,
                "annual_savings_usd": 356982.0,
                "fuel_saved_l": 118994.0,
                "diesel_reduction_pct": 25.2,
                "renewable_utilization_pct": 68.2,
                "curtailment_kwh": 41280.0,
                "battery_utilization_pct": 74.5,
                "capex_cost_usd": 240000.0,
                "payback_years": 0.67,
                "winter_resilience_score": 82,
                "limiting_factor": "BALANCED_ENTRY",
                "limiting_factor_label": "Balanced Entry Baseline",
                "limiting_factor_badge": "bg-slate-100 text-slate-700",
                "analysis_note": "Standard polar station deployment. 80 kW inverter comfortably covers nominal nighttime life-support load."
            },
            {
                "config_id": "CONFIG_B",
                "name": "Battery B (Energy Expanded Only)",
                "battery_kwh": 600.0,
                "inverter_kw": 80.0,
                "usable_energy_kwh": 429.0,
                "peak_discharge_kw": 80.0,
                "annual_savings_usd": 357143.0,
                "fuel_saved_l": 119048.0,
                "diesel_reduction_pct": 25.2,
                "renewable_utilization_pct": 68.3,
                "curtailment_kwh": 39820.0,
                "battery_utilization_pct": 49.2,
                "capex_cost_usd": 360000.0,
                "payback_years": 1.01,
                "winter_resilience_score": 85,
                "limiting_factor": "POWER_INVERTER_BOTTLENECK",
                "limiting_factor_label": "POWER / INVERTER BOTTLENECK",
                "limiting_factor_badge": "bg-rose-100 text-rose-800 border border-rose-300 font-black",
                "analysis_note": "CRITICAL BOTTLENECK: Adding +200 kWh battery capacity without upgrading the 80 kW inverter yields only +54 L ($161 USD) in annual savings! Inverter limits peak renewable absorption and blizzard peak shaving."
            },
            {
                "config_id": "CONFIG_C",
                "name": "Battery C (Inverter Power Expanded)",
                "battery_kwh": 400.0,
                "inverter_kw": 120.0,
                "usable_energy_kwh": 286.0,
                "peak_discharge_kw": 120.0,
                "annual_savings_usd": 408250.0,
                "fuel_saved_l": 136083.0,
                "diesel_reduction_pct": 28.9,
                "renewable_utilization_pct": 74.8,
                "curtailment_kwh": 22150.0,
                "battery_utilization_pct": 88.6,
                "capex_cost_usd": 275000.0,
                "payback_years": 0.67,
                "winter_resilience_score": 91,
                "limiting_factor": "ENERGY_CAPACITY_LIMIT",
                "limiting_factor_label": "ENERGY CAPACITY LIMIT",
                "limiting_factor_badge": "bg-amber-100 text-amber-800 border border-amber-300 font-bold",
                "analysis_note": "HIGH ROI: Upgrading inverter to 120 kW allows full absorption of katabatic wind gusts up to 120 kW and shaves peak blizzard loads, saving an additional 17,089 L of fuel ($51K USD)."
            },
            {
                "config_id": "CONFIG_D",
                "name": "Battery D (Optimal Co-Expansion)",
                "battery_kwh": 600.0,
                "inverter_kw": 120.0,
                "usable_energy_kwh": 429.0,
                "peak_discharge_kw": 120.0,
                "annual_savings_usd": 435600.0,
                "fuel_saved_l": 145200.0,
                "diesel_reduction_pct": 30.8,
                "renewable_utilization_pct": 79.4,
                "curtailment_kwh": 14200.0,
                "battery_utilization_pct": 78.0,
                "capex_cost_usd": 395000.0,
                "payback_years": 0.91,
                "winter_resilience_score": 98,
                "limiting_factor": "OPTIMAL_CO_EXPANDED",
                "limiting_factor_label": "Optimal Co-Expanded System",
                "limiting_factor_badge": "bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold",
                "analysis_note": "MAXIMUM RESILIENCE: Co-expanding storage to 600 kWh alongside a 120 kW inverter achieves 30.8% diesel reduction and 98/100 winter resilience, surviving 48h blackout without gensets."
            }
        ]

        return {
            "configurations": configurations,
            "key_engineering_takeaway": (
                "Increasing battery capacity alone (Config B) produces negligible return (+0.04% fuel saved) "
                "because the 80 kW inverter restricts discharge power. Upgrading inverter power (Config C) "
                "unlocks an additional $51,268/yr by eliminating renewable curtailment and enabling peak shaving."
            ),
            "recommendation_summary": {
                "preferred_upgrade": "CONFIG_C (400 kWh + 120 kW Inverter)",
                "marginal_capex": "$35,000 USD",
                "marginal_annual_savings": "$51,268 USD/yr",
                "payback_on_upgrade": "0.68 Years"
            }
        }

    def get_renewable_storage_accounting(
        self,
        renewable_gen_kw: float = 420.0,
        station_demand_kw: float = 300.0
    ) -> Dict[str, Any]:
        """
        Implements Section 4.F:
        When excess renewable = 120 kW, and battery available is 80 kW:
        Stores 80 kW into battery, and identifies remaining 40 kW as CURTAILED RENEWABLE ENERGY.
        """
        excess_kw = max(0.0, renewable_gen_kw - station_demand_kw)
        cell_temp = self.get_effective_cell_temp()
        derating = self.compute_derating_factor(cell_temp)
        chg_limit = round(self.nominal_inverter_kw * derating, 1)

        stored_kw = min(excess_kw, chg_limit)
        curtailed_kw = round(max(0.0, excess_kw - stored_kw), 1)

        return {
            "renewable_generation_kw": round(renewable_gen_kw, 1),
            "station_demand_kw": round(station_demand_kw, 1),
            "excess_renewable_kw": round(excess_kw, 1),
            "battery_charging_capacity_kw": chg_limit,
            "battery_energy_stored_kw": round(stored_kw, 1),
            "curtailed_renewable_energy_kw": curtailed_kw,
            "curtailment_pct": round((curtailed_kw / excess_kw * 100.0), 1) if excess_kw > 0 else 0.0,
            "root_cause": "Inverter Power Bottleneck (80 kW Clamp)" if curtailed_kw > 0 else "None (100% Stored)"
        }

    def get_historical_battery_analytics(self, time_range: str = "24H") -> Dict[str, Any]:
        """
        Historical battery analytics for 24H | 7D | 30D | 12M.
        Grounded in Project A's 8,760h polar simulation.
        """
        r = time_range.upper().strip()
        hours_map = {"24H": 24, "7D": 168, "30D": 720, "12M": 8760}
        num_hours = hours_map.get(r, 24)

        # Baseline stats derived from 8,760h run
        if num_hours == 24:
            efc = 0.8
            chg_cycles = 1
            disch_cycles = 1
            throughput_kwh = 312.0
            hours_cold_derating = 0.0
            hours_lockout = 0.0
            curtailed_kwh = 12.0
            stored_kwh = 186.0
            peak_shaving_kw = 48.0
            timeline = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"]
            soc_curve = [76, 74, 78, 85, 80, 77]
        elif num_hours == 168:
            efc = 5.2
            chg_cycles = 7
            disch_cycles = 7
            throughput_kwh = 2140.0
            hours_cold_derating = 14.5
            hours_lockout = 0.0
            curtailed_kwh = 94.0
            stored_kwh = 1240.0
            peak_shaving_kw = 55.0
            timeline = [f"D{i+1}" for i in range(7)]
            soc_curve = [76, 75, 78, 72, 79, 81, 77]
        elif num_hours == 720:
            efc = 18.4
            chg_cycles = 30
            disch_cycles = 30
            throughput_kwh = 7620.0
            hours_cold_derating = 62.0
            hours_lockout = 3.5
            curtailed_kwh = 410.0
            stored_kwh = 4800.0
            peak_shaving_kw = 62.0
            timeline = [f"Wk {i+1}" for i in range(4)]
            soc_curve = [76, 74, 78, 77]
        else:
            # 12 Months Polar Cycle
            efc = 93.3
            chg_cycles = 365
            disch_cycles = 365
            throughput_kwh = 37320.0
            hours_cold_derating = 428.0
            hours_lockout = 18.0
            curtailed_kwh = 41280.0
            stored_kwh = 52400.0
            peak_shaving_kw = 80.0
            timeline = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            soc_curve = [82, 80, 75, 68, 62, 58, 60, 64, 70, 78, 84, 85]

        return {
            "range": r,
            "hours": num_hours,
            "timeline_labels": timeline,
            "soc_curve": soc_curve,
            "reserve_floor_pct": self.reserve_floor_pct,
            "equivalent_full_cycles": efc,
            "charge_cycles_count": chg_cycles,
            "discharge_cycles_count": disch_cycles,
            "energy_throughput_kwh": throughput_kwh,
            "thermal_exposure": {
                "hours_in_cold_derating": hours_cold_derating,
                "hours_in_lockout": hours_lockout,
                "heating_jacket_kwh_consumed": round(hours_cold_derating * 8.0, 1)
            },
            "renewable_integration": {
                "stored_renewable_kwh": stored_kwh,
                "curtailed_renewable_kwh": curtailed_kwh,
                "peak_shaving_contribution_kw": peak_shaving_kw
            }
        }
