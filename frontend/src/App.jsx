import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';
import HeroSection from './components/HeroSection';
import MetricCards from './components/MetricCards';
import PowerBalanceBanner from './components/PowerBalanceBanner';
import BottomCards from './components/BottomCards';
import CriticalAlertBanner from './components/CriticalAlertBanner';
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
import DeviceMonitoringModal from './modals/DeviceMonitoringModal';
import StationComparisonModal from './modals/StationComparisonModal';
import AdvancedAnalyticsModal from './modals/AdvancedAnalyticsModal';
import RecommendationsModal from './modals/RecommendationsModal';
import DatabaseModal from './modals/DatabaseModal';
import EnergyModal from './modals/EnergyModal';
import EnvironmentModal from './modals/EnvironmentModal';
import DigitalTwinModal from './modals/DigitalTwinModal';
import ReportsModal from './modals/ReportsModal';
import { TelemetryProvider, useTelemetry } from './context/TelemetryContext';
import { STATIONS } from './constants/stations';
import { getWsUrl } from './constants/api';

export default function App() {
  const [stationId, setStationId] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlStation = params.get('station');
      if (urlStation && ['MAITRI', 'BHARATI'].includes(urlStation.toUpperCase())) {
        return urlStation.toUpperCase();
      }
      const saved = sessionStorage.getItem('polarops_station');
      if (saved && ['MAITRI', 'BHARATI'].includes(saved.toUpperCase())) {
        return saved.toUpperCase();
      }
    } catch (e) {}
    return 'MAITRI';
  });
  const [mode, setMode] = useState('DEMO_MODE');
  const [currentScenario, setCurrentScenario] = useState('normal');
  const [clockTime, setClockTime] = useState('');
  const [latestData, setLatestData] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [activeOverrides, setActiveOverrides] = useState(() => {
    try {
      const saved = localStorage.getItem('polarops_overrides');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [isG2Dispatched, setIsG2Dispatched] = useState(false);

  const handleAcceptRecommendation = useCallback(async () => {
    setIsG2Dispatched(true);
    try {
      await fetch('/api/commander/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_diesel_2_kw: 85.0 })
      });
    } catch (e) {
      console.warn('G2 dispatch override error:', e);
    }
  }, []);

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

  // Initial station sync to ensure backend context matches URL/session
  useEffect(() => {
    // Sync initial station to backend
    fetch('/api/station/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ station_id: stationId })
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.snapshot) setLatestData(data.snapshot);
      })
      .catch(() => {});

    // Sync authoritative commander overrides from backend database/state
    fetch('/api/commander/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.has_active_overrides && data.active_overrides && Object.keys(data.active_overrides).length > 0) {
          setActiveOverrides(data.active_overrides);
          try {
            localStorage.setItem('polarops_overrides', JSON.stringify(data.active_overrides));
          } catch (e) {}
        } else if (data && !data.has_active_overrides) {
          setActiveOverrides(null);
          try {
            localStorage.removeItem('polarops_overrides');
          } catch (e) {}
        }
      })
      .catch(() => {});
  }, []);

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
      const wsUrl = getWsUrl();

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

            // Synchronize active_overrides if emitted from backend
            if (payload.active_overrides !== undefined) {
              if (payload.active_overrides && Object.keys(payload.active_overrides).length > 0) {
                setActiveOverrides((prev) => {
                  const sPrev = JSON.stringify(prev || {});
                  const sNext = JSON.stringify(payload.active_overrides);
                  if (sPrev !== sNext) {
                    try {
                      localStorage.setItem('polarops_overrides', sNext);
                    } catch (e) {}
                    return payload.active_overrides;
                  }
                  return prev;
                });
              } else if (payload.active_overrides && Object.keys(payload.active_overrides).length === 0) {
                setActiveOverrides((prev) => {
                  if (prev !== null) {
                    try {
                      localStorage.removeItem('polarops_overrides');
                    } catch (e) {}
                    return null;
                  }
                  return null;
                });
              }
            }

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
            if (status.active_overrides !== undefined) {
              if (status.active_overrides && Object.keys(status.active_overrides).length > 0) {
                setActiveOverrides(status.active_overrides);
              } else if (status.active_overrides && Object.keys(status.active_overrides).length === 0) {
                setActiveOverrides(null);
              }
            }
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
    if (!id) return;
    if (id === 'COMPARE') {
      setActiveModal('comparison');
      return;
    }
    const cleanId = id.toUpperCase();
    setStationId(cleanId);
    try {
      sessionStorage.setItem('polarops_station', cleanId);
      const url = new URL(window.location);
      url.searchParams.set('station', cleanId);
      window.history.replaceState({}, '', url);
    } catch (e) {}

    try {
      const res = await fetch('/api/station/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ station_id: cleanId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.snapshot) {
          setLatestData(data.snapshot);
          fetchAuditLogs();
          return data.snapshot;
        }
      }
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
    if (!scenario || scenario.toUpperCase() === 'NORMAL') {
      await handleResetScenario();
      return;
    }

    try {
      // 1. Try modern scenario preset endpoint
      const res = await fetch('/api/scenarios/preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset_id: scenario })
      });

      if (!res.ok) {
        // Fallback to commander override for legacy strings
        let overridePayload = {};
        if (scenario === 'blizzard' || scenario === 'BLIZZARD_HIGH_WIND') {
          overridePayload = { ambient_temp_c: -36.0, wind_speed_ms: 28.5, load_multiplier: 1.3, wind_trip: true };
        } else if (scenario === 'trip' || scenario === 'GENERATOR_FAILURE') {
          overridePayload = { fault_genset_1: true };
        } else if (scenario === 'night' || scenario === 'LOW_SOLAR') {
          overridePayload = { solar_irradiance_wm2: 0.0, ambient_temp_c: -28.0 };
        } else if (scenario === 'EXTREME_COLD') {
          overridePayload = { ambient_temp_c: -45.0, load_multiplier: 1.45 };
        } else if (scenario === 'BATTERY_DEGRADATION') {
          overridePayload = { battery_soh_pct: 62.0, battery_reserve_pct: 30.0 };
        } else if (scenario === 'MICROGRID_ISOLATION') {
          overridePayload = { microgrid_isolated: true, battery_reserve_pct: 30.0 };
        }
        await fetch('/api/commander/override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(overridePayload)
        });
      }

      // Re-fetch snapshot immediately so state, telemetry, and graphs update in real time
      const statusRes = await fetch('/api/status');
      if (statusRes.ok) {
        const status = await statusRes.json();
        setLatestData(status);
      }
      fetchAuditLogs();
    } catch (e) {
      console.warn('Scenario override error:', e);
    }
  };

  const handleResetScenario = async () => {
    setCurrentScenario('NORMAL');
    try {
      await fetch('/api/scenarios/reset', { method: 'POST' });
    } catch (e) {}
    try {
      await fetch('/api/commander/reset', { method: 'POST' });
      const statusRes = await fetch('/api/status');
      if (statusRes.ok) {
        const status = await statusRes.json();
        setLatestData(status);
      }
      fetchAuditLogs();
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
    <TelemetryProvider activeStationId={stationId} mode={mode} initialData={latestData}>
      <AppDashboard
        stationId={stationId}
        onStationChange={handleStationChange}
        mode={mode}
        onModeChange={handleModeChange}
        currentScenario={currentScenario}
        onScenarioChange={handleScenarioChange}
        onResetScenario={handleResetScenario}
        clockTime={clockTime}
        activeModal={activeModal}
        setActiveModal={setActiveModal}
        activeOverrides={activeOverrides}
        onApplyOverrides={handleApplyOverrides}
        onResetOverrides={handleResetOverrides}
        auditLogs={auditLogs}
        initialLatestData={latestData}
        isG2Dispatched={isG2Dispatched}
        handleAcceptRecommendation={handleAcceptRecommendation}
      />
    </TelemetryProvider>
  );
}

