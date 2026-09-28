import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';

const TelemetryContext = createContext(null);

const STALE_THRESHOLD_SEC = 5.0;
const MAX_BUFFER_POINTS = 60; // 60 seconds of 1 Hz telemetry
const MAX_RECONNECT_ATTEMPTS = 5;

// Plausibility bounds validation
function validatePlausibility(t) {
  if (!t) return { isPlausible: true, flags: [] };
  const flags = [];

  const freq = t.grid_frequency_hz;
  if (freq !== undefined && (freq < 45.0 || freq > 55.0)) {
    flags.push(`Frequency out of bounds: ${freq} Hz`);
  }

  const soc = t.battery_soc_pct;
  if (soc !== undefined && (soc < 0.0 || soc > 100.0)) {
    flags.push(`SoC out of bounds: ${soc}%`);
  }

  const load = t.station_load_kwe || t.load_elec_kw;
  if (load !== undefined && load < 0.0) {
    flags.push(`Negative load: ${load} kW`);
  }

  const temp = t.ambient_temp_c;
  if (temp !== undefined && (temp < -90.0 || temp > 20.0)) {
    flags.push(`Extreme ambient temp: ${temp}°C`);
  }

  return {
    isPlausible: flags.length === 0,
    flags
  };
}

export function TelemetryProvider({ children, activeStationId = 'MAITRI', mode = 'DEMO_MODE', initialData = null }) {
  const [connectionState, setConnectionState] = useState('CONNECTING'); // CONNECTING | CONNECTED | RECONNECTING | DISCONNECTED | STALE | ERROR
  const [telemetryData, setTelemetryData] = useState(initialData);
  const [lastPacketTime, setLastPacketTime] = useState(initialData ? Date.now() : null);
  const [staleSeconds, setStaleSeconds] = useState(0);
  const [isStale, setIsStale] = useState(false);
  const [latencyMs, setLatencyMs] = useState(12);
  const [packetCount, setPacketCount] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [telemetryBuffer, setTelemetryBuffer] = useState([]);
  const [sessionStartTime] = useState(() => Date.now());
  const [uptimeSeconds, setUptimeSeconds] = useState(0);

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const pingStartTsRef = useRef(null);
  const retryCountRef = useRef(0);
  const activeStationIdRef = useRef(activeStationId);

  useEffect(() => {
    activeStationIdRef.current = activeStationId;
  }, [activeStationId]);

  // Keep track of session uptime and stale status every 500ms
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setUptimeSeconds(Math.floor((now - sessionStartTime) / 1000));

      if (lastPacketTime) {
        const elapsed = (now - lastPacketTime) / 1000;
        setStaleSeconds(Math.floor(elapsed));
        const stale = elapsed >= STALE_THRESHOLD_SEC;
        setIsStale(stale);
        if (stale && connectionState === 'CONNECTED') {
          setConnectionState('STALE');
        } else if (!stale && connectionState === 'STALE') {
          setConnectionState('CONNECTED');
        }
      }
    }, 500);

    return () => clearInterval(timer);
  }, [lastPacketTime, sessionStartTime, connectionState]);

  // Reconnection with bounded exponential backoff
  const connectWs = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;

    setConnectionState((prev) => (retryCountRef.current > 0 ? 'RECONNECTING' : 'CONNECTING'));

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState('CONNECTED');
        retryCountRef.current = 0;
        setRetryCount(0);
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

        // Send an initial heartbeat
        pingStartTsRef.current = Date.now();
        try {
          ws.send(JSON.stringify({ type: 'ping', client_ts: pingStartTsRef.current }));
        } catch (e) {}
      };

      ws.onmessage = (event) => {
        try {
          if (event.data === 'pong') {
            if (pingStartTsRef.current) {
              setLatencyMs(Math.max(1, Date.now() - pingStartTsRef.current));
            }
            return;
          }

          const payload = JSON.parse(event.data);

          if (payload.type === 'pong') {
            if (payload.client_ts) {
              setLatencyMs(Math.max(1, Date.now() - payload.client_ts));
            }
            return;
          }

          // Strict Station Isolation: Discard telemetry not matching active station
          const packetStation = (payload.station_id || payload.station || '').toUpperCase();
          const targetStation = (activeStationIdRef.current || 'MAITRI').toUpperCase();
          if (packetStation && packetStation !== targetStation) {
            return;
          }

          const now = Date.now();
          setLastPacketTime(now);
          setIsStale(false);
          setStaleSeconds(0);
          setConnectionState('CONNECTED');
          setPacketCount((c) => c + 1);
          setTelemetryData(payload);

          // Update bounded ring buffer for charts (last 60 points)
          const t = payload.telemetry || {};
          const d = payload.dispatch || {};
          const genKw = (d.p_solar_kw || 0) + (d.p_wind_kw || 0) + (d.p_diesel_1_kw || 0) + (d.p_diesel_2_kw || 0) + ((d.p_battery_discharge_kw || 0) > 0 ? (d.p_battery_discharge_kw || 0) : 0);
          const loadKw = t.station_load_kwe !== undefined ? t.station_load_kwe : (t.load_elec_kw !== undefined ? t.load_elec_kw : 0);
          const point = {
            timestamp: payload.timestamp || new Date().toISOString(),
            timeLabel: new Date().toTimeString().substring(0, 8),
            load_kw: loadKw,
            solar_kw: d.p_solar_kw || t.solar_kw || 0,
            wind_kw: d.p_wind_kw || t.wind_kw || 0,
            diesel_kw: (d.p_diesel_1_kw || 0) + (d.p_diesel_2_kw || 0),
            battery_kw: (d.p_battery_discharge_kw || 0) - (d.p_battery_charge_kw || 0),
            generation_kw: genKw,
            net_balance_kw: Number((genKw - loadKw).toFixed(2)),
            soc_pct: t.battery_soc_pct !== undefined ? t.battery_soc_pct : 77.0,
            grid_freq_hz: t.grid_frequency_hz || 50.02,
            temp_c: t.ambient_temp_c !== undefined ? t.ambient_temp_c : -42.0,
            wind_speed_ms: t.wind_speed_ms !== undefined ? t.wind_speed_ms : 25.9
          };

          setTelemetryBuffer((prev) => {
            const next = [...prev, point];
            return next.length > MAX_BUFFER_POINTS ? next.slice(-MAX_BUFFER_POINTS) : next;
          });
        } catch (err) {
          console.warn('[TelemetryContext] Packet parse warning:', err);
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (retryCountRef.current < MAX_RECONNECT_ATTEMPTS) {
          retryCountRef.current += 1;
          setRetryCount(retryCountRef.current);
          setConnectionState('RECONNECTING');
          const backoffMs = Math.min(10000, 1000 * Math.pow(2, retryCountRef.current - 1));
          reconnectTimerRef.current = setTimeout(connectWs, backoffMs);
        } else {
          setConnectionState('DISCONNECTED');
        }
      };

      ws.onerror = () => {
        if (ws) ws.close();
      };
    } catch (e) {
      setConnectionState('ERROR');
    }
  }, []);

  // Heartbeat ping interval (every 5 seconds)
  useEffect(() => {
    heartbeatTimerRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        pingStartTsRef.current = Date.now();
        try {
          wsRef.current.send(JSON.stringify({ type: 'ping', client_ts: pingStartTsRef.current }));
        } catch (e) {}
      }
    }, 5000);

    return () => clearInterval(heartbeatTimerRef.current);
  }, []);

  // Initialize connection
  useEffect(() => {
    connectWs();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connectWs, activeStationId]);

  // Compute energy balance verification
  const energyBalance = useMemo(() => {
    if (!telemetryData) return null;
    const t = telemetryData.telemetry || {};
    const d = telemetryData.dispatch || {};
    const m = telemetryData.microgrid || {};

    const p_solar = Number(d.p_solar_kw ?? t.solar_kw ?? 0);
    const p_wind = Number(d.p_wind_kw ?? t.wind_kw ?? 0);
    const p_d1 = Number(d.p_diesel_1_kw ?? 0);
    const p_d2 = Number(d.p_diesel_2_kw ?? 0);
    const genTotal = p_solar + p_wind + p_d1 + p_d2;

    const batDischarge = Number(d.p_battery_discharge_kw ?? 0);
    const batCharge = Number(d.p_battery_charge_kw ?? 0);

    const loadTotal = Number(t.station_load_kwe ?? t.load_elec_kw ?? 0);
    const curtailment = Number(m.curtailment?.curtailed_wind_kw ?? 0) + Number(m.curtailment?.curtailed_solar_kw ?? 0);

    const supply = genTotal + batDischarge;
    const demand = loadTotal + batCharge + curtailment;
    const deviation = Math.round((supply - demand) * 10) / 10;
    const isBalanced = Math.abs(deviation) <= 1.5;

    return {
      supplyKw: Math.round(supply * 10) / 10,
      demandKw: Math.round(demand * 10) / 10,
      generationTotalKw: Math.round(genTotal * 10) / 10,
      batteryDischargeKw: Math.round(batDischarge * 10) / 10,
      batteryChargeKw: Math.round(batCharge * 10) / 10,
      loadTotalKw: Math.round(loadTotal * 10) / 10,
      curtailmentKw: Math.round(curtailment * 10) / 10,
      deviationKw: deviation,
      isBalanced
    };
  }, [telemetryData]);

  // Data Quality determination
  const quality = useMemo(() => {
    if (isStale) return 'STALE';
    if (connectionState === 'DISCONNECTED' || connectionState === 'ERROR') return 'INVALID';
    if (mode === 'DEMO_MODE') return 'SIMULATED';
    return telemetryData?.data_quality || 'VALID';
  }, [isStale, connectionState, mode, telemetryData]);

  // Plausibility check
  const plausibility = useMemo(() => {
    return validatePlausibility(telemetryData?.telemetry);
  }, [telemetryData]);

  // Context value
  const value = useMemo(() => ({
    connectionState,
    telemetryData,
    lastPacketTime,
    staleSeconds,
    isStale,
    latencyMs,
    packetCount,
    uptimeSeconds,
    retryCount,
    telemetryBuffer,
    quality,
    activeStationId,
    mode,
    energyBalance,
    plausibility,
    reconnectNow: () => {
      retryCountRef.current = 0;
      connectWs();
    },
    updateTelemetrySnapshot: (freshSnapshot) => {
      setTelemetryData(freshSnapshot);
      setLastPacketTime(Date.now());
      setIsStale(false);
    }
  }), [
    connectionState,
    telemetryData,
    lastPacketTime,
    staleSeconds,
    isStale,
    latencyMs,
    packetCount,
    uptimeSeconds,
    retryCount,
    telemetryBuffer,
    quality,
    activeStationId,
    mode,
    energyBalance,
    plausibility,
    connectWs
  ]);

  return (
    <TelemetryContext.Provider value={value}>
      {children}
    </TelemetryContext.Provider>
  );
}

