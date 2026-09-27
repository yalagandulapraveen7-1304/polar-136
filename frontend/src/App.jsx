import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';
import HeroSection from './components/HeroSection';
import MetricCards from './components/MetricCards';
import PowerBalanceBanner from './components/PowerBalanceBanner';
import BottomCards from './components/BottomCards';
import ForecastFullModal from './modals/ForecastFullModal';
import DispatchModal from './modals/DispatchModal';
import CopilotModal from './modals/CopilotModal';
import MaintenanceModal from './modals/MaintenanceModal';
import ManualEntryModal from './modals/ManualEntryModal';
import MonitoringModal from './modals/MonitoringModal';
import BatteryModal from './modals/BatteryModal';
import MicrogridModal from './modals/MicrogridModal';
import WeatherModal from './modals/WeatherModal';
import AlertsModal from './modals/AlertsModal';
import { STATIONS } from './constants/stations';

export default function App() {
  const [stationId, setStationId] = useState('MAITRI');
  const [mode, setMode] = useState('DEMO_MODE');
  const [currentScenario, setCurrentScenario] = useState('normal');
  const [clockTime, setClockTime] = useState('');
  const [latestData, setLatestData] = useState(null);
  const [activeModal, setActiveModal] = useState(null); // 'forecast' | 'dispatch' | 'copilot' | 'maintenance' | 'manual' | null
  const [activeOverrides, setActiveOverrides] = useState(() => {
    try {
      const saved = localStorage.getItem('polarops_overrides');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [auditLogs, setAuditLogs] = useState([
    {
      time: '12:00:15',
      station: 'Maitri',
      action: 'LP Dispatch Active',
      reason: 'Optimal LP solution: 286 kW renewable, 76 kW battery buffer, 77 kW generator',
      tier: 'NORMAL'
    },
    {
      time: '11:58:30',
      station: 'Maitri',
      action: 'Battery Reserve Check',
      reason: 'LiFePO4 core at -8.6°C within heated thermal envelope. State of charge: 77%',
      tier: 'NORMAL'
    },
    {
      time: '11:55:00',
      station: 'Maitri',
      action: 'Telemetry Handshake',
      reason: 'FastAPI SEMS telemetry stream synchronized via satellite link',
      tier: 'NORMAL'
    }
  ]);

  const wsRef = useRef(null);
  const wsConnectedRef = useRef(false);
  const reconnectTimerRef = useRef(null);

  // 1. Live UTC Clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClockTime(now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. Fetch history / audit logs periodically
  const fetchAuditLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        if (data.audit_logs && data.audit_logs.length > 0) {
          setAuditLogs(data.audit_logs);
        }
      }
    } catch (err) {
      // quiet retry
    }
  }, []);

  useEffect(() => {
    fetchAuditLogs();
    const historyInterval = setInterval(fetchAuditLogs, 4000);
    return () => clearInterval(historyInterval);
  }, [fetchAuditLogs]);

  // 3. WebSocket Connection
  useEffect(() => {
    function connectWs() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          wsConnectedRef.current = true;
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          console.log('[WebSocket] Connected to SEMS Telemetry Stream');
        };

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            setLatestData(payload);

            // Handle Guardrail Interventions
            const g = payload.guardrail || {};
            if (g.interventions && g.interventions.length > 0) {
              const stationName = STATIONS[stationId]?.name || 'Maitri';
              const nowTime = new Date().toTimeString().substring(0, 8);
              setAuditLogs((prev) => {
                let changed = false;
                let updated = [...prev];
                g.interventions.forEach((inv) => {
                  const exists = updated.some(
                    (log) => log.action === (inv.title || inv.rule_id) && log.time === nowTime
                  );
                  if (!exists) {
                    updated.unshift({
                      time: nowTime,
                      station: stationName,
                      action: inv.title || inv.rule_id || 'Safety Interlock',
                      reason: inv.reason || 'Guardrail safety clamp triggered',
                      tier: inv.severity || 'CRITICAL'
                    });
                    changed = true;
                  }
                });
                return changed ? updated.slice(0, 35) : prev;
              });
            }
          } catch (err) {
            console.error('[WebSocket] Parse error:', err);
          }
        };

        ws.onclose = () => {
          wsConnectedRef.current = false;
          reconnectTimerRef.current = setTimeout(connectWs, 2500);
        };

        ws.onerror = () => {
          wsConnectedRef.current = false;
          if (ws) ws.close();
        };
      } catch (e) {
        reconnectTimerRef.current = setTimeout(connectWs, 3000);
      }
    }

    connectWs();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [stationId]);

  // 4. HTTP Polling Fallback
  useEffect(() => {
    const pollStatus = async () => {
      if (!wsConnectedRef.current) {
        try {
          let url = '/api/status';
          if (activeOverrides) {
            const params = new URLSearchParams();
            if (activeOverrides.battery_soc_pct !== undefined && activeOverrides.battery_soc_pct !== null) {
              params.append('override_soc', activeOverrides.battery_soc_pct);
            }
            if (activeOverrides.battery_reserve_pct !== undefined && activeOverrides.battery_reserve_pct !== null) {
              params.append('override_reserve', activeOverrides.battery_reserve_pct);
            }
            if (activeOverrides.ambient_temp_c !== undefined && activeOverrides.ambient_temp_c !== null) {
              params.append('override_temp', activeOverrides.ambient_temp_c);
            }
            if (activeOverrides.wind_speed_ms !== undefined && activeOverrides.wind_speed_ms !== null) {
              params.append('override_wind', activeOverrides.wind_speed_ms);
            }
            if (activeOverrides.load_multiplier !== undefined && activeOverrides.load_multiplier !== null) {
              params.append('override_load', activeOverrides.load_multiplier);
            }
            if (activeOverrides.fault_genset_1) params.append('fault_genset_1', 'true');
            if (activeOverrides.fault_battery_heater) params.append('fault_battery_heater', 'true');
            const qs = params.toString();
            if (qs) url += `?${qs}`;
          }
          const res = await fetch(url);
          if (res.ok) {
            const status = await res.json();
            setLatestData(status);
          }
        } catch (e) {
          // quiet retry
        }
      }
    };

    pollStatus();
    const pollInterval = setInterval(pollStatus, 2000);
    return () => clearInterval(pollInterval);
  }, [activeOverrides]);

  // 5. Handlers
  const handleStationChange = async (id) => {
    setStationId(id);
    try {
      await fetch('/api/station/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ station_id: id })
      });
      fetchAuditLogs();
    } catch (e) {
      console.warn('Switch station endpoint error:', e);
    }
  };

  const handleModeChange = async (newMode) => {
    setMode(newMode);
    try {
      await fetch('/api/mode/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode })
      });
    } catch (e) {
      console.warn('Mode switch error:', e);
    }
  };

  const handleScenarioChange = async (scenario) => {
    setCurrentScenario(scenario);
    let overridePayload = {};
    if (scenario === 'blizzard') {
      overridePayload = { ambient_temp_c: -52.0, wind_speed_ms: 34.0, load_multiplier: 1.3 };
    } else if (scenario === 'trip') {
      overridePayload = { fault_genset_1: true };
    } else if (scenario === 'night') {
      overridePayload = { solar_irradiance_wm2: 0.0, ambient_temp_c: -35.0 };
    } else if (scenario === 'dawn') {
      overridePayload = { solar_irradiance_wm2: 520.0, wind_speed_ms: 12.0 };
    }

    try {
      await fetch('/api/commander/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overridePayload)
      });
    } catch (e) {
      console.warn('Scenario override error:', e);
    }
  };

  const handleResetScenario = async () => {
    setCurrentScenario('normal');
    try {
      await fetch('/api/commander/reset', { method: 'POST' });
    } catch (e) {
      console.warn('Reset scenario error:', e);
    }
  };

  const handleApplyOverrides = async (payload) => {
    setActiveOverrides(payload);
    try {
      localStorage.setItem('polarops_overrides', JSON.stringify(payload));
    } catch (e) {}

    try {
      await fetch('/api/commander/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.warn('Commander override error:', e);
    }
  };

  const handleResetOverrides = async () => {
    setActiveOverrides(null);
    try {
      localStorage.removeItem('polarops_overrides');
    } catch (e) {}

    try {
      await fetch('/api/commander/reset', { method: 'POST' });
    } catch (e) {
      console.warn('Commander reset error:', e);
    }
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto p-3 sm:p-4 lg:p-5 flex flex-col gap-3.5 sm:gap-4 lg:gap-5">
      {/* 1. Floating Top Navigation Pill */}
      <Header
        stationId={stationId}
        onStationChange={handleStationChange}
        mode={mode}
        onModeChange={handleModeChange}
        onOpenModal={(modalName) => setActiveModal(modalName)}
        clockTime={clockTime}
      />

      {/* 2. Real-Time Operations Gauges (4 Live HUD Cards: Battery, Load, Renewables, Environment) */}
      <MetricCards
        stationId={stationId}
        latestData={latestData}
        activeOverrides={activeOverrides}
        onOpenModal={(modalName) => setActiveModal(modalName)}
      />

      {/* 2.5 Live Power Balance & Generation/Consumption Monitoring Banner (Section 3) */}
      <PowerBalanceBanner
        latestData={latestData}
        onOpenMonitoring={() => setActiveModal('monitoring')}
      />

      {/* 3. Hero Section (Alert Banner + Central POLAR AI COPILOT + 6H/12H/24H Forecast + Energy Flow Matrix) */}
      <HeroSection
        stationId={stationId}
        latestData={latestData}
        onOpenModal={(modalName) => setActiveModal(modalName)}
        activeOverrides={activeOverrides}
        currentScenario={currentScenario}
        onScenarioChange={handleScenarioChange}
      />

      {/* 4. Tactical Operations & Annual Strategic Impact KPIs */}
      <BottomCards
        latestData={latestData}
        currentScenario={currentScenario}
        onScenarioChange={handleScenarioChange}
        onResetScenario={handleResetScenario}
        onOpenModal={(modalName) => setActiveModal(modalName)}
      />

      {/* Modals */}
      <MonitoringModal
        isOpen={activeModal === 'monitoring'}
        onClose={() => setActiveModal(null)}
        latestData={latestData}
        stationId={stationId}
      />

      <BatteryModal
        isOpen={activeModal === 'battery'}
        onClose={() => setActiveModal(null)}
        latestData={latestData}
        stationId={stationId}
      />

      <MicrogridModal
        isOpen={activeModal === 'microgrid'}
        onClose={() => setActiveModal(null)}
        latestData={latestData}
        stationId={stationId}
      />

      <WeatherModal
        isOpen={activeModal === 'weather'}
        onClose={() => setActiveModal(null)}
        latestData={latestData}
        stationId={stationId}
      />

      <ForecastFullModal
        isOpen={activeModal === 'forecast'}
        onClose={() => setActiveModal(null)}
      />

      <DispatchModal
        isOpen={activeModal === 'dispatch'}
        onClose={() => setActiveModal(null)}
        latestData={latestData}
        auditLogs={auditLogs}
        stationId={stationId}
      />

      <CopilotModal
        isOpen={activeModal === 'copilot'}
        onClose={() => setActiveModal(null)}
      />

      <MaintenanceModal
        isOpen={activeModal === 'maintenance'}
        onClose={() => setActiveModal(null)}
        latestData={latestData}
      />

      <ManualEntryModal
        isOpen={activeModal === 'manual'}
        onClose={() => setActiveModal(null)}
        activeOverrides={activeOverrides}
        onApplyOverrides={handleApplyOverrides}
        onResetOverrides={handleResetOverrides}
        latestData={latestData}
        stationId={stationId}
      />

      <AlertsModal
        isOpen={activeModal === 'alerts'}
        onClose={() => setActiveModal(null)}
        latestData={latestData}
        stationId={stationId}
      />
    </div>
  );
}
