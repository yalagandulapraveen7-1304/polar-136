import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { useTelemetryBuffer } from '../../context/TelemetryContext';

/**
 * Real-Time Tactical Power & Net Energy Balance Chart (1 Hz live stream).
 * Conforms strictly to Polar EMS Light Mode palette.
 */
export default function RealTimePowerChart({
  windowSelection = '60s', // '60s' | '5m' | '15m' | '30m'
  onWindowChange = null
}) {
  const { buffer, quality } = useTelemetryBuffer();
  const canvasRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const [activeWindow, setActiveWindow] = useState(windowSelection);

  const handleWindowSwitch = (w) => {
    setActiveWindow(w);
    if (onWindowChange) onWindowChange(w);
  };

  useEffect(() => {
    const ctx = canvasRef.current;
    if (!ctx) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const dataPoints = buffer.length > 0 ? buffer : [
      { timeLabel: '00:00:00', generation_kw: 412, load_kw: 412, net_balance_kw: 0, battery_kw: 0 }
    ];

    // Filter points based on window
    const maxPointsMap = { '60s': 60, '5m': 300, '15m': 900, '30m': 1800 };
    const sliceCount = maxPointsMap[activeWindow] || 60;
    const viewPoints = dataPoints.slice(-sliceCount);

    const labels = viewPoints.map((p, idx) => (idx % 10 === 0 || idx === viewPoints.length - 1 ? p.timeLabel : ''));
    const genData = viewPoints.map((p) => p.generation_kw);
    const loadData = viewPoints.map((p) => p.load_kw);
    const netData = viewPoints.map((p) => p.net_balance_kw);

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Total Generation',
            data: genData,
            borderColor: '#0699C6',
            backgroundColor: 'rgba(6, 153, 198, 0.08)',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0.2
          },
          {
            label: 'Station Demand (Load)',
            data: loadData,
            borderColor: '#127694',
            borderWidth: 2,
            borderDash: [4, 3],
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0.2
          },
          {
            label: 'Net Balance (Gen - Load)',
            data: netData,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.10)',
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: 'origin',
            tension: 0.2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 }, // Zero lag on 1 Hz ticks
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              font: { size: 10, weight: '700', family: 'Inter, system-ui' },
              color: '#127694'
            }
          },
          tooltip: {
            backgroundColor: '#127694',
            titleColor: '#FFFFFF',
            bodyColor: '#EDF9FD',
            borderColor: '#0699C6',
            borderWidth: 1,
            padding: 8,
            titleFont: { size: 10, weight: 'bold' },
            bodyFont: { size: 10 },
            callbacks: {
              label: (c) => ` ${c.dataset.label}: ${typeof c.raw === 'number' ? c.raw.toFixed(1) : c.raw} kW`
            }
          }
        },
        scales: {
          y: {
            grid: { color: 'rgba(18, 118, 148, 0.08)' },
            ticks: {
              color: '#127694',
              font: { size: 9, weight: '600' },
              callback: (v) => `${v} kW`
            }
          },
          x: {
            grid: { display: false },
            ticks: {
              color: '#127694',
              font: { size: 8 }
            }
          }
        }
      }
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [buffer, activeWindow]);

  const latestPoint = buffer.length > 0 ? buffer[buffer.length - 1] : null;

  return (
    <div className="w-full h-full flex flex-col justify-between">
      {/* Controls & Metrics Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#bcecfc]/60 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-[#127694] uppercase tracking-tight flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            1 Hz Live Energy Balance
          </span>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            {latestPoint?.net_balance_kw >= 0 ? `+${latestPoint.net_balance_kw} kW SURPLUS` : `${latestPoint?.net_balance_kw} kW DEFICIT`}
          </span>
          <span className="text-[9px] font-mono text-slate-400">
            Quality: <strong className="text-[#0699C6]">{quality || 'VALID'}</strong>
          </span>
        </div>

        {/* Time Window Buttons */}
        <div className="flex items-center gap-1 bg-[#edf9fd] p-0.5 rounded-lg border border-[#bcecfc]">
          {['60s', '5m', '15m', '30m'].map((win) => (
            <button
              key={win}
              type="button"
              onClick={() => handleWindowSwitch(win)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                activeWindow === win
                  ? 'bg-[#127694] text-white shadow-xs'
                  : 'text-[#127694] hover:bg-[#c2f0fe]'
              }`}
            >
              {win}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="relative flex-1 w-full min-h-[180px]">
        <canvas ref={canvasRef} />
      </div>

      {/* Legend & Physical Conservation Note */}
      <div className="pt-2 mt-1 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <span>Gen: <strong className="text-[#0699C6]">{latestPoint?.generation_kw?.toFixed(1) || '412.0'} kW</strong></span>
        <span>Load: <strong className="text-[#127694]">{latestPoint?.load_kw?.toFixed(1) || '412.0'} kW</strong></span>
        <span>Net: <strong className="text-emerald-600">{latestPoint?.net_balance_kw >= 0 ? `+${latestPoint?.net_balance_kw?.toFixed(1)}` : latestPoint?.net_balance_kw?.toFixed(1)} kW</strong></span>
        <span className="text-[9px] text-slate-400 font-sans">Physical Invariant: $\sum P_{in} = \sum P_{out}$</span>
      </div>
    </div>
  );
}
