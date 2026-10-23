# ShieldForge — AI-Powered Reverse Proxy Security Platform
### Hackathon build doc — PS-16 (Real-time threat detection, neutralization & behavioral training)

> Placeholder project name: **ShieldForge**. Rename freely — search/replace is the only place it matters.

---

## 1. What we are actually building

A reverse proxy that sits in front of a deployed Vercel app, inspects traffic, classifies attacks with a fast ML "Jev-style" decision layer, explains findings in plain English with an LLM, auto-responds (block / rate-limit / rotate session), shows all of it live on a dashboard, and includes a tiny behavioral-training module for the "human vulnerability" clause of PS-16.

No real domain purchase, no real DNS, no real Cloudflare account needed for the demo. "Connecting a domain" = pasting a `*.vercel.app` URL into our dashboard as an origin.

**The demo flow that proves everything works (rehearse this exact sequence):**
1. Deploy the deliberately-vulnerable victim app → get `victim-shop.vercel.app`.
2. Paste that URL into the dashboard as a new origin → proxy starts serving it at `shield-proxy.vercel.app`.
3. Fire the XSS/cookie-theft payload at the proxied URL, live.
4. Dashboard lights up: finding → classification → confidence score → plain-English AI explanation → auto action (block attacker IP / invalidate session) → audit log entry.
5. Click "Verify fix" → proxy re-checks → finding flips to **Fixed and verified**.
6. Switch tabs → show the behavioral-training module flag a "risky" simulated user and auto-assign a micro-lesson.

Everything below exists to make that 90-second flow real.

---

## 2. High-level architecture

```
                         ┌─────────────────────────────┐
  Attacker / visitor ───►│   PROXY (Part 1)            │
                         │   Next.js middleware +       │
                         │   catch-all route, on Vercel │
                         │                               │
                         │  - rule-based WAF (sync)      │
                         │  - rate limiting (sync)       │
                         │  - forwards to origin         │
                         │  - inspects response           │
                         │    (Set-Cookie, headers)       │
                         │  - fires async event ──────────┼────┐
                         └───────────────┬───────────────┘    │
                                         │ fetch()              │
                                         ▼                      │
                         ┌─────────────────────────────┐        │
                         │ Victim / customer origin     │        │
                         │ (Part 4's vulnerable app, or │        │
                         │  any other *.vercel.app)     │        │
                         └───────────────────────────────┘        │
                                                                   ▼
                         ┌─────────────────────────────┐   ┌──────────────┐
                         │  ML DETECTION ENGINE (Part 2)│◄──┤   events      │
                         │  standalone FastAPI service  │   │   table        │
                         │  - feature extraction        │   │  (Supabase)    │
                         │  - LightGBM: attack class +   │   └──────┬───────┘
                         │    confidence (the "Noul/     │          │
                         │    Choice/Score" Jev-style    │          │
                         │    typed decision)            │          │
                         │  - Isolation Forest: session  │          │
                         │    / behavioral anomaly       │          │
                         └───────────────┬───────────────┘          │
                                         │ writes finding            │
                                         ▼                           │
                         ┌─────────────────────────────┐            │
                         │        SUPABASE (shared)      │◄───────────┘
                         │  Postgres + Realtime + Auth    │
                         │  tenants, origins, events,      │
                         │  findings, incidents, policies, │
                         │  audit_log, training_*          │
                         └───────────────┬───────────────┘
                                         │ realtime channel + REST
                 ┌───────────────────────┼───────────────────────┐
                 ▼                                                 ▼
  ┌─────────────────────────────┐                  ┌─────────────────────────────┐
  │ DASHBOARD + CONTROL PLANE    │                  │ LLM EXPLANATION AGENT         │
  │ (Part 3)                     │                  │ + TRAINING MODULE (Part 4)     │
  │ Next.js/React on Vercel      │                  │ small Next.js API routes or     │
  │ - live findings/incidents    │                  │ serverless function             │
  │ - policy editor (thresholds) │                  │ - reads new finding              │
  │ - origin onboarding UI       │                  │ - calls OpenRouter/Groq/NIM      │
  │ - "Verify fix" action         │                  │ - writes ai_summary back         │
  │ - CERT-In report export       │                  │ - phishing-sim + risk scoring    │
  └─────────────────────────────┘                  └─────────────────────────────┘
```

