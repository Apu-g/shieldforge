"""Model loading and inference."""

from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from scipy.sparse import csr_matrix, hstack

from .features import SCANNER_PATH_TOKENS, SESSION_FEATURE_NAMES, extract_features, session_vector

log = logging.getLogger("shieldforge.ml")

CLASSES = ("xss", "sqli", "php_rce", "scanner", "cred_stuffing", "benign")


class Detector:
    """Wraps the trained artifacts; degrades to a rule heuristic if they are absent."""

    def __init__(self, model_path: Path, version: str) -> None:
        self.model_path = model_path
        self.version = version
        self.loaded = False
        self.bundle: dict[str, Any] = {}
        self._load()
        self._warm()
        if not self.loaded:
            log.warning("Model artifact unavailable at %s; using heuristic fallback", model_path)

    # ------------------------------------------------------------------ loading
    def _load(self) -> None:
        try:
            bundle = joblib.load(self.model_path)
            required = {"model", "vectorizer", "classes", "temperature"}
            missing = required - set(bundle)
            if missing:
                raise ValueError(f"artifact missing keys: {sorted(missing)}")
            if not Path(self.model_path).exists():
                raise FileNotFoundError(self.model_path)
            self.bundle = bundle
            classes = list(bundle["classes"])
            if set(classes) != set(CLASSES):
                raise ValueError(f"unexpected class list: {classes}")
            self.classes = classes
            self.model = bundle["model"]
            self.vectorizer = bundle["vectorizer"]
            self.temperature = float(bundle.get("temperature", 1.0) or 1.0)
            self.iforest = bundle.get("iforest")
            self.anomaly_low = float(bundle.get("anomaly_low", 0.0) or 0.0)
            self.anomaly_high = float(bundle.get("anomaly_high", 1.0) or 1.0)
            self.feature_names = list(bundle.get("feature_names") or [])
            self.metadata = dict(bundle.get("metadata") or {})
            self.version = str(self.metadata.get("version") or self.version)
            self.loaded = True
            log.info(
                "Loaded model %s (%d classes, trained %s)",
                self.version,
                len(classes),
                self.metadata.get("trained_at", "unknown"),
            )
        except Exception as exc:  # pragma: no cover - depends on local artifacts
            log.error("Could not load model artifact: %s", exc)
            self.loaded = False

    def _warm(self) -> None:
        sample = {
            "method": "GET",
            "path": "/",
            "query": "",
            "body": "",
            "headers": {"user-agent": "warmup"},
            "content_type": "",
            "response": {"status_code": 200, "cookie_flags": {}},
            "session": {
                "ip_change_count_5min": 0,
                "ua_change_count_5min": 0,
                "asn_changed": False,
                "request_rate": 1.0,
            },
        }
        try:
            self.predict(sample)
        except Exception as exc:  # pragma: no cover
            log.warning("Warm-up failed: %s", exc)

    # ------------------------------------------------------------------ inference
    def predict(self, request: dict[str, Any]) -> tuple[dict[str, float], float, dict[str, Any]]:
        dense, text, names, info = extract_features(request)
        if self.feature_names and len(names) != len(self.feature_names):
            raise ValueError(
                f"feature mismatch: serving extractor produced {len(names)}, artifact expects {len(self.feature_names)}"
            )
        if self.loaded:
            try:
                probs = self._predict_model(dense, text)
            except Exception as exc:  # pragma: no cover - corrupt input guard
                log.exception("Model inference failed, falling back to heuristic: %s", exc)
                probs = self._heuristic(info)
        else:
            probs = self._heuristic(info)

        probs = self._temperature_scale(probs)
        probs = self._apply_signature_prior(probs, info)
        anomaly = self._anomaly(request.get("session") or {})
        return probs, anomaly, info

    def _predict_model(self, dense: np.ndarray, text: str) -> dict[str, float]:
        tfidf = self.vectorizer.transform([text])
        matrix = hstack([csr_matrix(dense.reshape(1, -1)), tfidf], format="csr")
        raw = np.asarray(self.model.predict_proba(matrix)[0], dtype=np.float64)
        return dict(zip(self.classes, raw))

    def _temperature_scale(self, probs: dict[str, float]) -> dict[str, float]:
        t = max(self.temperature, 1e-3)
        if abs(t - 1.0) < 1e-6:
            total = sum(probs.values()) or 1.0
            return {k: float(v) / total for k, v in probs.items()}
        powered = {k: max(float(v), 1e-12) ** (1.0 / t) for k, v in probs.items()}
        total = sum(powered.values()) or 1.0
        return {k: v / total for k, v in powered.items()}

    def _apply_signature_prior(self, probs: dict[str, float], info: dict[str, Any]) -> dict[str, float]:
        """Small deterministic posterior correction for high-specificity probes.

        The classifier is trained on synthetic + public data; rare path probes
        (``/.env``, ``/wp-login.php``) are under-represented relative to benign
        traffic even after augmentation. These priors are intentionally narrow:
        they only fire on tokens that are unambiguous in a customer web app, and
        the action bands still gate the response.
        """
        adjusted = {k: float(v) for k, v in probs.items()}
        path = str(info.get("path") or "").lower()
        hits = info.get("keyword_hits") or {}
        session = info.get("session") or {}

        if any(token in path for token in SCANNER_PATH_TOKENS):
            adjusted["scanner"] *= 4.0
        elif hits.get("scanner"):
            adjusted["scanner"] *= 1.8
        if info.get("ua_scanner"):
            adjusted["scanner"] *= 3.0

        if hits.get("php_rce") and adjusted["php_rce"] >= 0.2 * max(adjusted.values()):
            adjusted["php_rce"] *= 1.5

        rate = float(session.get("request_rate") or 0.0)
        if hits.get("cred_stuffing") and rate >= 25 and any(
            token in path for token in ("/login", "/signin", "/auth", "/session", "/token")
        ):
            adjusted["cred_stuffing"] *= 2.0

        total = sum(adjusted.values()) or 1.0
        return {k: v / total for k, v in adjusted.items()}

    def _anomaly(self, session: dict[str, Any]) -> float:
        if self.iforest is None or not self.loaded:
            # Heuristic fallback: map the raw session volatility into 0..1.
            ip = float(session.get("ip_change_count_5min") or 0.0)
            ua = float(session.get("ua_change_count_5min") or 0.0)
            asn = 1.0 if session.get("asn_changed") else 0.0
            rate = float(session.get("request_rate") or 0.0)
            raw = 0.18 * ip + 0.15 * ua + 0.35 * asn + 0.006 * min(rate, 100)
            return float(max(0.0, min(1.0, raw)))
        try:
            vec = session_vector(session).reshape(1, -1)
            df = float(self.iforest.decision_function(vec)[0])
            span = self.anomaly_high - self.anomaly_low
            if not math.isfinite(span) or abs(span) < 1e-9:
                return 0.0
            score = (self.anomaly_high - df) / span
            return float(max(0.0, min(1.0, score)))
        except Exception as exc:  # pragma: no cover
            log.warning("Anomaly inference failed: %s", exc)
            return 0.0

    def _heuristic(self, info: dict[str, Any]) -> dict[str, float]:
        hits = info.get("keyword_hits") or {}
        path = str(info.get("path") or "").lower()
        session = info.get("session") or {}
        scores = {
            "xss": 4.5 * bool(hits.get("xss")),
            "sqli": 4.5 * bool(hits.get("sqli")),
            "php_rce": 4.5 * bool(hits.get("php_rce")),
            "scanner": 4.0 * bool(hits.get("scanner")) + 3.0 * bool(info.get("ua_scanner")),
            "cred_stuffing": 2.0 * bool(hits.get("cred_stuffing"))
            + (1.2 if float(session.get("request_rate") or 0.0) > 30 and "login" in path else 0.0),
            "benign": 1.5,
        }
        exp = {k: math.exp(min(v, 30.0)) for k, v in scores.items()}
        total = sum(exp.values())
        return {k: v / total for k, v in exp.items()}

    # ------------------------------------------------------------------ metadata
    @property
    def anomaly_features(self) -> list[str]:
        return list(SESSION_FEATURE_NAMES)

    def metrics(self) -> dict[str, Any]:
        return dict(self.metadata.get("metrics") or {})
