# ShieldForge — ML Detection Engine (Part 2)

Standalone FastAPI service that turns HTTP request features into a typed,
confidence-scored decision for the ShieldForge proxy. No proxy, dashboard, or
database is required. One endpoint, one health check.

- **`POST /classify`** → attack class + calibrated confidence + 1–5 risk + recommended action
- **`GET /health`** → 200 for the integration step
- **`GET /docs`** → interactive OpenAPI docs

Contract: [`CONTRACT.md`](CONTRACT.md) (Boundary 1). Results: [`RESULTS.md`](RESULTS.md).

> `02_INTEGRATION_README.md` was not present in this repo snapshot. The service
> implements the shape described in the Part 2 brief and accepts aliases plus a
> flat equivalent, so the proxy team is not blocked. Align `CONTRACT.md` with
> Boundary 1 when that file lands.

## Quick start

```bash
cd ml-service
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements-dev.txt
pytest -q
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The trained artifact is committed at `artifacts/model.joblib` (≈4 MB). The
service starts even without it, using a rule-based fallback (`/health` reports
`model_loaded: false`).

### Smoke test with curl

```bash
curl -s http://localhost:8000/health

curl -s -X POST http://localhost:8000/classify \
  -H "Content-Type: application/json" \
  -d '{
    "request_meta": {
      "method": "GET",
      "path": "/search",
      "query": "q=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
      "headers": {"user-agent": "Mozilla/5.0"}
    },
    "response_meta": {"status_code": 200},
    "session_features": {
      "ip_change_count_5min": 0,
      "ua_change_count_5min": 0,
      "asn_changed": false,
      "request_rate": 2
    }
  }'
```

Expected:

```json
{
  "attack_detected": true,
  "attack_class": "xss",
  "confidence": 0.999,
  "risk_score": 5,
  "action_recommended": "temp_block"
}
```

Benign request:

```bash
curl -s -X POST http://localhost:8000/classify \
  -H "Content-Type: application/json" \
  -d '{"request_meta":{"method":"GET","path":"/products/42","query":"page=2"}}'
```

Session replay (high risk without a payload):

```bash
curl -s -X POST http://localhost:8000/classify \
  -H "Content-Type: application/json" \
  -d '{
    "request_meta":{"method":"GET","path":"/account/profile"},
    "session_features":{"ip_change_count_5min":5,"asn_changed":true,"request_rate":40}
  }'
```

## How it works

```
raw request fields
      │
      ▼
normalize + redact secrets          app/schemas.py
      │
      ▼
136 dense features + char 2–5-gram TF-IDF (6,000)
      │
      ├──► LightGBM multiclass ──► temperature scaling ──► P(class)
      │       xss / sqli / php_rce / scanner / cred_stuffing / benign
      │
      └──► Isolation Forest on session vectors ──► anomaly score 0–1
      │
      ▼
typed decision (bands + risk bucket + action)     app/decision.py
```

**Model 1 — attack classifier.** LightGBM softmax over six classes. Dense
features cover URL/query/body length, special-character ratio, Shannon entropy,
character counts, keyword signatures (`<script>`, `UNION SELECT`, `../`,
`php://`, `eval(`, `base64_decode`, webshell markers), header hygiene, cookie
flags, and session volatility. TF-IDF char n-grams catch encoded and mutated
payloads. Class-balanced weights; early stopping on a validation split;
temperature scaling fitted on a separate calibration split. `confidence` is the
calibrated maximum probability.

**Model 2 — session anomaly.** 200-tree Isolation Forest trained only on benign
session vectors `[ip_change_count_5min, ua_change_count_5min, asn_changed,
request_rate]`. Scores are min-maxed over the benign training quantiles, then
combined with the attack decision:

| Evidence | Risk |
|---|---|
| no attack, normal session | 1 |
| no attack, anomaly_level 1 / 2 / 3 | 2 / 3 / 4 |
| attack confidence < 0.6 / 0.75 / 0.9 / > 0.9 | 2 / 3 / 4 / 5 |
| detected attack + strong anomaly | +1, capped at 5 |

Hard signals (`asn_changed` with ≥3 IP changes, or ≥5 IP changes) force the
anomaly level, so a replay session scores high even if the forest has seen a
similar outlier before.

**Signature prior.** A narrow, documented posterior adjustment fires only on
unambiguous probe paths (`/.env`, `/.git`, `/wp-login.php`, `/phpmyadmin`,
`/server-status`, `/actuator`, …) and scanner user agents. Without it, rare paths
are under-weighted against the benign prior in the public/synthetic corpus.

