"use client";

import { useMemo } from "react";

export function ActivityMatrixHeatmap() {
  const hours = ["2pm", "1pm", "12am", "11am", "10am", "9am", "8am"];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Heatmap activity levels: 0 (dim hatched), 1 (light), 2 (medium lime), 3 (bright neon lime)
  const gridData = useMemo(() => {
    return [
      [0, 0, 0, 1, 0, 0, 0],
      [0, 1, 0, 0, 2, 0, 0],
      [0, 1, 2, 0, 3, 1, 1],
      [0, 2, 3, 3, 3, 2, 0],
      [0, 3, 3, 2, 3, 3, 0],
      [0, 0, 1, 2, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0],
    ];
  }, []);

  return (
    <div className="activity-matrix-widget">
      <div className="matrix-legend-row">
        <span className="legend-item">
          <i className="matrix-dot lvl-0" /> &gt;100
        </span>
        <span className="legend-item">
          <i className="matrix-dot lvl-1" /> &gt;500
        </span>
        <span className="legend-item">
          <i className="matrix-dot lvl-2" /> &gt;1,000
        </span>
        <span className="legend-item">
          <i className="matrix-dot lvl-3" /> &gt;2,000
        </span>
      </div>

      <div className="matrix-grid-layout">
        <div className="matrix-y-axis">
          {hours.map((h) => (
            <span key={h} className="axis-label">{h}</span>
          ))}
        </div>

        <div className="matrix-cells-container">
          <div className="matrix-cells-grid">
            {gridData.map((row, rIdx) => (
              <div key={rIdx} className="matrix-grid-row">
                {row.map((lvl, cIdx) => (
                  <div
                    key={cIdx}
                    className={`matrix-tile lvl-${lvl}`}
                    title={`${days[cIdx]} at ${hours[rIdx]}: ${
                      lvl === 3 ? "Peak threat containment (2,400+ req/s)" : lvl === 2 ? "High traffic (1,200 req/s)" : lvl === 1 ? "Normal traffic (600 req/s)" : "Nominal telemetry"
                    }`}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="matrix-x-axis">
            {days.map((d) => (
              <span key={d} className="axis-label">{d}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
