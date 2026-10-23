"use client";

import { useId } from "react";

export function Sparkline({
  points,
  width = 132,
  height = 36,
}: {
  points: number[];
  width?: number;
  height?: number;
}) {
  const rawId = useId();
  const gradientId = `spark-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  if (points.length < 2) {
    return <span className="spark-empty">No events yet</span>;
  }

  const pad = 3;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = (width - pad * 2) / (points.length - 1);

  const coords = points.map((value, index) => {
    const x = pad + index * step;
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = coords
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${(width - pad).toFixed(2)},${(height - pad).toFixed(2)} L${pad},${(height - pad).toFixed(2)} Z`;

  const rising = points[points.length - 1] >= points[0];
  const stroke = rising ? "#fb7185" : "#34d399";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Risk trend: ${rising ? "rising" : "falling"} from ${points[0]} to ${points[points.length - 1]}`}
      className="sparkline"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" />
      <circle
        cx={coords[coords.length - 1][0]}
        cy={coords[coords.length - 1][1]}
        r="2.3"
        fill={stroke}
      />
    </svg>
  );
}
