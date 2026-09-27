"""
PolarOPS - Physics Component Models (Phase 4)
High-fidelity electro-thermal physics equations for:
1. Diesel Gensets (SFOC curve, wet-stacking accumulation, jacket thermal transient).
2. Battery Energy Storage System (Arrhenius impedance, sub-zero derating, Joule heating, insulation loss).
3. Station Habitat Building Thermal Envelope (UA conductance, katabatic infiltration, CHP loop).
"""
import math
from typing import Dict, Any, Tuple
from pydantic import BaseModel, Field


class ComponentSimulationState(BaseModel):
    # Genset states
    genset_1_kw: float = 0.0
    genset_1_sfoc: float = 0.26
    genset_1_fuel_rate_lh: float = 0.0
    genset_1_block_temp_c: float = 85.0
    genset_1_wet_stacking_sec: float = 0.0
    genset_1_chp_th_kw: float = 0.0

    # BESS states
    battery_soc_pct: float = 75.0
    battery_cell_temp_c: float = 8.0
    battery_internal_r_ohm: float = 0.05
    battery_derating_factor: float = 1.0
    battery_joule_heat_w: float = 0.0
    battery_terminal_v: float = 400.0
    battery_is_locked_out: bool = False

    # Habitat states
    habitat_indoor_temp_c: float = 18.0
    habitat_heat_loss_kw: float = 65.0
    habitat_chp_recovered_kw: float = 0.0
    habitat_aux_boiler_kw: float = 0.0


class GeneratorPhysicsModel:
    """
    Physical engine dynamics for Antarctic marine diesel generators.
    Models SFOC non-linearity, wet-stacking particulate deposition, and jacket thermal mass.
    """
    def __init__(self, rated_kw: float = 100.0, initial_temp_c: float = 80.0):
        self.rated_kw = rated_kw
        self.block_temp_c = initial_temp_c
        self.wet_stacking_seconds = 0.0
        self.total_runtime_seconds = 0.0

    def step(self, p_kw: float, dt_sec: float, ambient_c: float) -> Tuple[float, float, float, float]:
        """
        Calculates fuel burn rate (L/h), CHP thermal output (kWth), block temp (°C), and wet stacking risk.
        Returns: (burn_rate_lh, chp_th_kw, block_temp_c, wet_stacking_sec)
        """
        p_clamped = max(0.0, min(self.rated_kw * 1.1, p_kw))
        is_running = p_clamped > 0.5

        if is_running:
            self.total_runtime_seconds += dt_sec
            load_ratio = max(0.05, min(1.1, p_clamped / self.rated_kw))

            # Non-linear Specific Fuel Oil Consumption (SFOC) curve
            if load_ratio < 0.30:
                sfoc = 0.36 + 0.12 * (0.30 - load_ratio)
                # Accumulate unburnt fuel & soot deposition below 30% load
                self.wet_stacking_seconds += dt_sec
            elif load_ratio < 0.70:
                sfoc = 0.28 - 0.05 * (load_ratio - 0.30)
                # Slow self-cleaning
                self.wet_stacking_seconds = max(0.0, self.wet_stacking_seconds - 0.5 * dt_sec)
            else:
                sfoc = 0.24 + 0.04 * (load_ratio - 0.70)
                # High exhaust temperature rapidly burns off soot deposits
                self.wet_stacking_seconds = max(0.0, self.wet_stacking_seconds - 2.0 * dt_sec)

            burn_rate_lh = p_clamped * sfoc
            # Combined Heat and Power (CHP) heat recovery (~1.20 kWth per kWe generated)
            chp_th_kw = p_clamped * 1.20

            # Thermal transient towards nominal +85°C operating jacket temp
            target_t = 85.0
            tau_sec = 900.0  # 15 minute warmup time constant
        else:
            burn_rate_lh = 0.0
            chp_th_kw = 0.0
            target_t = ambient_c
            tau_sec = 7200.0  # 2 hour block cooldown with winter block heater

        dT = (target_t - self.block_temp_c) * (dt_sec / tau_sec)
        self.block_temp_c = round(self.block_temp_c + dT, 2)

        return round(burn_rate_lh, 2), round(chp_th_kw, 2), self.block_temp_c, round(self.wet_stacking_seconds, 1)


