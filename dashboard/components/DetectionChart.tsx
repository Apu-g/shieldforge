"use client";

import { useId } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DetectionPoint } from "@/lib/types";
import { categoryLabel, formatRelative, formatSeconds } from "@/lib/format";

function LatencyTooltip(props: {
  active?: boolean;
  payload?: Array<{ payload?: DetectionPoint }>;
}) {
  const point = props.payload?.[0]?.payload;
  if (!props.active || !point) return null;
  return (
    <div className="chart-tooltip">
      <p>{categoryLabel(point.category)}</p>
      <strong>{formatSeconds(point.seconds)}</strong>
      <span>{formatRelative(point.created_at)}</span>
    </div>
  );
}

export function DetectionChart({
  data,
  baselineSeconds,
}: {
  data: DetectionPoint[];
  baselineSeconds: number;
}) {
  const rawId = useId();
  const gradientId = `latency-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  if (data.length === 0) {
    return (
      <div className="chart-empty">
        No findings with an event timestamp yet. Seed a finding whose
        <code> event_id </code>
        points at an <code>events</code> row to populate this chart.
      </div>
    );
  }

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 24, right: 18, left: 4, bottom: 0 }}
          barCategoryGap="24%"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#0e7490" stopOpacity={0.55} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 4"
            stroke="rgba(148, 163, 184, 0.16)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fill: "#7b8aa3", fontSize: 11 }}
            axisLine={{ stroke: "rgba(148,163,184,0.2)" }}
            tickLine={false}
          />
          <YAxis
            scale="log"
            domain={[0.1, 1200]}
            ticks={[0.1, 1, 10, 60, 900]}
            allowDataOverflow
            tickFormatter={(value: number) => formatSeconds(value)}
            tick={{ fill: "#7b8aa3", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={54}
          />
          <Tooltip
            cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
            content={<LatencyTooltip />}
          />
          <ReferenceLine
            y={baselineSeconds}
            stroke="#f59e0b"
            strokeDasharray="6 4"
            label={{
              value: `Manual review baseline (${formatSeconds(baselineSeconds)})`,
              position: "insideTopRight",
              fill: "#f59e0b",
              fontSize: 11,
            }}
          />
          <Bar
            dataKey="seconds"
            name="Detection time"
            fill={`url(#${gradientId})`}
            radius={[4, 4, 0, 0]}
            maxBarSize={38}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
