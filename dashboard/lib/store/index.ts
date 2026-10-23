import type {
  CreateOriginResult,
  FindingView,
  IncidentView,
  PolicyRow,
  Snapshot,
  StoreMode,
} from "../types";
import type { NormalizedOrigin, PolicyPatch } from "../origins";
import { isSupabaseConfigured } from "../supabase/server";
import { DemoStore } from "./demo";
import { SupabaseStore } from "./supabase";

export interface Store {
  readonly mode: StoreMode;
  getSnapshot(): Promise<Snapshot>;
  getPolicy(originId: string): Promise<PolicyRow | null>;
  createOrigin(input: NormalizedOrigin): Promise<CreateOriginResult>;
  updatePolicy(originId: string, patch: PolicyPatch): Promise<PolicyRow>;
  verifyFinding(findingId: string): Promise<FindingView>;
  getIncidentsSince(since: Date): Promise<IncidentView[]>;
  injectDemoFinding(): Promise<FindingView>;
  resetDemo(): Promise<void>;
}

let demoStore: DemoStore | null = null;
let supabaseStore: SupabaseStore | null = null;

/**
 * Supabase when configured, otherwise a seeded in-memory store so the entire
 * dashboard is demoable before the proxy / ML service / Supabase project exist.
 */
export function getStore(): Store {
  if (isSupabaseConfigured()) {
    if (!supabaseStore) supabaseStore = new SupabaseStore();
    return supabaseStore;
  }
  if (!demoStore) demoStore = new DemoStore();
  return demoStore;
}
