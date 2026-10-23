import { AppError, ConflictError, NotFoundError } from "../errors";
import { detectionSeconds } from "../metrics";
import type {
  AuditView,
  CreateOriginResult,
  FindingView,
  IncidentView,
  OriginRow,
  PolicyRow,
  Snapshot,
  TrainingEventRow,
} from "../types";
import type { NormalizedOrigin, PolicyPatch } from "../origins";
import { getServerSupabase } from "../supabase/server";
import { assembleSnapshot } from "./assemble";
import type { Store } from "./index";

// Supabase's nested relational selects are dynamic; normalize them once here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function asMode(value: unknown): "shadow" | "enforce" {
  return value === "enforce" ? "enforce" : "shadow";
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapOrigin(row: Row): OriginRow {
  return {
    id: String(row.id),
    tenant_id: row.tenant_id ?? null,
    origin_url: String(row.origin_url ?? ""),
    proxy_path: String(row.proxy_path ?? ""),
    status: String(row.status ?? "active"),
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapPolicy(row: Row): PolicyRow {
  return {
    id: String(row.id),
    origin_id: String(row.origin_id),
    auto_block_threshold: asNumber(row.auto_block_threshold, 0.9),
    alert_threshold: asNumber(row.alert_threshold, 0.6),
    mode: asMode(row.mode),
  };
}

function mapFinding(row: Row): FindingView {
  const event = one<Row>(row.events);
  const origin = one<Row>(row.origins);
  const eventTs = event?.ts ?? null;
  return {
    id: String(row.id),
    origin_id: row.origin_id ?? null,
    event_id: row.event_id ?? null,
    severity: row.severity ?? null,
    category: row.category ?? null,
    title: row.title ?? null,
    evidence: row.evidence ?? null,
    ai_summary: row.ai_summary ?? null,
    status: row.status ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    origin_url: origin?.origin_url ?? null,
    event_ts: eventTs,
    detection_seconds: eventTs ? detectionSeconds(eventTs, row.created_at) : null,
  };
}

function mapIncident(row: Row): IncidentView {
  const finding = one<Row>(row.findings);
  const origin = finding ? one<Row>(finding.origins) : null;
  return {
    id: String(row.id),
    finding_id: row.finding_id ?? null,
    action_taken: row.action_taken ?? null,
    confidence: row.confidence === null ? null : asNumber(row.confidence, 0),
    resolved: Boolean(row.resolved),
    created_at: String(row.created_at ?? new Date().toISOString()),
    finding_title: finding?.title ?? null,
    category: finding?.category ?? null,
    severity: finding?.severity ?? null,
    origin_url: origin?.origin_url ?? null,
  };
}

function queryError(label: string, error: { message: string } | null): void {
  if (error) {
    throw new Error(
      `${label} query failed: ${error.message}. Did you run supabase/schema.sql and supabase/seed.sql?`,
    );
  }
}

async function writeAudit(
  actor: string,
  action: string,
  target: Record<string, unknown>,
): Promise<void> {
  const supabase = getServerSupabase();
  const { error } = await supabase.from("audit_log").insert({
    actor,
    action,
    target,
  });
  if (error) console.error("Failed to write audit_log:", error.message);
}

export class SupabaseStore implements Store {
  readonly mode = "supabase" as const;

  async getSnapshot(): Promise<Snapshot> {
    const supabase = getServerSupabase();

    const [tenantRes, originsRes, policiesRes, findingsRes, incidentsRes, usersRes, eventsRes, auditRes] =
      await Promise.all([
        supabase
          .from("tenants")
          .select("*")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("origins")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("policies").select("*"),
        supabase
          .from("findings")
          .select("*, events(ts), origins(origin_url)")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("incidents")
          .select(
            "*, findings(title, category, severity, origins(origin_url))",
          )
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("training_users")
          .select("*")
          .order("risk_score", { ascending: false }),
        supabase
          .from("training_events")
          .select("*")
          .order("ts", { ascending: true })
          .limit(1000),
        supabase
          .from("audit_log")
          .select("*")
          .order("ts", { ascending: false })
          .limit(50),
      ]);

    queryError("tenants", tenantRes.error);
    queryError("origins", originsRes.error);
    queryError("policies", policiesRes.error);
    queryError("findings", findingsRes.error);
    queryError("incidents", incidentsRes.error);
    queryError("training_users", usersRes.error);
    queryError("training_events", eventsRes.error);
    queryError("audit_log", auditRes.error);

    const origins = ((originsRes.data ?? []) as Row[]).map(mapOrigin);
    const policies = ((policiesRes.data ?? []) as Row[]).map(mapPolicy);
    const findings = ((findingsRes.data ?? []) as Row[]).map(mapFinding);
    const incidents = ((incidentsRes.data ?? []) as Row[]).map(mapIncident);
    const trainingUsers = ((usersRes.data ?? []) as Row[]).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? "Unnamed user"),
      risk_score: asNumber(row.risk_score, 0),
    }));
    const trainingEvents: TrainingEventRow[] = (
      (eventsRes.data ?? []) as Row[]
    ).map((row) => ({
      id: String(row.id),
      user_id: row.user_id ?? null,
      event_type: row.event_type ?? null,
      ts: String(row.ts ?? new Date().toISOString()),
    }));
    const audit: AuditView[] = ((auditRes.data ?? []) as Row[]).map((row) => ({
      id: String(row.id),
      actor: row.actor ?? null,
      action: row.action ?? null,
      target: row.target ?? null,
      ts: String(row.ts ?? new Date().toISOString()),
    }));

    return assembleSnapshot({
      mode: this.mode,
      revision: 0,
      tenantName: tenantRes.data?.name ?? "ShieldForge",
      origins,
      policies,
      findings,
      incidents,
      trainingUsers,
      trainingEvents,
      audit,
      proxyBaseUrl: process.env.NEXT_PUBLIC_PROXY_BASE_URL ?? null,
    });
  }

  async getPolicy(originId: string): Promise<PolicyRow | null> {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("policies")
      .select("*")
      .eq("origin_id", originId)
      .maybeSingle();
    queryError("policy", error);
    return data ? mapPolicy(data as Row) : null;
  }

  async createOrigin(input: NormalizedOrigin): Promise<CreateOriginResult> {
    const supabase = getServerSupabase();

    const existing = await supabase
      .from("origins")
      .select("id")
      .eq("origin_url", input.originUrl)
      .maybeSingle();
    queryError("origin lookup", existing.error);
    if (existing.data) {
      throw new ConflictError(
        `${input.originUrl} is already connected to this workspace.`,
      );
    }

    let tenant = (
      await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
    ).data;

    if (!tenant) {
      const createdTenant = await supabase
        .from("tenants")
        .insert({ name: "ShieldForge Demo" })
        .select("*")
        .single();
      queryError("tenant insert", createdTenant.error);
      tenant = createdTenant.data;
    }

    const originRes = await supabase
      .from("origins")
      .insert({
        tenant_id: tenant?.id ?? null,
        origin_url: input.originUrl,
        proxy_path: input.proxyPath,
        status: "active",
      })
      .select("*")
      .single();

    if (originRes.error) {
      if (originRes.error.code === "23505") {
        throw new ConflictError(
          `${input.originUrl} is already connected to this workspace.`,
        );
      }
      throw new Error(`Could not create origin: ${originRes.error.message}`);
    }

    const policyRes = await supabase
      .from("policies")
      .insert({
        origin_id: originRes.data.id,
        auto_block_threshold: 0.9,
        alert_threshold: 0.6,
        mode: "shadow",
      })
      .select("*")
      .single();

    if (policyRes.error) {
      await supabase.from("origins").delete().eq("id", originRes.data.id);
      throw new Error(
        `Origin created but the default policy failed: ${policyRes.error.message}`,
      );
    }

    await writeAudit("dashboard", "origin.created", {
      origin_id: originRes.data.id,
      origin_url: input.originUrl,
      proxy_path: input.proxyPath,
    });

    return {
      origin: mapOrigin(originRes.data as Row),
      policy: mapPolicy(policyRes.data as Row),
    };
  }

  async updatePolicy(
    originId: string,
    patch: PolicyPatch,
  ): Promise<PolicyRow> {
    const supabase = getServerSupabase();
    const existing = await this.getPolicy(originId);

    let result;
    if (existing) {
      result = await supabase
        .from("policies")
        .update({
          auto_block_threshold: patch.auto_block_threshold,
          alert_threshold: patch.alert_threshold,
          mode: patch.mode,
        })
        .eq("origin_id", originId)
        .select("*")
        .single();
    } else {
      const origin = await supabase
        .from("origins")
        .select("id")
        .eq("id", originId)
        .maybeSingle();
      queryError("origin lookup", origin.error);
      if (!origin.data) throw new NotFoundError("Origin not found.");

      result = await supabase
        .from("policies")
        .insert({
          origin_id: originId,
          auto_block_threshold: patch.auto_block_threshold,
          alert_threshold: patch.alert_threshold,
          mode: patch.mode,
        })
        .select("*")
        .single();
    }

    if (result.error) {
      throw new Error(`Could not save policy: ${result.error.message}`);
    }

    await writeAudit("dashboard", "policy.updated", {
      origin_id: originId,
      auto_block_threshold: patch.auto_block_threshold,
      alert_threshold: patch.alert_threshold,
      mode: patch.mode,
    });

    return mapPolicy(result.data as Row);
  }

  async verifyFinding(findingId: string): Promise<FindingView> {
    const supabase = getServerSupabase();
    const existing = await supabase
      .from("findings")
      .select("id, origin_id, category, evidence, severity, title")
      .eq("id", findingId)
      .maybeSingle();
    queryError("finding lookup", existing.error);
    if (!existing.data) throw new NotFoundError("Finding not found.");

    const finding = existing.data as Row;
    const originId = finding.origin_id;

    // Get origin details for proxy URL — gracefully handle missing origin
    let originData: { origin_url: string; proxy_path: string } | null = null;
    if (originId) {
      const { data } = await supabase
        .from("origins")
        .select("origin_url, proxy_path")
        .eq("id", originId)
        .maybeSingle();
      originData = data ?? null;
    }

    // If no origin found, mark as requiring manual review instead of erroring
    if (!originData) {
      const updated = await supabase
        .from("findings")
        .update({
          status: "open",
          evidence: {
            ...(finding.evidence as Record<string, unknown> || {}),
            verification: {
              fixVerified: false,
              note: "Origin not configured — manual review required",
              verifiedAt: new Date().toISOString(),
            },
          },
        })
        .eq("id", findingId)
        .select("*, events(ts), origins(origin_url)")
        .single();
      queryError("finding update (no origin)", updated.error);
      return mapFinding(updated.data as Row);
    }

    // Get proxy base URL
    const proxyBaseUrl = process.env.NEXT_PUBLIC_PROXY_BASE_URL || 'http://localhost:3000';
    const testUrl = `${proxyBaseUrl}${originData.proxy_path}`;

    // Real fix verification: replay a safe test request based on finding category
    let fixVerified = false;
    let verificationDetails: Record<string, unknown> = {};

    try {
      const category = finding.category;
      const evidence = finding.evidence as Record<string, unknown> | null;

      // Construct test payload based on vulnerability type
      const testPayload = this.buildTestPayload(category, evidence);
      if (testPayload) {
        const response = await fetch(testUrl, {
          method: testPayload.method,
          headers: {
            'Content-Type': testPayload.contentType || 'application/x-www-form-urlencoded',
            'User-Agent': 'ShieldForge-VerifyFix/1.0',
          },
          body: testPayload.body,
          signal: AbortSignal.timeout(10000),
        });

        // Fix is verified if the attack is blocked (403/429) or returns safe response
        fixVerified = response.status === 403 || response.status === 429;
        verificationDetails = {
          testUrl: testUrl,
          testMethod: testPayload.method,
          testStatus: response.status,
          fixVerified,
          verifiedAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      console.warn('[shieldforge] Fix verification failed:', error);
      verificationDetails = {
        error: error instanceof Error ? error.message : 'Verification failed',
        verifiedAt: new Date().toISOString(),
      };
    }

    const newStatus = fixVerified ? 'fixed_verified' : 'open';
    const updated = await supabase
      .from("findings")
      .update({ 
        status: newStatus,
        evidence: { ...(finding.evidence as Record<string, unknown> || {}), verification: verificationDetails }
      })
      .eq("id", findingId)
      .select("*")
      .single();
    if (updated.error) {
      throw new Error(`Could not update finding: ${updated.error.message}`);
    }

    if (fixVerified) {
      await supabase
        .from("incidents")
        .update({ resolved: true })
        .eq("finding_id", findingId);
    }

    await writeAudit("dashboard", fixVerified ? "finding.fix_verified" : "finding.fix_check_failed", {
      finding_id: findingId,
      origin_id: originId,
      verification: verificationDetails,
    });

    const joined = await supabase
      .from("findings")
      .select("*, events(ts), origins(origin_url)")
      .eq("id", findingId)
      .single();
    queryError("finding refresh", joined.error);

    if (!joined.data) {
      return {
        ...mapFinding(updated.data as Row),
        origin_url: originData.origin_url,
        event_ts: null,
        detection_seconds: null,
      };
    }
    return mapFinding(joined.data as Row);
  }

  private buildTestPayload(category: string | null, evidence: Record<string, unknown> | null): { method: string; contentType: string; body: string } | null {
    if (!category) return null;

    switch (category) {
      case 'xss':
        // Safe XSS test - should be blocked by WAF
        return {
          method: 'GET',
          contentType: 'application/x-www-form-urlencoded',
          body: `q=<script>alert('xss-test')</script>`
        };
      case 'sqli':
        // Safe SQLi test - should be blocked by WAF
        return {
          method: 'GET',
          contentType: 'application/x-www-form-urlencoded',
          body: `q=union+select+1,2,3--`
        };
      case 'weak_cookie':
        // Test login endpoint for weak cookie
        return {
          method: 'POST',
          contentType: 'application/x-www-form-urlencoded',
          body: 'email=verify@test.com&password=test'
        };
      case 'php_rce':
        return {
          method: 'GET',
          contentType: 'application/x-www-form-urlencoded',
          body: `q=<?php system('id'); ?>`
        };
      case 'scanner':
        return {
          method: 'GET',
          contentType: 'application/x-www-form-urlencoded',
          body: `q=/etc/passwd`
        };
      default:
        // Generic benign test
        return {
          method: 'GET',
          contentType: 'application/x-www-form-urlencoded',
          body: 'q=test'
        };
    }
  }

  async getIncidentsSince(since: Date): Promise<IncidentView[]> {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("incidents")
      .select("*, findings(title, category, severity, origins(origin_url))")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(500);
    queryError("incident export", error);
    return ((data ?? []) as Row[]).map(mapIncident);
  }

  async injectDemoFinding(): Promise<FindingView> {
    throw new AppError(
      "Demo injection is only available when the dashboard is running without Supabase credentials.",
      400,
    );
  }

  async resetDemo(): Promise<void> {
    throw new AppError("Demo reset is only available in local demo mode.", 400);
  }
}
