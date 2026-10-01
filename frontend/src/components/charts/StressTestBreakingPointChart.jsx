import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

/**
 * Physical Breaking-Point & Stress-Test Capacity Analysis Chart.
 * Compares Normal Operating Capacity, Harsh Winter, and Extreme Breaking Point (580 kW vs 616 kW).
 */
export default function StressTestBreakingPointChart() {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const ctx = canvasRef.current;
    if (!ctx) return;

    if (chartRef.current) chartRef.current.destroy();

    const scenarios = ['Normal Austral', 'Harsh Winter', 'Hour 3,410 Blizzard (Breaking Point)'];
    const totalCapKw = [580.0, 580.0, 580.0];
    const peakLoadKw = [457.4, 548.9, 616.4];
    const deficitKw = [0, 0, -36.4];

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: scenarios,
        datasets: [
          {
            label: 'Total Generation Capacity (kW)',
            data: totalCapKw,
            backgroundColor: 'rgba(6, 153, 198, 0.75)',
            borderColor: '#0699C6',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'Station Peak Demand (kW)',
            data: peakLoadKw,
            backgroundColor: [
              'rgba(16, 185, 129, 0.75)',
              'rgba(245, 158, 11, 0.75)',
              'rgba(225, 29, 72, 0.85)'
            ],
            borderColor: ['#10b981', '#f59e0b', '#e11d48'],
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
              afterBody: (items) => {
                const idx = items[0].dataIndex;
                if (idx === 2) {
                  return '\n[DEFICIT] -36.4 kW shortfall: Automated load-shedding of tier-3 auxiliary heaters required.';
                }
                return '\n[FEASIBLE] Microgrid operating within reserve limits.';
              }
            }
          }
        },
        scales: {
          y: {
            title: { display: true, text: 'Power (kW)', color: '#127694', font: { size: 9, weight: 'bold' } },
            grid: { color: 'rgba(18, 118, 148, 0.08)' },
            ticks: { color: '#127694', font: { size: 9, weight: '600' } }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#127694', font: { size: 9, weight: 'bold' } }
          }
        }
      }
    });

    return () => {
      if (chartRef.current) chartRef.current.destroy();
    };
  }, []);

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs">
        <div className="flex items-center justify-between text-rose-900 font-extrabold mb-1">
          <span className="flex items-center gap-1.5 uppercase tracking-tight">
            <i className="fa-solid fa-triangle-exclamation text-rose-600"></i>
            Physical Breaking Point Analysis (Hour 3,410 / May 22)
          </span>
          <span className="font-mono text-rose-700 bg-rose-100 px-2 py-0.5 rounded text-[10px]">
            Infeasible without Load Shedding
          </span>
        </div>
        <p className="text-rose-800 leading-relaxed text-[11px]">
          Under compound Katabatic storm conditions (-36.9°C, 25.9 m/s wind cutout, zero solar, and 20% BESS floor lockout), electrical load spikes to <strong>616.4 kW</strong> while maximum physical dispatch capacity is capped at <strong>580.0 kW</strong> (Diesel G1 250 kW + Diesel G2 250 kW + BESS buffer max 80 kW). Net deficit of <strong>-36.4 kW</strong> triggers pre-emptive circuit shedding.
        </p>
      </div>

      <div className="w-full h-[220px] relative">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
