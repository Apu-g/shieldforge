"""Typed decision layer (the "Jev-style" part).

Maps calibrated model probabilities + session anomaly score into a small, fixed
response vocabulary. No free-text reasoning is produced here.
"""

from __future__ import annotations

from typing import Any

from .features import session_vector

ATTACK_CLASSES = ("xss", "sqli", "php_rce", "scanner", "cred_stuffing", "benign")

# Action vocabulary shared with the proxy and the incidents table.
ACTIONS = ("log", "alert", "rate_limit", "challenge", "temp_block")

# Confidence bands from the integration contract.
LOG_BELOW = 0.60
ALERT_BELOW = 0.90

# A non-benign class only counts as detected above this probability.
DETECT_CONFIDENCE = 0.50

# Injection classes get blocked at high confidence; noisy classes get a challenge.
BLOCK_CLASSES = {"xss", "sqli", "php_rce"}
CHALLENGE_CLASSES = {"scanner", "cred_stuffing"}


def anomaly_level(score: float) -> int:
    if score >= 0.90:
        return 3
    if score >= 0.75:
        return 2
    if score >= 0.55:
        return 1
    return 0


def decide(
    probabilities: dict[str, float],
    anomaly_score: float,
    session: dict[str, Any],
    info: dict[str, Any],
    *,
    log_below: float = LOG_BELOW,
    alert_below: float = ALERT_BELOW,
) -> dict[str, Any]:
    """Return the typed decision payload (without model/latency metadata)."""
    ordered = sorted(probabilities.items(), key=lambda kv: kv[1], reverse=True)
    top_class, top_conf = ordered[0]
    benign_prob = float(probabilities.get("benign", 0.0))

    detected = top_class != "benign" and top_conf >= DETECT_CONFIDENCE
    if detected:
        attack_class = top_class
        confidence = float(top_conf)
    else:
        attack_class = "benign"
        confidence = float(benign_prob)

    # --- risk score 1..5 -------------------------------------------------------------
    if detected:
        if confidence < LOG_BELOW:
            risk = 2
        elif confidence < 0.75:
            risk = 3
        elif confidence <= ALERT_BELOW:
            risk = 4
        else:
            risk = 5
    else:
        risk = 1

    level = anomaly_level(anomaly_score)
    session_volatility = (
        float(session.get("ip_change_count_5min") or 0.0) * 2.0
        + float(session.get("ua_change_count_5min") or 0.0) * 1.5
        + (3.0 if session.get("asn_changed") else 0.0)
    )
    # Explicit hard signals guarantee that a clearly replayed session cannot be
    # scored as low-risk just because the forest saw a similar outlier in training.
    if session.get("asn_changed") and float(session.get("ip_change_count_5min") or 0.0) >= 3:
        level = max(level, 2)
    elif float(session.get("ip_change_count_5min") or 0.0) >= 5:
        level = max(level, 2)
    if float(session.get("request_rate") or 0.0) >= 60:
        level = max(level, 1)

    if detected:
        risk = min(5, risk + (1 if level >= 2 else 0))
    else:
        risk = min(5, 1 + level)

    # Anomaly-only traffic still needs the dashboard to see it as risky.
    anomaly_flag = level >= 2 or anomaly_score >= 0.75

    # --- response action -------------------------------------------------------------
    if detected:
        if confidence < log_below:
            action = "log"
        elif confidence <= alert_below:
            action = "alert"
        else:
            if attack_class in BLOCK_CLASSES:
                action = "temp_block"
            elif attack_class in CHALLENGE_CLASSES:
                action = "challenge"
            else:
                action = "alert"
    else:
        if risk >= 4:
            action = "challenge"
        elif risk == 3:
            action = "rate_limit"
        else:
            action = "log"

    signals = _signals(attack_class, detected, anomaly_score, session, info)

    return {
        "attack_detected": bool(detected),
        "attack_class": attack_class,
        "confidence": round(confidence, 4),
        "risk_score": int(max(1, min(5, risk))),
        "action_recommended": action,
        "class_probabilities": {k: round(float(v), 4) for k, v in ordered},
        "anomaly_score": round(float(anomaly_score), 4),
        "anomaly_flag": bool(anomaly_flag),
        "signals": signals,
    }


def _signals(
    attack_class: str,
    detected: bool,
    anomaly_score: float,
    session: dict[str, Any],
    info: dict[str, Any],
) -> list[str]:
    """Short machine-readable codes; the LLM agent writes prose, not this service."""
    out: list[str] = []
    hits = info.get("keyword_hits") or {}
    if detected:
        out.append(f"{attack_class}_signature")
    if hits.get("xss"):
        out.append("xss_lexical_hit")
    if hits.get("sqli"):
        out.append("sqli_lexical_hit")
    if hits.get("php_rce"):
        out.append("rce_traversal_hit")
    if hits.get("scanner"):
        out.append("scanner_path_hit")
    if info.get("ua_scanner"):
        out.append("scanner_user_agent")
    if hits.get("cred_stuffing"):
        out.append("credential_endpoint")
    flags = info.get("cookie_flags") or {}
    if flags.get("httponly") is False or flags.get("secure") is False:
        out.append("weak_cookie_flags")
    s = info.get("session") or session
    if float(s.get("ip_change_count_5min") or 0.0) >= 3:
        out.append("session_ip_churn")
    if float(s.get("ua_change_count_5min") or 0.0) >= 3:
        out.append("session_ua_churn")
    if s.get("asn_changed"):
        out.append("session_asn_change")
    if float(s.get("request_rate") or 0.0) >= 30:
        out.append("high_request_rate")
    if anomaly_score >= 0.75:
        out.append("behavioral_anomaly")
    # Stable, deduped, bounded list.
    return list(dict.fromkeys(out))[:8]


def risk_for_session(anomaly_score: float, session: dict[str, Any]) -> int:
    """Risk score for a session with no attack signal (used by tests/metrics)."""
    return decide(
        {"benign": 1.0, "xss": 0.0, "sqli": 0.0, "php_rce": 0.0, "scanner": 0.0, "cred_stuffing": 0.0},
        anomaly_score,
        session,
        {"session": session},
    )["risk_score"]
