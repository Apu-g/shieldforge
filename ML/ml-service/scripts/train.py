"""Train the ShieldForge attack classifier and session anomaly model.

Usage:
    python scripts/train.py                 # full run, writes artifacts/model.joblib
    python scripts/train.py --quick         # smaller/faster run for smoke tests
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
from scipy.optimize import minimize_scalar
from scipy.sparse import csr_matrix, hstack
from sklearn.ensemble import IsolationForest
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    precision_recall_fscore_support,
)

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import MODEL_VERSION  # noqa: E402
from app.decision import decide  # noqa: E402
from app.features import extract_features, session_vector  # noqa: E402
from scripts.dataset import LABELS, assemble  # noqa: E402

MODEL_PATH = ROOT / "artifacts" / "model.joblib"
RESULTS_PATH = ROOT / "RESULTS.md"
METRICS_PATH = ROOT / "artifacts" / "metrics.json"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--data-dir", type=Path, default=ROOT / "data")
    p.add_argument("--out", type=Path, default=MODEL_PATH)
    p.add_argument("--results", type=Path, default=RESULTS_PATH)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--quick", action="store_true")
    p.add_argument("--n-estimators", type=int, default=400)
    return p.parse_args()


def group_split(
    groups: list[str], labels: list[str], seed: int
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Split by payload group so the same payload never lands in train and test."""
    uniq = sorted(set(groups))
    random.Random(seed).shuffle(uniq)
    n = len(uniq)
    n_test = max(1, int(n * 0.10))
    n_cal = max(1, int(n * 0.07))
    n_val = max(1, int(n * 0.10))
    test_groups = set(uniq[:n_test])
    cal_groups = set(uniq[n_test : n_test + n_cal])
    val_groups = set(uniq[n_test + n_cal : n_test + n_cal + n_val])

    train_idx, val_idx, cal_idx, test_idx = [], [], [], []
    for i, g in enumerate(groups):
        if g in test_groups:
            test_idx.append(i)
        elif g in cal_groups:
            cal_idx.append(i)
        elif g in val_groups:
            val_idx.append(i)
        else:
            train_idx.append(i)

    for name, idx in (("train", train_idx), ("val", val_idx), ("cal", cal_idx), ("test", test_idx)):
        present = sorted({labels[i] for i in idx})
        if len(present) < len(set(labels)):
            print(f"WARNING: split {name} missing classes: {set(labels) - set(present)}")
    return (
        np.asarray(train_idx),
        np.asarray(val_idx),
        np.asarray(cal_idx),
        np.asarray(test_idx),
    )


def build_matrices(rows, seed: int):
    labels: list[str] = []
    groups: list[str] = []
    dense: list[np.ndarray] = []
    texts: list[str] = []
    sessions: list[np.ndarray] = []
    feature_names: list[str] | None = None

    for row in rows:
        vec, text, names, _info = extract_features(row)
        if feature_names is None:
            feature_names = names
        elif names != feature_names:
            raise RuntimeError("feature order drifted between rows")
        dense.append(vec)
        texts.append(text)
        labels.append(row["label"])
        groups.append(row.get("group") or text[:80])
        sessions.append(session_vector(row.get("session") or {}))

    return (
        np.vstack(dense).astype(np.float32),
        texts,
        np.asarray(sessions, dtype=np.float32),
        labels,
        groups,
        feature_names or [],
    )


def temperature_nll(log_probs: np.ndarray, y: np.ndarray, log_t: float) -> float:
    scaled = log_probs / math.exp(log_t)
    scaled -= scaled.max(axis=1, keepdims=True)
    log_norm = np.log(np.exp(scaled).sum(axis=1, keepdims=True))
    log_p = scaled - log_norm
    return float(-log_p[np.arange(len(y)), y].mean())


def fit_temperature(cal_probs: np.ndarray, y: np.ndarray) -> float:
    log_probs = np.log(np.clip(cal_probs, 1e-12, None))
    res = minimize_scalar(
        lambda log_t: temperature_nll(log_probs, y, log_t),
        bounds=(-0.7, 0.7),
        method="bounded",
        options={"xatol": 1e-4},
    )
    return float(math.exp(res.x))


