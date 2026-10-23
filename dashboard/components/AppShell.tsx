"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ActivityIcon,
  BellIcon,
  FileIcon,
  GlobeIcon,
  GridIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
  SlidersIcon,
  UsersIcon,
} from "./icons";
import { LiveDot } from "./badges";
import { useLive } from "./LiveDataProvider";
import { Tooltip } from "./Tooltip";

import { AmbientStatusWave } from "./AmbientStatusWave";

const NAV = [
  { href: "/", label: "Overview", icon: GridIcon },
  { href: "/origins", label: "Origins", icon: GlobeIcon },
  { href: "/policies", label: "Policies", icon: SlidersIcon },
  { href: "/training", label: "Training", icon: UsersIcon },
  { href: "/compliance", label: "CERT-In export", icon: FileIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { snapshot, error, refresh } = useLive();
  const [refreshing, setRefreshing] = useState(false);

  const mode = snapshot?.mode;
  const modeLabel =
    mode === "supabase" ? "Supabase" : mode === "demo" ? "Demo data" : "Connecting";

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  return (
    <div className="canvas-wrapper">
      <AmbientStatusWave />
      <div className="app-frame">
        {/* Top Navigation Bar matching the image */}
        <header className="app-topbar">
          <div className="topbar-left">
            <Link href="/" className="top-brand" aria-label="ShieldForge Home">
              <span className="brand-symbol">
                <ShieldIcon size={20} />
              </span>
            </Link>

            <nav className="topbar-nav" aria-label="Primary navigation">
              {NAV.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-pill${active ? " is-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                    {item.href === "/compliance" && (
                      <span className="nav-help-pill" title="Mandatory CERT-In reporting">
                        ?
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="topbar-right">
            <div className="status-live-indicator">
              <LiveDot label={mode === "supabase" ? "Realtime" : "Polling"} />
            </div>

            <div className="mode-chip-wrapper">
              <span className={`mode-chip mode-${mode ?? "connecting"}`}>
                {modeLabel}
              </span>
              {mode === "demo" && (
                <Tooltip
                  title="Demo Environment"
                  content="In-memory telemetry active. Add Supabase keys in .env.local to stream live edge requests."
                  position="bottom"
                />
              )}
            </div>

            <button
              type="button"
              className="topbar-icon-btn"
              onClick={() => void onRefresh()}
              aria-label="Refresh dashboard"
              title="Refresh telemetry"
            >
              <RefreshIcon size={16} className={refreshing ? "spin" : undefined} />
            </button>

            <button
              type="button"
              className="topbar-icon-btn"
              aria-label="Search"
              title="Search origins and telemetry"
            >
              <SearchIcon size={16} />
            </button>

            <button
              type="button"
              className="topbar-icon-btn with-ping"
              aria-label="Alerts"
              title="Threat alerts nominal"
            >
              <BellIcon size={16} />
              <span className="bell-ping" />
            </button>

            <div className="topbar-user-avatar" title={snapshot?.tenant_name ?? "Security Admin"}>
              <span>{snapshot?.tenant_name ? snapshot.tenant_name.slice(0, 2).toUpperCase() : "SF"}</span>
            </div>
          </div>
        </header>

        {error && (
          <div className="alert-banner" role="alert">
            <span>
              <ActivityIcon size={16} /> {error}
            </span>
            <button type="button" onClick={() => void onRefresh()}>
              Retry
            </button>
          </div>
        )}

        <main className="dashboard-body">{children}</main>
      </div>
    </div>
  );
}
