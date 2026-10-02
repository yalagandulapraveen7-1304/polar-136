import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getWsUrl, RENDER_BACKEND_URL } from '../constants/api';

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

// Generate deterministic 50-step high-resolution fallback points for offline cold-starts
function generateFallbackBuffer(stationId = 'MAITRI', count = 50) {
  const isMaitri = (stationId || 'MAITRI').toUpperCase() === 'MAITRI';
  const baseLoad = isMaitri ? 180.0 : 120.0;
  const now = Date.now();
  const buffer = [];
  for (let i = count - 1; i >= 0; i--) {
    const t = new Date(now - i * 1000);
    const timeLabel = t.toTimeString().substring(0, 8);
    const loadKw = Number((baseLoad + Math.sin((now - i * 1000) / 10000) * 8.5).toFixed(1));
    const windKw = Number((isMaitri ? 65.0 + Math.cos(i * 0.1) * 6.0 : 80.0 + Math.cos(i * 0.1) * 8.0).toFixed(1));
    const solarKw = Number((isMaitri ? 42.0 + Math.sin(i * 0.05) * 5.0 : 35.0 + Math.sin(i * 0.05) * 4.0).toFixed(1));
    const dieselKw = Number(Math.max(56.0, loadKw - windKw - solarKw).toFixed(1));
    const genKw = Number((windKw + solarKw + dieselKw).toFixed(1));
    buffer.push({
      timestamp: t.toISOString(),
      timeLabel,
      load_kw: loadKw,
      solar_kw: solarKw,
      wind_kw: windKw,
      diesel_kw: dieselKw,
      battery_kw: 12.0,
      generation_kw: genKw,
      net_balance_kw: Number((genKw - loadKw).toFixed(2)),
      soc_pct: 76.5,
      grid_freq_hz: 50.01,
      temp_c: isMaitri ? -28.4 : -18.2,
      wind_speed_ms: 12.4
    });
  }
  return buffer;
}