No raw cookie values or passwords are read. Credential-looking values are
redacted before feature extraction.

## Training and reproduction

```bash
python scripts/download_data.py   # PayloadsAllTheThings + CSIC 2010 (optional refresh)
python scripts/train.py           # writes artifacts/model.joblib + RESULTS.md
python scripts/train.py --quick   # fast smoke run, lower metrics
```

Sources:

- [CSIC 2010 HTTP dataset](https://github.com/Monkey-D-Groot/Machine-Learning-on-CSIC-2010) — benign + anomalous raw requests
- [PayloadsAllTheThings](https://github.com/swisskyrepo/PayloadsAllTheThings) — XSS, SQLi, command injection, traversal, LFI payloads
- Generated benign traffic + payload variants — keeps the pipeline reproducible offline

CICIDS2017 is flow-level telemetry with no HTTP text. Blending it into a
request-text classifier mixes incompatible feature spaces, so it is **not** used
in the shipped model. `data/README.md` documents the reasoning and the optional
adapter for a second behavioural model.

## Deployment

The service is a Docker app. Any of these work on a free tier.

### Render

1. Push the repo.
2. **New → Blueprint**, select the repo. Render reads `render.yaml` when this
   folder is the repo root. In a monorepo, create **New → Web Service → Docker**
   with root directory `ml-service` and health check `/health` instead.
3. Copy the public URL into the team's `ML_SERVICE_URL`.
4. Free instances sleep after ~15 minutes. Hit `/health` once before the demo.

### Railway

1. **New Project → Deploy from GitHub**, root directory `ml-service`.
2. Railway detects `Dockerfile`; `railway.json` sets the health check.
3. Generate a public domain, share it.

### Hugging Face Spaces

1. Create a **Docker** Space.
2. Upload this folder's contents (keep `artifacts/model.joblib`).
3. Add `app_port: 7860` to the Space README metadata; the Dockerfile uses `$PORT`.

### Local Docker

```bash
docker build -t shieldforge-ml .
docker run -p 8000:8000 shieldforge-ml
```

## Performance

Measured on the development machine (Windows, Python 3.12, single uvicorn worker,
sequential calls, includes feature extraction + TF-IDF + LightGBM + Isolation
Forest):

| Metric | Value |
|---|---|
| p50 | ≈ 28 ms |
| p95 | ≈ 30–35 ms |
| Target | < 300 ms |

No network calls, no database, no LLM in the request path. The artifact is loaded
once at startup and warmed with a benign request.

## Acceptance status

| Check | Status |
|---|---|
| `<script>` in path → `xss`, confidence > 0.7 | pass |
| benign GET → `attack_detected: false`, `benign` | pass |
| `UNION SELECT` → `sqli` | pass |
| Precision/recall in `RESULTS.md` | pass |
| `ip_change_count_5min: 5` + `asn_changed: true` → materially higher risk | pass |
| Runs standalone via curl | pass |
| `/health` → 200 | pass |

Exact numbers: [`RESULTS.md`](RESULTS.md).

## Layout

```
ml-service/
├── app/
│   ├── main.py          FastAPI routes + lifespan
│   ├── schemas.py       input normalization, redaction, response models
│   ├── features.py      dense features + keyword lexicon
│   ├── model.py         artifact loading, inference, anomaly scoring
│   ├── decision.py      confidence bands, risk buckets, actions
│   └── config.py        env configuration
├── scripts/
│   ├── download_data.py public dataset fetcher
│   ├── dataset.py       CSIC/PAT parsers + synthetic corpus
│   └── train.py         training, calibration, metrics, RESULTS.md
├── tests/test_classify.py
├── artifacts/model.joblib
├── CONTRACT.md
├── RESULTS.md
├── Dockerfile
├── render.yaml
└── railway.json
```

## Known limits

- CSIC 2010 has binary labels; fine-grained classes for its anomalous half come
  from a deterministic signature mapping. That mapping overlaps with model
  features and inflates the CSIC share of the test metrics. The payload-group
  split limits, but does not eliminate, this optimism.
- A large share of training rows are generated variants of known payload
  families. The numbers demonstrate a working pipeline, not a production
  benchmark.
- Credential stuffing detection relies on session rate and endpoint, because raw
  passwords are never available by design.
- The free-tier deployment cold-starts. Warm `/health` before the demo.
