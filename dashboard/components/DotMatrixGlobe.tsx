"use client";

import { useEffect, useRef } from "react";
import { useLive } from "./LiveDataProvider";

interface AttackVector {
  id: string;
  sourceLat: number;
  sourceLon: number;
  targetLat: number;
  targetLon: number;
  progress: number;
  speed: number;
  name: string;
  impactTime: number; // timestamp when impact occurred
  trail: { x: number; y: number; alpha: number }[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  color: string;
}

export function DotMatrixGlobe({
  className = "",
  overrideStatus,
  overrideAttackCount,
}: {
  className?: string;
  overrideStatus?: "health" | "anomaly";
  overrideAttackCount?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { effectiveStatus, attackCount: liveAttackCount, snapshot } = useLive();

  const status = overrideStatus ?? effectiveStatus;
  const attackCount = overrideAttackCount ?? (status === "anomaly" ? Math.max(1, liveAttackCount) : 0);

  // Status ref for 60fps render loop
  const statusRef = useRef(status);
  statusRef.current = status;
  const attackCountRef = useRef(attackCount);
  attackCountRef.current = attackCount;

  // Real findings for attack vector labeling
  const findingsRef = useRef(snapshot?.findings ?? []);
  findingsRef.current = snapshot?.findings ?? [];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let angle = 0;

    // High DPI scaling
    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx?.scale(dpr, dpr);
    }

    resize();
    window.addEventListener("resize", resize);

    // 1. Generate Uniform Dot Matrix on 3D Sphere (UV Grid)
    interface SpherePoint {
      lat: number;
      lon: number;
      baseSize: number;
      pulseOffset: number;
    }

    const points: SpherePoint[] = [];
    const LAT_BANDS = 26; // Latitude bands from -78° to +78°
    for (let i = 0; i < LAT_BANDS; i++) {
      const lat = -1.36 + (i / (LAT_BANDS - 1)) * 2.72; // in radians (~ -78° to +78°)
      const cosLat = Math.cos(lat);
      const pointsInBand = Math.max(8, Math.round(54 * cosLat));
      for (let j = 0; j < pointsInBand; j++) {
        const lon = (j / pointsInBand) * Math.PI * 2;
        points.push({
          lat,
          lon,
          baseSize: 1.1 + Math.random() * 0.7,
          pulseOffset: Math.random() * Math.PI * 2,
        });
      }
    }

    // 2. Nominal Health Orbital Data Arcs (Green Mode)
    const nominalArcs = [
      { startLat: 0.45, startLon: 0.5, endLat: -0.2, endLon: 2.8, progress: 0.1, speed: 0.007 },
      { startLat: -0.5, startLon: 1.2, endLat: 0.6, endLon: 4.1, progress: 0.45, speed: 0.009 },
      { startLat: 0.2, startLon: 3.2, endLat: -0.4, endLon: 5.6, progress: 0.72, speed: 0.006 },
      { startLat: 0.7, startLon: 2.1, endLat: 0.1, endLon: 0.9, progress: 0.3, speed: 0.008 },
    ];

    // 3. Dynamic Attack Vectors for Anomaly (Red Mode)
    // Pre-seed diverse global coordinates
    const attackCoords = [
      { sLat: 0.7, sLon: 1.5, tLat: 0.35, tLon: 5.2, name: "SQLi Breach Attack" },
      { sLat: -0.3, sLon: 2.2, tLat: 0.65, tLon: 4.8, name: "XSS Session Exfil" },
      { sLat: 0.85, sLon: 3.8, tLat: -0.15, tLon: 1.9, name: "Auth Bypass Spray" },
      { sLat: 0.4, sLon: 0.9, tLat: -0.5, tLon: 3.4, name: "API Token Theft" },
      { sLat: -0.6, sLon: 4.5, tLat: 0.45, tLon: 2.3, name: "Command Injection" },
      { sLat: 0.25, sLon: 5.8, tLat: 0.75, tLon: 0.6, name: "DDoS Syn Flood" },
      { sLat: -0.45, sLon: 1.1, tLat: 0.1, tLon: 4.2, name: "SSRF Internal Probe" },
      { sLat: 0.55, sLon: 3.1, tLat: -0.25, tLon: 5.9, name: "RCE Exploit Vector" },
    ];

    const attacks: AttackVector[] = [];
    function ensureAttacks(count: number) {
      while (attacks.length < count) {
        const idx = attacks.length;
        const seed = attackCoords[idx % attackCoords.length];
        const finding = findingsRef.current[idx];
        attacks.push({
          id: `attack-${idx}`,
          sourceLat: seed.sLat,
          sourceLon: seed.sLon,
          targetLat: seed.tLat,
          targetLon: seed.tLon,
          progress: Math.random() * 0.8,
          speed: 0.009 + Math.random() * 0.008,
          name: finding?.title ? finding.title.slice(0, 24) : seed.name,
          impactTime: 0,
          trail: [],
        });
      }
      if (attacks.length > count) {
        attacks.splice(count);
      }
    }

    const impactParticles: Particle[] = [];

    // Helper: 3D Spherical to Screen Projection
    const tiltX = 0.34; // Forward tilt to look slightly down upon the globe
    const tiltZ = -0.12;
    const cosTiltX = Math.cos(tiltX);
    const sinTiltX = Math.sin(tiltX);
    const cosTiltZ = Math.cos(tiltZ);
    const sinTiltZ = Math.sin(tiltZ);

    function project3D(
      lat: number,
      lon: number,
      radius: number,
      cx: number,
      cy: number,
      elevation = 0,
    ) {
      const currentLon = lon + angle;
      const r = radius + elevation;
      const x = r * Math.cos(lat) * Math.sin(currentLon);
      const y = r * Math.sin(lat);
      const z = r * Math.cos(lat) * Math.cos(currentLon);

      // Rotate around X
      const y1 = y * cosTiltX - z * sinTiltX;
      const z1 = y * sinTiltX + z * cosTiltX;

      // Rotate around Z
      const x2 = x * cosTiltZ - y1 * sinTiltZ;
      const y2 = x * sinTiltZ + y1 * cosTiltZ;
      const z2 = z1;

      // Perspective divide
      const camDist = 650;
      const scale = camDist / (camDist - z2);
      return {
        x: cx + x2 * scale,
        y: cy + y2 * scale,
        z: z2,
        scale,
        isFront: z2 > -radius * 0.15,
      };
    }

    // Helper: Spherical Linear Interpolation (SLERP) along Great Circle
    function slerp3D(
      lat1: number,
      lon1: number,
      lat2: number,
      lon2: number,
      t: number,
    ) {
      // Cartesian coordinates on unit sphere
      const x1 = Math.cos(lat1) * Math.sin(lon1);
      const y1 = Math.sin(lat1);
      const z1 = Math.cos(lat1) * Math.cos(lon1);

      const x2 = Math.cos(lat2) * Math.sin(lon2);
      const y2 = Math.sin(lat2);
      const z2 = Math.cos(lat2) * Math.cos(lon2);

      let dot = x1 * x2 + y1 * y2 + z1 * z2;
      dot = Math.max(-1, Math.min(1, dot));
      const omega = Math.acos(dot);

      let x: number, y: number, z: number;
      if (Math.abs(omega) < 0.001) {
        x = x1 + t * (x2 - x1);
        y = y1 + t * (y2 - y1);
        z = z1 + t * (z2 - z1);
      } else {
        const sinOmega = Math.sin(omega);
        const a = Math.sin((1 - t) * omega) / sinOmega;
        const b = Math.sin(t * omega) / sinOmega;
        x = a * x1 + b * x2;
        y = a * y1 + b * y2;
        z = a * z1 + b * z2;
      }

      // Convert back to spherical
      const r = Math.sqrt(x * x + y * y + z * z);
      const lat = Math.asin(y / r);
      const lon = Math.atan2(x, z);
      return { lat, lon };
    }

    // Main 60 FPS Render Loop
    function render(timestamp: number) {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      const currentStatus = statusRef.current;
      const currentAttackCount = attackCountRef.current;
      const isAnomaly = currentStatus === "anomaly";

      // Speed up rotation slightly during anomaly for tactical urgency
      angle += isAnomaly ? 0.007 : 0.0042;

      // Position globe centered in the hero section matching the reference image
      const cx = w * 0.52;
      const cy = h * 0.44;
      const radius = Math.min(w * 0.46, h * 0.82, 290);

      // --- 1. Background Atmospheric Radial Halo ---
      const haloRadius = radius * 1.5;
      const haloGrad = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, haloRadius);
      if (isAnomaly) {
        haloGrad.addColorStop(0, "rgba(239, 68, 68, 0.22)");
        haloGrad.addColorStop(0.45, "rgba(220, 38, 38, 0.09)");
        haloGrad.addColorStop(0.8, "rgba(185, 28, 28, 0.02)");
        haloGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      } else {
        haloGrad.addColorStop(0, "rgba(74, 222, 128, 0.18)");
        haloGrad.addColorStop(0.4, "rgba(34, 197, 94, 0.08)");
        haloGrad.addColorStop(0.8, "rgba(212, 248, 75, 0.02)");
        haloGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      }
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
      ctx.fill();

      // --- 2. Outer Horizon Arc Guide Rings ---
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.01, 0, Math.PI * 2);
      ctx.strokeStyle = isAnomaly ? "rgba(239, 68, 68, 0.2)" : "rgba(74, 222, 128, 0.2)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Atmospheric limb rim glow
      const rimGrad = ctx.createRadialGradient(cx, cy, radius * 0.94, cx, cy, radius * 1.02);
      rimGrad.addColorStop(0, "rgba(0,0,0,0)");
      rimGrad.addColorStop(1, isAnomaly ? "rgba(239, 68, 68, 0.25)" : "rgba(134, 239, 172, 0.22)");
      ctx.fillStyle = rimGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // --- 3. Render Dot Matrix on Sphere ---
      // Sort points by z-depth so back dots render first, front dots render on top
      const projectedPoints = points.map((p) => {
        const proj = project3D(p.lat, p.lon, radius, cx, cy);
        return { ...p, ...proj };
      });
      projectedPoints.sort((a, b) => a.z - b.z);

