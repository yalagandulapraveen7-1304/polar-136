import React, { useState, useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { STATIONS } from '../constants/stations';

export default function DeviceMonitoringModal({
  isOpen,
  onClose,
  latestData,
  stationId = 'MAITRI'
}) {
  const [selectedDevice, setSelectedDevice] = useState(null); // Device object for Detail View modal
  const [trendMetric, setTrendMetric] = useState('power'); // 'power' | 'rpm' | 'temp' | 'vibration' | 'fuel'
  const [trendDevice, setTrendDevice] = useState('DG-1'); // 'DG-1' | 'DG-2' | 'BESS-1' | 'WIND-1' | 'SOLAR-1'
  const [trendRange, setTrendRange] = useState('15M'); // '5M' | '15M' | '1H' | '24H' | '7D' | '30D'
  const [analyticsRange, setAnalyticsRange] = useState('7D'); // '24H' | '7D' | '30D' | '12M'
  const [historicalAnalytics, setHistoricalAnalytics] = useState(null);
  const [isCellExpanded, setIsCellExpanded] = useState(false);
  const [detailTab, setDetailTab] = useState('overview'); // 'overview' | 'telemetry' | 'trends' | 'alerts' | 'maintenance' | 'history'

  const chartCanvasRef = useRef(null);
  const chartInstanceRef = useRef(null);

  const currentStation = STATIONS[stationId] || STATIONS.MAITRI;
  const scada = latestData?.scada_monitoring || {};
  const sysHealth = scada.system_health || {};
  const gen = scada.generation || {};
  const dg1 = gen.generator_1 || {};
  const dg2 = gen.generator_2 || {};
  const wind = gen.wind_turbine || {};
  const solar = gen.solar_pv || {};
  const bess = scada.storage?.battery || {};
  const loads = scada.loads || { groups: [] };
  const maintenanceList = scada.maintenance_intelligence || [];
  const telemetryState = scada.telemetry_state || (latestData?.telemetry?.mode === 'SCADA_MODE' ? 'LIVE' : 'SIMULATION');

  // Fetch long-term equipment analytics on range change
  useEffect(() => {
    if (!isOpen) return;
    const fetchAnalytics = async () => {
      try {
        const res = await fetch(`/api/scada/analytics?range=${analyticsRange}`);
        if (res.ok) {
          setHistoricalAnalytics(await res.json());
        }
      } catch (e) {
        console.warn('Analytics fetch error:', e);
      }
    };
    fetchAnalytics();
  }, [isOpen, analyticsRange]);

  // Rolling Trend Chart management
  useEffect(() => {
    if (!isOpen || !chartCanvasRef.current) return;

    let isMounted = true;
    const fetchTrendData = async () => {
      try {
        const res = await fetch(`/api/scada/trends?device=${trendDevice}&metric=${trendMetric}&range=${trendRange}`);
        if (res.ok && isMounted) {
          const trendJson = await res.json();
          renderTrendChart(trendJson);
        }
      } catch (e) {
        console.warn('Trend fetch error:', e);
      }
    };

    fetchTrendData();
    const interval = setInterval(fetchTrendData, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [isOpen, trendDevice, trendMetric, trendRange]);

  const renderTrendChart = (trendData) => {
    if (!chartCanvasRef.current) return;
    const ctx = chartCanvasRef.current.getContext('2d');
    if (!ctx) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, 'rgba(6, 153, 198, 0.25)');
    gradient.addColorStop(1, 'rgba(6, 153, 198, 0.0)');

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: trendData.labels || [],
        datasets: [{
          label: `${trendData.metric_title} (${trendData.units})`,
          data: trendData.values || [],
          borderColor: '#0699C6',
          backgroundColor: gradient,
          borderWidth: 2.2,
          fill: true,
          tension: 0.35,
          pointRadius: trendData.values?.length > 40 ? 0 : 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#127694'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: '#0f172a',
            titleColor: '#e2e8f0',
            bodyColor: '#38bdf8',
            borderColor: '#334155',
            borderWidth: 1,
            callbacks: {
              label: (item) => ` ${item.dataset.label}: ${item.parsed.y} ${trendData.units}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#64748b',
              font: { size: 9, family: 'monospace' },
              maxTicksLimit: 8
            }
          },
          y: {
            grid: { color: 'rgba(226, 232, 240, 0.6)' },
            ticks: {
              color: '#64748b',
              font: { size: 10, family: 'monospace' }
            }
          }
        }
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-7xl max-h-[94vh] flex flex-col rounded-2xl bg-white border border-[#bcecfc] shadow-2xl shadow-cyan-950/40 text-slate-800 overflow-hidden font-sans">

        {/* 1. TOP STATUS BAR (Section 5) */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#bcecfc]/70 bg-gradient-to-r from-[#f0faff] via-white to-[#f0faff] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0699C6] to-[#127694] text-white flex items-center justify-center shadow-md shadow-cyan-900/30">
              <i className="fa-solid fa-server text-base text-white"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-[#127694] uppercase">
                  SCADA Device Monitoring
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-[#e5f6fd] text-[#127694] border border-[#bcecfc]">
                  PLC Register Level
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-cyan-500/10 text-[#0699C6] border border-cyan-500/20">
                  {currentStation.name}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                1 Hz Real-Time Telemetry · Calculated Equipment Health · Digital Twin Residuals · Maintenance Intelligence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Top Status Indicators */}
            <div className="hidden md:flex items-center gap-4 px-4 py-1.5 rounded-xl bg-white border border-[#bcecfc] shadow-xs text-xs">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase font-bold text-slate-400">System</span>
                <span className="font-extrabold text-emerald-700 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  {sysHealth.overall_status || 'NORMAL'}
                </span>
              </div>
              <div className="w-px h-6 bg-slate-200"></div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase font-bold text-slate-400">Devices</span>
                <span className="font-bold text-[#127694] font-mono">
                  {sysHealth.devices_online_text || '6 / 6 ONLINE'}
                </span>
              </div>
              <div className="w-px h-6 bg-slate-200"></div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase font-bold text-slate-400">Telemetry</span>
                <span className={`font-bold flex items-center gap-1 ${
                  telemetryState === 'LIVE' ? 'text-emerald-700' : 'text-amber-700'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    telemetryState === 'LIVE' ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}></span>
                  {telemetryState === 'LIVE' ? 'LIVE' : 'SIMULATION'}
                </span>
              </div>
              <div className="w-px h-6 bg-slate-200"></div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase font-bold text-slate-400">Last Update</span>
                <span className="font-mono text-slate-700 font-semibold">
                  {scada.last_update_seconds_ago !== undefined ? `${scada.last_update_seconds_ago}s ago` : '1.0s ago'}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition border border-slate-200"
              title="Close SCADA Device Monitor"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        </div>

        {/* SCROLLABLE MAIN BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* 2. SYSTEM HEALTH SUMMARY (Section 6) */}
          <section className="rounded-xl p-4 bg-gradient-to-br from-[#f0faff] to-white border border-[#bcecfc] shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#bcecfc]/50 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#127694] uppercase tracking-wider">
                  <i className="fa-solid fa-heart-pulse mr-1 text-[#0699C6]"></i> System Health Summary
                </span>
                <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                  SCADA Supervisory Layer
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="text-emerald-700 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  {sysHealth.devices_online_count || 6} / {sysHealth.total_devices_count || 6} Devices Online
                </span>
                <span className={`px-2.5 py-0.5 rounded-full border ${
                  (sysHealth.critical_issues_count || 0) === 0 ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-rose-100 text-rose-800 border-rose-300'
                }`}>
                  {sysHealth.critical_issues_count || 0} Critical Issues
                </span>
                <span className="bg-amber-50 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200">
                  {sysHealth.warning_issues_count || 0} Warnings
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Generator Health</div>
                  <div className="text-sm font-extrabold text-[#127694] mt-0.5">{sysHealth.generator_health || 'NORMAL'}</div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-cyan-50 text-[#0699C6] flex items-center justify-center font-bold text-xs">
                  <i className="fa-solid fa-bolt"></i>
                </div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Battery Health</div>
                  <div className="text-sm font-extrabold text-emerald-700 mt-0.5">{sysHealth.battery_health || 'NORMAL'}</div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
                  <i className="fa-solid fa-car-battery"></i>
                </div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Renewable Health</div>
                  <div className="text-sm font-extrabold text-[#127694] mt-0.5">{sysHealth.renewable_health || 'NORMAL'}</div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-xs">
                  <i className="fa-solid fa-fan"></i>
                </div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Load Bus Health</div>
                  <div className="text-sm font-extrabold text-[#127694] mt-0.5">{sysHealth.load_health || 'NORMAL'}</div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                  <i className="fa-solid fa-network-wired"></i>
                </div>
              </div>
            </div>

            {/* Multivariate ML Anomaly Row */}
            <div className="mt-3 pt-2.5 border-t border-[#bcecfc]/40 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">Multi-Variate Isolation Forest Anomaly Detection:</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {sysHealth.multivariate_anomaly?.status || 'NOMINAL'} (Score: {sysHealth.multivariate_anomaly?.score || 0.05})
                </span>
              </div>
              <span className="text-[11px] text-slate-500 italic">
                Cross-evaluates Electrical, Thermal &amp; Mechanical signatures without hard sensor trip
              </span>
            </div>
          </section>

          {/* 3. GENERATION DEVICES (Sections 7, 8, 9) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-[#127694] uppercase tracking-wider flex items-center gap-1.5">
                <i className="fa-solid fa-industry text-[#0699C6]"></i> Generation Assets (Dual Diesel Microgrid)
              </h3>
              <span className="text-[11px] text-slate-500">Continuous 415V Line-to-Line Synchronization</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Generator 1 Card */}
              <div className="bg-white rounded-2xl border border-[#bcecfc] p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-sm text-[#127694]">{dg1.name || 'Diesel Generator 1'}</h4>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        dg1.operational_state === 'RUNNING'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        ● {dg1.operational_state || 'STANDBY'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">Asset ID: {dg1.device_id || 'DG-1'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-[#127694] font-mono leading-none">
                      {dg1.electrical?.power_kw !== undefined ? dg1.electrical.power_kw : 184} <span className="text-xs font-bold text-[#0699C6]">kW</span>
                    </div>
                    <div className="text-[11px] font-bold text-slate-500 mt-0.5">
                      {dg1.electrical?.load_pct || 61}% LOAD
                    </div>
                  </div>
                </div>

                {/* Generator 1 Metric Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 text-xs">
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">RPM</span>
                    <span className="font-mono font-bold text-slate-800">{dg1.mechanical?.rpm || 1500} rpm</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Frequency</span>
                    <span className="font-mono font-bold text-slate-800">{dg1.electrical?.frequency_hz || 50.0} Hz</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Oil Pressure</span>
                    <span className="font-mono font-bold text-slate-800">{dg1.mechanical?.oil_pressure_bar || 4.2} bar</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Vibration</span>
                    <span className="font-mono font-bold text-amber-700">{dg1.mechanical?.vibration_mms || 2.38} mm/s</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Coolant Temp</span>
                    <span className="font-mono font-bold text-slate-800">{dg1.mechanical?.coolant_temp_c || 82.4}°C</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Fuel Burn Rate</span>
                    <span className="font-mono font-bold text-slate-800">{dg1.fuel?.fuel_rate_lh || 42.0} L/h</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Voltage / Current</span>
                    <span className="font-mono font-bold text-slate-800">{dg1.electrical?.voltage_v || 415}V / {dg1.electrical?.current_a || 270}A</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Runtime</span>
                    <span className="font-mono font-bold text-slate-800">{dg1.fuel?.runtime_hours || 1284} h</span>
                  </div>
                </div>

                {/* Grounded Health & Digital Twin Badges */}
                <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-100 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Calculated Health:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      dg1.calculated_health?.state === 'NORMAL'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}>
                      {dg1.calculated_health?.state || 'NORMAL'} ({dg1.calculated_health?.score_pct || 88}%)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      DT: {dg1.digital_twin?.deviation_pct > 0 ? `+${dg1.digital_twin.deviation_pct}%` : `${dg1.digital_twin?.deviation_pct || 0}%`}
                    </span>
                  </div>
                  <button
                    onClick={() => { setSelectedDevice(dg1); setDetailTab('overview'); }}
                    className="px-3 py-1 rounded-lg bg-[#127694] hover:bg-[#0699C6] text-white font-bold text-xs transition shadow-xs flex items-center gap-1"
                  >
                    <span>View Details</span>
                    <i className="fa-solid fa-chevron-right text-[10px]"></i>
                  </button>
                </div>
              </div>

              {/* Generator 2 Card */}
              <div className="bg-white rounded-2xl border border-[#bcecfc] p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-sm text-[#127694]">{dg2.name || 'Diesel Generator 2'}</h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        ● {dg2.operational_state || 'STANDBY'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">Asset ID: {dg2.device_id || 'DG-2'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-slate-600 font-mono leading-none">
                      {dg2.electrical?.power_kw !== undefined ? dg2.electrical.power_kw : 0} <span className="text-xs font-bold text-slate-400">kW</span>
                    </div>
                    <div className="text-[11px] font-bold text-slate-400 mt-0.5">
                      {dg2.electrical?.load_pct || 0}% LOAD
                    </div>
                  </div>
                </div>

                {/* Generator 2 Metric Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 text-xs">
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">RPM</span>
                    <span className="font-mono font-bold text-slate-800">{dg2.mechanical?.rpm || 0} rpm</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Frequency</span>
                    <span className="font-mono font-bold text-slate-800">50.0 Hz</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Oil Pressure</span>
                    <span className="font-mono font-bold text-slate-800">0.0 bar</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Vibration</span>
                    <span className="font-mono font-bold text-slate-800">0.00 mm/s</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Coolant Temp</span>
                    <span className="font-mono font-bold text-emerald-700">{dg2.mechanical?.coolant_temp_c || 52.0}°C (Pre-warmed)</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Fuel Burn Rate</span>
                    <span className="font-mono font-bold text-slate-800">0.0 L/h</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Overhaul Due</span>
                    <span className="font-mono font-bold text-slate-800">{dg2.fuel?.overhaul_due_hours || 7580} h</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Runtime</span>
                    <span className="font-mono font-bold text-slate-800">{dg2.fuel?.runtime_hours || 420} h</span>
                  </div>
                </div>

                {/* Grounded Health & Digital Twin Badges */}
                <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-100 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Calculated Health:</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      NORMAL (100%)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Standby Ready</span>
                  </div>
                  <button
                    onClick={() => { setSelectedDevice(dg2); setDetailTab('overview'); }}
                    className="px-3 py-1 rounded-lg bg-[#127694] hover:bg-[#0699C6] text-white font-bold text-xs transition shadow-xs flex items-center gap-1"
                  >
                    <span>View Details</span>
                    <i className="fa-solid fa-chevron-right text-[10px]"></i>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 4. BATTERY STORAGE & CELL MONITORING (Sections 10, 11, 12) */}
          <section className="bg-white rounded-2xl border border-[#bcecfc] p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-md">
                  <i className="fa-solid fa-car-battery text-lg text-white"></i>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-extrabold text-sm text-[#127694]">{bess.name || 'Battery Energy Storage System'}</h4>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      bess.thermal_management?.thermal_state === 'COLD DERATING'
                        ? 'bg-cyan-50 text-[#127694] border border-[#bcecfc]'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      ● {bess.operational_state || 'COLD DERATING'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    LiFePO4 Chemistry · 400 kWh Capacity · 120S Cell String Topology
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">State of Charge</span>
                  <span className="text-xl font-black text-[#127694] font-mono leading-none">
                    {bess.soc_pct !== undefined ? bess.soc_pct : 76.5}%
                  </span>
                </div>
                <div className="text-right border-l border-slate-200 pl-4">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">State of Health</span>
                  <span className="text-xl font-black text-emerald-700 font-mono leading-none">
                    {bess.soh_pct !== undefined ? bess.soh_pct : 96.2}%
                  </span>
                </div>
                <button
                  onClick={() => { setSelectedDevice(bess); setDetailTab('overview'); }}
                  className="px-3.5 py-1.5 rounded-xl bg-[#127694] hover:bg-[#0699C6] text-white font-bold text-xs transition shadow-xs"
                >
                  View Details
                </button>
              </div>
            </div>

            {/* Battery Key Telemetry */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div className="bg-[#f0faff] p-2.5 rounded-xl border border-[#bcecfc]/50">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Core Temperature</span>
                <span className="font-mono text-sm font-extrabold text-[#127694]">{bess.temperature_c || -12.4}°C</span>
              </div>
              <div className="bg-[#f0faff] p-2.5 rounded-xl border border-[#bcecfc]/50">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Pack Voltage</span>
                <span className="font-mono text-sm font-extrabold text-slate-800">{bess.pack_voltage_v || 402.5} V</span>
              </div>
              <div className="bg-[#f0faff] p-2.5 rounded-xl border border-[#bcecfc]/50">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Pack Current</span>
                <span className="font-mono text-sm font-extrabold text-slate-800">{bess.pack_current_a || 34.5} A</span>
              </div>
              <div className="bg-[#f0faff] p-2.5 rounded-xl border border-[#bcecfc]/50">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Power Flow</span>
                <span className="font-mono text-sm font-extrabold text-[#0699C6]">{bess.power_flow_kw || 32.0} kW</span>
              </div>
              <div className="bg-[#f0faff] p-2.5 rounded-xl border border-[#bcecfc]/50 col-span-2 sm:col-span-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Thermal State</span>
                <span className="font-bold text-xs text-[#127694] block truncate">
                  {bess.thermal_management?.thermal_state || 'COLD DERATING'}
                </span>
              </div>
            </div>

            {/* Thermal Explanation Alert Banner */}
            <div className="p-3 bg-[#EDF9FD] rounded-xl border border-[#bcecfc] text-xs flex items-start gap-2.5">
              <i className="fa-solid fa-temperature-arrow-down text-base text-[#0699C6] mt-0.5"></i>
              <div>
                <span className="font-bold text-[#127694]">Thermal Condition ({bess.temperature_c || -12.4}°C): </span>
                <span className="text-slate-700">
                  {bess.thermal_management?.reason || 'Low ambient temperature is reducing available battery performance. Charge rate capped to prevent lithium plating.'}
                </span>
              </div>
            </div>

            {/* Expandable Cell-Level Telemetry (Section 12) */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setIsCellExpanded(!isCellExpanded)}
                className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between transition text-xs font-bold text-slate-700"
              >
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-microchip text-[#0699C6]"></i>
                  <span>CELL MONITORING (120-CELL STRING)</span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-cyan-100 text-[#127694] border border-cyan-200">
                    SIMULATED
                  </span>
                </div>
                <div className="flex items-center gap-3 text-slate-500 font-mono text-xs">
                  <span>Imbalance: {bess.cell_monitoring?.cell_imbalance_v || 0.041} V</span>
                  <i className={`fa-solid fa-chevron-down text-[10px] transition-transform ${isCellExpanded ? 'rotate-180' : ''}`}></i>
                </div>
              </button>

              {isCellExpanded && (
                <div className="p-4 bg-white grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-t border-slate-200 animate-fadeIn">
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Min Cell Voltage</span>
                    <span className="font-mono font-bold text-slate-800 text-sm">{bess.cell_monitoring?.cell_min_v || 3.341} V</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Cell #42</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Max Cell Voltage</span>
                    <span className="font-mono font-bold text-slate-800 text-sm">{bess.cell_monitoring?.cell_max_v || 3.382} V</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Cell #108</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Cell Imbalance</span>
                    <span className="font-mono font-bold text-amber-700 text-sm">{bess.cell_monitoring?.cell_imbalance_v || 0.041} V</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Tolerance &lt; 0.050 V</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Average Cell Voltage</span>
                    <span className="font-mono font-bold text-slate-800 text-sm">{bess.cell_monitoring?.cell_avg_v || 3.361} V</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">120 Series Pack</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 5. RENEWABLE DEVICES (Sections 13, 14) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-[#127694] uppercase tracking-wider flex items-center gap-1.5">
                <i className="fa-solid fa-leaf text-[#0699C6]"></i> Renewable Generation Assets
              </h3>
              <span className="text-[11px] text-slate-500">Katabatic Aerodynamics &amp; Bifacial Polar Sun Harvesting</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Wind Turbine Card */}
              <div className="bg-white rounded-2xl border border-[#bcecfc] p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-sm text-[#127694]">{wind.name || 'Katabatic Wind Turbine'}</h4>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        wind.operational_state === 'CUTOUT'
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      }`}>
                        ● {wind.operational_state || 'ONLINE'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">Asset ID: {wind.device_id || 'WIND-1'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-[#127694] font-mono leading-none">
                      {wind.power_output_kw !== undefined ? wind.power_output_kw : 87} <span className="text-xs font-bold text-[#0699C6]">kW</span>
                    </div>
                    <div className="text-[11px] font-bold text-slate-500 mt-0.5">
                      Wind: {wind.wind_speed_ms || 14.2} m/s
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 text-xs">
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Rotor Speed</span>
                    <span className="font-mono font-bold text-slate-800">{wind.rotor_rpm || 18.4} RPM</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Generator Speed</span>
                    <span className="font-mono font-bold text-slate-800">{wind.generator_rpm || 1518} RPM</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Wind Direction</span>
                    <span className="font-mono font-bold text-slate-800">{wind.wind_direction_deg || 218}° SSW</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Pitch Angle</span>
                    <span className="font-mono font-bold text-slate-800">{wind.pitch_angle_deg || 4.2}°</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Nacelle Temp</span>
                    <span className="font-mono font-bold text-slate-800">{wind.nacelle_temp_c || -13.8}°C</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Cut-Out Limit</span>
                    <span className="font-mono font-bold text-rose-700">25.0 m/s</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50 col-span-2">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Digital Twin Residual</span>
                    <span className="font-mono font-bold text-[#127694]">
                      {wind.digital_twin?.deviation_pct ? `${wind.digital_twin.deviation_pct}%` : '0.0%'} (Power Curve Validated)
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-500 font-semibold">
                    Status: {wind.operational_state === 'CUTOUT' ? 'BRAKED (STORM CUTOUT)' : 'NORMAL OPERATIONAL DISPATCH'}
                  </span>
                  <button
                    onClick={() => { setSelectedDevice(wind); setDetailTab('overview'); }}
                    className="px-3 py-1 rounded-lg bg-[#127694] hover:bg-[#0699C6] text-white font-bold text-xs transition shadow-xs"
                  >
                    View Details
                  </button>
                </div>
              </div>

              {/* Solar PV Card */}
              <div className="bg-white rounded-2xl border border-[#bcecfc] p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-sm text-[#127694]">{solar.name || 'Bifacial Solar PV Array'}</h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        ● {solar.operational_state || 'ONLINE'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">Asset ID: {solar.device_id || 'SOLAR-1'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-[#127694] font-mono leading-none">
                      {solar.power_output_kw !== undefined ? solar.power_output_kw : 42} <span className="text-xs font-bold text-[#0699C6]">kW</span>
                    </div>
                    <div className="text-[11px] font-bold text-slate-500 mt-0.5">
                      {solar.irradiance_wm2 || 320} W/m²
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 text-xs">
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">DC Voltage</span>
                    <span className="font-mono font-bold text-slate-800">{solar.dc_voltage_v || 648.2} V</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">DC Current</span>
                    <span className="font-mono font-bold text-slate-800">{solar.dc_current_a || 64.8} A</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Panel Temp</span>
                    <span className="font-mono font-bold text-slate-800">{solar.panel_temp_c || -13.6}°C</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Inverter Eff.</span>
                    <span className="font-mono font-bold text-emerald-700">{solar.inverter_efficiency_pct || 98.2}%</span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50 col-span-2">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Snow Albedo Reflection Gain</span>
                    <span className="font-mono font-bold text-[#0699C6]">
                      +20% (Model-Derived Albedo Parameter)
                    </span>
                  </div>
                  <div className="bg-[#f0faff] p-2 rounded-lg border border-[#bcecfc]/50 col-span-2">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Bifacial Factor</span>
                    <span className="font-mono font-bold text-slate-800">0.85 Rear-Surface Capture</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-500 font-semibold">
                    Telemetry: Calibrated pyranometer &amp; SMA Sunny Central Inverter
                  </span>
                  <button
                    onClick={() => { setSelectedDevice(solar); setDetailTab('overview'); }}
                    className="px-3 py-1 rounded-lg bg-[#127694] hover:bg-[#0699C6] text-white font-bold text-xs transition shadow-xs"
                  >
                    View Details
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 6. LOAD GROUPS & SHEDDING VISUALIZATION (Sections 15, 16) */}
          <section className="bg-white rounded-2xl border border-[#bcecfc] p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-extrabold text-[#127694] uppercase tracking-wider">
                  <i className="fa-solid fa-list-check mr-1 text-[#0699C6]"></i> Station Load Groups &amp; Hierarchical Shedding
                </h4>
                <span className="text-[10px] font-mono text-slate-500 bg-[#f0faff] px-2 py-0.5 rounded border border-[#bcecfc]">
                  Total: {loads.total_load_kw || 412} kW
                </span>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                loads.load_shedding_tier === 0
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-100 text-amber-900 border border-amber-300'
              }`}>
                {loads.load_shedding_tier === 0 ? 'All Tiers Connected' : `Tier ${loads.load_shedding_tier} Shedding Active`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(loads.groups || []).map((grp, idx) => (
                <div key={idx} className={`p-3 rounded-xl border ${
                  grp.priority.includes('CRITICAL')
                    ? 'bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-400/40'
                    : 'bg-[#f0faff] border-[#bcecfc]/70'
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] uppercase font-extrabold text-slate-500">
                      {grp.tier_name}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold ${
                      grp.priority.includes('CRITICAL')
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      {grp.priority}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-black text-slate-900 font-mono">
                      {grp.power_kw} <span className="text-xs font-normal text-slate-500">kW</span>
                    </span>
                    <span className="text-xs font-bold text-slate-600 font-mono">
                      {grp.demand_pct}%
                    </span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Shedding:</span>
                    <span className={`font-bold ${grp.shedding_allowed ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {grp.shedding_allowed ? 'Allowed (Tiered)' : 'STRICTLY PROTECTED'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 7. EQUIPMENT TRENDS (Interactive Rolling Chart) (Section 20) */}
          <section className="bg-white rounded-2xl border border-[#bcecfc] p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-xs font-extrabold text-[#127694] uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fa-solid fa-chart-line text-[#0699C6]"></i> Equipment Trends &amp; Rolling Telemetry
                </h4>
                <p className="text-[11px] text-slate-500">1-Second High-Precision Rolling Buffers with Bounded Browser Overhead</p>
              </div>

              {/* Controls: Device, Metric, Time Window */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Device Selector */}
                <select
                  value={trendDevice}
                  onChange={(e) => setTrendDevice(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-[#0699C6]"
                >
                  <option value="DG-1">Diesel Generator 1</option>
                  <option value="DG-2">Diesel Generator 2</option>
                  <option value="BESS-1">Battery Storage</option>
                  <option value="WIND-1">Wind Turbine</option>
                  <option value="SOLAR-1">Solar PV</option>
                </select>

                {/* Metric Selector */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  {['power', 'rpm', 'temp', 'vibration', 'fuel'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTrendMetric(m)}
                      className={`px-2.5 py-1 rounded text-xs font-bold capitalize transition ${
                        trendMetric === m
                          ? 'bg-[#127694] text-white shadow-xs'
                          : 'text-slate-600 hover:text-[#0699C6]'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                {/* Window Selector */}
                <div className="flex items-center bg-[#f0faff] p-0.5 rounded-lg border border-[#bcecfc]">
                  {['5M', '15M', '1H', '24H', '7D', '30D'].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setTrendRange(w)}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono transition ${
                        trendRange === w
                          ? 'bg-[#0699C6] text-white shadow-xs'
                          : 'text-slate-600 hover:text-[#0699C6]'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Chart Canvas */}
            <div className="h-64 w-full relative">
              <canvas ref={chartCanvasRef}></canvas>
            </div>
          </section>

          {/* 8. HISTORICAL EQUIPMENT ANALYTICS (PROJECT A) (Section 21) */}
          <section className="bg-white rounded-2xl border border-[#bcecfc] p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
              <div>
                <h4 className="text-xs font-extrabold text-[#127694] uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fa-solid fa-clock-rotate-left text-[#0699C6]"></i> Long-Term Equipment Analytics (Project A)
                </h4>
                <p className="text-[11px] text-slate-500">Aggregated Duty Cycles, Capacity Factors &amp; Availability Accounting</p>
              </div>

              <div className="flex items-center gap-1 bg-[#f0faff] p-0.5 rounded-lg border border-[#bcecfc]">
                {['24H', '7D', '30D', '12M'].map((rng) => (
                  <button
                    key={rng}
                    type="button"
                    onClick={() => setAnalyticsRange(rng)}
                    className={`px-3 py-1 rounded text-xs font-bold font-mono transition ${
                      analyticsRange === rng
                        ? 'bg-[#127694] text-white shadow-xs'
                        : 'text-slate-600 hover:text-[#0699C6]'
                    }`}
                  >
                    {rng}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-[#f0faff] rounded-xl border border-[#bcecfc]/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">DG-1 Cumulative Fuel</span>
                <span className="font-mono text-base font-extrabold text-slate-900">
                  {historicalAnalytics?.generator_1?.fuel_consumed_liters?.toLocaleString() || '4,650'} <span className="text-xs font-normal">L</span>
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Runtime: {historicalAnalytics?.generator_1?.runtime_hours || 112} h ({historicalAnalytics?.generator_1?.availability_pct || 99.4}% Avail)
                </span>
              </div>

              <div className="p-3 bg-[#f0faff] rounded-xl border border-[#bcecfc]/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">DG-1 Capacity Factor</span>
                <span className="font-mono text-base font-extrabold text-[#127694]">
                  {historicalAnalytics?.generator_1?.capacity_factor_pct || 59.5}%
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  SFOC: {historicalAnalytics?.generator_1?.specific_fuel_consumption || 0.233} L/kWh
                </span>
              </div>

              <div className="p-3 bg-[#f0faff] rounded-xl border border-[#bcecfc]/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Wind Harvest</span>
                <span className="font-mono text-base font-extrabold text-[#0699C6]">
                  {historicalAnalytics?.wind_turbine?.generation_kwh?.toLocaleString() || '11,450'} <span className="text-xs font-normal">kWh</span>
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Capacity Factor: {historicalAnalytics?.wind_turbine?.capacity_factor_pct || 68.2}%
                </span>
              </div>

              <div className="p-3 bg-[#f0faff] rounded-xl border border-[#bcecfc]/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">BESS Equivalent Cycles</span>
                <span className="font-mono text-base font-extrabold text-emerald-700">
                  {historicalAnalytics?.battery_storage?.equivalent_full_cycles || 13.4} <span className="text-xs font-normal">EFC</span>
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Round-trip Eff: {historicalAnalytics?.battery_storage?.average_efficiency_pct || 92.4}%
                </span>
              </div>
            </div>
          </section>

          {/* 9. MAINTENANCE INTELLIGENCE (Sections 22, 23) */}
          <section className="bg-white rounded-2xl border border-[#bcecfc] p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
              <div>
                <h4 className="text-xs font-extrabold text-[#127694] uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fa-solid fa-wrench text-[#0699C6]"></i> Maintenance Intelligence &amp; Degradation Indicators
                </h4>
                <p className="text-[11px] text-slate-500">Physics-Driven Anomaly Detection Prioritized by Equipment Risk</p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#f0faff] text-[#127694] border border-[#bcecfc]">
                {maintenanceList.length} Indicators Monitored
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {maintenanceList.map((item, idx) => (
                <div key={idx} className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wide uppercase ${
                          item.priority === 'URGENT INSPECTION'
                            ? 'bg-purple-950 text-purple-200'
                            : item.priority === 'MAINTENANCE RECOMMENDED'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : item.priority === 'INSPECT'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {item.priority}
                        </span>
                        <span className="text-xs font-bold text-[#127694]">{item.device_name}</span>
                      </div>
                      <h5 className="font-extrabold text-xs text-slate-800 mt-1">{item.title}</h5>
                    </div>
                    <div className="text-right text-xs">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold">Delta</span>
                      <span className="font-bold font-mono text-amber-700">{item.delta}</span>
                    </div>
                  </div>

                  <div className="p-2 bg-[#f0faff] rounded-lg border border-[#bcecfc]/50 text-xs text-slate-700">
                    <span className="font-bold text-[#127694]">Evidence: </span>
                    {item.evidence}
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 text-slate-600">
                    <div>
                      <span className="font-bold text-slate-700">Recommendation: </span>
                      <span className="text-slate-600">{item.recommendation}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>

        {/* 10. REUSABLE DEVICE DETAILS SUB-VIEW (Section 17) */}
        {selectedDevice && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-5 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
            <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl bg-white border border-[#bcecfc] shadow-2xl overflow-hidden font-sans">
              {/* Detail Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-[#f0faff]">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-[#127694]">{selectedDevice.name}</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-[#0699C6] border border-[#bcecfc]">
                      {selectedDevice.device_id}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      ● {selectedDevice.operational_state}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Asset Telemetry, Residual Tolerances &amp; History</p>
                </div>
                <button
                  onClick={() => setSelectedDevice(null)}
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition border border-slate-200"
                >
                  <i className="fa-solid fa-xmark text-sm"></i>
                </button>
              </div>

              {/* Sub-view Navigation Tabs */}
              <div className="flex items-center px-6 pt-2 border-b border-slate-200 bg-slate-50 gap-2">
                {[
                  { id: 'overview', label: 'Overview', icon: 'fa-gauge' },
                  { id: 'telemetry', label: 'Live Telemetry', icon: 'fa-network-wired' },
                  { id: 'maintenance', label: 'Maintenance', icon: 'fa-wrench' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDetailTab(tab.id)}
                    className={`px-3 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 border-t border-x ${
                      detailTab === tab.id
                        ? 'bg-white text-[#127694] border-slate-200 shadow-xs'
                        : 'text-slate-500 hover:text-[#0699C6]'
                    }`}
                  >
                    <i className={`fa-solid ${tab.icon} text-xs`}></i>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Detail Content Body */}
              <div className="p-6 overflow-y-auto space-y-4 text-xs">
                {detailTab === 'overview' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-[#f0faff] border border-[#bcecfc] space-y-2">
                      <div className="text-xs font-bold text-[#127694] uppercase">Operational Status &amp; Physics Validation</div>
                      <p className="text-slate-700">
                        Operating under verified physical constraints. Telemetry quality status is <span className="font-bold text-[#127694]">{selectedDevice.data_quality || 'LIVE'}</span>.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                        <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Calculated Health</span>
                          <span className="font-bold text-[#127694] text-sm">{selectedDevice.calculated_health?.state || 'NORMAL'}</span>
                        </div>
                        <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Digital Twin Residual</span>
                          <span className="font-bold text-[#0699C6] text-sm">
                            {selectedDevice.digital_twin?.deviation_pct ? `${selectedDevice.digital_twin.deviation_pct}%` : 'Nominal'}
                          </span>
                        </div>
                        <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Tolerance Status</span>
                          <span className="font-bold text-emerald-700 text-sm">{selectedDevice.digital_twin?.status || 'VALIDATED'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2">
                      <div className="text-xs font-bold text-slate-800 uppercase">Underlying Health Indicators</div>
                      <ul className="list-disc pl-5 text-slate-600 space-y-1">
                        {(selectedDevice.calculated_health?.indicators || ['All monitored parameters within baseline bounds']).map((ind, i) => (
                          <li key={i}>{ind}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {detailTab === 'telemetry' && (
                  <div className="space-y-3 font-mono">
                    <div className="text-xs font-bold text-slate-800 uppercase font-sans">Raw SCADA Parameter Registers</div>
                    <div className="p-3 bg-slate-900 text-slate-200 rounded-xl overflow-x-auto text-[11px] leading-relaxed">
                      <pre>{JSON.stringify(selectedDevice, null, 2)}</pre>
                    </div>
                  </div>
                )}

                {detailTab === 'maintenance' && (
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-[#127694] uppercase">Proactive Maintenance Advisory</div>
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-slate-700 space-y-2">
                      <div className="font-bold text-amber-900">Scheduled Inspection Cycle</div>
                      <p>
                        Routine maintenance window scheduled according to Arctic/Antarctic logistics protocol. No emergency trip interlock active.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Detail Footer */}
              <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-mono">SCADA Mode Read-Only Protection Active</span>
                <button
                  onClick={() => setSelectedDevice(null)}
                  className="px-4 py-1.5 rounded-xl bg-[#127694] text-white font-bold text-xs"
                >
                  Close Detail View
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