def ece(probs: np.ndarray, y: np.ndarray, bins: int = 10) -> float:
    conf = probs.max(axis=1)
    pred = probs.argmax(axis=1)
    correct = (pred == y).astype(float)
    total = len(y)
    score = 0.0
    for lo in np.linspace(0.0, 1.0, bins + 1)[:-1]:
        hi = lo + 1.0 / bins
        mask = (conf >= lo) & (conf < hi if hi < 1.0 else conf <= hi)
        if mask.sum() == 0:
            continue
        score += (mask.sum() / total) * abs(correct[mask].mean() - conf[mask].mean())
    return float(score)


def per_class_report(y_true, y_pred, classes) -> dict:
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=classes, zero_division=0
    )
    out = {}
    for i, c in enumerate(classes):
        out[c] = {
            "precision": float(precision[i]),
            "recall": float(recall[i]),
            "f1": float(f1[i]),
            "support": int(support[i]),
        }
    return out


def binary_report(y_true, y_pred) -> dict:
    tp = sum(1 for t, p in zip(y_true, y_pred) if t != "benign" and p != "benign")
    fp = sum(1 for t, p in zip(y_true, y_pred) if t == "benign" and p != "benign")
    fn = sum(1 for t, p in zip(y_true, y_pred) if t != "benign" and p == "benign")
    tn = sum(1 for t, p in zip(y_true, y_pred) if t == "benign" and p == "benign")
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    fpr = fp / (fp + tn) if fp + tn else 0.0
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "false_positive_rate": fpr,
    }


def evaluate_acceptance(artifact: Path) -> dict:
    from app.model import Detector

    detector = Detector(artifact, MODEL_VERSION)
    cases = {
        "xss_script_in_path": {
            "method": "GET",
            "path": "/search/<script>alert(document.cookie)</script>",
            "query": "",
            "headers": {"user-agent": "Mozilla/5.0"},
            "session": {
                "ip_change_count_5min": 0,
                "ua_change_count_5min": 0,
                "asn_changed": False,
                "request_rate": 2.0,
            },
        },
        "benign_get": {
            "method": "GET",
            "path": "/products/42",
            "query": "ref=home",
            "headers": {
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
                "referer": "https://shop.example.com/",
            },
            "session": {"ip_change_count_5min": 0, "ua_change_count_5min": 0, "asn_changed": False, "request_rate": 1.5},
        },
        "sqli_union_select": {
            "method": "GET",
            "path": "/products",
            "query": "id=1%27%20UNION%20SELECT%20username,password%20FROM%20users--",
            "headers": {"user-agent": "Mozilla/5.0"},
            "session": {"ip_change_count_5min": 0, "ua_change_count_5min": 0, "asn_changed": False, "request_rate": 2.0},
        },
    }
    out = {}
    for name, request in cases.items():
        probs, anomaly, info = detector.predict(
            {
                "method": request["method"],
                "path": request["path"],
                "query": request["query"],
                "body": "",
                "headers": request["headers"],
                "content_type": "",
                "response": {"status_code": 200, "cookie_flags": {}},
                "session": request["session"],
            }
        )
        decision = decide(probs, anomaly, request["session"], info)
        out[name] = {
            "attack_detected": decision["attack_detected"],
            "attack_class": decision["attack_class"],
            "confidence": decision["confidence"],
            "risk_score": decision["risk_score"],
            "action_recommended": decision["action_recommended"],
            "anomaly_score": decision["anomaly_score"],
        }

    # Session replay contrast.
    def session_case(params):
        return {
            "method": "GET",
            "path": "/account/profile",
            "query": "",
            "body": "",
            "headers": {
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
                "referer": "https://shop.example.com/",
            },
            "content_type": "",
            "response": {"status_code": 200, "cookie_flags": {}},
            "session": params,
        }

    normal = {"ip_change_count_5min": 0, "ua_change_count_5min": 0, "asn_changed": False, "request_rate": 1.2}
    suspicious = {"ip_change_count_5min": 5, "ua_change_count_5min": 4, "asn_changed": True, "request_rate": 45.0}
    for name, params in (("normal_session", normal), ("replay_session", suspicious)):
        probs, anomaly, info = detector.predict(session_case(params))
        decision = decide(probs, anomaly, params, info)
        out[name] = {
            "risk_score": decision["risk_score"],
            "anomaly_score": decision["anomaly_score"],
            "anomaly_flag": decision["anomaly_flag"],
            "action_recommended": decision["action_recommended"],
        }

    # Latency over 300 sequential calls.
    import statistics

    latencies = []
    for _ in range(300):
        t0 = time.perf_counter()
        detector.predict(
            {
                "method": "GET",
                "path": "/products/42",
                "query": "ref=home&page=2",
                "body": "",
                "headers": {
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
                "referer": "https://shop.example.com/",
            },
                "content_type": "",
                "response": {"status_code": 200, "cookie_flags": {}},
                "session": normal,
            }
        )
        latencies.append((time.perf_counter() - t0) * 1000)
    latencies.sort()
    out["latency_ms"] = {
        "p50": round(statistics.median(latencies), 2),
        "p95": round(latencies[int(len(latencies) * 0.95)], 2),
        "max": round(max(latencies), 2),
    }
    return out


