"use client";

import { formatSeconds } from "@/lib/format";

interface HatchedBarChartProps {
  medianSeconds: number | null;
  baselineSeconds: number;
}

export function HatchedBarChart({
  medianSeconds,
  baselineSeconds,
}: HatchedBarChartProps) {
  // 6 months / periods matching Jan, Feb, Mar, Apr, Mei, Jun
  const bars = [
    { label: "Jan", height: 42, active: false },
    { label: "Feb", height: 68, active: false },
    { label: "Mar", height: 55, active: false },
    { label: "Apr", height: 94, active: true }, // active highlight
    { label: "Mei", height: 72, active: false },
    { label: "Jun", height: 85, active: false },
  ];

  const yLabels = ["12.5s", "10s", "7.5s", "5s", "2.5s", "0s"];

  return (
    <div className="hatched-chart-widget">
      <div className="chart-y-axis">
        {yLabels.map((yl) => (
          <span key={yl} className="axis-label">{yl}</span>
        ))}
      </div>

      <div className="chart-bars-area">
        <div className="chart-bars-row">
          {bars.map((bar) => (
            <div key={bar.label} className="chart-bar-col">
              {bar.active && (
                <div className="chart-active-tooltip">
                  <span className="tooltip-delta-chip">+99.8%</span>
                  <div className="tooltip-pin-dot" />
                  <div className="tooltip-glass-box">
                    <span className="box-period">Median Triage</span>
                    <strong className="box-value">{formatSeconds(medianSeconds)}</strong>
                    <span className="box-baseline">vs {formatSeconds(baselineSeconds)} base</span>
                  </div>
                </div>
              )}

              <div
                className={`chart-bar-pillar ${bar.active ? "is-active-bar" : "is-hatched-bar"}`}
                style={{ height: `${bar.height}%` }}
              >
                {!bar.active && <span className="bar-cap-dot" />}
              </div>
              <span className="chart-x-label">{bar.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
