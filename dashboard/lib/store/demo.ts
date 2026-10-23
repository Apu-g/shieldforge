import { ConflictError, NotFoundError } from "../errors";
import { detectionSeconds, round } from "../metrics";
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
import { assembleSnapshot } from "./assemble";
import type { NormalizedOrigin, PolicyPatch } from "../origins";
import type { Store } from "./index";

interface DemoTrainingUser {
  id: string;
  name: string;
  risk_score: number;
}

interface DemoState {
  tenantId: string;
  tenantName: string;
  origins: OriginRow[];
  policies: PolicyRow[];
  findings: FindingView[];
  incidents: IncidentView[];
  audit: AuditView[];
  trainingUsers: DemoTrainingUser[];
  trainingEvents: TrainingEventRow[];
  revision: number;
  seededAt: number;
}

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const ORIGIN_A = "22222222-2222-4222-8222-222222222201";
const ORIGIN_B = "22222222-2222-4222-8222-222222222202";
const ORIGIN_IEEE = "55555555-5555-4555-8555-555555555555";
const MINUTE = 60_000;

type SeedRow = {
  number: number;
  originId: string;
  minutesAgo: number;
  detection: number;
  severity: string;
  category: string;
  title: string;
  evidence: Record<string, unknown>;
  ai_summary: string | null;
  status: string;
  action: string;
  confidence: number;
  resolved: boolean;
};

const SEED_ROWS: SeedRow[] = [
  {
    number: 1,
    originId: ORIGIN_A,
    minutesAgo: 12,
    detection: 1.2,
    severity: "critical",
    category: "xss",
    title: "Reflected XSS attempting to exfiltrate session cookie",
    evidence: {
      path: "/search?q=...",
      payload_type: "script_tag",
      target: "document.cookie",
      attacker_ip: "203.0.113.42",
    },
    ai_summary: null,
    status: "open",
    action: "temp_block",
    confidence: 0.972,
    resolved: false,
  },
  {
    number: 2,
    originId: ORIGIN_A,
    minutesAgo: 28,
    detection: 0.8,
    severity: "high",
    category: "sqli",
    title: "SQL injection attempt on login endpoint",
    evidence: {
      path: "/api/login",
      strategy: "union_based",
      mysql_error_leaked: true,
      attacker_ip: "198.51.100.17",
    },
    ai_summary:
      "An automated SQL injection tool sent a crafted login request designed to bypass authentication. The database returned an error, but no data was read. The source IP was temporarily blocked for 30 minutes and the login endpoint was rate-limited.",
    status: "actioned",
    action: "rate_limit",
    confidence: 0.884,
    resolved: false,
  },
  {
    number: 3,
    originId: ORIGIN_A,
    minutesAgo: 47,
    detection: 2.4,
    severity: "medium",
    category: "weak_cookie",
    title: "Session cookie is missing HttpOnly and SameSite",
    evidence: {
      cookie: "session_id",
      httponly: false,
      secure: false,
      samesite: null,
    },
    ai_summary: null,
    status: "open",
    action: "alert",
    confidence: 0.781,
    resolved: false,
  },
  {
    number: 4,
    originId: ORIGIN_A,
    minutesAgo: 130,
    detection: 1.6,
    severity: "high",
    category: "session_replay",
    title: "Session token replayed from a new device and network",
    evidence: {
      ip_changes: 4,
      ua_changes: 3,
      window_minutes: 22,
      account: "demo-buyer@example.test",
    },
    ai_summary:
      "The same authenticated session was used from four different networks and three browsers within 22 minutes. This pattern is consistent with a stolen session cookie. The session was invalidated and the customer was asked to sign in again.",
    status: "fixed_verified",
    action: "session_invalidate",
    confidence: 0.926,
    resolved: true,
  },
  {
    number: 5,
    originId: ORIGIN_B,
    minutesAgo: 200,
    detection: 0.5,
    severity: "critical",
    category: "php2shell",
    title: "PHP webshell upload disguised as an image",
    evidence: {
      path: "/uploads/avatar.php",
      declared_type: "image/gif",
      detected_type: "php",
      attacker_ip: "198.51.100.203",
    },
    ai_summary:
      "An attacker uploaded a PHP script disguised as a GIF image, a common route to remote code execution. The upload was blocked before it reached the origin and the source IP was temporarily blocked. No file was written to disk.",
    status: "actioned",
    action: "temp_block",
    confidence: 0.991,
    resolved: false,
  },
  {
    number: 6,
    originId: ORIGIN_B,
    minutesAgo: 340,
    detection: 3.1,
    severity: "medium",
    category: "credential_stuffing",
    title: "Credential stuffing burst against checkout API",
    evidence: {
      attempts_60s: 42,
      distinct_accounts: 39,
      failure_ratio: 0.95,
      attacker_ip: "198.51.100.76",
    },
    ai_summary: null,
    status: "open",
    action: "rate_limit",
    confidence: 0.664,
    resolved: false,
  },
  {
    number: 7,
    originId: ORIGIN_A,
    minutesAgo: 480,
    detection: 1.9,
    severity: "low",
    category: "xss",
    title: "javascript: URI offered in a product review",
    evidence: {
      path: "/reviews",
      field: "next",
      payload: "javascript:alert(1)",
    },
    ai_summary:
      "A product review contained a javascript: link, a low-risk reflected XSS attempt. The proxy stripped the URI and the review was not rendered. This was likely a scanner rather than a targeted attack.",
    status: "fixed_verified",
    action: "alert",
    confidence: 0.412,
    resolved: true,
  },
  {
    number: 8,
    originId: ORIGIN_B,
    minutesAgo: 25,
    detection: 1.1,
    severity: "high",
    category: "weak_cookie",
    title: "Authentication cookie exposed to JavaScript on profile API",
    evidence: {
      cookie: "auth_token",
      httponly: false,
      secure: true,
      samesite: null,
    },
    ai_summary: null,
    status: "open",
    action: "challenge",
    confidence: 0.842,
    resolved: false,
  },
];