function loadCachedBuffer(stationId = 'MAITRI') {
  try {
    const key = `polar_telemetry_buffer_${(stationId || 'MAITRI').toUpperCase()}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 10) {
        return parsed.slice(-50);
      }
    }
  } catch (e) {}
  return generateFallbackBuffer(stationId, 50);
}

// Autonomous Client Digital Twin generator matching backend physics model
export function generateAutonomousSnapshot(stationId = 'MAITRI', prevSnapshot = null, step = 0) {
  const isMaitri = (stationId || 'MAITRI').toUpperCase() === 'MAITRI';
  const now = new Date();
  const timeStr = now.toISOString();

  // Thermodynamic & environmental state
  const hourOfDay = now.getUTCHours() + now.getUTCMinutes() / 60.0;
  const solarAngle = Math.max(0, Math.sin(((hourOfDay - 5.5) * Math.PI) / 13.0));
  const baseSolarCap = isMaitri ? 45.0 : 35.0;
  const solarKw = Number((solarAngle * baseSolarCap * (0.95 + Math.sin(step * 0.1) * 0.05)).toFixed(1));

  const baseWind = isMaitri ? 12.4 : 15.6;
  const windSpeedMs = Number(Math.max(2.5, Math.min(24.5, baseWind + Math.sin(step * 0.08) * 2.2 + Math.cos(step * 0.2) * 1.1)).toFixed(1));
  const windCap = isMaitri ? 85.0 : 120.0;
  const windKw = (windSpeedMs < 3.0 || windSpeedMs > 25.0)
    ? 0.0
    : Number(Math.min(windCap, Math.pow((windSpeedMs - 3.0) / 9.0, 2.5) * (isMaitri ? 75.0 : 105.0)).toFixed(1));

  const baseLoad = isMaitri ? 179.0 : 125.0;
  const loadKw = Number((baseLoad + Math.sin(step * 0.05) * 6.5 + Math.cos(step * 0.15) * 2.5).toFixed(1));

  const renKw = solarKw + windKw;
  const netDeficit = Math.max(0.0, loadKw - renKw);

  let p_d1 = 0.0;
  let p_d2 = 0.0;
  let batDischarge = 0.0;
  let batCharge = 0.0;

  if (netDeficit > 0) {
    if (netDeficit <= 45.0) {
      batDischarge = Number(netDeficit.toFixed(1));
      p_d1 = 0.0;
    } else {
      p_d1 = Number(Math.max(65.0, netDeficit * 0.85).toFixed(1));
      const rem = loadKw - (renKw + p_d1);
      if (rem > 0) {
        batDischarge = Number(rem.toFixed(1));
      } else {
        batCharge = Number(Math.abs(rem).toFixed(1));
      }
    }
  } else {
    batCharge = Number(Math.min(60.0, Math.abs(loadKw - renKw)).toFixed(1));
  }

  const prevSoc = prevSnapshot?.telemetry?.battery_soc_pct ?? 77.0;
  const socDelta = (batCharge * 0.0003) - (batDischarge * 0.0003);
  const nextSoc = Number(Math.max(20.0, Math.min(95.0, prevSoc + socDelta)).toFixed(2));

  const ambientTemp = Number((isMaitri ? -22.5 + Math.sin(step * 0.02) * 1.5 : -14.2 + Math.sin(step * 0.02) * 1.2).toFixed(1));
  const gridFreq = Number((50.00 + Math.sin(step * 0.3) * 0.03).toFixed(2));

  const totalGen = Number((solarKw + windKw + p_d1 + p_d2 + batDischarge).toFixed(1));
  const totalDemand = Number((loadKw + batCharge).toFixed(1));
  const netResidual = Number((totalGen - totalDemand).toFixed(2));

  const heatRecovered = Number((p_d1 * 1.20).toFixed(1));
  const heatRequired = isMaitri ? 147.5 : 110.0;

  return {
    station_id: stationId,
    timestamp: timeStr,
    clock_utc: timeStr.replace('T', ' ').substring(0, 19) + ' UTC',
    mode: 'AUTONOMOUS_TWIN',
    data_quality: 'VALID',
    telemetry: {
      station_load_kwe: loadKw,
      load_elec_kw: loadKw,
      solar_kw: solarKw,
      wind_kw: windKw,
      battery_soc_pct: nextSoc,
      battery_kw: Number((batDischarge - batCharge).toFixed(1)),
      grid_frequency_hz: gridFreq,
      ambient_temp_c: ambientTemp,
      wind_speed_ms: windSpeedMs,
      core_temp_c: -8.6
    },
    dispatch: {
      p_solar_kw: solarKw,
      p_wind_kw: windKw,
      p_diesel_1_kw: p_d1,
      p_diesel_2_kw: p_d2,
      p_battery_discharge_kw: batDischarge,
      p_battery_charge_kw: batCharge
    },
    thermal: {
      heat_recovered_kw: heatRecovered,
      heat_required_kw: heatRequired,
      chp_active: p_d1 > 0
    },
    fuel: {
      liters_consumed_hourly: Number((p_d1 * 0.26).toFixed(1)),
      sfoc_actual: 0.26,
      fuel_level_liters: 142380 - step * 0.1
    },
    microgrid: {
      curtailment: {
        curtailed_wind_kw: 0.0,
        curtailed_solar_kw: 0.0
      },
      net_balance_kw: netResidual
    },
    alerts: prevSnapshot?.alerts || { active_count: 1, items: [] },
    recommendations: prevSnapshot?.recommendations || { active_count: 2, items: [] }
  };
}

export function TelemetryProvider({ children, activeStationId = 'MAITRI', mode = 'DEMO_MODE', initialData = null }) {
  const [connectionState, setConnectionState] = useState('CONNECTING'); // CONNECTING | CONNECTED | RECONNECTING | DISCONNECTED | STALE | ERROR
  const [telemetryData, setTelemetryData] = useState(() => {
    if (initialData) return initialData;
    try {
      const st = (activeStationId || 'MAITRI').toUpperCase();
      const raw = localStorage.getItem(`polar_last_snapshot_${st}`);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  });
  const [lastPacketTime, setLastPacketTime] = useState(initialData ? Date.now() : null);
  const [staleSeconds, setStaleSeconds] = useState(0);
  const [isStale, setIsStale] = useState(false);
  const [latencyMs, setLatencyMs] = useState(12);
  const [packetCount, setPacketCount] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [telemetryBuffer, setTelemetryBuffer] = useState(() => loadCachedBuffer(activeStationId));
  const [sessionStartTime] = useState(() => Date.now());
  const [uptimeSeconds, setUptimeSeconds] = useState(0);
  const [isAutonomousTwin, setIsAutonomousTwin] = useState(false);
  const [isBackendWaking, setIsBackendWaking] = useState(false);

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const wakeTimerRef = useRef(null);
  const pingStartTsRef = useRef(null);
  const retryCountRef = useRef(0);
  const activeStationIdRef = useRef(activeStationId);
  const simStepRef = useRef(0);

  useEffect(() => {
    activeStationIdRef.current = activeStationId;
    setTelemetryBuffer(loadCachedBuffer(activeStationId));
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

  // Autonomous Client Digital Twin Heartbeat (1 Hz) when remote backend is sleeping or offline
  useEffect(() => {
    const twinTimer = setInterval(() => {
      const now = Date.now();
      const elapsedSincePacket = lastPacketTime ? (now - lastPacketTime) / 1000 : 999;
      const isLiveWsOpen = wsRef.current && wsRef.current.readyState === WebSocket.OPEN;

      if (!isLiveWsOpen || elapsedSincePacket >= 3.0) {
        setIsAutonomousTwin(true);
        simStepRef.current += 1;
        setTelemetryData((prevSnap) => {
          const snapshot = generateAutonomousSnapshot(activeStationIdRef.current, prevSnap, simStepRef.current);

          const t = snapshot.telemetry || {};
          const d = snapshot.dispatch || {};
          const genKw = (d.p_solar_kw || 0) + (d.p_wind_kw || 0) + (d.p_diesel_1_kw || 0) + (d.p_diesel_2_kw || 0) + ((d.p_battery_discharge_kw || 0) > 0 ? (d.p_battery_discharge_kw || 0) : 0);
          const loadKw = t.station_load_kwe !== undefined ? t.station_load_kwe : (t.load_elec_kw !== undefined ? t.load_elec_kw : 0);
          const point = {
            timestamp: snapshot.timestamp,
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
            const sliced = next.length > MAX_BUFFER_POINTS ? next.slice(-MAX_BUFFER_POINTS) : next;
            try {
              const st = (activeStationIdRef.current || 'MAITRI').toUpperCase();
              localStorage.setItem(`polar_telemetry_buffer_${st}`, JSON.stringify(sliced.slice(-50)));
              localStorage.setItem(`polar_last_snapshot_${st}`, JSON.stringify(snapshot));
            } catch (e) {}
            return sliced;
          });

          return snapshot;
        });

        setLastPacketTime(now);
        setIsStale(false);
        setStaleSeconds(0);
      }
    }, 1000);

    return () => clearInterval(twinTimer);
  }, [lastPacketTime]);

  // Non-blocking wake-up ping to boot sleeping container on Render
  const wakeCloudBackend = useCallback(async () => {
    try {
      setIsBackendWaking(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const pingUrl = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')
        ? `${RENDER_BACKEND_URL}/api/health`
        : '/api/health';

      const res = await fetch(pingUrl, { signal: controller.signal, mode: 'cors' }).catch(() => null);
      clearTimeout(timeoutId);
      if (res && res.ok) {
        setIsBackendWaking(false);
        if (connectWsRef.current) connectWsRef.current();
      }
    } catch (e) {
      // quiet retry
    }
  }, []);

  const connectWsRef = useRef(null);

  // Reconnection with bounded exponential backoff
  const connectWs = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = getWsUrl();

    setConnectionState((prev) => (retryCountRef.current > 0 ? 'RECONNECTING' : 'CONNECTING'));

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState('CONNECTED');
        setIsAutonomousTwin(false);
        setIsBackendWaking(false);
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
          setIsAutonomousTwin(false);
          setIsBackendWaking(false);
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
            const sliced = next.length > MAX_BUFFER_POINTS ? next.slice(-MAX_BUFFER_POINTS) : next;
            try {
              const st = (activeStationIdRef.current || 'MAITRI').toUpperCase();
              localStorage.setItem(`polar_telemetry_buffer_${st}`, JSON.stringify(sliced.slice(-50)));
            } catch (e) {}
            return sliced;
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
    isAutonomousTwin,
    isBackendWaking,
    reconnectNow: () => {
      retryCountRef.current = 0;
      wakeCloudBackend();
      connectWs();
    },
    updateTelemetrySnapshot: (freshSnapshot) => {
      setTelemetryData(freshSnapshot);
      setLastPacketTime(Date.now());
      setIsStale(false);
      try {
        const st = (activeStationIdRef.current || 'MAITRI').toUpperCase();
        localStorage.setItem(`polar_last_snapshot_${st}`, JSON.stringify(freshSnapshot));
        const t = freshSnapshot?.telemetry || {};
        const d = freshSnapshot?.dispatch || {};
        const genKw = (d.p_solar_kw || 0) + (d.p_wind_kw || 0) + (d.p_diesel_1_kw || 0) + (d.p_diesel_2_kw || 0) + ((d.p_battery_discharge_kw || 0) > 0 ? (d.p_battery_discharge_kw || 0) : 0);
        const loadKw = t.station_load_kwe !== undefined ? t.station_load_kwe : (t.load_elec_kw !== undefined ? t.load_elec_kw : 0);
        const point = {
          timestamp: freshSnapshot.timestamp || new Date().toISOString(),
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
          const sliced = next.length > MAX_BUFFER_POINTS ? next.slice(-MAX_BUFFER_POINTS) : next;
          try {
            localStorage.setItem(`polar_telemetry_buffer_${st}`, JSON.stringify(sliced.slice(-50)));
          } catch (e) {}
          return sliced;
        });
      } catch (e) {}
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
    isAutonomousTwin,
    isBackendWaking,
    connectWs,
    wakeCloudBackend
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

