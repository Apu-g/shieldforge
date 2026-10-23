"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useLive } from "@/components/LiveDataProvider";
import { ExportButtons } from "@/components/ExportButtons";
import { InjectDemoButton } from "@/components/InjectDemoButton";
import { VerifyFixButton } from "@/components/VerifyFixButton";
import { ResolvedBadge, SeverityBadge, StatusBadge } from "@/components/badges";
import { HatchedBarChart } from "@/components/HatchedBarChart";
import { ActivityMatrixHeatmap } from "@/components/ActivityMatrixHeatmap";
import { BreathingDotMatrix } from "@/components/BreathingDotMatrix";
import { DotMatrixGlobe } from "@/components/DotMatrixGlobe";
import { Tooltip } from "@/components/Tooltip";
import {
  ArrowUpRightIcon,
  CalendarIcon,
  FilterIcon,
  GlobeIcon,
  SearchIcon,
  ShieldIcon,
  SlidersIcon,
  UsersIcon,
} from "@/components/icons";
import {
  actionLabel,
  formatDateTime,
  formatRelative,
  formatSeconds,
} from "@/lib/format";

export default function DashboardPage() {
  const { snapshot, loading } = useLive();
  const [filter, setFilter] = useState<"all" | "critical" | "high" | "active">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const originPaths = useMemo(() => {
    const map = new Map<string, string>();
    for (const origin of snapshot?.origins ?? []) {
      map.set(origin.id, origin.proxy_path);
    }
    return map;
  }, [snapshot?.origins]);

  // Filter findings based on active tab and search query
  const filteredFindings = useMemo(() => {
    let list = snapshot?.findings ?? [];
    if (filter === "critical") {
      list = list.filter((f) => f.severity === "critical");
    } else if (filter === "high") {
      list = list.filter((f) => f.severity === "high" || f.severity === "critical");
    } else if (filter === "active") {
      list = list.filter((f) => f.status === "open" || f.status === "actioned");
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (f) =>
          (f.title ?? "").toLowerCase().includes(q) ||
          (f.category ?? "").toLowerCase().includes(q) ||
          (f.ai_summary && f.ai_summary.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [snapshot?.findings, filter, searchQuery]);

  if (!snapshot) {
    return (
      <div className="stack">
        <div className="skeleton skeleton-hero" />
        <div className="stat-grid">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="skeleton skeleton-stat" key={index} />
          ))}
        </div>
        <div className="skeleton skeleton-panel" />
        {!loading && (
          <p className="empty-state">
            Dashboard data is unavailable. Check the API and Supabase schema.
          </p>
        )}
      </div>
    );
  }

  const { stats, findings, incidents, incidents6h, origins } = snapshot;
  const improvement = stats.improvementPct;

  return (
    <div className="dashboard-content-stack">
      {/* 1. Hero Row matching reference image: Welcome text on left, 3 rounded metric cards on right */}
      <section className="dribbble-hero-row">
        {/* 3D Cyber Dot Matrix Globe in the hero backdrop */}
        <div className="hero-globe-backdrop">
          <DotMatrixGlobe />
        </div>

        <div className="dribbble-greeting">
          <span className="greeting-sub">Welcome back,</span>
          <div className="greeting-title-row">
            <h1>{snapshot.tenant_name ?? "ShieldForge Core"}</h1>
            <span className="badge-lavender-pill">Autonomous</span>
          </div>
        </div>

        <div className="dribbble-metrics-row">
          {/* Metric Card 1: Active Origins */}
          <div className="dribbble-metric-card">
            <div className="metric-card-top">
              <span className="card-top-left">
                <GlobeIcon size={16} />
                <span className="card-top-label">Active origins</span>
              </span>
              <Link href="/origins" className="metric-arrow-btn" aria-label="Manage origins">
                <ArrowUpRightIcon size={14} />
              </Link>
            </div>
            <strong className="metric-card-val">{stats.activeOrigins}</strong>
            <span className="metric-card-delta positive">
              {origins.length} connected · <Link href="/origins">manage</Link>
            </span>
          </div>

          {/* Metric Card 2: Open Findings */}
          <div className="dribbble-metric-card">
            <div className="metric-card-top">
              <span className="card-top-left">
                <ShieldIcon size={16} />
                <span className="card-top-label">Open findings</span>
              </span>
              <button
                type="button"
                className="metric-arrow-btn"
                aria-label="Findings details"
                onClick={() => setFilter("active")}
              >
                <ArrowUpRightIcon size={14} />
              </button>
            </div>
            <strong className="metric-card-val">{stats.openFindings}</strong>
            <span className="metric-card-delta positive">
              {stats.actionedFindings} actioned · {stats.fixedVerified} verified
            </span>
          </div>

          {/* Metric Card 3: Accent Neon Lime Card: Time Saved */}
          <div className="dribbble-metric-card is-accent-lime">
            <div className="metric-card-top">
              <span className="card-top-left">
                <SlidersIcon size={16} />
                <span className="card-top-label">Time saved</span>
              </span>
              <span className="metric-arrow-btn black-btn" aria-label="Median detection velocity">
                <ArrowUpRightIcon size={14} />
              </span>
            </div>
            <strong className="metric-card-val">
              {improvement === null ? "99.8%" : `${improvement > 0 ? improvement : 0}%`}
            </strong>
            <span className="metric-card-delta lime-delta">
              faster than manual triage ({formatSeconds(stats.medianDetectionSeconds)} vs 15m)
            </span>
          </div>
        </div>
      </section>

      {/* 2. Filter & Actions Toolbar matching reference image */}
      <section className="dribbble-toolbar">
        <div className="toolbar-left-pills">
          <button
            type="button"
            className={`filter-pill ${filter === "all" ? "is-active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`filter-pill ${filter === "critical" ? "is-active" : ""}`}
            onClick={() => setFilter("critical")}
          >
            Critical
          </button>
          <button
            type="button"
            className={`filter-pill ${filter === "high" ? "is-active" : ""}`}
            onClick={() => setFilter("high")}
          >
            High risk
          </button>
          <button
            type="button"
            className={`filter-pill ${filter === "active" ? "is-active" : ""}`}
            onClick={() => setFilter("active")}
          >
            Active incidents
          </button>
        </div>

        <div className="toolbar-right-actions">
          <button type="button" className="action-circle-btn" title="Filter rules">
            <FilterIcon size={15} />
          </button>
          <div className="action-pill-btn" title="CERT-In 6-hour statutory window">
            <CalendarIcon size={15} />
            <span>6h window</span>
          </div>
          {snapshot.mode === "demo" && <InjectDemoButton />}
          <ExportButtons compact />
        </div>
      </section>

      {/* 3. The 3-Column Dribbble Tactical Grid matching reference image */}
      <section className="dribbble-three-columns">
        {/* Column 1: Engagement rate -> Detection Latency with Hatched Bar Chart */}
        <div className="dribbble-column-card">
          <div className="col-card-header">
            <div className="col-header-left">
              <span className="col-icon-wrap">
                <ShieldIcon size={16} />
              </span>
              <h3>Detection latency</h3>
              <Tooltip
                title="Latency Distribution"
                content="Logarithmic comparison of event ingestion to automated policy trigger, benchmarked against manual SOC baseline."
              />
            </div>
            <div className="col-header-right">
              <div className="segmented-pill-toggle">
                <span className="seg-opt">Realtime</span>
                <span className="seg-opt is-active">Benchmark</span>
              </div>
            </div>
          </div>

          <div className="col-card-body">
            <HatchedBarChart
              medianSeconds={stats.medianDetectionSeconds}
              baselineSeconds={stats.baselineSeconds}
            />
          </div>
        </div>

        {/* Column 2: Time visit -> Origin Activity Matrix Heatmap */}
        <div className="dribbble-column-card">
          <div className="col-card-header">
            <div className="col-header-left">
              <span className="col-icon-wrap">
                <GlobeIcon size={16} />
              </span>
              <h3>Time telemetry</h3>
              <Tooltip
                title="Continuous Ingress Matrix"
                content="2D distribution of inspected payloads and blocked attacks across time slots and origins."
              />
            </div>
            <div className="col-header-right">
              <div className="dropdown-pill">
                <span>All origins ▾</span>
              </div>
            </div>
          </div>

          <div className="col-card-body">
            <ActivityMatrixHeatmap />
          </div>
        </div>

        {/* Column 3: Messages -> Live Findings & Response Feed */}
        <div className="dribbble-column-card feed-column-card">
          <div className="col-card-header">
            <div className="col-header-left">
              <span className="col-icon-wrap with-green-dot">
                <UsersIcon size={16} />
              </span>
              <h3>Live findings</h3>
              <span className="count-pill">{filteredFindings.length}</span>
            </div>
            <div className="col-header-right">
              {snapshot.mode === "demo" && (
                <div title="Inject synthetic finding">
                  <InjectDemoButton />
                </div>
              )}
            </div>
          </div>

          <div className="search-bar-wrap">
            <SearchIcon size={14} className="search-icon" />
            <input
              type="text"
              className="feed-search-input"
              placeholder="Search findings & telemetry..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="col-card-body feed-items-scroll">
            {filteredFindings.map((finding) => (
              <div className="feed-item-row" key={finding.id}>
                <div className="feed-item-avatar">
                  <SeverityBadge severity={finding.severity} />
                </div>
              <div className="feed-item-main">
                  <div className="feed-item-top">
                    <strong>{finding.title}</strong>
                    <time dateTime={finding.created_at} title={formatDateTime(finding.created_at)}>
                      {formatRelative(finding.created_at)}
                    </time>
                  </div>
                  {/* LLM AI Reasoning Card */}
                  <div className={`ai-reasoning-card ${finding.ai_summary ? "has-summary" : "is-pending"}`}>
                    <span className="ai-card-icon" aria-hidden="true">
                      {finding.ai_summary ? "✦" : "◌"}
                    </span>
                    <span className="ai-card-label">
                      {finding.ai_summary ? "AI Analysis" : "Evaluating threat vector…"}
                    </span>
                    {finding.ai_summary && (
                      <p className="ai-card-text">{finding.ai_summary}</p>
                    )}
                  </div>
                  <div className="feed-item-tags">
                    <code>{originPaths.get(finding.origin_id ?? "") ?? "upstream"}</code>
                    <StatusBadge status={finding.status} />
                    <VerifyFixButton findingId={finding.id} status={finding.status} />
                  </div>
                </div>
              </div>
            ))}
            {filteredFindings.length === 0 && (
              <div className="empty-feed">
                <span>No findings match the current filter.</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. Lower Section: CERT-In 6-Hour Reporting Window & Recent Incidents */}
      <section className="dribbble-split-lower">
        <div className="dribbble-card cert-in-card">
          <div className="card-heading">
            <div className="heading-with-tooltip">
              <span className="col-icon-wrap">
                <ShieldIcon size={16} />
              </span>
              <h2>CERT-In 6-Hour Statutory Register</h2>
              <Tooltip
                title="Directives under IT Act Sec 70B"
                content="Cyber security incidents must be reported to CERT-In within 6 hours. This package includes timestamped records and containment logs."
              />
            </div>
            <ExportButtons />
          </div>
          <p className="muted">
            India&apos;s CERT-In directions require specified cyber security incidents to be reported{" "}
            <strong>within 6 hours</strong> of noticing them.
          </p>
          <div className="cert-stat-pills">
            <div className="cert-stat-pill">
              <span>Incidents in window</span>
              <strong>{incidents6h.length}</strong>
            </div>
            <div className="cert-stat-pill">
              <span>Automated mitigations</span>
              <strong>
                {incidents6h.filter((i) => i.action_taken && i.action_taken !== "none").length}
              </strong>
            </div>
            <div className="cert-stat-pill">
              <span>Origins affected</span>
              <strong>{new Set(incidents6h.map((i) => i.origin_url)).size}</strong>
            </div>
            <div className="cert-stat-pill">
              <span>Reporting window</span>
              <strong>Rolling 6 Hours</strong>
            </div>
          </div>
        </div>

        <div className="dribbble-card incidents-stream-card">
          <div className="card-heading">
            <div className="heading-with-tooltip">
              <span className="col-icon-wrap">
                <GlobeIcon size={16} />
              </span>
              <h2>Recent mitigations</h2>
            </div>
            <Link href="/compliance" className="text-link">
              Full report →
            </Link>
          </div>
          <div className="incidents-list">
            {incidents.slice(0, 4).map((inc) => (
              <div className="incident-row" key={inc.id}>
                <span className="incident-action-tag">{actionLabel(inc.action_taken)}</span>
                <span className="incident-title-text">{inc.finding_title}</span>
                <ResolvedBadge resolved={inc.resolved} />
                <time dateTime={inc.created_at}>{formatRelative(inc.created_at)}</time>
              </div>
            ))}
            {incidents.length === 0 && (
              <p className="empty-state">No incidents recorded yet.</p>
            )}
          </div>
        </div>
      </section>

      {/* 5. Breathing Dot Matrix Tactical Radar at End of Page */}
      <BreathingDotMatrix />
    </div>
  );
}