def markdown_results(payload: dict) -> str:
    m = payload["metrics"]
    per = m["per_class"]
    cm = m["confusion_matrix"]
    classes = m["classes"]
    acc = payload["acceptance"]
    stats = payload["dataset"]

    lines: list[str] = []
    lines.append("# ShieldForge ML Detection Engine — Results")
    lines.append("")
    lines.append(f"Generated: {payload['trained_at']}")
    lines.append("")
    lines.append("## Headline")
    lines.append("")
    lines.append("| Metric | Value |")
    lines.append("|---|---|")
    lines.append(f"| Test rows (held-out) | {m['test_rows']} |")
    lines.append(f"| Accuracy | **{m['accuracy']:.4f}** |")
    lines.append(f"| Macro F1 | **{m['macro_f1']:.4f}** |")
    lines.append(f"| Weighted F1 | **{m['weighted_f1']:.4f}** |")
    lines.append(f"| Attack precision (binary) | **{m['binary']['precision']:.4f}** |")
    lines.append(f"| Attack recall (binary) | **{m['binary']['recall']:.4f}** |")
    lines.append(f"| Benign false-positive rate | **{m['binary']['false_positive_rate']:.4f}** |")
    lines.append(f"| Expected calibration error | {m['ece_after']:.4f} (raw {m['ece_before']:.4f}) |")
    lines.append(f"| P95 inference latency | **{acc['latency_ms']['p95']} ms** |")
    lines.append("")
    lines.append("## Per-class held-out performance")
    lines.append("")
    lines.append("| Class | Precision | Recall | F1 | Support |")
    lines.append("|---|---|---|---|---|")
    for c in classes:
        row = per[c]
        lines.append(
            f"| {c} | {row['precision']:.4f} | {row['recall']:.4f} | {row['f1']:.4f} | {row['support']} |"
        )
    lines.append("")
    lines.append("## Confusion matrix (rows = truth, cols = prediction)")
    lines.append("")
    lines.append("| truth \\ pred | " + " | ".join(classes) + " |")
    lines.append("|---" * (len(classes) + 1) + "|")
    for i, c in enumerate(classes):
        lines.append("| " + c + " | " + " | ".join(str(v) for v in cm[i]) + " |")
    lines.append("")
    lines.append("## Acceptance tests")
    lines.append("")
    lines.append("| Case | Class | Confidence | Detected | Risk | Action |")
    lines.append("|---|---|---|---|---|---|")
    for name in ("xss_script_in_path", "benign_get", "sqli_union_select"):
        row = acc[name]
        lines.append(
            f"| {name} | {row['attack_class']} | {row['confidence']:.3f} | "
            f"{row['attack_detected']} | {row['risk_score']} | {row['action_recommended']} |"
        )
    lines.append("")
    lines.append("### Session anomaly contrast")
    lines.append("")
    lines.append("| Session | Anomaly score | Anomaly flag | Risk score | Action |")
    lines.append("|---|---|---|---|---|")
    for name in ("normal_session", "replay_session"):
        row = acc[name]
        lines.append(
            f"| {name} | {row['anomaly_score']:.3f} | {row['anomaly_flag']} | "
            f"{row['risk_score']} | {row['action_recommended']} |"
        )
    lines.append("")
    lines.append("## Dataset")
    lines.append("")
    lines.append("| Slice | Rows |")
    lines.append("|---|---|")
    lines.append(f"| Total | {stats['total']} |")
    for label in LABELS:
        lines.append(f"| {label} | {stats[f'label_{label}']} |")
    lines.append(f"| From synthetic generators | {stats['source_synthetic']} |")
    lines.append(f"| From PayloadsAllTheThings | {stats['source_pat']} |")
    lines.append(f"| From CSIC 2010 | {stats['source_csic']} |")
    lines.append("")
    lines.append(
        f"Split (group-aware, no payload appears in two splits): train {m['split']['train']}, "
        f"validation {m['split']['val']}, calibration {m['split']['calibration']}, test {m['split']['test']}."
    )
    lines.append("")
    lines.append("## Method")
    lines.append("")
    lines.append(
        "- **Features:** 120+ handcrafted signals (URL/query/body length, special-character ratio, "
        "Shannon entropy, character counts, keyword signatures, header hygiene, cookie flags, session volatility) "
        "combined with a character 2–5-gram TF-IDF matrix (6,000 features)."
    )
    lines.append(
        "- **Attack classifier:** LightGBM multiclass (softmax), 6 classes, class-balanced weights, "
        "early stopping on a validation split."
    )
    lines.append(
        "- **Calibration:** temperature scaling fitted on a dedicated held-out calibration split. "
        "`confidence` is the calibrated maximum class probability."
    )
    lines.append(
        "- **Session anomaly:** Isolation Forest (200 trees) trained only on benign sessions "
        "(ip change count, UA change count, ASN change, request rate), score min-maxed over the "
        "benign training quantiles, then bucketed into the 1–5 risk score."
    )
    lines.append(
        "- **Decision layer:** confidence bands `<0.6` log, `0.6–0.9` alert, `>0.9` temp_block "
        "(injection classes) or challenge (scanner/credential classes). Session anomalies raise risk "
        "even when no payload signature is present."
    )
    lines.append("")
    lines.append("## Honest limitations")
    lines.append("")
    lines.append(
        "- CSIC 2010 has binary labels, so its anomalous requests were assigned a fine-grained class "
        "with a deterministic signature mapping. That mapping overlaps with model features, which "
        "inflates the CSIC portion of the test metrics. The payload-group split limits, but does not "
        "eliminate, this optimism."
    )
    lines.append(
        "- A large share of training rows are generated variants of known payload families. Treat the "
        "numbers as evidence of a working pipeline, not as a production benchmark."
    )
    lines.append(
        "- CICIDS2017 is network-flow data and has no HTTP text. It was not blended into the request "
        "classifier because doing so would mix incompatible feature spaces. `data/README.md` documents "
        "the optional loader; the shipped model uses CSIC 2010 + PayloadsAllTheThings + generated benign traffic."
    )
    lines.append(
        "- No raw cookie values or passwords are read or stored. Credential parameters are redacted "
        "defensively in both training data and serving input."
    )
    lines.append("")
    lines.append("## Reproduce")
    lines.append("")
    lines.append("```bash")
    lines.append("python scripts/download_data.py   # optional: refreshes public payloads + CSIC")
    lines.append("python scripts/train.py")
    lines.append("```")
    lines.append("")
    return "\n".join(lines).replace("—", "-").replace("–", "-").replace("≥", ">=").replace("≤", "<=")