// Custom selective subscription hooks
export function useTelemetry() {
  const ctx = useContext(TelemetryContext);
  if (!ctx) throw new Error('useTelemetry must be used within TelemetryProvider');
  return ctx;
}

export function useConnectionStatus() {
  const { connectionState, latencyMs, packetCount, uptimeSeconds, isStale, staleSeconds, quality, activeStationId, mode, reconnectNow } = useTelemetry();
  return { connectionState, latencyMs, packetCount, uptimeSeconds, isStale, staleSeconds, quality, activeStationId, mode, reconnectNow };
}

export function useBatteryTelemetry() {
  const { telemetryData, quality } = useTelemetry();
  const t = telemetryData?.telemetry || {};
  const d = telemetryData?.dispatch || {};
  const b = telemetryData?.battery_management || {};
  return {
    socPct: t.battery_soc_pct ?? 77.0,
    sohPct: b.soh_pct ?? 98.4,
    powerKw: (d.p_battery_discharge_kw || 0) - (d.p_battery_charge_kw || 0),
    temperatureC: t.battery_temp_c ?? -12.4,
    thermalState: b.state_machine_mode || (t.battery_temp_c < -20.0 ? 'COLD DERATING' : 'NORMAL'),
    flowDirection: (d.p_battery_discharge_kw || 0) > 0.5 ? 'DISCHARGING' : ((d.p_battery_charge_kw || 0) > 0.5 ? 'CHARGING' : 'IDLE'),
    quality
  };
}