const TRAINING_SEED: Array<{
  idx: number;
  name: string;
  risk: number;
  events: Array<{ daysAgo: number; type: string }>;
}> = [
  {
    idx: 1,
    name: "Aarav Mehta",
    risk: 82,
    events: [
      { daysAgo: 14, type: "phishing_sent" },
      { daysAgo: 13.9, type: "phishing_clicked" },
      { daysAgo: 12, type: "lesson_assigned" },
      { daysAgo: 11, type: "lesson_completed" },
      { daysAgo: 5, type: "phishing_sent" },
      { daysAgo: 4.85, type: "phishing_clicked" },
      { daysAgo: 4, type: "lesson_assigned" },
    ],
  },
  {
    idx: 2,
    name: "Priya Nair",
    risk: 64,
    events: [
      { daysAgo: 12, type: "phishing_sent" },
      { daysAgo: 11, type: "phishing_clicked" },
      { daysAgo: 9, type: "lesson_completed" },
      { daysAgo: 3, type: "phishing_sent" },
      { daysAgo: 2, type: "lesson_completed" },
    ],
  },
  {
    idx: 3,
    name: "Rohan Das",
    risk: 41,
    events: [
      { daysAgo: 10, type: "phishing_sent" },
      { daysAgo: 9.9, type: "phishing_clicked" },
      { daysAgo: 7, type: "lesson_completed" },
    ],
  },
  {
    idx: 4,
    name: "Meera Iyer",
    risk: 23,
    events: [
      { daysAgo: 8, type: "phishing_sent" },
      { daysAgo: 7, type: "lesson_completed" },
    ],
  },
  {
    idx: 5,
    name: "Kabir Shah",
    risk: 9,
    events: [
      { daysAgo: 6, type: "phishing_sent" },
      { daysAgo: 5, type: "lesson_completed" },
      { daysAgo: 1, type: "phishing_sent" },
    ],
  },
];

