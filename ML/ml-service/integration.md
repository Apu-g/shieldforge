# Integration guide — ML service (Part 2)

This service classifies one HTTP transaction and returns a typed decision. You call
it over HTTP. It has no database, no auth, and no session state.

- Endpoint: `POST /classify`
- Base URL in production: the Render/Railway/HF Spaces URL the ML owner shares
- Content type: `application/json`
- Latency: p95 ~31 ms on the reference machine

## 1. Run it locally

```bash
cd ml-service
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open <http://127.0.0.1:8000/docs> for interactive Swagger docs.

Health check:

```bash
curl http://127.0.0.1:8000/health
```

```json
{
  "status": "ok",
  "model_loaded": true,
  "model_version": "shieldforge-ml-1.0.0",
  "uptime_s": 42.1
}
```

`model_loaded: false` means `artifacts/model.joblib` is missing. The service still
answers with a rule-based fallback, but the real model is the artifact.

## 2. Call it

```bash
curl -X POST http://127.0.0.1:8000/classify \
  -H "Content-Type: application/json" \
  -d '{
    "request_meta": {
      "method": "GET",
      "path": "/search",
      "query": "q=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
      "headers": {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "referer": "https://shop.example.com/"
      }
    },
    "response_meta": {
      "status_code": 200,
      "set_cookie_flags": { "httponly": false, "secure": false, "samesite": "none" }
    },
    "session_features": {
      "ip_change_count_5min": 0,
      "ua_change_count_5min": 0,
      "asn_changed": false,
      "request_rate": 2.5
    }
  }'
```

## 3. Request shape

```json
{
  "request_meta": {
    "method": "GET",
    "path": "/search",
    "query": "q=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
    "headers": {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "referer": "https://shop.example.com/"
    },
    "body_preview": "",
    "content_type": ""
  },
  "response_meta": {
    "status_code": 200,
    "content_type": "text/html; charset=utf-8",
    "set_cookie_flags": {
      "httponly": false,
      "secure": false,
      "samesite": "none"
    }
  },
  "session_features": {
    "ip_change_count_5min": 0,
    "ua_change_count_5min": 0,
    "asn_changed": false,
    "request_rate": 2.5
  },
  "origin_id": "optional-uuid",
  "event_id": "optional-uuid"
}
```

| Field | Required | Notes |
|---|---|---|
| `request_meta.method` | no | Defaults to `GET`. Unknown verbs normalize to `GET`. |
| `request_meta.path` | no | May include a query string; it is split automatically. |
| `request_meta.query` | no | Raw query string or a dict. |
| `request_meta.headers` | no | Dict or `[[name, value], ...]`. `Cookie`/`Authorization` values are discarded. |
| `request_meta.body_preview` | no | Must already be redacted. The service also redacts credential-looking parameters defensively. |
| `response_meta.set_cookie_flags` | no | Flags only — **never** a raw `Set-Cookie` value. A raw header is parsed for flags and the value dropped. |
| `session_features.*` | no | Pre-computed by the proxy. Missing values become `0`/`false`. |
| `request_rate` | no | Requests per minute for the session. |

Everything is optional. An empty `{}` is valid and returns a benign decision.

### Accepted aliases

Flat aliases at the root: `method`, `path`, `url`, `query`, `body` or
`body_preview`, `headers`, `status_code`, `session`, `set_cookie_flags`.

Nested aliases: `request` / `http_request` for `request_meta`; `response` for
`response_meta`; `session` / `session_context` for `session_features`.

Session aliases: `ip_change_count` → `ip_change_count_5min`,
`ua_change_count` → `ua_change_count_5min`, `requests_per_minute` /
`rate_per_min` → `request_rate`.

The `02_INTEGRATION_README.md` shape from the team doc also works unchanged.

## 4. Response shape

```json
{
  "attack_detected": true,
  "attack_class": "xss",
  "confidence": 0.9993,
  "risk_score": 5,
  "action_recommended": "temp_block",
  "class_probabilities": {
    "xss": 0.9993,
    "benign": 0.0004,
    "sqli": 0.0001,
    "php_rce": 0.0001,
    "scanner": 0.0001,
    "cred_stuffing": 0.0
  },
  "anomaly_score": 0.017,
  "anomaly_flag": false,
  "signals": ["xss_signature", "xss_lexical_hit"],
  "model_version": "shieldforge-ml-1.0.0",
  "latency_ms": 28.4
}
```

| Field | Type | Meaning |
|---|---|---|
| `attack_detected` | bool | True only when the top non-benign class is ≥ 0.50. |
| `attack_class` | enum | `xss`, `sqli`, `php_rce`, `scanner`, `cred_stuffing`, `benign`. |
| `confidence` | float 0–1 | Calibrated probability of the returned class. |
| `risk_score` | int 1–5 | Attack confidence plus session anomaly, bucketed. |
| `action_recommended` | enum | `log`, `alert`, `rate_limit`, `challenge`, `temp_block`. |
| `class_probabilities` | object | All six calibrated probabilities, highest first. |
| `anomaly_score` | float 0–1 | Isolation Forest score; 1 = most anomalous. |
| `anomaly_flag` | bool | True when behavioural evidence is material. |
| `signals` | string[] | Short machine codes. No free-text reasoning. |
| `model_version` | string | Artifact version. |
| `latency_ms` | float | Server-side processing time. |

Extra fields are additions; the five required fields never change shape.

## 5. Action mapping

| Condition | Action |
|---|---|
| detected, confidence < 0.60 | `log` |
| detected, 0.60 ≤ confidence ≤ 0.90 | `alert` |
| detected, confidence > 0.90, class in `xss`/`sqli`/`php_rce` | `temp_block` |
| detected, confidence > 0.90, class in `scanner`/`cred_stuffing` | `challenge` |
| not detected, risk 1–2 | `log` |
| not detected, risk 3 | `rate_limit` |
| not detected, risk 4–5 | `challenge` |

Policy thresholds are overridable with `LOG_BELOW` / `ALERT_BELOW` environment
variables, or per-origin at the proxy after it receives this decision.

## 6. Calling from the proxy

Use `CONTRACT.md` for the exact field semantics. Call the service without blocking
the visitor's response:

```js
async function classify(event) {
  try {
    const res = await fetch(`${process.env.ML_SERVICE_URL}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // fail open: log and continue
  }
}
```

Wrap the call in `waitUntil(...)` on Vercel so the request is not dropped.

## 7. Errors

| Status | When | What to do |
|---|---|---|
| 422 | Body is not valid JSON or is not an object. | Fix the payload shape. |
| 500 | Unexpected server error. | Treat as `log`, fail open. |
| 503 | Not returned. | Missing artifact means rule-based fallback, not outage. |

## 8. Privacy

Never send raw cookie values, tokens, or passwords. Send cookie flags as booleans
and passwords as `[REDACTED]`. The service discards `Cookie`/`Authorization`
headers and redacts credential-looking parameters itself, but do not rely on that.

## 9. Deploy

Docker image is included:

```bash
docker build -t ml-service .
docker run -p 8000:8000 ml-service
```

`render.yaml` and `railway.json` are ready for one-click deploys. Build context
excludes the local venv and raw training data via `.dockerignore`.

Runtime needs `artifacts/model.joblib` (2.8 MB). Keep it in the image.
