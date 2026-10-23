"""Acceptance + contract tests. Run: pytest -q"""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app.main import app

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

BENIGN_SESSION = {
    "ip_change_count_5min": 0,
    "ua_change_count_5min": 0,
    "asn_changed": False,
    "request_rate": 2.0,
}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def payload(*, method="GET", path="/", query="", body="", headers=None, session=None, response=None):
    return {
        "request_meta": {
            "method": method,
            "path": path,
            "query": query,
            "body_preview": body,
            "headers": headers or {"user-agent": UA, "host": "shop.example.com"},
        },
        "response_meta": response or {"status_code": 200, "content_type": "text/html", "set_cookie_flags": {}},
        "session_features": session or BENIGN_SESSION,
    }


# --------------------------------------------------------------------------- ops


def test_health_returns_200(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["model_loaded"] is True


def test_root_describes_service(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["endpoints"]["classify"] == "POST /classify"


# --------------------------------------------------------------- acceptance tests


def test_xss_script_in_path_is_detected(client):
    response = client.post(
        "/classify",
        json=payload(path="/search/<script>alert(document.cookie)</script>"),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["attack_detected"] is True
    assert body["attack_class"] == "xss"
    assert body["confidence"] > 0.7
    assert body["action_recommended"] in {"alert", "temp_block", "challenge", "rate_limit"}


def test_benign_get_is_not_detected(client):
    response = client.post(
        "/classify",
        json=payload(
            path="/products/42",
            query="ref=home&page=2",
            headers={"user-agent": UA, "referer": "https://shop.example.com/"},
        ),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["attack_detected"] is False
    assert body["attack_class"] == "benign"
    assert body["risk_score"] == 1
    assert body["action_recommended"] == "log"


def test_union_select_is_sqli(client):
    response = client.post(
        "/classify",
        json=payload(
            path="/products",
            query="id=1%27%20UNION%20SELECT%20username,password%20FROM%20users--",
        ),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["attack_detected"] is True
    assert body["attack_class"] == "sqli"
    assert body["confidence"] > 0.7


def test_traversal_is_rce_class(client):
    response = client.post("/classify", json=payload(path="/download", query="file=../../../../etc/passwd"))
    body = response.json()
    assert body["attack_detected"] is True
    assert body["attack_class"] == "php_rce"


def test_common_scanner_probe_is_detected(client):
    response = client.post("/classify", json=payload(path="/.env", response={"status_code": 404}))
    body = response.json()
    assert body["attack_class"] == "scanner"
    assert body["confidence"] >= 0.5


def test_credential_burst_is_detected(client):
    response = client.post(
        "/classify",
        json=payload(
            method="POST",
            path="/login",
            body="username=admin&password=%5BREDACTED%5D",
            headers={"user-agent": UA, "content-type": "application/x-www-form-urlencoded"},
            session={
                "ip_change_count_5min": 2,
                "ua_change_count_5min": 1,
                "asn_changed": False,
                "request_rate": 120,
            },
            response={"status_code": 401},
        ),
    )
    body = response.json()
    assert body["attack_class"] == "cred_stuffing"
    assert body["action_recommended"] == "challenge"


def test_weak_cookie_flags_surface_as_signal(client):
    response = client.post(
        "/classify",
        json=payload(
            path="/products/42",
            response={
                "status_code": 200,
                "content_type": "text/html",
                "set_cookie_flags": {"httponly": False, "secure": False, "samesite": "none"},
            },
        ),
    )
    body = response.json()
    assert body["attack_detected"] is False
    assert "weak_cookie_flags" in body["signals"]


def test_raw_set_cookie_is_reduced_to_flags_and_not_echoed(client):
    response = client.post(
        "/classify",
        json=payload(
            path="/products/42",
            response={
                "status_code": 200,
                "set_cookie": "session=SuperSecretCookieValue; Path=/; HttpOnly; Secure; SameSite=Lax",
            },
        ),
    )
    assert response.status_code == 200
    assert "SuperSecretCookieValue" not in response.text
    body = response.json()
    assert "weak_cookie_flags" not in body["signals"]


def test_password_is_never_echoed(client):
    response = client.post(
        "/classify",
        json=payload(
            method="POST",
            path="/login",
            body="username=bob&password=SuperSecret123!",
            headers={"user-agent": UA, "content-type": "application/x-www-form-urlencoded"},
        ),
    )
    assert response.status_code == 200
    assert "SuperSecret123" not in response.text


# ------------------------------------------------------------------- anomaly tests


def test_suspicious_session_has_materially_higher_risk(client):
    normal = client.post(
        "/classify",
        json=payload(path="/account/profile", session=BENIGN_SESSION),
    ).json()
    suspicious = client.post(
        "/classify",
        json=payload(
            path="/account/profile",
            session={
                "ip_change_count_5min": 5,
                "ua_change_count_5min": 0,
                "asn_changed": True,
                "request_rate": 0,
            },
        ),
    ).json()

    assert normal["attack_detected"] is False
    assert suspicious["risk_score"] - normal["risk_score"] >= 2
    assert suspicious["anomaly_flag"] is True


# ------------------------------------------------------------------- shape tests


def test_flat_input_aliases_accepted(client):
    response = client.post(
        "/classify",
        json={
            "method": "GET",
            "path": "/search",
            "query": "q=<script>alert(1)</script>",
            "headers": {"user-agent": UA},
            "session": {"ip_change_count": 0, "ua_change_count": 0, "asn_changed": False, "requests_per_minute": 1},
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["attack_class"] == "xss"
    for key in ("attack_detected", "attack_class", "confidence", "risk_score", "action_recommended"):
        assert key in body


def test_empty_payload_defaults_to_benign(client):
    response = client.post("/classify", json={})
    assert response.status_code == 200
    body = response.json()
    assert body["attack_class"] == "benign"
    assert 1 <= body["risk_score"] <= 5


def test_response_action_vocabulary(client):
    body = client.post("/classify", json=payload(path="/search", query="q=hello")).json()
    assert body["action_recommended"] in {"log", "alert", "rate_limit", "challenge", "temp_block"}


def test_latency_under_300ms(client):
    timings = []
    for _ in range(20):
        start = time.perf_counter()
        response = client.post("/classify", json=payload(path="/products/42", query="page=2"))
        timings.append((time.perf_counter() - start) * 1000)
        assert response.status_code == 200
    timings.sort()
    assert timings[int(len(timings) * 0.95)] < 300
