export type PolicyMode = "shadow" | "enforce";
export type FindingStatus = "open" | "actioned" | "fixed_verified";
export type Severity = "low" | "medium" | "high" | "critical";
export type StoreMode = "supabase" | "demo";

export interface TenantRow {
  id: string;
  name: string;
  created_at: string;
}

export interface OriginRow {
  id: string;
  tenant_id: string | null;
  origin_url: string;
  proxy_path: string;
  status: string;
  created_at: string;
}

export interface PolicyRow {
  id: string;
  origin_id: string;
  auto_block_threshold: number;
  alert_threshold: number;
  mode: PolicyMode;
}

export interface FindingView {
  id: string;
  origin_id: string | null;
  event_id: string | null;
  severity: string | null;
  category: string | null;
  title: string | null;
  evidence: unknown;
  ai_summary: string | null;
  status: string | null;
  created_at: string;
  origin_url: string | null;
  event_ts: string | null;
  detection_seconds: number | null;
}

export interface IncidentView {
  id: string;
  finding_id: string | null;
  action_taken: string | null;
  confidence: number | null;
  resolved: boolean;
  created_at: string;
  finding_title: string | null;
  category: string | null;
  severity: string | null;
  origin_url: string | null;
}

export interface TrainingEventRow {
  id: string;
  user_id: string | null;
  event_type: string | null;
  ts: string;
}

export interface TrainingUserView {
  id: string;
  name: string;
  risk_score: number;
  trend: number[];
  event_count: number;
  last_event_at: string | null;
}

export interface AuditView {
  id: string;
  actor: string | null;
  action: string | null;
  target: unknown;
  ts: string;
}

export interface DetectionPoint {
  id: string;
  label: string;
  category: string;
  seconds: number;
  created_at: string;
}

export interface DashboardStats {
  activeOrigins: number;
  openFindings: number;
  actionedFindings: number;
  fixedVerified: number;
  incidents6h: number;
  medianDetectionSeconds: number | null;
  baselineSeconds: number;
  improvementPct: number | null;
}

export interface Snapshot {
  mode: StoreMode;
  revision: number;
  generated_at: string;
  tenant_name: string;
  origins: OriginRow[];
  policies: PolicyRow[];
  findings: FindingView[];
  incidents: IncidentView[];
  incidents6h: IncidentView[];
  detection: DetectionPoint[];
  stats: DashboardStats;
  training: TrainingUserView[];
  audit: AuditView[];
  proxy_base_url: string | null;
}

export interface CertInRow {
  timestamp: string;
  origin: string;
  severity: string;
  category: string;
  finding: string;
  action: string;
  confidence: string;
  resolved: string;
}

export interface CreateOriginResult {
  origin: OriginRow;
  policy: PolicyRow;
}