---

## 3. Tech stack (final)

| Layer | Choice | Why |
|---|---|---|
| Proxy (data plane) | Next.js middleware + catch-all API route, Vercel | No domain needed, free, serverless, honest limits we state in the pitch |
| ML service | Python + FastAPI, deployed on Render/Railway/HF Spaces free tier | Needs sklearn/LightGBM, doesn't belong on Vercel, must be independently testable |
| Database | **Supabase** (Postgres + Realtime + Auth) | Relational tables fit tenants/findings/policies cleanly; built-in Realtime gives us the live dashboard for free (no custom SSE/websocket plumbing); Row Level Security gives clean multi-tenant isolation; generous free tier. MongoDB was the alternative — skip it: you'd hand-roll change streams for "live," and our data is relational (findings belong to incidents belong to tenants), which Postgres models better than documents. |
| Dashboard + control plane | Next.js/React on Vercel, Supabase client + Realtime subscriptions | Matches everyone's stack, one deploy target |
| LLM — primary explanation | **OpenRouter** (model-agnostic router) | Swap models without code changes; good for the "write the incident report" task |
| LLM — low-latency path | **Groq** | Fast/cheap, good for live dashboard toast summaries, used as fallback if OpenRouter is slow/down |
| LLM — secondary/embeddings | **NVIDIA NIM** | Optional: hosted inference backup, or embeddings if the ML person wants a semantic-similarity feature for payload matching |
| Vulnerable demo app | Next.js, Vercel | Deliberately weak cookies + stored XSS field, isolated project |
| Rate limiting (stretch) | Upstash Redis (free tier) | Optional — Supabase table + timestamp check is enough for a hackathon demo |

---

## 4. The four modules (what each person owns)

| # | Module | Owner builds | Depends on |
|---|---|---|---|
| 1 | **Reverse Proxy & Edge Enforcement** | Next.js proxy, rule-based WAF, rate limiter, response inspector, origin registration | Nothing live — mocks the ML call and the DB write until integration |
| 2 | **ML Detection Engine** | Standalone FastAPI service: feature extraction, LightGBM classifier, Isolation Forest anomaly scorer, `/classify` endpoint | Nothing — trains on public datasets, fully standalone and testable with Postman |
| 3 | **Dashboard + Control Plane + Supabase schema** | Supabase schema (owns it, others read the contract), Next.js dashboard, Realtime wiring, policy CRUD API, CERT-In export, "Verify fix" flow | Reads Supabase directly — works against seed data, no dependency on live proxy/ML |
| 4 | **LLM Explanation Agent + Vulnerable Demo App + Training Module** | Victim app (XSS + weak cookies), LLM call wrapper (OpenRouter→Groq fallback), phishing-sim mini module, risk scoring | Reads a `findings` row shape (mocked JSON until integration) |

Each module is designed so a person can build and fully test it **without the other three existing yet.** That's the whole point of the contract file (`02_INTEGRATION_README.md`).

---

## 5. Supabase schema (owned by Part 3, read by everyone)

