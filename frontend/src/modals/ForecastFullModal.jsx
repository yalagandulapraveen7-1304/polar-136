import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export default function ForecastFullModal({ isOpen, onClose }) {
  const [horizon, setHorizon] = useState('12m');
  const chartCanvasRef = useRef(null);
  const chartInstanceRef = useRef(null);

  // Horizon Data Definitions
  const horizonConfig = {
    '6h': {
      peak: '44.5 kW',
      minRen: '22.0 kW',
      renFrac: '68%',
      fuelBurn: '48 L',
      insight: 'High katabatic wind speeds sustaining majority of electrical demand.',
      labels: ['+1h', '+2h', '+3h', '+4h', '+5h', '+6h'],
      demand: [39, 41, 42, 44, 43, 40],
      wind: [42, 45, 46, 44, 43, 41],
      solar: [2, 3, 2, 1, 0, 0]
    },
    '12h': {
      peak: '44.5 kW',
      minRen: '22.0 kW',
      renFrac: '68%',
      fuelBurn: '48 L',
      insight: 'High katabatic wind speeds sustaining majority of electrical demand.',
      labels: ['+2h', '+4h', '+6h', '+8h', '+10h', '+12h'],
      demand: [40, 42, 44, 43, 41, 39],
      wind: [43, 46, 45, 42, 40, 41],
      solar: [3, 2, 1, 0, 0, 0]
    },
    '24h': {
      peak: '44.5 kW',
      minRen: '22.0 kW',
      renFrac: '68%',
      fuelBurn: '48 L',
      insight: 'High katabatic wind speeds sustaining majority of electrical demand.',
      labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
      demand: [38, 41, 43, 44, 42, 39],
      wind: [40, 43, 45, 44, 42, 41],
      solar: [0, 0, 2, 3, 1, 0]
    },
    '48h': {
      peak: '49.0 kW',
      minRen: '14.5 kW',
      renFrac: '62%',
      fuelBurn: '280 L',
      insight: 'Approaching low-pressure depression will reduce solar bifacial harvest.',
      labels: ['+6h', '+12h', '+18h', '+24h', '+30h', '+36h', '+42h', '+48h'],
      demand: [40, 42, 45, 48, 46, 43, 41, 40],
      wind: [44, 42, 36, 28, 35, 42, 45, 43],
      solar: [3, 4, 3, 1, 2, 4, 3, 2]
    },
    '7d': {
      peak: '49.0 kW',
      minRen: '14.5 kW',
      renFrac: '62%',
      fuelBurn: '280 L',
      insight: 'Approaching low-pressure depression will reduce solar bifacial harvest.',
      labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
      demand: [40, 42, 45, 48, 46, 43, 41],
      wind: [44, 42, 36, 28, 35, 42, 45],
      solar: [3, 4, 3, 1, 2, 4, 3]
    },
    '12m': {
      peak: '57.5 kW',
      minRen: '16 kW',
      renFrac: '50%',
      fuelBurn: '58,400 L',
      insight: 'Annual polar cycle: Continuous 24h sunlight in Dec/Jan transitions to polar night winter (May-Aug) with high heating demand.',
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      demand: [34, 36, 42, 52, 57, 58, 56, 52, 44, 38, 35, 34],
      wind: [18, 19, 22, 24, 25, 26, 26, 25, 23, 20, 19, 18],
      solar: [24, 21, 12, 1, 0, 0, 0, 0, 1, 11, 20, 25]
    },
    'yearwise': {
      peak: '57.5 kW',
      minRen: '16 kW',
      renFrac: '50%',
      fuelBurn: '58,400 L',
      insight: 'Annual polar cycle: Continuous 24h sunlight in Dec/Jan transitions to polar night winter (May-Aug) with high heating demand.',
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      demand: [34, 36, 42, 52, 57, 58, 56, 52, 44, 38, 35, 34],
      wind: [18, 19, 22, 24, 25, 26, 26, 25, 23, 20, 19, 18],
      solar: [24, 21, 12, 1, 0, 0, 0, 0, 1, 11, 20, 25]
    }
  };

  const currentCfg = horizonConfig[horizon] || horizonConfig['12m'];

  useEffect(() => {
    if (!isOpen) return;

    // Allow DOM to settle
    const timer = setTimeout(() => {
      const ctx = chartCanvasRef.current;
      if (!ctx) return;

      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }

      chartInstanceRef.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: currentCfg.labels,
          datasets: [
            {
              label: 'Station Demand (kW)',
              data: currentCfg.demand,
              borderColor: '#127694',
              backgroundColor: 'rgba(18, 118, 148, 0.05)',
              borderWidth: 2.5,
              tension: 0.35,
              pointRadius: 3,
              pointBackgroundColor: '#127694',
              fill: false
            },
            {
              label: 'Wind Generation (kW)',
              data: currentCfg.wind,
              borderColor: '#05c5ff',
              borderWidth: 2,
              borderDash: [5, 4],
              tension: 0.35,
              pointRadius: 2,
              pointBackgroundColor: '#05c5ff',
              fill: false
            },
            {
              label: 'Solar PV Harvest (kW)',
              data: currentCfg.solar,
              borderColor: '#4499b3',
              backgroundColor: 'rgba(68, 153, 179, 0.15)',
              borderWidth: 2,
              tension: 0.35,
              pointRadius: 2,
              pointBackgroundColor: '#4499b3',
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' },
                color: '#475569',
                usePointStyle: true,
                boxWidth: 8
              }
            },
            tooltip: {
              backgroundColor: 'rgba(18, 118, 148, 0.95)',
              titleFont: { family: 'Plus Jakarta Sans', size: 12, weight: 'bold' },
              bodyFont: { family: 'JetBrains Mono', size: 11 }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(154, 229, 254, 0.3)' },
              ticks: { font: { family: 'Plus Jakarta Sans', size: 10 }, color: '#64748b' }
            },
            y: {
              title: { display: true, text: 'Electric Power (kW)', color: '#64748b', font: { size: 11, weight: 'bold' } },
              grid: { color: 'rgba(154, 229, 254, 0.3)' },
              ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#64748b' },
              min: 0,
              max: 65
            }
          }
        }
      });
    }, 50);

    return () => {
      clearTimeout(timer);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [isOpen, horizon]);

  if (!isOpen) return null;

  return (
    <div
      id="modal-forecast-full"
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target.id === 'modal-forecast-full') onClose();
      }}
    >
      <div className="modal-content p-5 sm:p-6 max-w-[960px]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div>
            <h2 className="text-base font-extrabold text-[#127694] flex items-center gap-2">
              <i className="fa-solid fa-chart-line text-xs text-[#05c5ff]"></i>
              Predictive Energy Horizon & Climate Modeling
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              AI projected station demand vs katabatic wind and solar PV generation curve.
            </p>
          </div>
          <button
            id="btnCloseForecastModal"
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Horizon Selector Pills */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#f0faff] rounded-2xl border border-[#9ae5fe]/60 mb-3">
          {['6h', '12h', '24h', '48h', '7d', '12m', 'yearwise'].map((hKey) => {
            const labels = {
              '6h': '6 Hours',
              '12h': '12 Hours',
              '24h': '24 Hours',
              '48h': '48 Hours',
              '7d': '7 Days',
              '12m': '12 Months',
              'yearwise': 'Year-wise'
            };
            return (
              <button
                key={hKey}
                type="button"
                className={`horizon-pill ${horizon === hKey ? 'active' : ''}`}
                data-horizon={hKey}
                onClick={() => setHorizon(hKey)}
              >
                {labels[hKey]}
              </button>
            );
          })}
        </div>

        {/* Horizon Telemetry Cards Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
          <div className="p-2.5 rounded-xl bg-white border border-[#9ae5fe] text-center shadow-sm">
            <div className="text-[9px] font-bold text-slate-400 uppercase">Peak Demand</div>
            <div id="horizonPeakLoad" className="text-sm font-extrabold text-[#127694]">{currentCfg.peak}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-white border border-[#9ae5fe] text-center shadow-sm">
            <div className="text-[9px] font-bold text-slate-400 uppercase">Min Renewable Window</div>
            <div id="horizonMinRenewable" className="text-sm font-extrabold text-[#0698c4]">{currentCfg.minRen}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-white border border-[#9ae5fe] text-center shadow-sm">
            <div className="text-[9px] font-bold text-slate-400 uppercase">Renewable Fraction</div>
            <div id="horizonAvgRenewable" className="text-sm font-extrabold text-emerald-600">{currentCfg.renFrac}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-white border border-[#9ae5fe] text-center shadow-sm">
            <div className="text-[9px] font-bold text-slate-400 uppercase">Projected Fuel Burn</div>
            <div id="horizonFuelLiters" className="text-sm font-extrabold text-slate-800">{currentCfg.fuelBurn}</div>
          </div>
        </div>

        {/* Large Forecast Line Chart */}
        <div className="w-full h-72 relative bg-white p-2 rounded-2xl border border-slate-100">
          <canvas ref={chartCanvasRef} id="forecastFullCanvas"></canvas>
        </div>

        <div className="mt-3 p-2.5 bg-[#f8fcfe] rounded-xl border border-[#9ae5fe]/60 flex items-center justify-between text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <i className="fa-solid fa-circle-info text-xs text-[#0698c4]"></i>
            <span id="horizonInsightText">{currentCfg.insight}</span>
          </span>
          <span className="text-[10px] font-bold text-[#0698c4] bg-[#c2f0fe] px-2 py-0.5 rounded-full">
            AI Confidence: 94.2%
          </span>
        </div>
      </div>
    </div>
  );
}
