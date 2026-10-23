"use client";

import { useEffect, useRef } from "react";

export function BreathingDotMatrix({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let time = 0;

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx?.scale(dpr, dpr);
    }

    resize();
    window.addEventListener("resize", resize);

    // Grid configuration
    const SPACING = 24;
    const waves: { x: number; y: number; progress: number; speed: number; maxR: number }[] = [];

    // Periodic radar pulse waves
    let waveTimer = 0;

    function render() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);
      time += 0.025;
      waveTimer++;

      if (waveTimer % 90 === 0) {
        waves.push({
          x: w * 0.5 + (Math.random() - 0.5) * w * 0.4,
          y: h * 0.5 + (Math.random() - 0.5) * h * 0.3,
          progress: 0,
          speed: 0.008,
          maxR: Math.max(w, h) * 0.6,
        });
      }

      // Draw subtle tactical gradient underglow
      const bgGlow = ctx.createRadialGradient(w * 0.5, h * 0.5, 20, w * 0.5, h * 0.5, w * 0.6);
      bgGlow.addColorStop(0, "rgba(34, 197, 94, 0.08)");
      bgGlow.addColorStop(0.5, "rgba(16, 185, 129, 0.03)");
      bgGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, w, h);

      // Draw breathing dot matrix grid
      const cols = Math.ceil(w / SPACING) + 1;
      const rows = Math.ceil(h / SPACING) + 1;

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const x = c * SPACING;
          const y = r * SPACING;

          // Multi-frequency breathing wave formula
          const distFromCenter = Math.hypot(x - w * 0.5, y - h * 0.5);
          const breath = Math.sin(time + distFromCenter * 0.015) * 0.5 + 0.5;
          const harmonic = Math.sin(time * 0.6 + c * 0.15 - r * 0.15) * 0.5 + 0.5;

          // Check interaction with active radar waves
          let waveBoost = 0;
          for (let wi = waves.length - 1; wi >= 0; wi--) {
            const wv = waves[wi];
            const currentR = wv.progress * wv.maxR;
            const d = Math.abs(Math.hypot(x - wv.x, y - wv.y) - currentR);
            if (d < 35) {
              const f = 1 - d / 35;
              waveBoost = Math.max(waveBoost, f * (1 - wv.progress));
            }
          }

          const baseAlpha = 0.1 + breath * 0.2 + waveBoost * 0.7;
          const dotSize = 1.0 + breath * 0.9 + waveBoost * 1.5;

          ctx.beginPath();
          ctx.arc(x, y, dotSize, 0, Math.PI * 2);

          if (waveBoost > 0.3 || (c % 7 === 0 && r % 5 === 0 && harmonic > 0.75)) {
            // Active highlighted telemetry node
            ctx.fillStyle = `rgba(163, 230, 53, ${Math.min(1, baseAlpha + 0.4)})`;
            ctx.shadowColor = "#84cc16";
            ctx.shadowBlur = 6;
          } else {
            ctx.fillStyle = `rgba(74, 222, 128, ${baseAlpha * 0.75})`;
            ctx.shadowBlur = 0;
          }
          ctx.fill();
        }
      }

      ctx.shadowBlur = 0;

      // Update radar waves
      for (let wi = waves.length - 1; wi >= 0; wi--) {
        waves[wi].progress += waves[wi].speed;
        if (waves[wi].progress >= 1) {
          waves.splice(wi, 1);
        }
      }

      animId = requestAnimationFrame(render);
    }

    render();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <section className={`breathing-dot-matrix-card ${className}`}>
      <div className="matrix-canvas-wrapper" aria-hidden="true">
        <canvas ref={canvasRef} className="matrix-canvas" />
      </div>

      <div className="matrix-overlay-content">
        <div className="matrix-tactical-header">
          <div className="tactical-badge">
            <span className="tactical-pulse-dot" />
            <span>CONTINUOUS SURFACE TELEMETRY</span>
          </div>
          <span className="tactical-id">GRID://SF-SEC-CORE.884</span>
        </div>

        <div className="matrix-center-hero">
          <div className="radar-target-ring">
            <span className="radar-scanner" />
            <div className="radar-core-circle">
              <span className="radar-icon-shield" />
            </div>
          </div>
          <div className="matrix-hero-text">
            <h3>Autonomous Perimeter Defended</h3>
            <p>
              Sub-millisecond containment matrix continuously evaluating ingress payloads across all connected cluster origins.
            </p>
          </div>
        </div>

        <div className="matrix-metrics-strip">
          <div className="matrix-metric">
            <span className="metric-tag">LATENCY MATRIX</span>
            <strong>1.2ms</strong>
            <span className="metric-status nominal">● NOMINAL</span>
          </div>
          <div className="matrix-metric">
            <span className="metric-tag">INSPECTION CADENCE</span>
            <strong>100.0%</strong>
            <span className="metric-status nominal">● STREAMING</span>
          </div>
          <div className="matrix-metric">
            <span className="metric-tag">POLICY STATUS</span>
            <strong>ENFORCED</strong>
            <span className="metric-status active">● AUTONOMOUS</span>
          </div>
          <div className="matrix-metric">
            <span className="metric-tag">SOC ESCALATIONS</span>
            <strong>0 QUEUED</strong>
            <span className="metric-status secure">● ZERO DELAY</span>
          </div>
        </div>
      </div>
    </section>
  );
}