```sql
-- tenants: one row per team/customer using the platform (can be just 1 row for the demo)
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- origins: the "connect a domain" step — just a Vercel URL
create table origins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  origin_url text not null,           -- e.g. https://victim-shop.vercel.app
  proxy_path text not null,           -- e.g. /t/victim-shop  (how the proxy routes to it)
  status text default 'active',       -- active | paused
  created_at timestamptz default now()
);

-- events: every request the proxy processed (redacted — never raw cookie/token values)
create table events (
  id uuid primary key default gen_random_uuid(),
  origin_id uuid references origins(id),
  ts timestamptz default now(),
  method text,
  path text,
  ip text,
  user_agent text,
  status_code int,
  rule_hit text,                      -- which sync WAF rule fired, if any
  features jsonb,                     -- extracted features sent to ML (no raw secrets)
  ml_attack_class text,
  ml_confidence float,
  ml_risk_score int
);

-- findings: a specific issue worth showing on the dashboard
create table findings (
  id uuid primary key default gen_random_uuid(),
  origin_id uuid references origins(id),
  event_id uuid references events(id),
  severity text,                      -- low | medium | high | critical
  category text,                      -- xss | sqli | weak_cookie | php2shell | session_replay | ...
  title text,
  evidence jsonb,
  ai_summary text,                    -- filled in by Part 4's LLM agent
  status text default 'open',         -- open | actioned | fixed_verified
  created_at timestamptz default now()
);

-- incidents: a finding that triggered an automated or human response
create table incidents (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid references findings(id),
  action_taken text,                  -- log | alert | rate_limit | challenge | temp_block | session_invalidate
  confidence float,
  resolved boolean default false,
  created_at timestamptz default now()
);

-- policies: per-origin thresholds that drive automated response
create table policies (
  id uuid primary key default gen_random_uuid(),
  origin_id uuid references origins(id),
  auto_block_threshold float default 0.9,
  alert_threshold float default 0.6,
  mode text default 'shadow'          -- shadow (log-only) | enforce
);

-- audit_log: every automated or manual action, for the CERT-In export
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text,                         -- 'system' | user id
  action text,
  target jsonb,
  ts timestamptz default now()
);

-- training module (Part 4)
create table training_users (
  id uuid primary key default gen_random_uuid(),
  name text,
  risk_score int default 0
);

create table training_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references training_users(id),
  event_type text,                    -- phishing_sent | phishing_clicked | lesson_assigned | lesson_completed
  ts timestamptz default now()
);
```

Enable Realtime on `events`, `findings`, and `incidents` in the Supabase dashboard — that's what makes the live UI work with zero extra plumbing.

---

## 6. Environment variables (master list)

Put these in a root `.env.example` so nobody hardcodes a key:

```
# Supabase (Part 3 creates the project, shares these with the team)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-side only, never exposed to the client

# ML service (Part 2 deploys it, shares the URL)
ML_SERVICE_URL=https://your-ml-service.onrender.com

# LLM providers (Part 4 owns the calling code; keys can be per-person during dev)
OPENROUTER_API_KEY=
GROQ_API_KEY=
NVIDIA_NIM_API_KEY=

# Proxy config
PROXY_SHARED_SECRET=              # if you add origin-lock header checking
```

---

## 7. Repo layout (monorepo, one GitHub repo, four folders)

```
shieldforge/
├── 01_ARCHITECTURE.md
├── 02_INTEGRATION_README.md
├── 03_PART_PROMPTS.md
├── 04_MASTER_INTEGRATION_PROMPT.md
├── .env.example
├── proxy/              ← Part 1 (Next.js, deploys to Vercel as shield-proxy)
├── ml-service/          ← Part 2 (FastAPI, deploys to Render/Railway)
├── dashboard/           ← Part 3 (Next.js, deploys to Vercel as shield-dash)
│   └── supabase/        ← schema.sql lives here, Part 3 owns migrations
├── victim-app/           ← Part 4 (Next.js, deploys to Vercel as victim-shop)
└── llm-agent/             ← Part 4 (Next.js API routes or a tiny Node service)
```

Each folder is a **separate Vercel/Render project** with its own deploy. This is intentional — it mirrors the real architecture (proxy, origin, dashboard, ML service are genuinely separate services) and means nobody's broken build blocks anyone else's deploy.

---

## 8. Testing philosophy

Every module must pass **its own acceptance checklist in isolation** (detailed in `03_PART_PROMPTS.md`) before anyone touches integration. The `02_INTEGRATION_README.md` defines the exact JSON contracts so each person can build against a **mock** of the other three modules — nobody waits on anybody.

Integration happens once, at the end, using `04_MASTER_INTEGRATION_PROMPT.md`, which swaps every mock for the real deployed URL and re-runs the end-to-end demo flow from Section 1.