      for (const p of projectedPoints) {
        const depthNorm = (p.z + radius) / (2 * radius); // 0 (back) to 1 (front)

        if (p.z > 0) {
          // Front Hemisphere: Bright, crisp glowing dots
          const alpha = 0.25 + depthNorm * 0.7;
          const size = p.baseSize * (0.8 + depthNorm * 0.75);

          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);

          if (isAnomaly) {
            ctx.fillStyle = `rgba(248, 113, 113, ${alpha})`;
          } else {
            ctx.fillStyle = depthNorm > 0.8 ? `rgba(212, 248, 75, ${alpha})` : `rgba(74, 222, 128, ${alpha})`;
          }
          ctx.fill();

          // Subtle glow on nearest center dots
          if (depthNorm > 0.85) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, size * 1.8, 0, Math.PI * 2);
            ctx.fillStyle = isAnomaly ? `rgba(239, 68, 68, 0.15)` : `rgba(212, 248, 75, 0.18)`;
            ctx.fill();
          }
        } else {
          // Back Hemisphere: Faint, translucent dots for 3D depth perception
          const alpha = 0.05 + Math.max(0, depthNorm) * 0.12;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.baseSize * 0.7, 0, Math.PI * 2);
          ctx.fillStyle = isAnomaly ? `rgba(239, 68, 68, ${alpha})` : `rgba(34, 197, 94, ${alpha})`;
          ctx.fill();
        }
      }

      // --- 4. Lines & Arcs Rendering ---
      if (!isAnomaly) {
        // === HEALTH NOMINAL MODE (Green Data Arcs) ===
        for (const arc of nominalArcs) {
          arc.progress = (arc.progress + arc.speed) % 1;

          // Draw continuous great circle curve
          const STEPS = 28;
          ctx.beginPath();
          let started = false;
          for (let s = 0; s <= STEPS; s++) {
            const t = s / STEPS;
            const coord = slerp3D(arc.startLat, arc.startLon, arc.endLat, arc.endLon, t);
            const proj = project3D(coord.lat, coord.lon, radius, cx, cy, 8);
            if (proj.z > -radius * 0.3) {
              if (!started) {
                ctx.moveTo(proj.x, proj.y);
                started = true;
              } else {
                ctx.lineTo(proj.x, proj.y);
              }
            }
          }
          ctx.strokeStyle = "rgba(74, 222, 128, 0.28)";
          ctx.lineWidth = 1.3;
          ctx.stroke();

          // Draw moving pulse packet
          const headCoord = slerp3D(arc.startLat, arc.startLon, arc.endLat, arc.endLon, arc.progress);
          const headProj = project3D(headCoord.lat, headCoord.lon, radius, cx, cy, 10);

          if (headProj.z > -radius * 0.1) {
            // Pulse head
            ctx.beginPath();
            ctx.arc(headProj.x, headProj.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = "#d4f84b";
            ctx.shadowColor = "#d4f84b";
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Ping wave
            ctx.beginPath();
            ctx.arc(headProj.x, headProj.y, 6.5, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(212, 248, 75, 0.4)";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      } else {
        // === ANOMALY DETECTED MODE (Red Attack Vectors) ===
        ensureAttacks(currentAttackCount);

        for (let i = 0; i < attacks.length; i++) {
          const atk = attacks[i];
          atk.progress += atk.speed;

          // Compute elevated 3D ballistic trajectory
          const STEPS = 34;
          const MAX_ELEVATION = 46 + (i % 3) * 14;

          ctx.save();
          ctx.beginPath();
          let started = false;
          for (let s = 0; s <= STEPS; s++) {
            const t = s / STEPS;
            const coord = slerp3D(atk.sourceLat, atk.sourceLon, atk.targetLat, atk.targetLon, t);
            // Parabolic ballistic elevation above sphere surface
            const elevation = 4 * MAX_ELEVATION * t * (1 - t);
            const proj = project3D(coord.lat, coord.lon, radius, cx, cy, elevation);

            if (proj.z > -radius * 0.4) {
              if (!started) {
                ctx.moveTo(proj.x, proj.y);
                started = true;
              } else {
                ctx.lineTo(proj.x, proj.y);
              }
            }
          }
          // Gradient or dashed trajectory line
          ctx.strokeStyle = "rgba(239, 68, 68, 0.42)";
          ctx.lineWidth = 1.6;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();

          // Calculate current projectile position
          const currentT = Math.min(atk.progress, 1);
          const currentCoord = slerp3D(atk.sourceLat, atk.sourceLon, atk.targetLat, atk.targetLon, currentT);
          const currentElevation = 4 * MAX_ELEVATION * currentT * (1 - currentT);
          const headProj = project3D(currentCoord.lat, currentCoord.lon, radius, cx, cy, currentElevation);

          // Add to trail
          if (headProj.z > -radius * 0.2) {
            atk.trail.push({ x: headProj.x, y: headProj.y, alpha: 1.0 });
            if (atk.trail.length > 10) atk.trail.shift();

            // Render fading missile trail
            for (let tIdx = 0; tIdx < atk.trail.length; tIdx++) {
              const pt = atk.trail[tIdx];
              const tAlpha = (tIdx / atk.trail.length) * 0.65;
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, 1.5 + (tIdx / atk.trail.length) * 1.5, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(248, 113, 113, ${tAlpha})`;
              ctx.fill();
            }

            // Render glowing red projectile warhead
            ctx.beginPath();
            ctx.arc(headProj.x, headProj.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = "#ef4444";
            ctx.shadowBlur = 14;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Attack telemetry mini badge tag floating above attack head
            if (i < 3 && headProj.z > 0) {
              ctx.font = "600 9px 'JetBrains Mono', monospace";
              ctx.fillStyle = "rgba(254, 202, 202, 0.9)";
              ctx.fillText(atk.name, headProj.x + 8, headProj.y - 6);
            }
          }

          // Impact handling at target coordinate
          if (atk.progress >= 1.0) {
            atk.impactTime = timestamp;
            atk.progress = 0; // Loop or trigger next wave
            atk.trail = [];

            // Spawn explosive impact sparks at target
            const targetProj = project3D(atk.targetLat, atk.targetLon, radius, cx, cy, 2);
            for (let p = 0; p < 8; p++) {
              const pAngle = Math.random() * Math.PI * 2;
              const pSpeed = 1.5 + Math.random() * 2.5;
              impactParticles.push({
                x: targetProj.x,
                y: targetProj.y,
                vx: Math.cos(pAngle) * pSpeed,
                vy: Math.sin(pAngle) * pSpeed,
                alpha: 1.0,
                size: 1.5 + Math.random() * 1.5,
                color: Math.random() > 0.4 ? "#f87171" : "#ffffff",
              });
            }
          }

          // Target Base Ping Ring on Globe
          const targetProj = project3D(atk.targetLat, atk.targetLon, radius, cx, cy, 2);
          if (targetProj.z > -radius * 0.2) {
            const pulse = (Math.sin(timestamp * 0.008 + i) + 1) * 0.5;
            ctx.beginPath();
            ctx.arc(targetProj.x, targetProj.y, 4 + pulse * 6, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(239, 68, 68, ${0.7 - pulse * 0.5})`;
            ctx.lineWidth = 1.4;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(targetProj.x, targetProj.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = "#ef4444";
            ctx.fill();
          }
        }

        // Render & Update Impact Sparks
        for (let pIdx = impactParticles.length - 1; pIdx >= 0; pIdx--) {
          const p = impactParticles[pIdx];
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= 0.035;
          if (p.alpha <= 0) {
            impactParticles.splice(pIdx, 1);
            continue;
          }
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha;
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }
      }

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className={`globe-matrix-wrapper ${className}`} aria-hidden="true">
      <canvas ref={canvasRef} className="globe-matrix-canvas" />
    </div>
  );
}