function AppDashboard({
  stationId,
  onStationChange,
  mode,
  onModeChange,
  currentScenario,
  onScenarioChange,
  onResetScenario,
  clockTime,
  activeModal,
  setActiveModal,
  activeOverrides,
  onApplyOverrides,
  onResetOverrides,
  auditLogs,
  initialLatestData,
  isG2Dispatched = false,
  handleAcceptRecommendation
}) {
  const {
    telemetryData,
    connectionState,
    latencyMs,
    packetCount,
    uptimeSeconds,
    isStale,
    staleSeconds,
    quality,
    reconnectNow,
    updateTelemetrySnapshot
  } = useTelemetry();

  // Prefer stream data from central telemetry store, fallback to initial snapshot
  const latestData = telemetryData || initialLatestData;

  const handleStationSwitchWithStore = async (id) => {
    const snap = await onStationChange(id);
    if (snap && updateTelemetrySnapshot) {
      updateTelemetrySnapshot(snap);
    }
  };

  const [modalInitialTab, setModalInitialTab] = useState(null);
  const [copilotInitialQuery, setCopilotInitialQuery] = useState(null);

  const handleOpenModal = useCallback((modalName, payload = null) => {
    if (modalName === 'copilot' && typeof payload === 'string') {
      setCopilotInitialQuery(payload);
    } else {
      setModalInitialTab(payload);
    }
    setActiveModal(modalName);
  }, [setActiveModal]);

  return (
    <div className="w-full max-w-[1600px] mx-auto p-3 sm:p-4 lg:p-5 flex flex-col gap-3.5 sm:gap-4 lg:gap-5">
      {/* 1. Floating Top Navigation Pill */}
      <Header
        stationId={stationId}
        onStationChange={handleStationSwitchWithStore}
        mode={mode}
        onModeChange={onModeChange}
        onOpenModal={handleOpenModal}
        activeModal={activeModal}
        clockTime={clockTime}
        telemetryMeta={{
          connectionState,
          latencyMs,
          packetCount,
          uptimeSeconds,
          isStale,
          staleSeconds,
          quality,
          reconnectNow,
          alertCount: latestData?.alerts?.active_count || (latestData?.alerts?.items?.length || 0),
          recommendationsCount: latestData?.recommendations?.active_count ?? (latestData?.recommendations?.items?.length || 4)
        }}
      />

      {/* 1.5. Critical Renewable Deficit Alert Notification (Positioned at top right after Navbar) */}
      <CriticalAlertBanner
        stationId={stationId}
        latestData={latestData}
        activeOverrides={activeOverrides}
        currentScenario={currentScenario}
        onOpenModal={handleOpenModal}
        isG2Dispatched={isG2Dispatched}
        onAcceptRecommendation={handleAcceptRecommendation}
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

      {/* 3. Hero Section (Central POLAR AI COPILOT + 6H/12H/24H Forecast + Energy Flow Matrix) */}
      <HeroSection
        stationId={stationId}
        latestData={latestData}
        onOpenModal={handleOpenModal}
        activeOverrides={activeOverrides}
        currentScenario={currentScenario}
        onScenarioChange={onScenarioChange}
        isG2Dispatched={isG2Dispatched}
        onAcceptRecommendation={handleAcceptRecommendation}
      />

      {/* 4. Tactical Operations & Baseline vs PolarOPS Evaluation */}
      <BottomCards
        stationId={stationId}
        latestData={latestData}
        currentScenario={currentScenario}
        onScenarioChange={onScenarioChange}
        onResetScenario={onResetScenario}
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

      {/* Unified Energy Workspace (Microgrid + Dispatch + Energy Flow) */}
      <EnergyModal
        isOpen={activeModal === 'energy'}
        onClose={() => setActiveModal(null)}
        latestData={latestData}
        stationId={stationId}
        initialTab={modalInitialTab || 'balance'}
        auditLogs={auditLogs}
      />

      {/* Unified Environment Workspace (Weather + Forecast + Impacts) */}
      <EnvironmentModal
        isOpen={activeModal === 'environment'}
        onClose={() => setActiveModal(null)}
        latestData={latestData}
        stationId={stationId}
        initialTab={modalInitialTab || 'current'}
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
        stationId={stationId}
        onOpenModal={handleOpenModal}
        latestData={latestData}
        activeOverrides={activeOverrides}
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
        onClose={() => {
          setActiveModal(null);
          setCopilotInitialQuery(null);
        }}
        stationId={stationId}
        latestData={latestData}
        onOpenModal={handleOpenModal}
        initialQuery={copilotInitialQuery}
        onAcceptRecommendation={handleAcceptRecommendation}
        updateTelemetrySnapshot={updateTelemetrySnapshot}
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
        onApplyOverrides={onApplyOverrides}
        onResetOverrides={onResetOverrides}
        latestData={latestData}
        stationId={stationId}
      />

      <AlertsModal
        isOpen={activeModal === 'alerts'}
        onClose={() => setActiveModal(null)}
        latestData={latestData}
        stationId={stationId}
      />

      <DeviceMonitoringModal
        isOpen={activeModal === 'devices'}
        onClose={() => setActiveModal(null)}
        latestData={latestData}
        stationId={stationId}
      />

      <StationComparisonModal
        isOpen={activeModal === 'comparison'}
        onClose={() => setActiveModal(null)}
        onSelectStation={(id) => {
          handleStationSwitchWithStore(id);
          setActiveModal(null);
        }}
        activeStationId={stationId}
      />

      <AdvancedAnalyticsModal
        isOpen={activeModal === 'analytics'}
        onClose={() => setActiveModal(null)}
        stationId={stationId}
        latestData={latestData}
      />

      <RecommendationsModal
        isOpen={activeModal === 'recommendations'}
        onClose={() => setActiveModal(null)}
        stationId={stationId}
        latestData={latestData}
      />

      <DatabaseModal
        isOpen={activeModal === 'database'}
        onClose={() => setActiveModal(null)}
        stationId={stationId}
        latestData={latestData}
      />

      {/* Feature 2: Digital Twin Workspace Modal */}
      <DigitalTwinModal
        isOpen={activeModal === 'digital_twin'}
        onClose={() => setActiveModal(null)}
        latestData={latestData}
        stationId={stationId}
        onOpenModal={handleOpenModal}
      />

      {/* Feature 5: Export Reports Workspace Modal */}
      <ReportsModal
        isOpen={activeModal === 'reports'}
        onClose={() => setActiveModal(null)}
        stationId={stationId}
        latestData={latestData}
        auditLogs={auditLogs}
      />
    </div>
  );
}
