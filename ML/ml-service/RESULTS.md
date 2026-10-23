# ShieldForge ML Detection Engine - Results

Generated: 2026-10-23T09:18:37+00:00

## Headline

| Metric | Value |
|---|---|
| Test rows (held-out) | 2458 |
| Accuracy | **0.9947** |
| Macro F1 | **0.9955** |
| Weighted F1 | **0.9947** |
| Attack precision (binary) | **0.9987** |
| Attack recall (binary) | **0.9927** |
| Benign false-positive rate | **0.0021** |
| Expected calibration error | 0.0030 (raw 0.0032) |
| P95 inference latency | **30.82 ms** |

## Per-class held-out performance

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| benign | 0.9885 | 0.9979 | 0.9932 | 950 |
| cred_stuffing | 1.0000 | 1.0000 | 1.0000 | 161 |
| php_rce | 1.0000 | 1.0000 | 1.0000 | 367 |
| scanner | 0.9940 | 0.9706 | 0.9821 | 340 |
| sqli | 1.0000 | 1.0000 | 1.0000 | 427 |
| xss | 1.0000 | 0.9953 | 0.9976 | 213 |

## Confusion matrix (rows = truth, cols = prediction)

| truth \ pred | benign | cred_stuffing | php_rce | scanner | sqli | xss |
|---|---|---|---|---|---|---|
| benign | 948 | 0 | 0 | 2 | 0 | 0 |
| cred_stuffing | 0 | 161 | 0 | 0 | 0 | 0 |
| php_rce | 0 | 0 | 367 | 0 | 0 | 0 |
| scanner | 10 | 0 | 0 | 330 | 0 | 0 |
| sqli | 0 | 0 | 0 | 0 | 427 | 0 |
| xss | 1 | 0 | 0 | 0 | 0 | 212 |

## Acceptance tests

| Case | Class | Confidence | Detected | Risk | Action |
|---|---|---|---|---|---|
| xss_script_in_path | xss | 1.000 | True | 5 | temp_block |
| benign_get | benign | 1.000 | False | 1 | log |
| sqli_union_select | sqli | 1.000 | True | 5 | temp_block |

### Session anomaly contrast

| Session | Anomaly score | Anomaly flag | Risk score | Action |
|---|---|---|---|---|
| normal_session | 0.045 | False | 1 | log |
| replay_session | 1.000 | True | 4 | challenge |

## Dataset

| Slice | Rows |
|---|---|
| Total | 23400 |
| xss | 3000 |
| sqli | 3000 |
| php_rce | 2800 |
| scanner | 3500 |
| cred_stuffing | 1600 |
| benign | 9500 |
| From synthetic generators | 11631 |
| From PayloadsAllTheThings | 3820 |
| From CSIC 2010 | 7949 |

Split (group-aware, no payload appears in two splits): train 17193, validation 2360, calibration 1389, test 2458.

## Method

- **Features:** 120+ handcrafted signals (URL/query/body length, special-character ratio, Shannon entropy, character counts, keyword signatures, header hygiene, cookie flags, session volatility) combined with a character 2-5-gram TF-IDF matrix (6,000 features).
- **Attack classifier:** LightGBM multiclass (softmax), 6 classes, class-balanced weights, early stopping on a validation split.
- **Calibration:** temperature scaling fitted on a dedicated held-out calibration split. `confidence` is the calibrated maximum class probability.
- **Session anomaly:** Isolation Forest (200 trees) trained only on benign sessions (ip change count, UA change count, ASN change, request rate), score min-maxed over the benign training quantiles, then bucketed into the 1-5 risk score.
- **Decision layer:** confidence bands `<0.6` log, `0.6-0.9` alert, `>0.9` temp_block (injection classes) or challenge (scanner/credential classes). Session anomalies raise risk even when no payload signature is present.

## Honest limitations

- CSIC 2010 has binary labels, so its anomalous requests were assigned a fine-grained class with a deterministic signature mapping. That mapping overlaps with model features, which inflates the CSIC portion of the test metrics. The payload-group split limits, but does not eliminate, this optimism.
- A large share of training rows are generated variants of known payload families. Treat the numbers as evidence of a working pipeline, not as a production benchmark.
- CICIDS2017 is network-flow data and has no HTTP text. It was not blended into the request classifier because doing so would mix incompatible feature spaces. `data/README.md` documents the optional loader; the shipped model uses CSIC 2010 + PayloadsAllTheThings + generated benign traffic.
- No raw cookie values or passwords are read or stored. Credential parameters are redacted defensively in both training data and serving input.

## Reproduce

```bash
python scripts/download_data.py   # optional: refreshes public payloads + CSIC
python scripts/train.py
```
