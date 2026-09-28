import React, { useState, useEffect } from 'react';
import { STATIONS } from '../constants/stations';

export default function AlertsModal({
  isOpen,
  onClose,
  latestData,
  stationId = 'MAITRI'
}) {
  const [activeTab, setActiveTab] = useState('realtime'); // 'realtime' | 'compound' | 'matrix' | 'worst' | 'history'
  const [filterSeverity, setFilterSeverity] = useState('ALL'); // 'ALL' | 'EMERGENCY' | 'CRITICAL' | 'HIGH' | 'WARNING' | 'INFO' | 'PREDICTIVE'
  const [stationFilter, setStationFilter] = useState('ALL'); // 'ALL' | 'MAITRI' | 'BHARATI'
  const [annualMatrix, setAnnualMatrix] = useState(null);
  const [worstEvent, setWorstEvent] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [compoundData, setCompoundData] = useState(null);
  const [acknowledgedIds, setAcknowledgedIds] = useState(new Set());
  const [ackToast, setAckToast] = useState(null);

  const currentStation = STATIONS[stationId] || STATIONS.MAITRI;
  const alertIntel = latestData?.alert_intelligence || {};
  const activeAlerts = alertIntel.active_alerts || [];
  const predictiveAlerts = alertIntel.predictive_alerts || [];
  const compoundRisk = alertIntel.compound_risk || compoundData?.compound_risk || { score: 4, max_score: 15, risk_tier: 'WARNING', factors: [], scenarios: [] };
  const rootCauseTree = alertIntel.root_cause_tree || compoundData?.root_cause_tree || {};

  // Fetch Section 10 extra endpoints on modal open or tab switch
  useEffect(() => {
    if (!isOpen) return;
    const fetchExtras = async () => {
      try {
        if (activeTab === 'matrix' && !annualMatrix) {
          const res = await fetch('/api/alerts/annual-matrix');
          if (res.ok) setAnnualMatrix(await res.json());
        }
        if (activeTab === 'worst' && !worstEvent) {
          const res = await fetch('/api/alerts/worst-event');
          if (res.ok) setWorstEvent(await res.json());
        }
        if (activeTab === 'history') {
          const res = await fetch('/api/alerts/history?limit=30');
          if (res.ok) {
            const data = await res.json();
            setHistoryLogs(data.history || []);
          }
        }
        if (activeTab === 'compound' && !compoundData) {
          const res = await fetch('/api/alerts/compound');
          if (res.ok) setCompoundData(await res.json());
        }
      } catch (e) {
        console.warn('Error fetching alert details:', e);
      }
    };
    fetchExtras();
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  // Handle Operator Acknowledgment
  const handleAcknowledge = async (alertId, alertTitle) => {
    try {
      const res = await fetch('/api/alerts/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: alertId, acknowledged_by: 'Commander Vance' })
      });
      if (res.ok) {
        setAcknowledgedIds((prev) => new Set(prev).add(alertId));
        setAckToast(`Alert [${alertTitle}] acknowledged by Commander Vance.`);
        setTimeout(() => setAckToast(null), 4000);
      }
    } catch (e) {
      console.warn('Failed to acknowledge alert:', e);
    }
  };

  // Severity color mappings
  const getSeverityBadge = (sev) => {
    switch (sev) {
      case 'EMERGENCY':
        return 'bg-purple-950/80 text-purple-300 border-purple-500/80 animate-pulse ring-1 ring-purple-500';
      case 'CRITICAL':
        return 'bg-rose-50 text-rose-700 border-rose-300 ring-1 ring-rose-400/50';
      case 'HIGH':
        return 'bg-orange-950/80 text-orange-300 border-orange-500/80';
      case 'WARNING':
        return 'bg-amber-50 text-amber-800 border-amber-300';
      case 'INFO':
      default:
        return 'bg-[#e5f6fd]/80 text-[#127694] border-cyan-500/80';
    }
  };

  const getSeverityIcon = (sev) => {
    switch (sev) {
      case 'EMERGENCY':
        return 'fa-radiation';
      case 'CRITICAL':
        return 'fa-triangle-exclamation';
      case 'HIGH':
        return 'fa-circle-exclamation';
      case 'WARNING':
        return 'fa-bell';
      case 'INFO':
      default:
        return 'fa-circle-info';
    }
  };

  // Counts
  const emergencyCount = activeAlerts.filter((a) => a.severity === 'EMERGENCY').length;
  const criticalCount = activeAlerts.filter((a) => a.severity === 'CRITICAL').length;
  const warningCount = activeAlerts.filter((a) => a.severity === 'WARNING').length;
  const infoCount = activeAlerts.filter((a) => a.severity === 'INFO').length;

  // Filtered lists
  const filteredActive = activeAlerts.filter((a) => {
    if (stationFilter !== 'ALL') {
      const aStation = ((a.station_id || a.station || stationId) + '').toUpperCase();
      if (!aStation.includes(stationFilter)) return false;
    }
    if (filterSeverity === 'ALL') return true;
    if (filterSeverity === 'PREDICTIVE') return false;
    return a.severity === filterSeverity;
  });

  const showPredictive = filterSeverity === 'ALL' || filterSeverity === 'PREDICTIVE';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl bg-white border border-[#bcecfc] shadow-2xl shadow-cyan-950/50 text-slate-800 overflow-hidden font-sans">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#bcecfc]/60 bg-gradient-to-r from-[#f0faff] via-white to-[#f0faff] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-rose-950/50">
              <i className="fa-solid fa-triangle-exclamation text-lg"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold tracking-tight text-[#127694] uppercase">
                  Alerts & Risk Intelligence
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-rose-50 text-rose-700 border border-rose-200">
                  SCADA Layer 1 & 2
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-cyan-500/10 text-[#127694] border border-cyan-500/20">
                  {currentStation.name}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Deterministic Hysteresis Engine · 4-Part Explainability · Compound Risk Scenarios · 8,760H Breaking Point
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition border border-slate-200"
            title="Close Alert Center"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Global Toast Notification */}
        {ackToast && (
          <div className="px-6 py-2 bg-emerald-50/80 border-b border-emerald-500/40 text-emerald-800 text-xs flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-circle-check text-emerald-400"></i>
              <span className="font-semibold">{ackToast}</span>
            </div>
            <button onClick={() => setAckToast(null)} className="text-emerald-700 hover:text-emerald-950 text-xs font-bold">
              &times;
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between px-6 pt-3 border-b border-[#bcecfc]/60 bg-gradient-to-r from-[#f0faff] via-white to-[#f0faff] shrink-0 overflow-x-auto gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('realtime')}
              className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition flex items-center gap-2 border-t border-x ${
                activeTab === 'realtime'
                  ? 'bg-[#127694] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0699C6]'
              }`}
            >
              <i className="fa-solid fa-bell text-xs"></i>
              <span>Live & Predictive Alerts</span>
              {activeAlerts.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-extrabold ml-1">
                  {activeAlerts.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('compound')}
              className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition flex items-center gap-2 border-t border-x ${
                activeTab === 'compound'
                  ? 'bg-[#127694] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0699C6]'
              }`}
            >
              <i className="fa-solid fa-layer-group text-xs"></i>
              <span>Compound Risk Engine</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-extrabold ${compoundRisk.score >= 8 ? 'bg-rose-500 text-white' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                {compoundRisk.score}/15
              </span>
            </button>

            <button
              onClick={() => setActiveTab('matrix')}
              className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition flex items-center gap-2 border-t border-x ${
                activeTab === 'matrix'
                  ? 'bg-[#127694] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0699C6]'
              }`}
            >
              <i className="fa-solid fa-table-cells text-xs"></i>
              <span>Annual 8,760H Matrix</span>
              <span className="text-[10px] text-[#0699C6] font-mono">3,276h</span>
            </button>

            <button
              onClick={() => setActiveTab('worst')}
              className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition flex items-center gap-2 border-t border-x ${
                activeTab === 'worst'
                  ? 'bg-[#127694] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0699C6]'
              }`}
            >
              <i className="fa-solid fa-skull-crossbones text-xs text-rose-400"></i>
              <span>Worst Event & Breaking Point</span>
              <span className="text-[10px] text-rose-400 font-mono">Hr 3,410</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition flex items-center gap-2 border-t border-x ${
                activeTab === 'history'
                  ? 'bg-[#127694] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0699C6]'
              }`}
            >
              <i className="fa-solid fa-clock-rotate-left text-xs"></i>
              <span>SCADA Lifecycle Log</span>
            </button>
          </div>

          <div className="text-[10px] font-mono text-[#0699C6]/80 pb-2 hidden md:block">
            HYSTERESIS: BATT &le;20%/&ge;23% · WIND &ge;25/&le;22 m/s · DEBOUNCE: 2.0s
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white text-slate-800">
          
          {/* TAB 1: REAL-TIME & PREDICTIVE ALERTS */}
          {activeTab === 'realtime' && (
            <div className="space-y-6">
              
              {/* Top Operational Status Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3 rounded-xl bg-[#f0faff] border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Total Active</div>
                    <div className="text-xl font-mono font-black text-[#127694]">{activeAlerts.length}</div>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-[#0699C6] flex items-center justify-center font-bold">
                    <i className="fa-solid fa-list-check"></i>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#f0faff] border border-purple-500/30 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-purple-800">Emergency</div>
                    <div className="text-xl font-mono font-black text-purple-700">{emergencyCount}</div>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                    <i className="fa-solid fa-radiation animate-pulse"></i>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#f0faff] border border-rose-500/30 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-rose-800">Critical</div>
                    <div className="text-xl font-mono font-black text-rose-700">{criticalCount}</div>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#f0faff] border border-amber-500/30 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-amber-800">Warning</div>
                    <div className="text-xl font-mono font-black text-amber-700">{warningCount}</div>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                    <i className="fa-solid fa-bell"></i>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#f0faff] border border-cyan-500/30 flex items-center justify-between col-span-2 sm:col-span-1">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-[#127694]">Hysteresis Status</div>
                    <div className="text-xs font-mono font-bold text-[#0699C6]">CHATTER-FREE</div>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-[#0699C6] flex items-center justify-center font-bold">
                    <i className="fa-solid fa-wave-square"></i>
                  </div>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold text-[#127694] uppercase tracking-wider mr-1">Station:</span>
                  {['ALL', 'MAITRI', 'BHARATI'].map((stn) => (
                    <button
                      key={stn}
                      onClick={() => setStationFilter(stn)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                        stationFilter === stn
                          ? 'bg-[#127694] text-white shadow-sm'
                          : 'bg-[#edf9fd] text-[#127694] hover:bg-[#bcecfc]'
                      }`}
                    >
                      {stn}
                    </button>
                  ))}
                  <span className="text-slate-300 mx-1">|</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1">Severity:</span>
                  {['ALL', 'EMERGENCY', 'CRITICAL', 'WARNING', 'INFO', 'PREDICTIVE'].map((sev) => (
                    <button
                      key={sev}
                      onClick={() => setFilterSeverity(sev)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                        filterSeverity === sev
                          ? 'bg-cyan-500 text-slate-950 shadow-md'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>

                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  <span className="font-mono text-[11px]">SCADA Telemetry Active</span>
                </div>
              </div>

              {/* Active Alerts List (4-Part Cards) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <i className="fa-solid fa-bolt text-[#0699C6]"></i>
                    <span>Real-Time Operational Alerts ({filteredActive.length})</span>
                  </h3>
                  <span className="text-[10px] text-slate-500">
                    Deterministic Safety Priority: Emergency &gt; Critical &gt; High &gt; Warning &gt; Info
                  </span>
                </div>

                {filteredActive.length === 0 ? (
                  <div className="p-8 rounded-xl bg-[#f0faff] border border-slate-200 text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-xl">
                      <i className="fa-solid fa-shield-halved"></i>
                    </div>
                    <div className="text-sm font-bold text-slate-700">No Active Alarms in Selected Category</div>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      All polar microgrid parameters (Battery SoC, Thermal Loop, Katabatic Wind, and Diesel Gensets) are within nominal boundaries.
                    </p>
                  </div>
                ) : (
                  filteredActive.map((alert) => {
                    const isAck = acknowledgedIds.has(alert.id) || alert.status === 'ACKNOWLEDGED';
                    return (
                      <div
                        key={alert.id}
                        className={`p-4 rounded-xl bg-[#f0faff] border transition shadow-lg ${
                          alert.severity === 'EMERGENCY'
                            ? 'border-purple-500/50 shadow-purple-950/30'
                            : alert.severity === 'CRITICAL'
                            ? 'border-rose-500/50 shadow-rose-950/30'
                            : alert.severity === 'HIGH'
                            ? 'border-orange-500/40'
                            : alert.severity === 'WARNING'
                            ? 'border-amber-500/40'
                            : 'border-cyan-500/40'
                        }`}
                      >
                        {/* Card Top Row */}
                        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                          <div className="flex items-center gap-2.5">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 border ${getSeverityBadge(alert.severity)}`}>
                              <i className={`fa-solid ${getSeverityIcon(alert.severity)} text-xs`}></i>
                              {alert.severity}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-700 text-slate-700 font-bold">
                              {alert.rule_id}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-[#127694] border border-cyan-500/20">
                              {alert.category} · {alert.subsystem}
                            </span>
                            <h4 className="text-sm font-bold text-slate-900 tracking-tight">{alert.title}</h4>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-slate-400">
                              {alert.detected_at?.replace('T', ' ').substring(11, 19)} UTC
                            </span>
                            {isAck ? (
                              <span className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                <i className="fa-solid fa-check"></i>
                                <span>ACKNOWLEDGED</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => handleAcknowledge(alert.id, alert.title)}
                                className="px-3 py-1 rounded-lg text-[11px] font-bold bg-cyan-500/20 hover:bg-cyan-500 hover:text-slate-950 text-[#127694] border border-cyan-500/40 transition flex items-center gap-1"
                              >
                                <i className="fa-solid fa-hand"></i>
                                <span>ACKNOWLEDGE</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 4-Part Explainability Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 font-bold text-slate-700 text-[11px]">
                              <i className="fa-solid fa-circle-exclamation text-rose-400"></i>
                              <span className="uppercase tracking-wider">1. What Happened</span>
                            </div>
                            <p className="text-slate-700 leading-relaxed pl-4">{alert.what}</p>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 font-bold text-slate-700 text-[11px]">
                              <i className="fa-solid fa-magnifying-glass-chart text-amber-400"></i>
                              <span className="uppercase tracking-wider">2. Why Detected</span>
                            </div>
                            <p className="text-slate-700 leading-relaxed pl-4">{alert.why}</p>
                          </div>

                          <div className="space-y-1 pt-2 border-t border-slate-200 md:border-t-0">
                            <div className="flex items-center gap-1.5 font-bold text-slate-700 text-[11px]">
                              <i className="fa-solid fa-forward-step text-purple-400"></i>
                              <span className="uppercase tracking-wider">3. What Could Happen Next</span>
                            </div>
                            <p className="text-slate-700 leading-relaxed pl-4">{alert.next}</p>
                          </div>

                          <div className="space-y-1 pt-2 border-t border-slate-200 md:border-t-0">
                            <div className="flex items-center gap-1.5 font-bold text-[#127694] text-[11px]">
                              <i className="fa-solid fa-wrench text-[#0699C6]"></i>
                              <span className="uppercase tracking-wider">4. Recommended Action</span>
                            </div>
                            <p className="text-[#127694] font-bold leading-relaxed pl-4">{alert.action}</p>
                          </div>
                        </div>

                        {/* Evidentiary Metrics Table */}
                        {alert.evidence && Object.keys(alert.evidence).length > 0 && (
                          <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2 text-[11px]">
                            <div className="flex items-center gap-2 text-slate-400">
                              <span className="font-bold text-[10px] uppercase tracking-wider text-slate-500">Telemetry Evidence:</span>
                              {Object.entries(alert.evidence).map(([k, v]) => (
                                <span key={k} className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[#127694]">
                                  {k}: <strong className="text-slate-900 font-bold">{String(v)}</strong>
                                </span>
                              ))}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              Trigger: <span className="text-rose-400 font-bold">{alert.trigger_value}</span> · Threshold: <span className="text-slate-700">{alert.threshold}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Predictive Alerts Section (Quantile Regression Projections) */}
              {showPredictive && (
                <div className="space-y-4 pt-4 border-t border-cyan-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#127694]">
                        Predictive & Forecast-Based Alerts (Section 7 LightGBM Coupling)
                      </h3>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Quantiles: P10 / P50 / P90 Uncertainty Bands
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {predictiveAlerts.map((pred) => (
                      <div
                        key={pred.id}
                        className="p-4 rounded-xl bg-gradient-to-br from-white to-[#f0faff] border border-[#bcecfc] shadow-md space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-cyan-500/20 text-[#127694] border border-cyan-500/30">
                              PREDICTIVE
                            </span>
                            <span className="text-xs font-bold text-slate-900">{pred.title}</span>
                          </div>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            Horizon: {pred.horizon}
                          </span>
                        </div>

                        <div className="text-xs text-slate-700 p-2.5 rounded-lg bg-[#f0faff] border border-slate-200 space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quantile Evidence:</div>
                          <p className="leading-relaxed">{pred.evidence}</p>
                        </div>

                        <div className="text-xs text-[#127694] flex items-start gap-1.5 pt-1">
                          <i className="fa-solid fa-arrow-right text-[10px] text-[#0699C6] mt-1"></i>
                          <span><strong>Mitigation:</strong> {pred.recommended_action}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: COMPOUND RISK ENGINE */}
          {activeTab === 'compound' && (
            <div className="space-y-6">
              
              {/* Score Meter Banner */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-[#f0faff] via-white to-[#f0faff] border border-[#bcecfc] flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
                <div className="space-y-2 text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#0699C6]">
                      Multi-Failure Compound Risk Score
                    </span>
                    <span className={`px-2.5 py-0.5 rounded text-xs font-extrabold uppercase border ${getSeverityBadge(compoundRisk.risk_tier)}`}>
                      {compoundRisk.risk_tier} RISK
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-[#127694]">
                    {compoundRisk.score} <span className="text-sm font-normal text-slate-400">/ {compoundRisk.max_score} Maximum Risk Points</span>
                  </h3>
                  <p className="text-xs text-slate-500 max-w-lg">
                    Deterministic additive factor scoring across 5 physical polar failure vectors. An alert triggers when compounding atmospheric and equipment stresses overlap.
                  </p>
                </div>

                <div className="w-full md:w-72 space-y-2">
                  <div className="flex justify-between text-xs font-mono font-bold">
                    <span className="text-slate-400">Risk Thresholds:</span>
                    <span className="text-rose-400">&ge;8 Critical · &ge;5 High · &ge;3 Warn</span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        compoundRisk.score >= 8
                          ? 'bg-rose-500'
                          : compoundRisk.score >= 5
                          ? 'bg-orange-500'
                          : compoundRisk.score >= 3
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${(compoundRisk.score / compoundRisk.max_score) * 100}%` }}
                    ></div>
                  </div>
                  <div className="text-[10px] text-right text-slate-500 font-mono">
                    Active Multi-Scenarios: {compoundRisk.active_scenarios_count || 0} of 7
                  </div>
                </div>
              </div>

              {/* Additive Scoring Breakdown Factors */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <i className="fa-solid fa-calculator text-[#0699C6]"></i>
                  <span>Additive Factor Contribution Breakdown</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {(compoundRisk.factors || []).map((f, i) => (
                    <div
                      key={i}
                      className={`p-3.5 rounded-xl border flex items-center justify-between ${
                        f.active
                          ? 'bg-[#f0faff] border-rose-500/50 shadow-md shadow-rose-950/20'
                          : 'bg-[#f0faff] border-slate-200 opacity-70'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-slate-700">{f.factor}</div>
                        <span className={`text-[10px] font-mono uppercase ${f.active ? 'text-rose-400 font-bold' : 'text-slate-500'}`}>
                          {f.active ? '● Factor Triggered' : '○ Nominal Condition'}
                        </span>
                      </div>
                      <div className={`text-lg font-mono font-black ${f.active ? 'text-rose-400' : 'text-slate-600'}`}>
                        +{f.points}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 7 Polar Compound Scenarios */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <i className="fa-solid fa-network-wired text-[#0699C6]"></i>
                  <span>7 Multi-System Compound Failure Scenarios</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(compoundRisk.scenarios || []).map((sc) => (
                    <div
                      key={sc.id}
                      className={`p-3.5 rounded-xl border transition ${
                        sc.is_active
                          ? 'bg-rose-50/30 border-rose-500/60 shadow-lg shadow-rose-950/30'
                          : 'bg-[#f0faff] border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            sc.is_active ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-700 text-slate-700'
                          }`}>
                            {sc.id}
                          </span>
                          <span className="text-xs font-bold text-slate-900">{sc.name}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          sc.is_active ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {sc.is_active ? 'ACTIVE MULTI-FAULT' : 'NOMINAL'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed mb-2">{sc.impact}</p>
                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 pt-2 border-t border-slate-200">
                        <span>Severity Class: <strong className="text-amber-400">{sc.severity}</strong></span>
                        <span className={sc.is_active ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                          {sc.is_active ? 'Automated Contingency Enforced' : 'Continuous Surveillance'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Root-Cause Causal Propagation Chain */}
              <div className="p-4 rounded-xl bg-[#f0faff] border border-cyan-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#127694] flex items-center gap-2">
                    <i className="fa-solid fa-diagram-project text-[#0699C6]"></i>
                    <span>Hierarchical Root-Cause Propagation Chain</span>
                  </h4>
                  <span className="text-[10px] font-mono text-slate-400">
                    Initiating Event: {rootCauseTree.initiating_event || 'Sub-Zero Cold Wave'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
                  {(rootCauseTree.causal_chain || []).map((step) => (
                    <div key={step.step} className="p-3 rounded-lg bg-slate-50 border border-slate-200 relative space-y-1">
                      <div className="flex justify-between items-center text-[10px] text-[#0699C6] font-mono font-bold">
                        <span>STAGE {step.step}</span>
                        <span className="text-slate-400">{step.subsystem}</span>
                      </div>
                      <div className="text-[11px] text-slate-700 font-medium leading-snug">
                        {step.event}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: ANNUAL 8,760H DENSITY MATRIX */}
          {activeTab === 'matrix' && (
            <div className="space-y-6">
              
              {/* Macro Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-[#f0faff] border border-cyan-500/30">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Total Alert Hours</div>
                  <div className="text-2xl font-mono font-black text-[#127694]">3,276 <span className="text-xs font-normal text-slate-400">hrs</span></div>
                  <div className="text-[10px] text-slate-500 mt-1">Across 8,760-hour polar cycle</div>
                </div>

                <div className="p-4 rounded-xl bg-[#f0faff] border border-cyan-500/30">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Annual Duration</div>
                  <div className="text-2xl font-mono font-black text-amber-700">37.4%</div>
                  <div className="text-[10px] text-slate-500 mt-1">Fraction of year with &ge;1 active alert</div>
                </div>

                <div className="p-4 rounded-xl bg-[#f0faff] border border-cyan-500/30">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Peak Risk Season</div>
                  <div className="text-2xl font-mono font-black text-rose-700">Jun – Aug</div>
                  <div className="text-[10px] text-slate-500 mt-1">78.4% of all compound contingencies</div>
                </div>

                <div className="p-4 rounded-xl bg-[#f0faff] border border-cyan-500/30">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Genset Overload Hours</div>
                  <div className="text-2xl font-mono font-black text-emerald-700">0.0 <span className="text-xs font-normal text-slate-500">hrs</span></div>
                  <div className="text-[10px] text-emerald-400/80 mt-1">100% prevented by MILP dispatch</div>
                </div>
              </div>

              {/* 12-Month x 8-Category Heatmap Table */}
              <div className="p-4 rounded-xl bg-[#f0faff] border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <i className="fa-solid fa-table-cells text-[#0699C6]"></i>
                    <span>12-Month &times; 8-Category Alert Density Heatmap (Hours per Month)</span>
                  </h4>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                    <span>Intensity:</span>
                    <span className="px-1.5 py-0.5 rounded bg-[#e5f6fd] text-[#127694] border border-cyan-800">Low (&lt;50h)</span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300">Med (50-200h)</span>
                    <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-300">High (&gt;200h)</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 text-[10px]">
                        <th className="py-2 px-3">MONTH</th>
                        <th className="py-2 px-2 text-center">COLD</th>
                        <th className="py-2 px-2 text-center">WIND</th>
                        <th className="py-2 px-2 text-center">BATTERY</th>
                        <th className="py-2 px-2 text-center">GENERATOR</th>
                        <th className="py-2 px-2 text-center">LOAD</th>
                        <th className="py-2 px-2 text-center">FUEL</th>
                        <th className="py-2 px-2 text-center">RESERVE</th>
                        <th className="py-2 px-2 text-center">COMPOUND</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {annualMatrix?.months?.map((m) => {
                        const row = annualMatrix?.density_hours?.[m] || {};
                        return (
                          <tr key={m} className="hover:bg-slate-50 transition">
                            <td className="py-2 px-3 font-bold text-slate-700">{m}</td>
                            {annualMatrix?.categories?.map((c) => {
                              const hrs = row[c] || 0;
                              let cellClass = 'bg-slate-50 text-slate-400';
                              if (hrs >= 200) cellClass = 'bg-rose-100 text-rose-800 font-bold border border-rose-300';
                              else if (hrs >= 50) cellClass = 'bg-amber-100 text-amber-800 font-semibold border border-amber-300';
                              else if (hrs > 0) cellClass = 'bg-[#e5f6fd]/40 text-[#127694]';
                              return (
                                <td key={c} className={`py-1.5 px-2 text-center rounded m-0.5 ${cellClass}`}>
                                  {hrs}h
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: WORST ANNUAL EVENT & BREAKING POINT */}
          {activeTab === 'worst' && (
            <div className="space-y-6">
              
              {/* Worst Event: Hour 3,410 Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-rose-50 via-white to-rose-50 border-2 border-rose-300 shadow-xl space-y-4">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-rose-500 text-white">
                        BENCHMARK EVENT: HOUR 3,410
                      </span>
                      <span className="text-xs text-rose-800 font-bold">May 22, 02:00 UTC · Austral Polar Night</span>
                    </div>
                    <h3 className="text-xl font-black text-rose-950 mt-1">
                      Worst Multi-System Compound Outage of 8,760-Hour Cycle
                    </h3>
                  </div>

                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1.5">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    5 Concurrent Active Alarms
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[10px] text-slate-400">Ambient Temperature</div>
                    <div className="text-lg font-bold text-rose-400">-36.93°C</div>
                    <div className="text-[10px] text-slate-500">Peak building heat loss</div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[10px] text-slate-400">Wind Velocity</div>
                    <div className="text-lg font-bold text-amber-400">25.88 m/s</div>
                    <div className="text-[10px] text-amber-400/80">Turbines feathered (0 kW)</div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[10px] text-slate-400">Electrical + Thermal Load</div>
                    <div className="text-lg font-bold text-slate-900">411.32 kW</div>
                    <div className="text-[10px] text-slate-500">+195.4 kWth heating</div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[10px] text-slate-400">Battery State of Charge</div>
                    <div className="text-lg font-bold text-rose-400">20.0% Floor</div>
                    <div className="text-[10px] text-slate-500">Emergency reserve locked</div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-100/90 border border-slate-200 text-xs space-y-2">
                  <div className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                    Autonomous SEMS Mitigation Protocol:
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    SEMS automatically committed dual diesel generators (Genset 1 at 300 kW + Genset 2 synchronized at 111.3 kW). Full diesel co-generation thermal loops recovered 182.0 kWth of exhaust waste heat into the central glycol loop, preventing habitat freeze-out with <strong>zero unserved energy (0.0 kWh)</strong>.
                  </p>
                </div>
              </div>

              {/* Physical Infeasible Breaking Point Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-white to-[#f0faff] border-2 border-[#bcecfc] space-y-4 shadow-xl">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-[10px] font-bold font-mono uppercase px-2 py-0.5 rounded bg-cyan-500/20 text-[#127694] border border-cyan-500/30">
                      PHYSICAL STRESS LIMIT
                    </span>
                    <h3 className="text-lg font-black text-[#127694] mt-1">
                      Antarctic Station Physical Breaking Point Analysis
                    </h3>
                  </div>
                  <div className="text-xs font-mono font-bold text-rose-400 bg-rose-50/60 px-3 py-1.5 rounded-xl border border-rose-800/60">
                    HARDWARE DEFICIT: -36.0 kW
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-[#f0faff] border border-slate-200 space-y-1">
                    <div className="text-[10px] font-bold uppercase text-slate-400">Sustainable Generation Capacity</div>
                    <div className="text-xl font-mono font-black text-[#127694]">580.0 kW</div>
                    <p className="text-[11px] text-slate-400">
                      Genset 1 (300 kW) + Genset 2 (200 kW) + Battery Cold-Derated Discharge Limit (80 kW).
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#f0faff] border border-slate-200 space-y-1">
                    <div className="text-[10px] font-bold uppercase text-slate-400">Peak Polar Blast Demand</div>
                    <div className="text-xl font-mono font-black text-rose-700">616.0 kW</div>
                    <p className="text-[11px] text-slate-400">
                      At -47.57°C ambient temperature and 50.6 m/s wind storm, total electrical and thermal heating load hits 616 kW.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#f0faff] border border-slate-200 space-y-1">
                    <div className="text-[10px] font-bold uppercase text-slate-400">Automated Defense Execution</div>
                    <div className="text-xl font-mono font-black text-emerald-400">TIER 2 & 3 SHED</div>
                    <p className="text-[11px] text-slate-400">
                      Automated shedding of Tier 3 scientific loads (25 kW) and Tier 2 flexible heating (11 kW) covers the 36 kW gap. Tier 1 life support remains 100% powered.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 5: SCADA LIFECYCLE LOG */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <i className="fa-solid fa-clock-rotate-left text-[#0699C6]"></i>
                  <span>Chronological State Machine Transitions (Detected &rarr; Active &rarr; Ack &rarr; Resolved)</span>
                </h4>
                <span className="text-[10px] font-mono text-slate-400">Showing last 30 SCADA lifecycle events</span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                <table className="w-full text-xs font-mono text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100 text-slate-400 text-[10px]">
                      <th className="py-2.5 px-3">TIMESTAMP</th>
                      <th className="py-2.5 px-2">RULE ID</th>
                      <th className="py-2.5 px-2">TITLE</th>
                      <th className="py-2.5 px-2">SEVERITY</th>
                      <th className="py-2.5 px-2">STATE</th>
                      <th className="py-2.5 px-2">OPERATOR</th>
                      <th className="py-2.5 px-3 text-right">TRIGGER VALUE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/60">
                    {historyLogs.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="py-8 text-center text-slate-500">
                          No historical alert transitions logged in buffer.
                        </td>
                      </tr>
                    ) : (
                      historyLogs.map((log, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition">
                          <td className="py-2 px-3 text-slate-400 text-[11px]">
                            {log.timestamp?.replace('T', ' ').substring(11, 19) || '12:00:00'} UTC
                          </td>
                          <td className="py-2 px-2 font-bold text-[#127694]">{log.rule_id}</td>
                          <td className="py-2 px-2 text-slate-700 font-sans text-xs">{log.title}</td>
                          <td className="py-2 px-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getSeverityBadge(log.severity)}`}>
                              {log.severity}
                            </span>
                          </td>
                          <td className="py-2 px-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              log.state === 'ACTIVE'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : log.state === 'ACKNOWLEDGED'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {log.state}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-slate-400 text-[11px]">{log.acknowledged_by || 'Autonomous Engine'}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-700">{log.trigger_value}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-cyan-500/20 bg-slate-100/90 text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span>POLAR-EMS Safety Supervisor: Autonomous Multi-Tier Contingency Armed</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#127694] hover:bg-[#0699C6] text-white font-bold text-xs border border-slate-200 transition"
          >
            Close Alert Center
          </button>
        </div>

      </div>
    </div>
  );
}
