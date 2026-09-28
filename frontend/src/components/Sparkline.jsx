import React, { useMemo } from 'react';

/**
 * High-performance, lightweight SVG Sparkline for Real-Time KPI Cards.
 * Renders smooth curves with optional shaded area and reference lines.
 */
export default function Sparkline({
  data = [],
  color = '#0699C6',
  fillColor = 'rgba(6, 153, 198, 0.12)',
  height = 36,
  referenceValue = null,
  referenceColor = '#e11d48',
  minVal = null,
  maxVal = null
}) {
  const points = useMemo(() => {
    if (!data || data.length < 2) return null;

    const values = data.filter((v) => typeof v === 'number' && !isNaN(v));
    if (values.length < 2) return null;

    const dataMin = minVal !== null ? minVal : Math.min(...values);
    const dataMax = maxVal !== null ? maxVal : Math.max(...values);
    const range = dataMax - dataMin || 1;

    const w = 120; // Internal SVG coordinate width
    const h = height;
    const padding = 3;
    const usableH = h - padding * 2;

    const coords = values.map((val, idx) => {
      const x = (idx / (values.length - 1)) * w;
      const normalizedY = (val - dataMin) / range;
      const y = h - padding - normalizedY * usableH;
      return { x, y };
    });

    const pathD = coords.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }, '');

    const areaD = `${pathD} L ${w} ${h} L 0 ${h} Z`;

    let refY = null;
    if (referenceValue !== null && referenceValue >= dataMin && referenceValue <= dataMax) {
      const normRef = (referenceValue - dataMin) / range;
      refY = h - padding - normRef * usableH;
    }

    return { pathD, areaD, refY, lastPoint: coords[coords.length - 1], w, h };
  }, [data, height, referenceValue, minVal, maxVal]);

  if (!points) {
    return (
      <div
        className="w-full flex items-center justify-center text-[10px] text-slate-400 font-mono"
        style={{ height }}
      >
        <span className="opacity-60">Buffering telemetry...</span>
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${points.w} ${points.h}`}
      className="w-full overflow-visible"
      style={{ height, display: 'block' }}
      preserveAspectRatio="none"
    >
      {fillColor && (
        <path d={points.areaD} fill={fillColor} />
      )}

      {points.refY !== null && (
        <line
          x1="0"
          y1={points.refY.toFixed(1)}
          x2={points.w}
          y2={points.refY.toFixed(1)}
          stroke={referenceColor}
          strokeWidth="1"
          strokeDasharray="2,2"
          opacity="0.8"
        />
      )}

      <path
        d={points.pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {points.lastPoint && (
        <circle
          cx={points.lastPoint.x.toFixed(1)}
          cy={points.lastPoint.y.toFixed(1)}
          r="2.5"
          fill={color}
          stroke="#FFFFFF"
          strokeWidth="1"
        />
      )}
    </svg>
  );
}