def main() -> None:
    args = parse_args()
    seed = args.seed
    np.random.seed(seed)
    random.seed(seed)

    scale = 0.25 if args.quick else 1.0
    counts = dict(
        n_benign=int(4500 * scale),
        n_xss=int(3000 * scale),
        n_sqli=int(3000 * scale),
        n_rce=int(2800 * scale),
        n_scanner=int(3500 * scale),
        n_cred=int(1600 * scale),
        n_csic_normal=int(5000 * scale),
        n_csic_anomalous=int(5000 * scale),
    )

    print("Building dataset ...")
    rows, stats = assemble(args.data_dir, seed=seed, **counts)
    print("Dataset:", json.dumps(stats, indent=2))

    print("Extracting features ...")
    t0 = time.perf_counter()
    dense, texts, sessions, labels, groups, feature_names = build_matrices(rows, seed)
    print(f"  {dense.shape[0]} rows x {dense.shape[1]} dense features in {time.perf_counter() - t0:.1f}s")

    train_idx, val_idx, cal_idx, test_idx = group_split(groups, labels, seed)
    print(f"Splits: train={len(train_idx)} val={len(val_idx)} cal={len(cal_idx)} test={len(test_idx)}")

    print("Fitting TF-IDF ...")
    vectorizer = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(2, 5),
        max_features=6000,
        min_df=2,
        sublinear_tf=True,
        lowercase=True,
    )
    train_texts = [texts[i] for i in train_idx]
    vectorizer.fit(train_texts)

    def matrix(idx: np.ndarray):
        tfidf = vectorizer.transform([texts[i] for i in idx])
        return hstack([csr_matrix(dense[idx]), tfidf], format="csr")

    X_train, X_val, X_cal, X_test = matrix(train_idx), matrix(val_idx), matrix(cal_idx), matrix(test_idx)
    y_train = np.asarray([labels[i] for i in train_idx])
    y_val = np.asarray([labels[i] for i in val_idx])
    y_cal = np.asarray([labels[i] for i in cal_idx])
    y_test = np.asarray([labels[i] for i in test_idx])

    print("Training LightGBM ...")
    t0 = time.perf_counter()
    model = lgb.LGBMClassifier(
        objective="multiclass",
        num_class=len(LABELS),
        n_estimators=args.n_estimators,
        learning_rate=0.07,
        num_leaves=63,
        min_child_samples=12,
        feature_fraction=0.7,
        bagging_fraction=0.85,
        bagging_freq=1,
        lambda_l2=1.0,
        class_weight="balanced",
        n_jobs=-1,
        random_state=seed,
        verbose=-1,
    )
    model.fit(
        X_train,
        y_train,
        eval_set=[(X_val, y_val)],
        callbacks=[lgb.early_stopping(40, verbose=False), lgb.log_evaluation(100)],
    )
    train_s = time.perf_counter() - t0
    classes = list(model.classes_)
    print(f"  trained in {train_s:.1f}s, best iteration {getattr(model, 'best_iteration_', 'n/a')}")

    class_to_int = {c: i for i, c in enumerate(classes)}
    y_cal_i = np.asarray([class_to_int[c] for c in y_cal])
    y_test_i = np.asarray([class_to_int[c] for c in y_test])

    print("Calibrating ...")
    cal_raw = model.predict_proba(X_cal)
    temperature = fit_temperature(cal_raw, y_cal_i)

    def apply_temperature(probs: np.ndarray, t: float) -> np.ndarray:
        powered = np.clip(probs, 1e-12, None) ** (1.0 / t)
        return powered / powered.sum(axis=1, keepdims=True)

    # Temperature scaling must not make held-out calibration worse than raw softmax.
    if ece(apply_temperature(cal_raw, temperature), y_cal_i) >= ece(cal_raw, y_cal_i):
        temperature = 1.0
    print(f"  temperature = {temperature:.4f}")

    test_raw = model.predict_proba(X_test)
    test_probs = apply_temperature(test_raw, temperature)

    y_pred = np.asarray([classes[i] for i in test_probs.argmax(axis=1)])
    per_class = per_class_report(y_test.tolist(), y_pred.tolist(), classes)
    macro = precision_recall_fscore_support(y_test, y_pred, average="macro", zero_division=0)
    weighted = precision_recall_fscore_support(y_test, y_pred, average="weighted", zero_division=0)
    cm = confusion_matrix(y_test, y_pred, labels=classes).tolist()

    metrics = {
        "classes": classes,
        "train_rows": int(len(train_idx)),
        "test_rows": int(len(test_idx)),
        "split": {
            "train": int(len(train_idx)),
            "val": int(len(val_idx)),
            "calibration": int(len(cal_idx)),
            "test": int(len(test_idx)),
        },
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "macro_f1": float(macro[2]),
        "weighted_f1": float(weighted[2]),
        "per_class": per_class,
        "binary": binary_report(y_test.tolist(), y_pred.tolist()),
        "confusion_matrix": cm,
        "ece_before": ece(test_raw, y_test_i),
        "ece_after": ece(test_probs, y_test_i),
        "temperature": float(temperature),
        "training_seconds": round(train_s, 1),
        "n_features": int(X_train.shape[1]),
        "best_iteration": int(getattr(model, "best_iteration_", 0) or 0),
    }
    print(json.dumps({k: v for k, v in metrics.items() if k not in ("per_class", "confusion_matrix")}, indent=2))

    print("Fitting Isolation Forest ...")
    benign_sessions = np.vstack(
        [
            sessions[i]
            for i in train_idx
            if labels[i] == "benign"
        ]
    )
    # Add dense synthetic normals so the forest learns the full benign manifold.
    rng = np.random.default_rng(seed)
    extra = np.column_stack(
        [
            rng.poisson(0.2, 2000).clip(0, 3),
            rng.poisson(0.15, 2000).clip(0, 2),
            (rng.random(2000) < 0.003).astype(float),
            np.clip(rng.lognormal(1.0, 0.75, 2000), 0.2, 40.0),
        ]
    ).astype(np.float32)
    if len(benign_sessions):
        fit_sessions = np.vstack([benign_sessions, extra])
    else:  # pragma: no cover
        fit_sessions = extra

    iforest = IsolationForest(
        n_estimators=200,
        max_samples=min(512, len(fit_sessions)),
        contamination=0.02,
        random_state=seed,
        n_jobs=-1,
    )
    iforest.fit(fit_sessions)
    benign_scores = iforest.decision_function(fit_sessions)
    anomaly_low = float(np.quantile(benign_scores, 0.01))
    anomaly_high = float(np.quantile(benign_scores, 0.99))

    bundle = {
        "model": model,
        "vectorizer": vectorizer,
        "classes": classes,
        "feature_names": feature_names,
        "temperature": temperature,
        "iforest": iforest,
        "anomaly_low": anomaly_low,
        "anomaly_high": anomaly_high,
        "metadata": {
            "version": MODEL_VERSION,
            "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "seed": seed,
            "dataset": stats,
            "metrics": metrics,
            "anomaly_features": ["ip_change_count_5min", "ua_change_count_5min", "asn_changed", "request_rate"],
        },
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, args.out, compress=3)
    size_mb = args.out.stat().st_size / (1024 * 1024)
    print(f"Saved {args.out} ({size_mb:.1f} MB)")

    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    METRICS_PATH.write_text(json.dumps({"metrics": metrics, "dataset": stats}, indent=2), encoding="utf-8")

    print("Running acceptance checks ...")
    acceptance = evaluate_acceptance(args.out)
    print(json.dumps(acceptance, indent=2))

    results = {
        "trained_at": bundle["metadata"]["trained_at"],
        "metrics": metrics,
        "acceptance": acceptance,
        "dataset": stats,
    }
    args.results.write_text(markdown_results(results), encoding="utf-8")
    print(f"Wrote {args.results}")


if __name__ == "__main__":
    main()