export function useMicrogridTelemetry() {
  const { telemetryData, energyBalance, quality } = useTelemetry();
  const m = telemetryData?.microgrid || {};
  const t = telemetryData?.telemetry || {};
  const d = telemetryData?.dispatch || {};
  return {
    energyBalance,
    balance: m.balance || {},
    generators: m.generators || {},
    gridFrequencyHz: t.grid_frequency_hz ?? 50.02,
    busVoltageV: t.bus_voltage_v ?? 400.1,
    curtailmentKw: energyBalance?.curtailmentKw || 0,
    greenSharePct: m.balance?.green_share_pct ?? 48.5,
    spinningReserveKw: m.generators?.spinning_reserve_kw ?? 75.0,
    emergencyState: m.emergency_state || 'NORMAL',
    quality
  };
}

export function useWeatherTelemetry() {
  const { telemetryData, quality } = useTelemetry();
  const t = telemetryData?.telemetry || {};
  const w = telemetryData?.weather_intelligence || {};
  const alerts = telemetryData?.weather_alerts || [];
  return {
    temperatureC: t.ambient_temp_c ?? -28.0,
    windSpeedMs: t.wind_speed_ms ?? 14.2,
    windGustsMs: w.wind_gusts_ms ?? 18.5,
    solarIrradianceWm2: t.solar_irradiance_wm2 ?? 320.0,
    katabaticSeverity: w.katabatic_severity || (t.wind_speed_ms > 20.0 ? 'HIGH' : 'NOMINAL'),
    weatherAlerts: alerts,
    quality
  };
}

export function useDeviceTelemetry() {
  const { telemetryData, quality } = useTelemetry();
  const scada = telemetryData?.scada_monitoring || {};
  return {
    devices: scada.devices || [],
    systemHealth: scada.system_health || {},
    maintenanceIntelligence: scada.maintenance_intelligence || [],
    quality
  };
}

export function useTelemetryBuffer() {
  const { telemetryBuffer, quality } = useTelemetry();
  return {
    buffer: telemetryBuffer || [],
    quality
  };
}

