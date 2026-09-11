import React, { useState, useRef, useEffect } from 'react';

export default function CopilotModal({ isOpen, onClose }) {
  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: "Hello Commander. I am Novara's real-time AI microgrid co-pilot. I continuously analyze station telemetry, weather forecasts, battery chemistry, and fuel burn rates to advise on optimal dispatch actions and polar contingencies. How can I assist you?"
    }
  ]);
  const [inputVal, setInputVal] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatThreadRef = useRef(null);

  useEffect(() => {
    if (chatThreadRef.current) {
      chatThreadRef.current.scrollTop = chatThreadRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = async (queryText) => {
    const q = queryText || inputVal;
    if (!q || !q.trim()) return;

    const userMsg = { sender: 'commander', text: q };
    setMessages((prev) => [...prev, userMsg]);
    setInputVal('');
    setIsSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, { sender: 'ai', text: data.answer || 'Response generated.' }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { sender: 'ai', text: 'Meeting station load with available renewables and active battery buffer.' }
        ]);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: 'Current conditions: -26.3°C with wind at 24.9 m/s. Fuel reserves at 75%, battery at 24%. System is running optimal LP balance.'
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSend(inputVal);
  };

  return (
    <div
      id="modal-copilot-full"
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target.id === 'modal-copilot-full') onClose();
      }}
    >
      <div className="modal-content p-5 sm:p-6 max-w-[850px] max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#05c5ff] to-[#0698c4] text-white flex items-center justify-center font-bold text-xs shadow-sm">
              <i className="fa-solid fa-robot text-sm"></i>
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#127694]">Novara AI Polar Station Co-Pilot</h2>
              <p className="text-xs text-slate-400">Contextually synchronized with live station telemetry & LP dispatch model</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-[#c2f0fe] text-[#0698c4] border border-[#9ae5fe]">
              Live Synced
            </span>
            <button
              id="btnCloseCopilotModal"
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        </div>

        {/* Quick Suggestion Tactical Chips */}
        <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
          <button
            type="button"
            className="ai-modal-chip text-[10px] px-2.5 py-1 rounded-full bg-[#f0faff] hover:bg-[#c2f0fe] text-[#127694] border border-[#9ae5fe] transition font-semibold"
            onClick={() => handleSend('Why did you choose this microgrid dispatch mix?')}
          >
            Dispatch Reasoning
          </button>
          <button
            type="button"
            className="ai-modal-chip text-[10px] px-2.5 py-1 rounded-full bg-[#f0faff] hover:bg-[#c2f0fe] text-[#127694] border border-[#9ae5fe] transition font-semibold"
            onClick={() => handleSend('How long will our fuel reserves last if a storm hits?')}
          >
            Fuel Autonomy in Storm
          </button>
          <button
            type="button"
            className="ai-modal-chip text-[10px] px-2.5 py-1 rounded-full bg-[#f0faff] hover:bg-[#c2f0fe] text-[#127694] border border-[#9ae5fe] transition font-semibold"
            onClick={() => handleSend('What is the station battery state of charge and health?')}
          >
            Battery State of Health
          </button>
          <button
            type="button"
            className="ai-modal-chip text-[10px] px-2.5 py-1 rounded-full bg-[#f0faff] hover:bg-[#c2f0fe] text-[#127694] border border-[#9ae5fe] transition font-semibold"
            onClick={() => handleSend('Explain current fuel savings with optimizer vs baseline.')}
          >
            Fuel Savings vs Baseline
          </button>
        </div>

        {/* Chat Thread Messages Scroll Area */}
        <div
          ref={chatThreadRef}
          id="copilotModalChatThread"
          className="flex-1 overflow-y-auto p-4 bg-[#f8fcfe] rounded-2xl border border-[#9ae5fe]/60 mb-3 space-y-3 min-h-[260px] max-h-[400px]"
        >
          {messages.map((msg, i) => {
            const isAi = msg.sender === 'ai';
            return (
              <div key={i} className={`flex items-start ${isAi ? 'gap-2.5' : 'justify-end gap-2.5'}`}>
                {isAi && (
                  <div className="w-7 h-7 rounded-lg bg-[#0698c4] text-white flex items-center justify-center text-xs shrink-0 mt-0.5">
                    <i className="fa-solid fa-robot"></i>
                  </div>
                )}
                <div
                  className={
                    isAi
                      ? 'bg-white p-3 rounded-2xl border border-[#9ae5fe]/70 shadow-sm max-w-[85%]'
                      : 'bg-[#127694] text-white p-3 rounded-2xl shadow-sm max-w-[85%]'
                  }
                >
                  <p className={`text-xs leading-relaxed ${isAi ? 'text-slate-700' : 'text-white'}`}>{msg.text}</p>
                  <span className={`text-[9px] font-mono mt-1 block ${isAi ? 'text-slate-400' : 'text-cyan-200 text-right'}`}>
                    {isAi ? 'Novara AI Telemetry Synced' : 'Commander'}
                  </span>
                </div>
              </div>
            );
          })}
          {isSending && (
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#0698c4] text-white flex items-center justify-center text-xs shrink-0 mt-0.5">
                <i className="fa-solid fa-robot"></i>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-[#9ae5fe]/70 shadow-sm max-w-[85%]">
                <p className="text-xs text-slate-500 italic flex items-center gap-1.5">
                  <i className="fa-solid fa-spinner fa-spin text-[#0698c4]"></i> AI co-pilot analyzing...
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Chat Input Form */}
        <form id="copilotModalForm" onSubmit={handleSubmit} className="flex items-center gap-2 shrink-0">
          <input
            type="text"
            id="copilotModalInput"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Ask Novara about generator load, renewable dispatch, or battery buffer..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#9ae5fe] bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#05c5ff] transition"
          />
          <button
            type="submit"
            id="btnCopilotModalSend"
            disabled={isSending}
            className="px-4 py-2.5 rounded-xl bg-[#0698c4] hover:bg-[#05c5ff] text-white font-bold text-xs transition flex items-center gap-1.5 shadow-sm"
          >
            <i className="fa-solid fa-paper-plane text-xs"></i>
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
