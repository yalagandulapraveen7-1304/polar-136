import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

/**
 * 24-Hour MILP Dispatch Stacked Area Chart.
 * Visualizes Solar, Wind, Battery Discharge, Diesel G1, Diesel G2 overlaid with Load demand curve.
 */
export default function DispatchStacked24hChart({
  schedule = []
}) {
  const canvasRef = useRef(null);
  const chartInstanceRef = useRef(null);

  useEffect(() => {
    const ctx = canvasRef.current;
    if (!ctx) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const defaultHours = ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
    const rows = schedule.length > 0 ? schedule : defaultHours.map((h, i) => ({
      time_label: h,
      load_kw: 410 + (i % 4) * 8,
      p_solar_kw: i >= 4 && i <= 8 ? (i === 6 ? 68 : 35) : 0,
      p_wind_kw: 180 + (i % 3) * 20,
      p_gen1_kw: 180,
      p_gen2_kw: i >= 8 ? 40 : 0,
      p_bess_net_kw: i === 6 ? -30 : 25
    }));

    const labels = rows.map((r) => r.time_label || `H${r.hour}`);
    const loadData = rows.map((r) => r.load_kw);
    const solarData = rows.map((r) => r.p_solar_kw || 0);
    const windData = rows.map((r) => r.p_wind_kw || 0);
    const dieselG1Data = rows.map((r) => r.p_gen1_kw || 0);
    const dieselG2Data = rows.map((r) => r.p_gen2_kw || 0);
    const bessDischData = rows.map((r) => (r.p_bess_net_kw > 0 ? r.p_bess_net_kw : 0));

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Station Load Demand',
            data: loadData,
            borderColor: '#0f172a',
            borderWidth: 2.5,
            borderDash: [5, 4],
            pointRadius: 2,
            fill: false,
            tension: 0.2,
            order: 0
          },
          {
            label: 'Solar PV',
            data: solarData,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.4)',
            borderWidth: 1.5,
            pointRadius: 0,
            fill: 'origin',
            tension: 0.3,
            order: 1
          },
          {
            label: 'Wind Turbine',
            data: windData,
            borderColor: '#0699C6',
            backgroundColor: 'rgba(6, 153, 198, 0.35)',
            borderWidth: 1.5,
            pointRadius: 0,
            fill: '-1',
            tension: 0.3,
            order: 2
          },
          {
            label: 'BESS Discharge',
            data: bessDischData,
            borderColor: '#05C5FF',
            backgroundColor: 'rgba(5, 197, 255, 0.3)',
            borderWidth: 1.5,
            pointRadius: 0,
            fill: '-1',
            tension: 0.3,
            order: 3
          },
          {
            label: 'Diesel Genset 1',
            data: dieselG1Data,
            borderColor: '#e11d48',
            backgroundColor: 'rgba(225, 29, 72, 0.25)',
            borderWidth: 1.5,
            pointRadius: 0,
            fill: '-1',
            tension: 0.2,
            order: 4
          },
          {
            label: 'Diesel Genset 2',
            data: dieselG2Data,
            borderColor: '#9333ea',
            backgroundColor: 'rgba(147, 51, 234, 0.25)',
            borderWidth: 1.5,
            pointRadius: 0,
            fill: '-1',
            tension: 0.2,
            order: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              font: { size: 10, weight: 'bold' },
              color: '#127694'
            }
          },
          tooltip: {
            backgroundColor: '#127694',
            titleColor: '#FFFFFF',
            bodyColor: '#EDF9FD',
            padding: 8,
            titleFont: { size: 10, weight: 'bold' },
            bodyFont: { size: 10 },
            callbacks: {
              label: (c) => ` ${c.dataset.label}: ${c.raw} kW`
            }
          }
        },
        scales: {
          y: {
            stacked: true,
            title: { display: true, text: 'Power (kW)', color: '#127694', font: { size: 9, weight: 'bold' } },
            grid: { color: 'rgba(18, 118, 148, 0.08)' },
            ticks: { color: '#127694', font: { size: 9, weight: '600' } }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#127694', font: { size: 8 } }
          }
        }
      }
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [schedule]);

  return (
    <div className="w-full h-[260px] relative">
      <canvas ref={canvasRef} />
    </div>
  );
}