class BatteryElectroThermalModel:
    """
    Sub-zero LiFePO4 battery pack model with Arrhenius internal impedance,
    temperature-dependent capacity derating, Joule internal heating, and enclosure insulation loss.
    """
    def __init__(
        self,
        capacity_kwh: float = 350.0,
        nominal_voltage_v: float = 400.0,
        initial_soc_pct: float = 75.0,
        initial_temp_c: float = 8.0,
        heater_power_kw: float = 8.0
    ):
        self.capacity_kwh = capacity_kwh
        self.nominal_v = nominal_voltage_v
        self.soc_pct = initial_soc_pct
        self.cell_temp_c = initial_temp_c
        self.heater_power_kw = heater_power_kw

        # Thermal mass: ~2500 kg cell mass * 900 J/(kg*K) = 2.25e6 J/K
        self.thermal_capacitance_j_per_k = 2.25e6
        # Thermal insulation UA value of BESS thermal enclosure (W/K)
        self.enclosure_ua_w_per_k = 42.0

    def compute_internal_resistance(self, temp_c: float) -> float:
        """
        Arrhenius temperature dependence of internal resistance:
        Impedance doubles below -10°C, and rises rapidly below -25°C.
        """
        t_kelvin = max(210.0, temp_c + 273.15)
        # R_ref = 0.045 Ohm at 298.15 K (25°C), Activation energy Ea/R ~ 2100 K
        r_ref = 0.045
        r_internal = r_ref * math.exp(2100.0 * (1.0 / t_kelvin - 1.0 / 298.15))
        return min(0.60, max(0.04, r_internal))

    def compute_derating_factor(self, temp_c: float) -> float:
        """
        Physical usable capacity and current derating factor:
        1.0 at >= 0°C; linear decline to 0.70 at -20°C; 0.20 at -34°C; 0.05 freeze lockout below -35°C.
        """
        if temp_c >= 0.0:
            return 1.0
        elif temp_c >= -20.0:
            return max(0.70, 1.0 - 0.015 * abs(temp_c))
        elif temp_c >= -35.0:
            return max(0.15, 0.70 - 0.035 * (abs(temp_c) - 20.0))
        else:
            return 0.05  # Severe sub-zero freeze lockout

    def step(
        self,
        net_power_kw: float,
        dt_sec: float,
        ambient_c: float,
        heater_active: bool = True
    ) -> Dict[str, Any]:
        """
        Simulates 1 electro-thermal time step.
        net_power_kw > 0: discharging into microgrid
        net_power_kw < 0: charging from renewables / genset
        """
        r_int = self.compute_internal_resistance(self.cell_temp_c)
        derating = self.compute_derating_factor(self.cell_temp_c)
        is_locked_out = self.cell_temp_c <= -35.0 or derating <= 0.10

        if is_locked_out and net_power_kw > 0.0:
            # Cannot safely discharge frozen cells
            actual_p_kw = 0.0
        else:
            actual_p_kw = net_power_kw

        # Open circuit voltage estimate based on SoC
        v_oc = self.nominal_v + 25.0 * (self.soc_pct / 100.0 - 0.5)

        # Terminal voltage and Current calculation: P = V_term * I => I = (V_oc - sqrt(V_oc^2 - 4*R*P)) / (2*R)
        p_watts = actual_p_kw * 1000.0
        discriminant = max(1.0, (v_oc ** 2) - 4.0 * r_int * p_watts)
        v_term = 0.5 * (v_oc + math.sqrt(discriminant))
        current_amps = p_watts / max(100.0, v_term)

        # Internal Joule heating: P_loss = I^2 * R (Watts)
        joule_heat_w = (current_amps ** 2) * r_int

        # Active heater jacket power
        heater_heat_w = 0.0
        if heater_active and self.cell_temp_c < 12.0:
            heater_heat_w = self.heater_power_kw * 1000.0

        # Thermal loss through container insulation
        insulation_loss_w = self.enclosure_ua_w_per_k * (self.cell_temp_c - ambient_c)

        # Net thermal rate of change
        net_heat_w = joule_heat_w + heater_heat_w - insulation_loss_w
        dT = (net_heat_w * dt_sec) / self.thermal_capacitance_j_per_k
        self.cell_temp_c = round(self.cell_temp_c + dT, 2)

        # Update SoC (Coulomb counting with efficiency)
        # Charging efficiency 95%, Discharging efficiency 98%
        eff = 0.98 if actual_p_kw >= 0 else 0.95
        eff_kw = actual_p_kw / eff if actual_p_kw >= 0 else actual_p_kw * eff
        dt_hours = dt_sec / 3600.0
        delta_kwh = eff_kw * dt_hours
        usable_cap_kwh = self.capacity_kwh * derating
        delta_soc = (delta_kwh / usable_cap_kwh) * 100.0

        self.soc_pct = max(2.0, min(100.0, self.soc_pct - delta_soc))

        return {
            "battery_soc_pct": round(self.soc_pct, 2),
            "battery_cell_temp_c": self.cell_temp_c,
            "battery_internal_r_ohm": round(r_int, 4),
            "battery_derating_factor": round(derating, 3),
            "battery_terminal_v": round(v_term, 1),
            "battery_joule_heat_w": round(joule_heat_w, 1),
            "battery_is_locked_out": is_locked_out,
            "actual_power_kw": round(actual_p_kw, 2)
        }


class HabitatThermalModel:
    """
    Building envelope heat loss and heating balance for Antarctic research stations.
    Calculates UA loss, katabatic wind infiltration, and CHP thermal loop supply.
    """
    def __init__(self, ua_kw_per_c: float = 1.95, target_temp_c: float = 18.0):
        self.ua_kw_per_c = ua_kw_per_c
        self.target_temp_c = target_temp_c
        self.indoor_temp_c = target_temp_c
        # Station building thermal mass ~ 35,000 kWh / deg C
        self.thermal_capacity_kwh_per_c = 15.0

    def step(
        self,
        chp_heat_kw: float,
        aux_heat_kw: float,
        ambient_c: float,
        wind_ms: float,
        dt_sec: float
    ) -> Tuple[float, float, float]:
        """
        Updates indoor temperature based on thermal losses and heating input.
        Returns: (indoor_temp_c, heat_loss_kw, heat_supplied_kw)
        """
        delta_t = max(0.0, self.indoor_temp_c - ambient_c)
        # Katabatic wind convection infiltration adds extra conductance
        wind_conductance = 0.025 * wind_ms
        total_ua = self.ua_kw_per_c + wind_conductance

        heat_loss_kw = total_ua * delta_t
        heat_supplied_kw = chp_heat_kw + aux_heat_kw

        net_kw = heat_supplied_kw - heat_loss_kw
        dt_hours = dt_sec / 3600.0
        dT = (net_kw * dt_hours) / self.thermal_capacity_kwh_per_c

        self.indoor_temp_c = round(max(-10.0, min(26.0, self.indoor_temp_c + dT)), 2)

        return self.indoor_temp_c, round(heat_loss_kw, 2), round(heat_supplied_kw, 2)
