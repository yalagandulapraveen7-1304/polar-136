import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

/**
 * Renewable Curtailment Breakdown & Root-Cause Distribution.
 */
export default function CurtailmentAnalyticsChart({
  curtailmentData = null
}) {
  const barCanvasRef = useRef(null);
  const barChartRef = useRef(null);

  useEffect(() => {
    const ctx = barCanvasRef.current;
    if (!ctx) return;

    if (barChartRef.current) {
      barChartRef.current.destroy();
    }

    const labels = ['24H Horizon', '7D Horizon', '30D Horizon', '12M Polar Year'];
    const utilizedKwh = [7840, 54200, 235000, 2840000];
    const curtailedKwh = [14.2, 112.5, 498.0, 6420.0];

    barChartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Utilized Renewable (kWh)',
            data: utilizedKwh,
            backgroundColor: 'rgba(6, 153, 198, 0.8)',
            borderColor: '#0699C6',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'Curtailed Renewable (kWh)',
            data: curtailedKwh,
            backgroundColor: 'rgba(244, 63, 94, 0.7)',
            borderColor: '#f43f5e',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { boxWidth: 10, font: { size: 10, weight: 'bold' }, color: '#127694' }
          },
          tooltip: {
            backgroundColor: '#127694',
            titleColor: '#FFFFFF',
            bodyColor: '#EDF9FD',
            callbacks: {
              label: (c) => ` ${c.dataset.label}: ${c.raw.toLocaleString()} kWh`
            }
          }
        },
        scales: {
          y: {
            type: 'logarithmic',
            title: { display: true, text: 'Energy (kWh, log scale)', color: '#127694', font: { size: 9, weight: 'bold' } },
            grid: { color: 'rgba(18, 118, 148, 0.08)' },
            ticks: { color: '#127694', font: { size: 8 } }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#127694', font: { size: 9, weight: 'bold' } }
          }
        }
      }
    });

    return () => {
      if (barChartRef.current) barChartRef.current.destroy();
    };
  }, [curtailmentData]);

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Root Causes Distribution */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="p-2.5 rounded-xl bg-white border border-[#bcecfc] shadow-xs">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Primary Root Cause</div>
          <div className="font-extrabold text-[#127694] mt-0.5">BESS Buffer Full (SoC ≥ 95%)</div>
          <span className="text-[9px] text-[#0699C6] font-mono">62% of curtailed kWh</span>
        </div>
        <div className="p-2.5 rounded-xl bg-white border border-[#bcecfc] shadow-xs">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Secondary Cause</div>
          <div className="font-extrabold text-amber-700 mt-0.5">Diesel 35% Min Loading Floor</div>
          <span className="text-[9px] text-amber-600 font-mono">28% of curtailed kWh</span>
        </div>
        <div className="p-2.5 rounded-xl bg-white border border-[#bcecfc] shadow-xs">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Tertiary Cause</div>
          <div className="font-extrabold text-slate-700 mt-0.5">Inverter Bus Clamping</div>
          <span className="text-[9px] text-slate-500 font-mono">10% of curtailed kWh</span>
        </div>
      </div>

      <div className="w-full h-[200px] relative">
        <canvas ref={barCanvasRef} />
      </div>
    </div>
  );
}
