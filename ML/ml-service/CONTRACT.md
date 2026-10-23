# Boundary 1 — ML service contract

`POST /classify` accepts one HTTP transaction's features and returns a typed
decision. This file records the exact contract this service implements and matches
`02_INTEGRATION_README.md`. The input normalizer also accepts common aliases and a
flat shape, so an early proxy draft will still work. See `integration.md` for the
setup-and-call guide.

Base URL in production: the Render/Railway/HF Spaces URL the ML owner shares.
Content type: `application/json`.

## Request

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

### Field rules

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

Flat aliases also accepted at the root: `method`, `path`, `url`, `query`, `body`
or `body_preview`, `headers`, `status_code`, `session`, `set_cookie_flags`.

Nested aliases: `request` / `http_request` for `request_meta`; `response` for
`response_meta`; `session` / `session_context` for `session_features`.

Session aliases: `ip_change_count` → `ip_change_count_5min`,
`ua_change_count` → `ua_change_count_5min`, `requests_per_minute` /
`rate_per_min` → `request_rate`.

## Response — 200

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

## Decision bands

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

## Errors

| Status | When |
|---|---|
| 422 | Body is not valid JSON or is not an object. |
| 500 | Unexpected server error. Treat as `log` in shadow mode; fail open. |
| 503 | Not returned. If the model artifact is missing the service starts with a rule-based fallback and `/health` reports `model_loaded: false`. |

## Health

`GET /health` → 200

```json
{
  "status": "ok",
  "model_loaded": true,
  "model_version": "shieldforge-ml-1.0.0",
  "uptime_s": 42.1
}
```

## Privacy

The service never needs or stores raw cookie values, passwords, or tokens. Cookie
inputs are flag booleans. Credential-looking parameter values are replaced with
`[REDACTED]` before feature extraction, so an accidental proxy mistake does not
leak a secret into this service's logs.
