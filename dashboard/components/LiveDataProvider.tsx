"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Snapshot } from "@/lib/types";
import { getBrowserSupabase } from "@/lib/supabase/browser";

interface LiveContextValue {
  snapshot: Snapshot | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  simulatedStatus: "health" | "anomaly" | null;
  setSimulatedStatus: (
    status:
      | "health"
      | "anomaly"
      | null
      | ((prev: "health" | "anomaly" | null) => "health" | "anomaly" | null),
  ) => void;
  effectiveStatus: "health" | "anomaly";
  attackCount: number;
}

const LiveContext = createContext<LiveContextValue | null>(null);

export function LiveDataProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulatedStatus, setSimulatedStatus] = useState<"health" | "anomaly" | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch("/api/snapshot", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not load dashboard data.");
      }
      if (!mounted.current) return;
      setSnapshot(payload as Snapshot);
      setError(null);
    } catch (caught) {
      if (!mounted.current) return;
      setError(
        caught instanceof Error ? caught.message : "Could not load dashboard data.",
      );
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const mode = snapshot?.mode;

  useEffect(() => {
    if (mode !== "supabase") return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel("shieldforge-live-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "findings" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "incidents" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [mode, refresh]);

  useEffect(() => {
    const intervalMs = mode === "supabase" ? 2000 : 1200;
    const interval = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(interval);
  }, [mode, refresh]);

  const criticalCount =
    snapshot?.findings.filter((f) => f.severity === "critical" && f.status === "open").length ?? 0;
  const highCount =
    snapshot?.findings.filter((f) => f.severity === "high" && f.status === "open").length ?? 0;
  const autoAnomaly = criticalCount > 0 || (snapshot?.incidents.length ?? 0) > 0;

  const effectiveStatus: "health" | "anomaly" =
    simulatedStatus ?? (autoAnomaly ? "anomaly" : "health");

  // Attack count based on critical + high findings or default to 4 when in anomaly mode
  const rawAttackCount = criticalCount + highCount;
  const attackCount =
    effectiveStatus === "anomaly" ? (rawAttackCount > 0 ? rawAttackCount : 4) : 0;

  const value = useMemo(
    () => ({
      snapshot,
      error,
      loading,
      refresh,
      simulatedStatus,
      setSimulatedStatus,
      effectiveStatus,
      attackCount,
    }),
    [
      snapshot,
      error,
      loading,
      refresh,
      simulatedStatus,
      setSimulatedStatus,
      effectiveStatus,
      attackCount,
    ],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveContextValue {
  const context = useContext(LiveContext);
  if (!context) {
    throw new Error("useLive must be used inside LiveDataProvider.");
  }
  return context;
}