function suffixed(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(2, "0")}`;
}

function seedDemoState(): DemoState {
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const originUrls = new Map<string, string>([
    [ORIGIN_IEEE, "https://aisummit.ieeebangalore.org"],
    [ORIGIN_A, "https://victim-shop.vercel.app"],
    [ORIGIN_B, "https://checkout-lab.vercel.app"],
  ]);

  const origins: OriginRow[] = [
    {
      id: ORIGIN_IEEE,
      tenant_id: TENANT_ID,
      origin_url: "https://aisummit.ieeebangalore.org",
      proxy_path: "/t/aisummit",
      status: "active",
      created_at: iso(1 * 24 * 60 * MINUTE),
    },
    {
      id: ORIGIN_A,
      tenant_id: TENANT_ID,
      origin_url: "https://victim-shop.vercel.app",
      proxy_path: "/t/victim-shop",
      status: "active",
      created_at: iso(6 * 24 * 60 * MINUTE),
    },
    {
      id: ORIGIN_B,
      tenant_id: TENANT_ID,
      origin_url: "https://checkout-lab.vercel.app",
      proxy_path: "/t/checkout-lab",
      status: "active",
      created_at: iso(2 * 24 * 60 * MINUTE),
    },
  ];

  const policies: PolicyRow[] = [
    {
      id: "33333333-3333-4333-8333-333333333300",
      origin_id: ORIGIN_IEEE,
      auto_block_threshold: 0.9,
      alert_threshold: 0.6,
      mode: "shadow",
    },
    {
      id: "33333333-3333-4333-8333-333333333301",
      origin_id: ORIGIN_A,
      auto_block_threshold: 0.9,
      alert_threshold: 0.6,
      mode: "shadow",
    },
    {
      id: "33333333-3333-4333-8333-333333333302",
      origin_id: ORIGIN_B,
      auto_block_threshold: 0.85,
      alert_threshold: 0.55,
      mode: "enforce",
    },
  ];

  const findings: FindingView[] = [];
  const incidents: IncidentView[] = [];
  const audit: AuditView[] = [];

  for (const row of SEED_ROWS) {
    const eventTs = iso(row.minutesAgo * MINUTE);
    const findingCreated = new Date(
      new Date(eventTs).getTime() + row.detection * 1000,
    ).toISOString();
    const findingId = suffixed("55555555-5555-4555-8555-5555555555", row.number);
    const incidentId = suffixed(
      "66666666-6666-4666-8666-6666666666",
      row.number,
    );
    const auditId = suffixed("77777777-7777-4777-8777-7777777777", row.number);

    findings.push({
      id: findingId,
      origin_id: row.originId,
      event_id: suffixed("44444444-4444-4444-8444-4444444444", row.number),
      severity: row.severity,
      category: row.category,
      title: row.title,
      evidence: row.evidence,
      ai_summary: row.ai_summary,
      status: row.status,
      created_at: findingCreated,
      origin_url: originUrls.get(row.originId) ?? null,
      event_ts: eventTs,
      detection_seconds: detectionSeconds(eventTs, findingCreated),
    });

    incidents.push({
      id: incidentId,
      finding_id: findingId,
      action_taken: row.action,
      confidence: row.confidence,
      resolved: row.resolved,
      created_at: new Date(
        new Date(findingCreated).getTime() + 300,
      ).toISOString(),
      finding_title: row.title,
      category: row.category,
      severity: row.severity,
      origin_url: originUrls.get(row.originId) ?? null,
    });

    audit.push({
      id: auditId,
      actor: "system",
      action: `origin.${row.action}`,
      target: {
        origin: originUrls.get(row.originId),
        finding_id: findingId,
        confidence: row.confidence,
      },
      ts: new Date(new Date(findingCreated).getTime() + 500).toISOString(),
    });
  }

  audit.push({
    id: "77777777-7777-4777-8777-777777777801",
    actor: "demo-analyst",
    action: "finding.fix_verified",
    target: { finding_id: "55555555-5555-4555-8555-555555555504" },
    ts: iso(95 * MINUTE),
  });

  const trainingUsers: DemoTrainingUser[] = [];
  const trainingEvents: TrainingEventRow[] = [];
  let eventNumber = 0;
  for (const user of TRAINING_SEED) {
    const userId = suffixed("88888888-8888-4888-8888-8888888888", user.idx);
    trainingUsers.push({ id: userId, name: user.name, risk_score: user.risk });
    for (const event of user.events) {
      eventNumber += 1;
      trainingEvents.push({
        id: suffixed("99999999-9999-4999-8999-9999999999", eventNumber),
        user_id: userId,
        event_type: event.type,
        ts: iso(event.daysAgo * 24 * 60 * MINUTE),
      });
    }
  }

  return {
    tenantId: TENANT_ID,
    tenantName: "ShieldForge Demo",
    origins,
    policies,
    findings,
    incidents,
    audit,
    trainingUsers,
    trainingEvents,
    revision: 1,
    seededAt: now,
  };
}

const globalForDemo = globalThis as unknown as {
  __shieldforgeDemoState?: DemoState;
};

function getState(): DemoState {
  if (!globalForDemo.__shieldforgeDemoState) {
    globalForDemo.__shieldforgeDemoState = seedDemoState();
  }
  return globalForDemo.__shieldforgeDemoState;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const INJECTIONS = [
  {
    severity: "critical",
    category: "xss",
    title: "Stored XSS payload detected in product review",
    evidence: { field: "review.body", payload: "<img src=x onerror=fetch('//evil')>" },
  },
  {
    severity: "high",
    category: "sqli",
    title: "Blind SQL injection probing on search endpoint",
    evidence: { path: "/search", payload: "' AND SLEEP(5)--" },
  },
  {
    severity: "medium",
    category: "weak_cookie",
    title: "New response sets a session cookie without HttpOnly",
    evidence: { cookie: "cart_session", httponly: false },
  },
  {
    severity: "high",
    category: "session_replay",
    title: "Authenticated session used from two countries in 3 minutes",
    evidence: { countries: ["IN", "NL"], window_minutes: 3 },
  },
];

export class DemoStore implements Store {
  readonly mode = "demo" as const;

  async getSnapshot(): Promise<Snapshot> {
    const state = getState();
    return assembleSnapshot({
      mode: this.mode,
      revision: state.revision,
      tenantName: state.tenantName,
      origins: state.origins,
      policies: state.policies,
      findings: state.findings,
      incidents: state.incidents,
      trainingUsers: state.trainingUsers,
      trainingEvents: state.trainingEvents,
      audit: state.audit,
      proxyBaseUrl: process.env.NEXT_PUBLIC_PROXY_BASE_URL ?? null,
    });
  }

  async getPolicy(originId: string): Promise<PolicyRow | null> {
    return getState().policies.find((p) => p.origin_id === originId) ?? null;
  }

  async createOrigin(input: NormalizedOrigin): Promise<CreateOriginResult> {
    const state = getState();
    const existing = state.origins.find(
      (origin) => origin.origin_url === input.originUrl,
    );
    if (existing) {
      throw new ConflictError(
        `${input.originUrl} is already connected to this workspace.`,
      );
    }

    const now = new Date().toISOString();
    const origin: OriginRow = {
      id: randomId(),
      tenant_id: state.tenantId,
      origin_url: input.originUrl,
      proxy_path: input.proxyPath,
      status: "active",
      created_at: now,
    };
    const policy: PolicyRow = {
      id: randomId(),
      origin_id: origin.id,
      auto_block_threshold: 0.9,
      alert_threshold: 0.6,
      mode: "shadow",
    };

    state.origins.push(origin);
    state.policies.push(policy);
    state.audit.unshift({
      id: randomId(),
      actor: "demo-analyst",
      action: "origin.created",
      target: { origin_id: origin.id, origin_url: origin.origin_url },
      ts: now,
    });
    state.revision += 1;

    return { origin, policy };
  }

  async updatePolicy(
    originId: string,
    patch: PolicyPatch,
  ): Promise<PolicyRow> {
    const state = getState();
    const existing = state.policies.find((p) => p.origin_id === originId);
    const now = new Date().toISOString();

    if (existing) {
      existing.auto_block_threshold = patch.auto_block_threshold;
      existing.alert_threshold = patch.alert_threshold;
      existing.mode = patch.mode;
      state.audit.unshift({
        id: randomId(),
        actor: "demo-analyst",
        action: "policy.updated",
        target: {
          origin_id: originId,
          auto_block_threshold: patch.auto_block_threshold,
          alert_threshold: patch.alert_threshold,
          mode: patch.mode,
        },
        ts: now,
      });
      state.revision += 1;
      return existing;
    }

    const origin = state.origins.find((o) => o.id === originId);
    if (!origin) throw new NotFoundError("Origin not found.");

    const policy: PolicyRow = {
      id: randomId(),
      origin_id: originId,
      ...patch,
    };
    state.policies.push(policy);
    state.audit.unshift({
      id: randomId(),
      actor: "demo-analyst",
      action: "policy.created",
      target: { origin_id: originId, ...patch },
      ts: now,
    });
    state.revision += 1;
    return policy;
  }

  async verifyFinding(findingId: string): Promise<FindingView> {
    // Demo only: simulate the re-check delay. Production would replay a safe,
    // benign version of the original request through the proxy and re-check the
    // specific vulnerability before flipping the finding to fixed_verified.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const state = getState();
    const finding = state.findings.find((f) => f.id === findingId);
    if (!finding) throw new NotFoundError("Finding not found.");

    finding.status = "fixed_verified";
    for (const incident of state.incidents) {
      if (incident.finding_id === findingId) incident.resolved = true;
    }
    state.audit.unshift({
      id: randomId(),
      actor: "demo-analyst",
      action: "finding.fix_verified",
      target: { finding_id: findingId, origin_id: finding.origin_id },
      ts: new Date().toISOString(),
    });
    state.revision += 1;
    return finding;
  }

  async getIncidentsSince(since: Date): Promise<IncidentView[]> {
    const cutoff = since.getTime();
    return getState()
      .incidents.filter(
        (incident) => new Date(incident.created_at).getTime() >= cutoff,
      )
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
  }

  async injectDemoFinding(): Promise<FindingView> {
    const state = getState();
    const origin =
      state.origins.find((o) => o.status === "active") ?? state.origins[0];
    if (!origin) throw new NotFoundError("No origin to attach the finding to.");

    const template =
      INJECTIONS[Math.floor(Math.random() * INJECTIONS.length)];
    const now = new Date();
    const eventTs = new Date(now.getTime() - 900).toISOString();
    const latency = round(0.4 + Math.random() * 2.2, 2);
    const created = new Date(
      new Date(eventTs).getTime() + latency * 1000,
    ).toISOString();
    const id = randomId();

    const finding: FindingView = {
      id,
      origin_id: origin.id,
      event_id: null,
      severity: template.severity,
      category: template.category,
      title: template.title,
      evidence: template.evidence,
      ai_summary: null,
      status: "open",
      created_at: created,
      origin_url: origin.origin_url,
      event_ts: eventTs,
      detection_seconds: detectionSeconds(eventTs, created),
    };

    const confidence = round(0.6 + Math.random() * 0.35, 3);
    state.findings.unshift(finding);
    state.incidents.unshift({
      id: randomId(),
      finding_id: id,
      action_taken: "alert",
      confidence,
      resolved: false,
      created_at: new Date(new Date(created).getTime() + 250).toISOString(),
      finding_title: template.title,
      category: template.category,
      severity: template.severity,
      origin_url: origin.origin_url,
    });
    state.audit.unshift({
      id: randomId(),
      actor: "demo-injector",
      action: "demo.finding_injected",
      target: { finding_id: id, origin: origin.origin_url },
      ts: new Date().toISOString(),
    });
    state.revision += 1;
    return finding;
  }

  async resetDemo(): Promise<void> {
    globalForDemo.__shieldforgeDemoState = seedDemoState();
  }

  async getSeededAt(): Promise<Date> {
    return new Date(getState().seededAt);
  }
}
