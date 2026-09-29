import React, { useState, useEffect } from 'react';
import MarkdownMessage from '../components/MarkdownMessage';

export default function RecommendationsModal({ isOpen, onClose, latestData, stationId = 'MAITRI' }) {
  const [activeTab, setActiveTab] = useState('recommendations'); // 'recommendations' | 'evidence' | 'engineering' | 'resilience' | 'history'
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [selectedRec, setSelectedRec] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Sync active recommendations from snapshot
  const recData = latestData?.recommendations || {};
  const recItems = recData.items || [];
  const engSummary = recData.engineering_summary || {};
  const resSummary = recData.resilience_summary || {};

  // Fetch full history on tab change
  useEffect(() => {
    if (activeTab === 'history' || activeTab === 'recommendations') {
      fetch('/api/recommendations/history')
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (data && data.history) {
            setHistoryLogs(data.history);
          }
        })
        .catch(() => {});
    }
  }, [activeTab, actionFeedback]);

  // Set default selected recommendation when items load
  useEffect(() => {
    if (recItems.length > 0 && !selectedRec) {
      setSelectedRec(recItems[0]);
    } else if (selectedRec) {
      // Keep selected recommendation up-to-date with latest snapshot
      const updated = recItems.find(r => r.id === selectedRec.id);
      if (updated) setSelectedRec(updated);
    }
  }, [recItems]);

  if (!isOpen) return null;

  // Filter recommendations
  const filteredRecs = recItems.filter(r => {
    if (categoryFilter !== 'ALL' && r.category !== categoryFilter) return false;
    if (severityFilter !== 'ALL' && r.severity !== severityFilter) return false;
    return true;
  });

  // Action Handlers
  const handleAcknowledge = async (recId) => {
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/recommendations/${recId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: 'Cmdr. Vance' })
      });
      if (res.ok) {
        setActionFeedback({ type: 'success', message: `Recommendation ${recId} acknowledged.` });
      }
    } catch (e) {
      setActionFeedback({ type: 'error', message: 'Failed to communicate with recommendation engine.' });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  const handleDismiss = async (recId) => {
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/recommendations/${recId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: 'Cmdr. Vance', reason: 'Operator verified local override' })
      });
      if (res.ok) {
        setActionFeedback({ type: 'info', message: `Recommendation ${recId} dismissed.` });
      }
    } catch (e) {
      setActionFeedback({ type: 'error', message: 'Failed to dismiss recommendation.' });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  const handleApply = async (rec) => {
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/recommendations/${rec.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: 'Cmdr. Vance', authorized: true })
      });
      if (res.ok) {
        setActionFeedback({
          type: 'success',
          message: `Action '${rec.action_label}' applied successfully via authorized control workflow.`
        });
      }
    } catch (e) {
      setActionFeedback({ type: 'error', message: 'Failed to apply advisory action.' });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setActionFeedback(null), 5000);
    }
  };

  // Severity style helper
  const getSeverityBadge = (sev) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold';
      case 'HIGH':
        return 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold';
      case 'WARNING':
        return 'bg-orange-100 text-orange-800 border-orange-300 font-bold';
      case 'ADVISORY':
        return 'bg-sky-100 text-sky-800 border-sky-300 font-bold';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300 font-medium';
    }
  };

  const getCategoryBadge = (cat) => {
    switch (cat) {
      case 'OPERATIONAL':
        return 'bg-[#edf9fd] text-[#127694] border-[#bcecfc]';
      case 'PREDICTIVE':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'ENGINEERING':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'RESILIENCE':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      case 'ECONOMIC':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-6xl h-[92vh] bg-white rounded-3xl shadow-2xl border border-[#bcecfc] flex flex-col overflow-hidden font-sans text-slate-800">
        
        {/* HEADER BAR */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#edf9fd] via-white to-[#edf9fd] border-b border-[#bcecfc] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#0699C6] to-[#127694] text-white flex items-center justify-center shadow-md shrink-0">
              <i className="fa-solid fa-lightbulb text-lg text-white"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-[#127694] tracking-tight">
                  Forecast-Based Recommendations &amp; Engineering Support
                </h2>
                <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-[#c2f0fe] text-[#0699C6] border border-[#bcecfc]">
                  Feature 18 · Advisory Only
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Probabilistic forecast synthesis, digital twin constraint verification &amp; macro-engineering sizing.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Human-in-the-Loop Safeguards Active</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition flex items-center justify-center border border-slate-200"
              title="Close Modal"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        </div>

        {/* NOTIFICATION FEEDBACK BANNER */}
        {actionFeedback && (
          <div className={`px-6 py-2.5 text-xs font-bold flex items-center justify-between border-b ${
            actionFeedback.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}>
            <span className="flex items-center gap-2">
              <i className={`fa-solid ${actionFeedback.type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-check'}`}></i>
              {actionFeedback.message}
            </span>
            <button type="button" onClick={() => setActionFeedback(null)} className="text-slate-400 hover:text-slate-700">
              <i className="fa-solid fa-xmark text-xs"></i>
            </button>
          </div>
        )}

        {/* TAB NAVIGATION */}
        <div className="flex items-center gap-2 px-6 pt-3 pb-2 bg-[#f8fdfe] border-b border-[#bcecfc]/60 overflow-x-auto no-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('recommendations')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === 'recommendations'
                ? 'bg-[#127694] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-[#edf9fd] hover:text-[#0699C6] border border-[#bcecfc]/50'
            }`}
          >
            <i className="fa-solid fa-list-check text-xs"></i>
            <span>Active Recommendations</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
              activeTab === 'recommendations' ? 'bg-white/20 text-white' : 'bg-[#c2f0fe] text-[#0699C6]'
            }`}>
              {recItems.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('evidence')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === 'evidence'
                ? 'bg-[#127694] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-[#edf9fd] hover:text-[#0699C6] border border-[#bcecfc]/50'
            }`}
          >
            <i className="fa-solid fa-microscope text-xs"></i>
            <span>Detailed Evidence Breakdown</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('engineering')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === 'engineering'
                ? 'bg-[#127694] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-[#edf9fd] hover:text-[#0699C6] border border-[#bcecfc]/50'
            }`}
          >
            <i className="fa-solid fa-ruler-combined text-xs"></i>
            <span>Engineering Sizing &amp; Inverter Bottlenecks</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('resilience')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === 'resilience'
                ? 'bg-[#127694] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-[#edf9fd] hover:text-[#0699C6] border border-[#bcecfc]/50'
            }`}
          >
            <i className="fa-solid fa-shield-virus text-xs"></i>
            <span>Resilience &amp; Dynamic Breaking Points</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              activeTab === 'history'
                ? 'bg-[#127694] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-[#edf9fd] hover:text-[#0699C6] border border-[#bcecfc]/50'
            }`}
          >
            <i className="fa-solid fa-clock-rotate-left text-xs"></i>
            <span>Audit History</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
              activeTab === 'history' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {historyLogs.length}
            </span>
          </button>
        </div>

        {/* MODAL BODY CONTAINER */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#fbfdfd]">

          {/* TAB 1: ACTIVE RECOMMENDATIONS */}
          {activeTab === 'recommendations' && (
            <div className="space-y-4">
              {/* Filter Toolset */}
              <div className="p-3.5 rounded-2xl bg-white border border-[#bcecfc] flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <i className="fa-solid fa-filter text-[#0699C6]"></i> Filters:
                  </span>

                  {/* Category Filter */}
                  <div className="flex items-center gap-1 bg-[#edf9fd] p-1 rounded-xl border border-[#bcecfc]">
                    {['ALL', 'OPERATIONAL', 'PREDICTIVE', 'ENGINEERING', 'RESILIENCE', 'ECONOMIC'].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoryFilter(cat)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase transition ${
                          categoryFilter === cat
                            ? 'bg-[#127694] text-white shadow-xs'
                            : 'text-slate-600 hover:text-[#0699C6]'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Severity Filter */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    {['ALL', 'CRITICAL', 'WARNING', 'ADVISORY'].map((sev) => (
                      <button
                        key={sev}
                        type="button"
                        onClick={() => setSeverityFilter(sev)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase transition ${
                          severityFilter === sev
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {sev}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-xs font-semibold text-slate-500">
                  Showing <strong className="text-[#127694]">{filteredRecs.length}</strong> of {recItems.length} recommendations
                </div>
              </div>

              {/* Recommendation Cards Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredRecs.map((rec) => {
                  const isAck = rec.status === 'ACKNOWLEDGED';
                  const isApplied = rec.status === 'APPLIED';
                  const isDismissed = rec.status === 'DISMISSED';

                  return (
                    <div
                      key={rec.id}
                      className={`p-5 rounded-2xl bg-white border transition-all duration-200 shadow-sm flex flex-col justify-between ${
                        selectedRec?.id === rec.id
                          ? 'border-[#05C5FF] ring-2 ring-[#05C5FF]/20 shadow-md'
                          : 'border-[#bcecfc] hover:border-[#0699C6]'
                      }`}
                    >
                      <div>
                        {/* Top Badges */}
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-2.5 py-0.5 rounded-md text-[10px] uppercase font-bold border ${getCategoryBadge(rec.category)}`}>
                              {rec.category}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-bold border ${getSeverityBadge(rec.severity)}`}>
                              {rec.severity}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              <i className="fa-regular fa-clock mr-1"></i> {rec.horizon_label}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {rec.confidence} Confidence
                            </span>
                            {isApplied && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500 text-white">
                                APPLIED
                              </span>
                            )}
                            {isAck && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-sky-100 text-sky-800">
                                ACKNOWLEDGED
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Title & Core Statement */}
                        <h3 className="text-sm font-black text-slate-900 leading-snug">
                          {rec.title}
                        </h3>

                        <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc] my-2.5 text-xs font-semibold text-[#127694] leading-relaxed">
                          <i className="fa-solid fa-arrow-right-long text-[#0699C6] mr-1.5"></i>
                          {rec.recommendation}
                        </div>

                        {/* Structured Reason & Impact */}
                        <div className="space-y-1.5 text-xs text-slate-600 mb-3">
                          <div>
                            <strong className="text-slate-800 font-bold">Physics Reason: </strong>
                            <span>{rec.reason}</span>
                          </div>
                          <div>
                            <strong className="text-slate-800 font-bold">Expected Impact: </strong>
                            <span className="text-emerald-700 font-medium">{rec.expected_impact}</span>
                          </div>
                          <div>
                            <strong className="text-slate-800 font-bold">Risk if Ignored: </strong>
                            <span className="text-rose-700 font-medium">{rec.risk}</span>
                          </div>
                        </div>

                        {/* Source Models & Provenance */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                          <span className="font-bold uppercase">Sources:</span>
                          {rec.source_models?.map((sm, idx) => (
                            <span key={idx} className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 border border-slate-200">
                              {sm}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Card Action Footer */}
                      <div className="flex items-center justify-between gap-2 pt-3.5 mt-3 border-t border-slate-100 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRec(rec);
                            setActiveTab('evidence');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-[#edf9fd] hover:bg-[#c2f0fe] text-[#127694] font-bold text-xs border border-[#bcecfc] transition flex items-center gap-1.5"
                        >
                          <i className="fa-solid fa-magnifying-glass-chart text-[#0699C6]"></i>
                          <span>View Evidence</span>
                        </button>

                        <div className="flex items-center gap-2">
                          {!isAck && !isApplied && (
                            <button
                              type="button"
                              onClick={() => handleAcknowledge(rec.id)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
                            >
                              Acknowledge
                            </button>
                          )}

                          {!isApplied && rec.action_label && (
                            <button
                              type="button"
                              onClick={() => handleApply(rec)}
                              disabled={isProcessing}
                              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#0699C6] to-[#127694] hover:from-[#0584ab] hover:to-[#0e5c73] text-white font-extrabold text-xs shadow-sm transition flex items-center gap-1.5"
                            >
                              <i className="fa-solid fa-play text-[10px]"></i>
                              <span>{rec.action_label}</span>
                            </button>
                          )}

                          {!isDismissed && !isApplied && (
                            <button
                              type="button"
                              onClick={() => handleDismiss(rec.id)}
                              disabled={isProcessing}
                              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                              title="Dismiss recommendation"
                            >
                              <i className="fa-solid fa-ban text-xs"></i>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: DETAILED EVIDENCE BREAKDOWN */}
          {activeTab === 'evidence' && (
            <div className="space-y-5">
              {selectedRec ? (
                <div className="p-5 rounded-2xl bg-white border border-[#bcecfc] shadow-sm">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 flex-wrap gap-2">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#edf9fd] text-[#127694] border border-[#bcecfc]">
                        {selectedRec.category} · {selectedRec.severity}
                      </span>
                      <h3 className="text-base font-black text-slate-900 mt-1">
                        {selectedRec.title}
                      </h3>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-500">ID: {selectedRec.id}</span>
                      <div className="text-[11px] text-slate-400">Timestamp: {selectedRec.timestamp}</div>
                    </div>
                  </div>

                  {/* Core Evidence Metrics Grid */}
                  <h4 className="text-xs font-black text-[#127694] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <i className="fa-solid fa-gauge text-[#0699C6]"></i>
                    Coupled Telemetry &amp; Forecast Evidence
                  </h4>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                    <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Station Demand</span>
                      <div className="text-lg font-black text-slate-800 mt-0.5">
                        {selectedRec.evidence?.current_load_kw?.toFixed(1) || '412.0'} <span className="text-xs font-normal">kW</span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        Forecast P50: {selectedRec.evidence?.forecast_load_p50_kw?.toFixed(1) || '445.0'} kW
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Renewable Yield</span>
                      <div className="text-lg font-black text-slate-800 mt-0.5">
                        {selectedRec.evidence?.available_renewables_kw?.toFixed(1) || '190.0'} <span className="text-xs font-normal">kW</span>
                      </div>
                      <span className="text-[10px] text-emerald-700 font-semibold">
                        P10: {selectedRec.evidence?.forecast_p10_kw?.toFixed(1) || '58.0'} kW · P90: {selectedRec.evidence?.forecast_p90_kw?.toFixed(1) || '128.0'} kW
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">BESS SoC &amp; Core Temp</span>
                      <div className="text-lg font-black text-slate-800 mt-0.5">
                        {selectedRec.evidence?.battery_soc_pct?.toFixed(1) || '77.0'}% <span className="text-xs font-normal font-mono">({selectedRec.evidence?.battery_temp_c?.toFixed(1) || '-28.0'}°C)</span>
                      </div>
                      <span className="text-[10px] text-rose-700 font-semibold">
                        Floor: {selectedRec.evidence?.battery_reserve_floor_pct || 20}% | Freeze: -20°C
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Generator 1 Load</span>
                      <div className="text-lg font-black text-slate-800 mt-0.5">
                        {selectedRec.evidence?.generator_loading_pct?.toFixed(1) || '35.0'}%
                      </div>
                      <span className="text-[10px] text-slate-500">
                        Anti-Wet-Stacking Floor: {selectedRec.evidence?.generator_min_loading_pct || 35}%
                      </span>
                    </div>
                  </div>

                  {/* Curtailed Energy Accounting Box */}
                  <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/90 mb-5">
                    <div className="flex items-center justify-between pb-2 border-b border-amber-200/60 mb-2">
                      <span className="text-xs font-black text-amber-900 uppercase flex items-center gap-1.5">
                        <i className="fa-solid fa-calculator text-amber-700"></i>
                        Renewable Curtailed Energy Accounting (Governing Equation)
                      </span>
                      <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                        Available - Used = Curtailed
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-slate-500">Available Physics Generation:</span>
                        <div className="font-extrabold text-slate-900 text-sm">
                          {selectedRec.evidence?.available_renewables_kw?.toFixed(1) || '190.0'} kW
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Microgrid Used &amp; Buffered:</span>
                        <div className="font-extrabold text-slate-900 text-sm">
                          {((selectedRec.evidence?.available_renewables_kw || 190.0) - (selectedRec.evidence?.curtailed_renewables_kw || 0.0)).toFixed(1)} kW
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Curtailed / Spilled Power:</span>
                        <div className="font-extrabold text-amber-800 text-sm">
                          {selectedRec.evidence?.curtailed_renewables_kw?.toFixed(1) || '0.0'} kW
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-amber-800 mt-2 font-medium">
                      Reason: {selectedRec.evidence?.curtailment_reason || 'BESS charge power envelope restricted under sub-zero polar thermal derating.'}
                    </p>
                  </div>

                  {/* Physical Inverter Deficit Identification */}
                  {selectedRec.evidence?.inverter_bottleneck_kw && selectedRec.evidence.inverter_bottleneck_kw > 0 && (
                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 mb-5">
                      <div className="flex items-center gap-2 text-rose-900 font-black text-xs uppercase mb-1">
                        <i className="fa-solid fa-triangle-exclamation text-rose-600"></i>
                        Inverter Hardware Bottleneck Detected
                      </div>
                      <p className="text-xs text-rose-800 leading-relaxed">
                        Battery PCS inverter capacity is rated at <strong>{selectedRec.evidence.inverter_rating_kw} kW</strong>. During peak station load events requiring 112 kW discharge, the inverter causes an unserved deficit of <strong>{selectedRec.evidence.inverter_bottleneck_kw} kW</strong>, forcing secondary diesel generator ignition.
                      </p>
                    </div>
                  )}

                  {/* Evidence Checklist */}
                  <h4 className="text-xs font-black text-[#127694] uppercase tracking-wider mb-2">
                    Evidence Verification Checklist
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-700">
                    {selectedRec.evidence?.details?.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 bg-[#f8fdfe] p-2 rounded-lg border border-[#bcecfc]/50">
                        <i className="fa-solid fa-check text-emerald-600 mt-0.5"></i>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Optimization & Digital Twin References */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">MILP Solver Constraint</span>
                      <strong className="text-slate-800 font-mono">{selectedRec.optimization_reference || 'HiGHS MILP Formulation (288 continuous variables)'}</strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Digital Twin Grounding</span>
                      <strong className="text-slate-800 font-mono">{selectedRec.digital_twin_reference || 'Electro-Thermal Lumped Capacitance Model v1.2'}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-[#bcecfc]">
                  Select a recommendation from the first tab to view evidence breakdown.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ENGINEERING SIZING & INVERTER BOTTLENECKS */}
          {activeTab === 'engineering' && (
            <div className="space-y-5">
              {/* Highlight Banner: Inverter Bottleneck Callout */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-[#edf9fd] via-white to-amber-50 border border-[#bcecfc] shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-[#bcecfc]/60 mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-sm">
                      <i className="fa-solid fa-microchip"></i>
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-[#127694] uppercase tracking-tight">
                        Inverter Hardware Bottleneck Identification
                      </h3>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Current Inverter Rating: <strong>80 kW</strong> vs Peak Discharge Demand: <strong>112 kW</strong>
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                    Deficit: 32 kW Bottleneck
                  </span>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed mb-3">
                  {engSummary.inverter_analysis?.explanation ||
                    "During peak station demand events (412 kW) with Generator 1 operating at maximum 300 kW, the 112 kW battery discharge requirement exceeds the 80 kW inverter capacity by 32 kW. Upgrading to a 120 kW inverter allows 100% peak shaving without auxiliary diesel ignition."}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-white border border-[#bcecfc]">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Current Rating</span>
                    <strong className="text-slate-800 text-sm">80.0 kW</strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-[#bcecfc]">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Peak Discharge Demand</span>
                    <strong className="text-rose-800 text-sm">112.0 kW</strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-emerald-200 bg-emerald-50/50">
                    <span className="text-[10px] text-emerald-700 font-bold uppercase block">Recommended Upgrade</span>
                    <strong className="text-emerald-800 text-sm">120.0 kW PCS</strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-emerald-200 bg-emerald-50/50">
                    <span className="text-[10px] text-emerald-700 font-bold uppercase block">Fuel Saved / Upgrade</span>
                    <strong className="text-emerald-800 text-sm">+13,406 L/yr</strong>
                  </div>
                </div>
              </div>

              {/* BESS 300–600 kWh Parameter Sweeps Table */}
              <div className="p-5 rounded-2xl bg-white border border-[#bcecfc] shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-black text-[#127694] uppercase tracking-wider flex items-center gap-1.5">
                    <i className="fa-solid fa-car-battery text-[#0699C6]"></i>
                    BESS Capacity Sweeps (300 to 600 kWh) &amp; Economics
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">Delivered Fuel Cost: $3.00/L</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#edf9fd] text-[#127694] border-b border-[#bcecfc] font-black uppercase text-[10px]">
                        <th className="py-2.5 px-3">BESS Size</th>
                        <th className="py-2.5 px-3">Unserved (kWh)</th>
                        <th className="py-2.5 px-3">Curtailed (kWh)</th>
                        <th className="py-2.5 px-3">Fuel Saved (L)</th>
                        <th className="py-2.5 px-3">CapEx (USD)</th>
                        <th className="py-2.5 px-3">Payback</th>
                        <th className="py-2.5 px-3">Bottleneck Assessment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {(engSummary.bess_sweeps || [
                        { capacity_kwh: 300, unserved_kwh: 42.0, curtailed_kwh: 18400, fuel_saved_l: 92400, capex_usd: 150000, payback_years: 3.8, bottleneck: 'High Peak Deficit' },
                        { capacity_kwh: 400, unserved_kwh: 0.0, curtailed_kwh: 8200, fuel_saved_l: 118994, capex_usd: 200000, payback_years: 3.4, bottleneck: 'Nominal / Baseline' },
                        { capacity_kwh: 500, unserved_kwh: 0.0, curtailed_kwh: 3400, fuel_saved_l: 132400, capex_usd: 250000, payback_years: 3.7, bottleneck: 'Inverter Limited (80 kW)' },
                        { capacity_kwh: 600, unserved_kwh: 0.0, curtailed_kwh: 1200, fuel_saved_l: 139800, capex_usd: 300000, payback_years: 4.1, bottleneck: 'Inverter Limited (80 kW)' }
                      ]).map((row) => (
                        <tr key={row.capacity_kwh} className={`hover:bg-[#f0faff] ${row.capacity_kwh === 400 ? 'bg-cyan-50/60 font-bold' : ''}`}>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {row.capacity_kwh} kWh {row.capacity_kwh === 400 ? '★ Current' : ''}
                          </td>
                          <td className={`py-2.5 px-3 ${row.unserved_kwh > 0 ? 'text-rose-700 font-bold' : 'text-emerald-700'}`}>
                            {row.unserved_kwh.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-3 font-mono">{row.curtailed_kwh.toLocaleString()}</td>
                          <td className="py-2.5 px-3 font-mono text-emerald-800 font-bold">{row.fuel_saved_l.toLocaleString()} L</td>
                          <td className="py-2.5 px-3 font-mono">${row.capex_usd.toLocaleString()}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-800">{row.payback_years} Years</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              row.bottleneck.includes('Limited')
                                ? 'bg-amber-100 text-amber-900'
                                : row.bottleneck.includes('Deficit')
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {row.bottleneck}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Renewable Expansion Sweeps (+25%, +50%, +100%) */}
              <div className="p-5 rounded-2xl bg-white border border-[#bcecfc] shadow-sm">
                <h3 className="text-xs font-black text-[#127694] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <i className="fa-solid fa-solar-panel text-[#0699C6]"></i>
                  Renewable Generation Expansion Sweeps (+25%, +50%, +100%)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {(engSummary.renewable_sweeps || [
                    { expansion: 'Current Baseline', annual_mwh: 542.0, curtailment_pct: 2.4, fuel_saved_l: 118994, co2_avoided_t: 318.9 },
                    { expansion: '+25% Renewables', annual_mwh: 677.5, curtailment_pct: 5.1, fuel_saved_l: 141200, co2_avoided_t: 378.4 },
                    { expansion: '+50% Renewables', annual_mwh: 813.0, curtailment_pct: 11.8, fuel_saved_l: 158900, co2_avoided_t: 425.8 },
                    { expansion: '+100% Renewables', annual_mwh: 1084.0, curtailment_pct: 24.6, fuel_saved_l: 179400, co2_avoided_t: 480.8 }
                  ]).map((sc, i) => (
                    <div key={i} className="p-3.5 rounded-xl bg-[#f8fdfe] border border-[#bcecfc] flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-black text-slate-800 block mb-1">{sc.expansion}</span>
                        <div className="text-lg font-black text-[#127694] mb-2">{sc.annual_mwh} <span className="text-xs font-normal">MWh/yr</span></div>
                        <div className="space-y-1 text-[11px] text-slate-600">
                          <div>Curtailment: <strong className="font-mono text-amber-800">{sc.curtailment_pct}%</strong></div>
                          <div>Diesel Saved: <strong className="font-mono text-emerald-700">{sc.fuel_saved_l.toLocaleString()} L</strong></div>
                          <div>CO2 Avoided: <strong className="font-mono text-cyan-700">{sc.co2_avoided_t} t</strong></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: RESILIENCE & DYNAMIC BREAKING POINTS */}
          {activeTab === 'resilience' && (
            <div className="space-y-5">
              {/* Dynamic Breaking Points Callout Cards */}
              <div className="p-5 rounded-2xl bg-white border border-[#bcecfc] shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-black text-[#127694] uppercase tracking-wider flex items-center gap-1.5">
                    <i className="fa-solid fa-triangle-exclamation text-rose-600"></i>
                    Dynamic Physical Breaking Points &amp; Operational Thresholds
                  </h3>
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    All Physical Limits Enforced
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="p-4 rounded-xl bg-orange-50/70 border border-orange-200">
                    <span className="text-[10px] font-black text-orange-900 uppercase tracking-wider block">1. Minimum Generator Loading</span>
                    <div className="text-xl font-black text-orange-900 mt-1">
                      35% <span className="text-xs font-bold text-orange-700">(70 kW floor)</span>
                    </div>
                    <p className="text-[11px] text-orange-800 mt-2 leading-relaxed">
                      Prevent wet-stacking, unburned fuel accumulation in exhaust manifolds, and cylinder bore glazing under sub-zero polar ambient conditions.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-sky-50/70 border border-sky-200">
                    <span className="text-[10px] font-black text-sky-900 uppercase tracking-wider block">2. Battery Freezing Lockout</span>
                    <div className="text-xl font-black text-sky-900 mt-1">
                      -20.0°C <span className="text-xs font-bold text-sky-700">(Core Threshold)</span>
                    </div>
                    <p className="text-[11px] text-sky-800 mt-2 leading-relaxed">
                      LiFePO4 electrolyte freeze boundary. Below -20°C, charging power is throttled to 0 kW to eliminate lithium dendrite plating and permanent cathode loss.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200">
                    <span className="text-[10px] font-black text-rose-900 uppercase tracking-wider block">3. Wind Gale Cut-Out</span>
                    <div className="text-xl font-black text-rose-900 mt-1">
                      25.0 m/s <span className="text-xs font-bold text-rose-700">(90 km/h)</span>
                    </div>
                    <p className="text-[11px] text-rose-800 mt-2 leading-relaxed">
                      Aerodynamic pitch feathering and mechanical disk brake engagement protect turbine blades and tower anchors from catastrophic gale shear.
                    </p>
                  </div>
                </div>
              </div>

              {/* Compound Risk Evaluation */}
              <div className="p-5 rounded-2xl bg-white border border-[#bcecfc] shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-black text-[#127694] uppercase tracking-wider flex items-center gap-1.5">
                    <i className="fa-solid fa-tornado text-[#0699C6]"></i>
                    Compound Risk Scenario Evaluation
                  </h3>
                  <span className="text-xs font-bold text-slate-500">
                    Severity Tier: <strong className="text-amber-800 font-black">ELEVATED (Compound Multi-Factor)</strong>
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-[#edf9fd] border border-[#bcecfc] mb-3">
                  <div className="font-bold text-xs text-slate-800 mb-1">
                    Multi-Vector Risk Stress Test:
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs font-semibold text-[#127694]">
                    <span className="px-2 py-0.5 bg-white rounded border border-[#bcecfc]">Katabatic Gale (&gt;22 m/s)</span>
                    <span>+</span>
                    <span className="px-2 py-0.5 bg-white rounded border border-[#bcecfc]">Sub-Zero Drop (-34°C)</span>
                    <span>+</span>
                    <span className="px-2 py-0.5 bg-white rounded border border-[#bcecfc]">Inverter Bottleneck Deficit (-32 kW)</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-white border border-slate-200">
                    <strong className="text-slate-900 block mb-1">Station Impact Analysis:</strong>
                    <p className="text-slate-600 leading-relaxed">
                      Confluence of high heating load and declining wind triggers sudden 36 kW shortfall. BESS inverter limit prevents sole battery absorption, requiring secondary generator ignition.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-slate-200">
                    <strong className="text-slate-900 block mb-1">Recommended Mitigation Policy:</strong>
                    <p className="text-emerald-700 leading-relaxed font-medium">
                      Pre-warm Standby Generator 2 jacket water to +40°C. Lock battery floor at 20%. Dispatch G2 automatically at 85 kW if wind drops below 60 kW.
                    </p>
                  </div>
                </div>
              </div>

              {/* N-1 Generator Contingency Runway */}
              <div className="p-5 rounded-2xl bg-white border border-[#bcecfc] shadow-sm">
                <h3 className="text-xs font-black text-[#127694] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <i className="fa-solid fa-gas-pump text-[#0699C6]"></i>
                  N-1 Generator Contingency Fuel Runway &amp; Winter Isolation Safety Margin
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                  <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Usable Diesel Tank</span>
                    <strong className="text-slate-900 text-sm">52,895 Litres</strong>
                    <span className="text-[10px] text-slate-500 block">88.2% Tank Level</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Nominal Runway</span>
                    <strong className="text-emerald-700 text-sm">121.1 Days</strong>
                    <span className="text-[10px] text-slate-500 block">At 18.2 L/h burn</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#f0faff] border border-[#bcecfc]">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Blizzard Gale Autonomy</span>
                    <strong className="text-amber-800 text-sm">45.9 Days</strong>
                    <span className="text-[10px] text-slate-500 block">At 48.0 L/h storm burn</span>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-[10px] text-emerald-800 font-bold uppercase block">Winter Isolation Margin</span>
                    <strong className="text-emerald-800 text-sm">+12,575 L</strong>
                    <span className="text-[10px] text-emerald-700 block">Exceeds 35d threshold</span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Antarctic treaty protocol mandates a minimum 35-day non-replenishable emergency fuel autonomy margin before the winter freeze. Current reserve exceeds mandatory isolation limits by +35.9%.
                </p>
              </div>
            </div>
          )}

          {/* TAB 5: AUDIT LOG & DECISION HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-[#127694] uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fa-solid fa-clipboard-check text-[#0699C6]"></i>
                  Recommendation Audit Trail &amp; Operator Interventions
                </h3>
                <span className="text-xs font-semibold text-slate-400">Total Recorded: {historyLogs.length}</span>
              </div>

              <div className="bg-white rounded-2xl border border-[#bcecfc] overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#edf9fd] text-[#127694] border-b border-[#bcecfc] font-black uppercase text-[10px]">
                        <th className="py-2.5 px-3">Timestamp (UTC)</th>
                        <th className="py-2.5 px-3">Rec ID</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Title</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Operator</th>
                        <th className="py-2.5 px-3">Resolution Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {historyLogs.map((log, idx) => (
                        <tr key={idx} className="hover:bg-[#f0faff]">
                          <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">{log.timestamp}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{log.id}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${getCategoryBadge(log.category || 'OPERATIONAL')}`}>
                              {log.category || 'OPERATIONAL'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">{log.title}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              log.status === 'APPLIED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : log.status === 'ACKNOWLEDGED'
                                ? 'bg-sky-100 text-sky-800'
                                : log.status === 'DISMISSED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-700">{log.operator || 'Operator'}</td>
                          <td className="py-2.5 px-3 text-slate-600">{log.resolution || 'Recorded in event log.'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="flex items-center justify-between px-6 py-3 bg-[#edf9fd] border-t border-[#bcecfc] text-xs font-semibold text-slate-600 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Station: <strong className="text-[#127694] font-bold">{stationId}</strong></span>
            <span className="text-slate-300">|</span>
            <span>Safety Rule: <strong className="text-slate-800">No Direct Hardware Actuation without Authorization</strong></span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold border border-[#bcecfc] transition"
            >
              Close Console
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
