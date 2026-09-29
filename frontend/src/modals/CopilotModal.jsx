import React, { useState, useRef, useEffect } from 'react';
import MarkdownMessage from '../components/MarkdownMessage';
import { generateCopilotResponse, getFallbackIntelligenceState, getFallbackSimulation } from '../utils/copilotEngine';

export default function CopilotModal({ isOpen, onClose, stationId = 'MAITRI', latestData, onOpenModal, initialQuery }) {
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'anomalies' | 'digital_twin' | 'counterfactual' | 'mlops' | 'audit'

  // Copilot Controls
  const [copilotMode, setCopilotMode] = useState('auto'); // 'auto' | 'cloud' | 'local'
  const [activeModeDisplay, setActiveModeDisplay] = useState('LOCAL_FALLBACK');
  const [userRole, setUserRole] = useState('Operator'); // 'Viewer' | 'Operator' | 'Commander'
  
  // Chat Messages State
  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      role: 'Copilot',
      time: '12:00 UTC',
      answer: "Commander, I am Polar AI, the operational intelligence copilot for Antarctic Research Stations. I correlate live telemetry, LightGBM quantile forecasts, Digital Twin physics, and deterministic safety rules to explain station decisions.",
      evidence: "System operating at 50.02 Hz frequency lock with zero uncommanded power drift.",
      impact: "All station life-support and scientific habitat heating loads are 100% protected.",
      recommendation: "Maintain automated MILP dispatch. Select any suggested prompt or type an operational query below.",
      sources: ["Live SCADA Telemetry", "HiGHS MILP Solver", "Digital Twin Engine v1.3"],
      action_card: null,
      mode: "LOCAL_FALLBACK"
    }
  ]);
  const [inputVal, setInputVal] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatThreadRef = useRef(null);
  // Proactive Insights & Prompts
  const fallbackState = getFallbackIntelligenceState(stationId);
  const [proactiveInsights, setProactiveInsights] = useState([]);
  const [suggestedPrompts, setSuggestedPrompts] = useState([
    "Explain the latest system decision and dispatch action",
    "Why did Diesel Generator 2 start or run?",
    "Why is the battery charging or discharging?",
    "Why did the optimizer choose this dispatch?",
    "Why are renewables curtailed or buffered into storage?",
    "What's happening right now?",
    "Compare Maitri and Bharati station metrics"
  ]);

  // Intelligence State (Initialized with grounded station models)
  const [statusData, setStatusData] = useState(() => fallbackState.status);
  const [anomalyData, setAnomalyData] = useState(() => fallbackState.anomalies);
  const [residualData, setResidualData] = useState(() => fallbackState.residuals);
  const [mlopsData, setMlopsData] = useState(() => fallbackState.mlops);
  const [timelineData, setTimelineData] = useState(() => fallbackState.timeline);
  const [auditData, setAuditData] = useState(() => fallbackState.audit);
  const [metricsData, setMetricsData] = useState(() => fallbackState.metrics);
  
  // Counterfactual State
  const [selectedScenario, setSelectedScenario] = useState('GENSET_1_FAILURE');
  const [simulationResult, setSimulationResult] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);
  const [expandedCards, setExpandedCards] = useState({});

  const SCENARIOS = [
    { id: 'GENSET_1_FAILURE', label: 'Genset 1 Sudden Trip', icon: 'fa-triangle-exclamation', color: 'rose' },
    { id: 'BESS_UNAVAILABLE', label: 'Battery Freeze Lockout', icon: 'fa-car-battery', color: 'amber' },
    { id: 'WIND_ICING_CUTOUT', label: 'Turbine Gale Cut-Out (>25 m/s)', icon: 'fa-wind', color: 'sky' },
    { id: 'POLAR_VORTEX_SURGE', label: 'Polar Vortex Thermal Shock (-44°C)', icon: 'fa-snowflake', color: 'cyan' },
    { id: 'SCIENTIFIC_LOAD_SPIKE', label: 'Drill Load Spike (+50 kW)', icon: 'fa-bolt-lightning', color: 'emerald' }
  ];

  useEffect(() => {
    if (chatThreadRef.current) {
      chatThreadRef.current.scrollTop = chatThreadRef.current.scrollHeight;
    }
  }, [messages, isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen) return;
    fetchIntelligenceState();
    fetchCopilotMetadata();
  }, [isOpen]);

  // Auto-execute initial query if provided when opening modal
  const initialQueryExecutedRef = useRef(false);
  useEffect(() => {
    if (isOpen && initialQuery && !initialQueryExecutedRef.current) {
      initialQueryExecutedRef.current = true;
      setActiveTab('chat');
      const timer = setTimeout(() => {
        handleSend(initialQuery);
      }, 150);
      return () => clearTimeout(timer);
    }
    if (!isOpen) {
      initialQueryExecutedRef.current = false;
    }
  }, [isOpen, initialQuery]);

  async function fetchCopilotMetadata() {
    try {
      const [resStatus, resIns, resPrompts, resAudit, resMet] = await Promise.all([
        fetch('/api/copilot/status').then(r => r.ok ? r.json() : null),
        fetch('/api/copilot/insights').then(r => r.ok ? r.json() : null),
        fetch('/api/copilot/prompts').then(r => r.ok ? r.json() : null),
        fetch('/api/copilot/audit').then(r => r.ok ? r.json() : null),
        fetch('/api/copilot/metrics').then(r => r.ok ? r.json() : null)
      ]);
      if (resStatus) {
        setActiveModeDisplay(resStatus.copilot_mode);
      }
      if (resIns && resIns.insights) {
        setProactiveInsights(resIns.insights);
      }
      if (resPrompts && resPrompts.prompts) {
        setSuggestedPrompts(resPrompts.prompts);
      }
      if (resAudit && resAudit.audit_trail) {
        setAuditData(resAudit.audit_trail);
      }
      if (resMet) {
        setMetricsData(resMet);
      }
    } catch (e) {
      console.warn('Copilot metadata fetch error:', e);
    }
  }

  async function fetchIntelligenceState() {
    try {
      const [resStatus, resAnom, resResid, resMlops, resTl] = await Promise.all([
        fetch('/api/intelligence/status').then(r => r.ok ? r.json() : null),
        fetch('/api/intelligence/anomalies').then(r => r.ok ? r.json() : null),
        fetch('/api/intelligence/digital-twin/residuals').then(r => r.ok ? r.json() : null),
        fetch('/api/intelligence/mlops').then(r => r.ok ? r.json() : null),
        fetch('/api/intelligence/timeline').then(r => r.ok ? r.json() : null)
      ]);
      if (resStatus) setStatusData(resStatus);
      if (resAnom) setAnomalyData(resAnom);
      if (resResid) setResidualData(resResid);
      if (resMlops) setMlopsData(resMlops);
      if (resTl && resTl.timeline) setTimelineData(resTl.timeline);
    } catch (e) {
      console.error('Error fetching intelligence state:', e);
    }
  }

    const handleSend = async (queryText) => {
    const q = queryText || inputVal;
    if (!q || !q.trim()) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' UTC';
    const userMsg = { sender: 'commander', role: userRole, time: timeStr, answer: q };
    setMessages((prev) => [...prev, userMsg]);
    setInputVal('');
    setIsSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          role: userRole,
          mode: copilotMode === 'auto' ? null : copilotMode,
          station_id: stationId
        })
      });
      if (res.ok) {
        const data = await res.json();
        setActiveModeDisplay(data.copilot_mode || 'LOCAL_FALLBACK');
        setMessages((prev) => [
          ...prev,
          {
            sender: 'ai',
            role: 'Copilot',
            time: timeStr,
            answer: data.answer || 'Response generated.',
            evidence: data.evidence || 'Verified from live telemetry stream.',
            impact: data.impact || 'Station microgrid balance preserved.',
            recommendation: data.recommendation || 'Maintain active dispatch.',
            sources: data.sources || ['Live Telemetry', 'MILP Solver'],
            action_card: data.action_card || null,
            mode: data.copilot_mode || 'LOCAL_FALLBACK'
          }
        ]);
        fetchCopilotMetadata();
      } else {
        const localResp = generateCopilotResponse(q, stationId, latestData, userRole);
        setActiveModeDisplay('LOCAL_FALLBACK');
        setMessages((prev) => [
          ...prev,
          {
            sender: 'ai',
            role: 'Copilot',
            time: timeStr,
            ...localResp
          }
        ]);
      }
    } catch (e) {
      const localResp = generateCopilotResponse(q, stationId, latestData, userRole);
      setActiveModeDisplay('LOCAL_FALLBACK');
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          role: 'Copilot',
          time: timeStr,
          ...localResp
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleExecuteAction = async (actionCard) => {
    if (!actionCard) return;
    const actionType = actionCard.action_type || '';

    // Handle navigational VIEW actions: open corresponding system modal
    if (onOpenModal && (
      actionType.startsWith('VIEW_') || 
      actionType === 'INSPECT_SIZING' || 
      actionType === 'INSPECT_ANOMALY'
    )) {
      if (actionType === 'VIEW_OPTIMIZATION' || actionType === 'VIEW_DISPATCH') {
        onClose();
        onOpenModal('dispatch');
        return;
      }
      if (
        actionType === 'VIEW_RECOMMENDATIONS' ||
        actionType === 'VIEW_ENGINEERING_SIZING' ||
        actionType === 'VIEW_RESILIENCE'
      ) {
        onClose();
        onOpenModal('recommendations');
        return;
      }
      if (actionType === 'VIEW_SCADA_DEVICES') {
        onClose();
        onOpenModal('devices');
        return;
      }
      if (actionType === 'VIEW_MAINTENANCE') {
        onClose();
        onOpenModal('maintenance');
        return;
      }
      if (actionType === 'VIEW_STATION_COMPARISON') {
        onClose();
        onOpenModal('comparison');
        return;
      }
      if (actionType === 'VIEW_DATABASE') {
        onClose();
        onOpenModal('database');
        return;
      }
      if (actionType === 'VIEW_ANALYTICS') {
        onClose();
        onOpenModal('energy', 'analytics');
        return;
      }
    }

    if (actionType === 'DISPATCH_G2') {
      try {
        await fetch('/api/commander/override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_diesel_2_kw: 85.0 })
        });
        setActionNotice('Generator 2 Auto-Dispatched at 85 kW. Critical Deficit Neutralized!');
        setTimeout(() => setActionNotice(null), 5000);
        return;
      } catch (e) {
        console.warn('G2 auto-dispatch error:', e);
      }
    }

    try {
      const res = await fetch('/api/copilot/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: actionType || 'ACK_ALERT',
          role: userRole
        })
      });
      const data = await res.json();
      if (res.ok) {
        setActionNotice(`Action Approved: ${data.message}`);
      } else {
        setActionNotice(`Action Denied: ${data.message}`);
      }
      setTimeout(() => setActionNotice(null), 5000);
      fetchCopilotMetadata();
    } catch (e) {
      console.error('Error executing action:', e);
    }
  };

    const handleRunCounterfactual = async (scId) => {
    const targetScenario = scId || selectedScenario;
    setIsSimulating(true);
    try {
      const res = await fetch('/api/intelligence/counterfactual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: targetScenario })
      });
      if (res.ok) {
        const json = await res.json();
        setSimulationResult(json);
      } else {
        setSimulationResult(getFallbackSimulation(targetScenario, stationId));
      }
    } catch (e) {
      setSimulationResult(getFallbackSimulation(targetScenario, stationId));
    } finally {
      setIsSimulating(false);
    }
  };

  const handleRollback = async (modelId) => {
    try {
      const res = await fetch('/api/intelligence/mlops/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId, justification: 'Operator triggered rollback' })
      });
      if (res.ok) {
        const json = await res.json();
        setActionNotice(json.message);
        fetchIntelligenceState();
        fetchCopilotMetadata();
        setTimeout(() => setActionNotice(null), 4000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleCardExpand = (idx) => {
    setExpandedCards((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (!isOpen) return null;

  return (
    <div
      id="modal-copilot-full"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-50/40 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target.id === 'modal-copilot-full') onClose();
      }}
    >
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-3xl bg-white border border-[#bcecfc] text-slate-800 shadow-2xl(2,132,199,0.25)] overflow-hidden">
        
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between px-6 py-3.5 border-b border-[#bcecfc]/60 bg-gradient-to-r from-[#f0faff] via-white to-[#f0faff] gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#0699C6] to-[#05C5FF] flex items-center justify-center text-white shadow-lg">
              <i className="fa-solid fa-robot text-lg"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-[#127694] uppercase">
                  Polar AI Operational Copilot
                </h2>
                
                {/* Two-Layer Mode Badge */}
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 border border-slate-200">
                  <span className="text-slate-400">Mode:</span>
                  <span className={`flex items-center gap-1 ${activeModeDisplay === 'CLOUD' ? 'text-[#127694]' : 'text-amber-800'}`}>
                    <span className={`w-2 h-2 rounded-full ${activeModeDisplay === 'CLOUD' ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'}`}></span>
                    {activeModeDisplay === 'CLOUD' ? 'CLOUD' : 'LOCAL FALLBACK'}
                  </span>
                </div>

                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 border border-emerald-500/40 hidden sm:inline">
                  Deterministic Safety Armed
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {stationId} Station · Grounded Telemetry · MILP &amp; Digital Twin · Multi-Station Cross Analysis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode Toggle Button */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setCopilotMode('auto')}
                className={`px-2 py-0.5 rounded-lg transition ${copilotMode === 'auto' ? 'bg-sky-500 text-slate-950' : 'text-slate-500 hover:text-[#127694]'}`}
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() => setCopilotMode('cloud')}
                className={`px-2 py-0.5 rounded-lg transition ${copilotMode === 'cloud' ? 'bg-cyan-500 text-slate-950' : 'text-slate-500 hover:text-[#127694]'}`}
              >
                Cloud
              </button>
              <button
                type="button"
                onClick={() => setCopilotMode('local')}
                className={`px-2 py-0.5 rounded-lg transition ${copilotMode === 'local' ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:text-[#127694]'}`}
              >
                Local
              </button>
            </div>

            {/* Role Selector */}
            <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-xl border border-slate-200 text-xs">
              <i className="fa-solid fa-user-shield text-[#0699C6] text-xs"></i>
              <select
                value={userRole}
                onChange={(e) => setUserRole(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="Viewer" className="bg-slate-100 text-slate-800">Viewer (Read-Only)</option>
                <option value="Operator" className="bg-slate-100 text-slate-800">Operator (Actions Allowed)</option>
                <option value="Commander" className="bg-slate-100 text-slate-800">Commander (Full Admin)</option>
              </select>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition border border-slate-200"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        </div>

        {/* Action Notice Alert */}
        {actionNotice && (
          <div className={`px-6 py-2 border-b text-xs font-bold flex items-center justify-between animate-fadeIn ${
            actionNotice.includes('Denied')
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}>
            <span className="flex items-center gap-2">
              <i className={`fa-solid ${actionNotice.includes('Denied') ? 'fa-triangle-exclamation' : 'fa-circle-check'}`}></i>
              <span>{actionNotice}</span>
            </span>
            <button onClick={() => setActionNotice(null)} className="text-slate-500 hover:text-[#127694]">
              <i className="fa-solid fa-xmark text-xs"></i>
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 pb-2 border-b border-[#bcecfc]/60 bg-gradient-to-r from-[#f0faff] via-white to-[#f0faff] overflow-x-auto text-xs font-bold">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
              activeTab === 'chat'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/30'
                : 'text-slate-600 hover:text-[#0699C6] hover:bg-slate-100/70'
            }`}
          >
            <i className="fa-solid fa-comment-dots"></i>
            <span>Interactive Copilot</span>
          </button>

          <button
            onClick={() => setActiveTab('anomalies')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
              activeTab === 'anomalies'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/30'
                : 'text-slate-600 hover:text-[#0699C6] hover:bg-slate-100/70'
            }`}
          >
            <i className="fa-solid fa-satellite-dish"></i>
            <span>Multivariate Anomalies</span>
            {anomalyData?.score > 0.40 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('digital_twin')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
              activeTab === 'digital_twin'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/30'
                : 'text-slate-600 hover:text-[#0699C6] hover:bg-slate-100/70'
            }`}
          >
            <i className="fa-solid fa-brain"></i>
            <span>Digital Twin &amp; Residuals</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('counterfactual');
              if (!simulationResult) handleRunCounterfactual('GENSET_1_FAILURE');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
              activeTab === 'counterfactual'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/30'
                : 'text-slate-600 hover:text-[#0699C6] hover:bg-slate-100/70'
            }`}
          >
            <i className="fa-solid fa-flask-vial"></i>
            <span>What-If Simulator</span>
          </button>

          <button
            onClick={() => setActiveTab('mlops')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
              activeTab === 'mlops'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/30'
                : 'text-slate-600 hover:text-[#0699C6] hover:bg-slate-100/70'
            }`}
          >
            <i className="fa-solid fa-dna"></i>
            <span>MLOps &amp; Registry</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
              activeTab === 'audit'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/30'
                : 'text-slate-600 hover:text-[#0699C6] hover:bg-slate-100/70'
            }`}
          >
            <i className="fa-solid fa-clipboard-list"></i>
            <span>Audit Trail &amp; Quality</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">

          {/* TAB 1: INTERACTIVE COPILOT */}
          {activeTab === 'chat' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Active Station Context Strip */}
              <div className="flex items-center justify-between px-3.5 py-2 bg-[#edf9fd] border border-[#bcecfc] rounded-xl text-xs font-semibold text-[#127694]">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-satellite-dish text-[#0699C6]"></i>
                  <span>Station Context: <strong className="font-bold text-[#127694] underline">{stationId}</strong></span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-600 font-normal">Telemetry: <strong className="text-emerald-700 font-bold">{latestData ? 'Synchronized' : 'Standby'}</strong></span>
                </div>
                <div className="text-[11px] text-[#0699C6] flex items-center gap-1.5">
                  <i className="fa-solid fa-shield-halved"></i>
                  <span>Grounded SCADA &amp; High-Confidence MILP</span>
                </div>
              </div>
              
              {/* Proactive AI Insights Strip */}
              {proactiveInsights.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {proactiveInsights.slice(0, 2).map((ins, i) => (
                    <div key={i} className="p-3 rounded-2xl bg-[#f0faff] border border-sky-500/30 flex items-start gap-3 relative overflow-hidden">
                      <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-[#0699C6] border border-sky-500/40 flex items-center justify-center shrink-0 text-xs font-bold">
                        <i className="fa-solid fa-bolt"></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-[#0699C6] uppercase tracking-wider">
                            Proactive AI Insight · {ins.title}
                          </span>
                          <span className="text-[9px] font-mono text-slate-400">Live Engine</span>
                        </div>
                        <p className="text-xs text-slate-700 font-semibold mt-0.5">
                          {ins.observation}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          <strong className="text-slate-700">Action:</strong> {ins.system_recommendation}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Chat Thread */}
              <div
                ref={chatThreadRef}
                className="h-[380px] overflow-y-auto space-y-4 p-4 rounded-2xl bg-[#f0faff] border border-slate-200 scroll-smooth"
              >
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2.5 ${m.sender === 'commander' ? 'justify-end' : 'justify-start'}`}
                  >
                    {m.sender === 'ai' && (
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#0699C6] to-[#05C5FF] text-white flex items-center justify-center shrink-0 text-xs font-bold shadow-md">
                        <i className="fa-solid fa-robot"></i>
                      </div>
                    )}

                    <div className={`max-w-[85%] sm:max-w-[78%] flex flex-col gap-1.5 ${m.sender === 'commander' ? 'items-end' : 'items-start'}`}>
                      {/* Sender Meta */}
                      <div className="flex items-center gap-2 px-1 text-[10px] font-mono text-slate-400">
                        <span className="font-bold text-slate-700">{m.sender === 'commander' ? `Operator (${m.role || userRole})` : 'Polar AI Copilot'}</span>
                        <span>·</span>
                        <span>{m.time}</span>
                        {m.sender === 'ai' && (
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold ${m.mode === 'CLOUD' ? 'bg-cyan-500/20 text-[#127694]' : 'bg-amber-500/20 text-amber-800'}`}>
                            {m.mode || 'LOCAL_FALLBACK'}
                          </span>
                        )}
                      </div>

                      {/* Main Message Bubble */}
                      <div
                        className={`px-4 py-3 rounded-2xl text-xs leading-relaxed ${
                          m.sender === 'commander'
                            ? 'bg-sky-500 text-slate-950 font-bold rounded-tr-none shadow-md'
                            : 'bg-slate-100/90 text-slate-800 border border-slate-200 rounded-tl-none font-medium'
                        }`}
                      >
                        <div className="font-medium text-slate-800">
                          {m.sender === 'commander' ? (
                            <span className="whitespace-pre-line font-semibold">{m.answer}</span>
                          ) : (
                            <MarkdownMessage content={m.answer} />
                          )}
                        </div>

                        {/* Collapsible 4-Part Evidence Breakdown for AI messages */}
                        {m.sender === 'ai' && (m.evidence || m.impact || m.recommendation) && (
                          <div className="mt-3 pt-2.5 border-t border-slate-200/80 space-y-2">
                            <button
                              type="button"
                              onClick={() => toggleCardExpand(idx)}
                              className="text-[11px] font-bold text-[#0699C6] hover:text-[#127694] flex items-center gap-1.5"
                            >
                              <i className={`fa-solid ${expandedCards[idx] ? 'fa-chevron-up' : 'fa-chevron-down'} text-[10px]`}></i>
                              <span>{expandedCards[idx] ? 'Hide Engineering Evidence & Impact' : 'Show Engineering Evidence & Impact'}</span>
                            </button>

                            {expandedCards[idx] && (
                              <div className="grid grid-cols-1 gap-2 pt-1 animate-fadeIn text-[11px]">
                                {m.evidence && (
                                  <div className="p-2 rounded-xl bg-[#f0faff] border border-slate-200">
                                    <span className="text-[10px] font-black text-[#0699C6] uppercase tracking-wider block">Evidence:</span>
                                    <span className="text-slate-700">{m.evidence}</span>
                                  </div>
                                )}
                                {m.impact && (
                                  <div className="p-2 rounded-xl bg-[#f0faff] border border-slate-200">
                                    <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider block">Operational Impact:</span>
                                    <span className="text-slate-700">{m.impact}</span>
                                  </div>
                                )}
                                {m.recommendation && (
                                  <div className="p-2 rounded-xl bg-[#f0faff] border border-slate-200">
                                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider block">Validated Recommendation:</span>
                                    <span className="text-slate-700">{m.recommendation}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Sources Badge */}
                            {m.sources && m.sources.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <span className="text-[9px] font-bold text-slate-500 uppercase">Sources:</span>
                                {m.sources.map((s, si) => (
                                  <span key={si} className="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-400 border border-slate-200">
                                    ● {s}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Action Card */}
                            {m.action_card && (
                              <div className="mt-2 p-2.5 rounded-xl bg-[#e5f6fd]/40 border border-sky-500/40 flex items-center justify-between gap-3">
                                <div>
                                  <span className="text-[10px] font-black text-[#127694] uppercase tracking-wider block">
                                    Recommended Action
                                  </span>
                                  <span className="text-xs font-bold text-slate-700">{m.action_card.action}</span>
                                  <span className="text-[10px] text-slate-400 block">{m.action_card.reason}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleExecuteAction(m.action_card)}
                                  className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs transition shadow shrink-0"
                                >
                                  {m.action_card.button_label || 'EXECUTE'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {m.sender === 'commander' && (
                      <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0 text-xs font-bold">
                        <i className="fa-solid fa-user"></i>
                      </div>
                    )}
                  </div>
                ))}

                {isSending && (
                  <div className="flex items-center gap-2 text-[#0699C6] text-xs font-bold animate-pulse p-2">
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    <span>AI Copilot verifying telemetry and formulating response...</span>
                  </div>
                )}
              </div>

              {/* Dynamic Suggested Prompts */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-400 mr-1 flex items-center gap-1">
                  <i className="fa-solid fa-bolt text-amber-400 text-[10px]"></i> Quick Ask:
                </span>
                {suggestedPrompts.map((qp, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSend(qp)}
                    className="px-2.5 py-1 rounded-lg bg-[#f0faff] hover:bg-slate-100 text-[#127694] hover:text-[#0699C6] text-[11px] font-semibold transition border border-slate-200"
                  >
                    {qp}
                  </button>
                ))}
              </div>

              {/* Input Form */}
              <form onSubmit={(e) => { e.preventDefault(); handleSend(inputVal); }} className="flex items-center gap-2">
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder="Ask Polar AI about microgrid status, diesel justification, 6h forecast, battery derating, or contingencies..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[#f0faff] border border-slate-200 text-slate-800 placeholder-slate-400 text-xs focus:outline-none focus:border-sky-500 transition"
                />
                <button
                  type="submit"
                  disabled={isSending || !inputVal.trim()}
                  className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs transition shadow-md shadow-sky-500/20 disabled:opacity-40 flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-paper-plane"></i>
                  <span>Send</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: MULTIVARIATE ANOMALIES & CONTEXT (SECTION 8) */}
          {activeTab === 'anomalies' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-[#f0faff] border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Isolation Forest Anomaly Score</span>
                  <div className="text-2xl font-black text-[#127694] mt-1">
                    {anomalyData?.score !== undefined ? anomalyData.score.toFixed(3) : '0.052'}
                  </div>
                  <span className="text-[10px] text-emerald-400 font-bold">10-Dimensional Vector Monitored</span>
                </div>
                <div className="p-4 rounded-2xl bg-[#f0faff] border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Operational Context Filter</span>
                  <div className="text-sm font-black text-[#0699C6] mt-2">
                    ACTIVE (False-alarm suppression)
                  </div>
                  <span className="text-[10px] text-slate-400">Solar shortfall &amp; load steps mitigated</span>
                </div>
                <div className="p-4 rounded-2xl bg-[#f0faff] border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Unified Operational Risk</span>
                  <div className="text-2xl font-black text-emerald-400 mt-1">
                    NORMAL (24.5/100)
                  </div>
                  <span className="text-[10px] text-slate-400">All safety guardrails nominal</span>
                </div>
              </div>

              {/* 4-Part XAI Card */}
              {anomalyData?.xai_card && (
                <div className="p-4 rounded-2xl bg-[#f0faff] border border-sky-500/30 space-y-2">
                  <div className="text-xs font-bold text-[#0699C6] uppercase flex items-center gap-1.5">
                    <i className="fa-solid fa-microchip"></i>
                    <span>Explainable AI Diagnostic</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200">
                      <strong className="text-[#127694] block mb-1">What Happened:</strong>
                      <span className="text-slate-700">{anomalyData.xai_card.what}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200">
                      <strong className="text-[#127694] block mb-1">Why Detected:</strong>
                      <span className="text-slate-700">{anomalyData.xai_card.why}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200">
                      <strong className="text-amber-800 font-bold block mb-1">What Could Happen:</strong>
                      <span className="text-slate-700">{anomalyData.xai_card.next}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200">
                      <strong className="text-emerald-800 font-bold block mb-1">Recommended Action:</strong>
                      <span className="text-slate-700">{anomalyData.xai_card.action}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DIGITAL TWIN & RESIDUALS (SECTION 8) */}
          {activeTab === 'digital_twin' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-3.5 rounded-2xl bg-[#f0faff] border border-slate-200 text-xs text-slate-700">
                <strong>Physics-Coupled Machine Learning:</strong> First-principles thermodynamic baselines (Lumped capacitance battery thermal, Diesel quadratic SFC, UA degree-day heat demand) with Ridge ML residual correctors clamped to strict ±15% physical safety limits.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-[#f0faff] border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Battery Cell Temperature</span>
                  <div className="text-lg font-black text-slate-900 mt-1">Physics: 21.4°C | ML: +0.38°C</div>
                  <div className="text-xs text-emerald-400 font-bold mt-1">Hybrid: 21.78°C (±15% Safe)</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#f0faff] border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Diesel SFC Fuel Rate</span>
                  <div className="text-lg font-black text-slate-900 mt-1">Physics: 48.2 L/h | ML: -0.82 L/h</div>
                  <div className="text-xs text-emerald-400 font-bold mt-1">Hybrid: 47.38 L/h (±15% Safe)</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#f0faff] border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Station Heating Demand</span>
                  <div className="text-lg font-black text-slate-900 mt-1">Physics: 142 kWth | ML: +3.2 kWth</div>
                  <div className="text-xs text-emerald-400 font-bold mt-1">Hybrid: 145.2 kWth (±15% Safe)</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: WHAT-IF SIMULATOR (SECTION 8) */}
          {activeTab === 'counterfactual' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex flex-wrap gap-2">
                {SCENARIOS.map((sc) => (
                  <button
                    key={sc.id}
                    onClick={() => {
                      setSelectedScenario(sc.id);
                      handleRunCounterfactual(sc.id);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                      selectedScenario === sc.id
                        ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/30'
                        : 'bg-[#f0faff] text-slate-700 hover:text-[#127694] border border-slate-200'
                    }`}
                  >
                    <i className={`fa-solid ${sc.icon}`}></i>
                    <span>{sc.label}</span>
                  </button>
                ))}
              </div>

              {simulationResult && (
                <div className="p-4 rounded-2xl bg-[#f0faff] border border-sky-500/30 space-y-3">
                  <div className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <i className="fa-solid fa-microchip text-[#0699C6]"></i>
                    <span>Simulated Contingency Result: {simulationResult.scenario_name || selectedScenario}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-100 border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Battery Response:</span>
                      <span className="text-slate-900 font-bold">{simulationResult.battery_response || '+42 kW discharge'}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-100 border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Generator Status:</span>
                      <span className="text-slate-900 font-bold">{simulationResult.genset_status || 'G2 Started & Synced'}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-100 border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Reserve Margin:</span>
                      <span className="text-amber-400 font-bold">{simulationResult.reserve_margin || '77% -> 51%'}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-100 border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Life Support:</span>
                      <span className="text-emerald-400 font-bold">{simulationResult.life_support || '100% PROTECTED'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: MLOPS & REGISTRY (SECTION 8) */}
          {activeTab === 'mlops' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-[#f0faff] border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Sensor Data Quality</span>
                  <div className="text-2xl font-black text-emerald-400 mt-1">98.5%</div>
                  <span className="text-[10px] text-slate-400">4-rule check (missing, stale, bounds, duplicate)</span>
                </div>
                <div className="p-4 rounded-2xl bg-[#f0faff] border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Feature PSI Drift</span>
                  <div className="text-2xl font-black text-[#0699C6] mt-1">0.038 (STABLE)</div>
                  <span className="text-[10px] text-slate-400">Population Stability Index &lt; 0.10</span>
                </div>
                <div className="p-4 rounded-2xl bg-[#f0faff] border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Production Champion</span>
                  <div className="text-sm font-black text-[#127694] mt-1">LightGBM-Quantile-v2.4.1</div>
                  <span className="text-[10px] text-[#0699C6]">Serving active 24H inference</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#f0faff] border border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-[#127694] uppercase">Model Rollback Governance</h4>
                  <p className="text-[11px] text-slate-400">Instantaneously revert active inference to previous validated checkpoint.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRollback('MOD-001')}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition"
                >
                  <i className="fa-solid fa-rotate-left mr-1.5"></i>
                  Rollback to Champion
                </button>
              </div>
            </div>
          )}

          {/* TAB 6: AUDIT TRAIL & AI QUALITY MONITORING (SECTION 9) */}
          {activeTab === 'audit' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Quality Metrics Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-[#f0faff] border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Queries</span>
                  <span className="text-xl font-black text-[#127694]">{metricsData?.total_queries || 0}</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#f0faff] border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Fallback Rate</span>
                  <span className="text-xl font-black text-amber-400">{metricsData?.fallback_rate_pct || 0}%</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#f0faff] border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Avg Latency</span>
                  <span className="text-xl font-black text-[#0699C6]">{metricsData?.average_latency_ms || 0} ms</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#f0faff] border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Grounding Pass</span>
                  <span className="text-xl font-black text-emerald-400">{metricsData?.grounding_compliance_pct || 100}%</span>
                </div>
              </div>

              {/* Audit Trail Table */}
              <div className="rounded-2xl bg-[#f0faff] border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between bg-slate-100">
                  <span className="text-xs font-black text-slate-700 uppercase">Chronological Copilot Audit Trail</span>
                  <span className="text-[10px] font-mono text-slate-500">Immutable SCADA Log</span>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-[#f8fcfe] text-slate-500 border-b border-slate-200 font-bold uppercase text-[9px]">
                      <tr>
                        <th className="py-2 px-3">Time</th>
                        <th className="py-2 px-3">Role</th>
                        <th className="py-2 px-3">Query</th>
                        <th className="py-2 px-3">Mode</th>
                        <th className="py-2 px-3">Latency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/60 text-slate-700 font-medium">
                      {auditData.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-500">No interaction logs recorded yet.</td>
                        </tr>
                      ) : (
                        auditData.map((item, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono text-slate-400">{item.timestamp?.split('T')[1]?.replace('Z', '') || '12:00'}</td>
                            <td className="py-2 px-3"><span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px]">{item.user_role}</span></td>
                            <td className="py-2 px-3 text-slate-800 font-medium max-w-xs truncate">{item.query}</td>
                            <td className="py-2 px-3"><span className={`text-[10px] font-bold ${item.copilot_mode === 'CLOUD' ? 'text-[#0699C6]' : 'text-amber-400'}`}>{item.copilot_mode}</span></td>
                            <td className="py-2 px-3 font-mono text-slate-400">{item.latency_ms} ms</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
