"""Request/response schemas and defensive normalization.

The proxy team codes against Boundary 1 of 02_INTEGRATION_README.md. Because that
file is not present in this repo snapshot, the service accepts both the documented
nested shape and a flat equivalent, plus common field aliases. See CONTRACT.md.
"""

from __future__ import annotations

import re
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field

AttackClass = Literal["xss", "sqli", "php_rce", "scanner", "cred_stuffing", "benign"]
Action = Literal["log", "alert", "rate_limit", "challenge", "temp_block"]

_SECRET_PARAM_RE = re.compile(
    r"(?i)\b(password|passwd|pwd|pass|secret|token|api[_-]?key|access[_-]?token|"
    r"refresh[_-]?token|session[_-]?id|sessionid|jsessionid|phpsessid|csrf|otp|"
    r"authorization|auth)=([^&;\s]*)"
)


def redact_secrets(value: str) -> str:
    """Replace credential-looking parameter values. Defence in depth only.

    The contract says the proxy already redacts. This guard means a mistake in the
    proxy cannot leak a password into feature extraction or logs from this service.
    """
    if not value:
        return value
    return _SECRET_PARAM_RE.sub(lambda m: f"{m.group(1)}=[REDACTED]", value)


class ClassifyRequest(BaseModel):
    """Permissive input model. Unknown keys are accepted and ignored."""

    # Documented nested shape.
    request_meta: dict[str, Any] | None = None
    response_meta: dict[str, Any] | None = None
    session_features: dict[str, Any] | None = None

    # Aliases seen in early proxy drafts.
    request: dict[str, Any] | None = None
    http_request: dict[str, Any] | None = None
    response: dict[str, Any] | None = None
    session: dict[str, Any] | None = None
    session_context: dict[str, Any] | None = None

    # Flat fallback.
    method: str | None = None
    url: str | None = None
    path: str | None = None
    query: Any = None
    body: Any = None
    body_preview: Any = None
    headers: dict[str, Any] | None = None
    content_type: str | None = None
    status_code: int | None = None
    origin_id: str | None = None
    event_id: str | None = None

    model_config = ConfigDict(
        extra="allow",
        json_schema_extra={
            "examples": [
                {
                    "request_meta": {
                        "method": "GET",
                        "path": "/search",
                        "query": "q=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
                        "headers": {"user-agent": "Mozilla/5.0", "host": "shop.example.com"},
                    },
                    "response_meta": {
                        "status_code": 200,
                        "content_type": "text/html",
                        "set_cookie_flags": {"httponly": False, "secure": False, "samesite": "none"},
                    },
                    "session_features": {
                        "ip_change_count_5min": 0,
                        "ua_change_count_5min": 0,
                        "asn_changed": False,
                        "request_rate": 2.5,
                    },
                }
            ]
        },
    )


class ClassifyResponse(BaseModel):
    attack_detected: bool
    attack_class: AttackClass
    confidence: float = Field(ge=0.0, le=1.0)
    risk_score: int = Field(ge=1, le=5)
    action_recommended: Action

    # Extra fields are safe for the proxy to ignore.
    class_probabilities: dict[str, float] = Field(default_factory=dict)
    anomaly_score: float = Field(default=0.0, ge=0.0, le=1.0)
    anomaly_flag: bool = False
    signals: list[str] = Field(default_factory=list)
    model_version: str = ""
    latency_ms: float = 0.0


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    model_loaded: bool
    model_version: str
    uptime_s: float


_FIRST_KEYS = ("request_meta", "request", "http_request")
_RESPONSE_KEYS = ("response_meta", "response")
_SESSION_KEYS = ("session_features", "session", "session_context")


def _first_dict(payload: dict[str, Any], keys: tuple[str, ...]) -> dict[str, Any]:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, dict):
            return value
    return {}


def _pick(*sources: dict[str, Any], keys: tuple[str, ...], default: Any = "") -> Any:
    for source in sources:
        for key in keys:
            if key in source and source[key] is not None:
                return source[key]
    return default


def _as_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        return "&".join(_as_str(v) for v in value)
    if isinstance(value, dict):
        return "&".join(f"{k}={_as_str(v)}" for k, v in value.items())
    return str(value)


def _normalize_headers(value: Any) -> dict[str, str]:
    headers: dict[str, str] = {}
    if isinstance(value, dict):
        items = value.items()
    elif isinstance(value, (list, tuple)):
        items = []
        for item in value:
            if isinstance(item, (list, tuple)) and len(item) == 2:
                items.append((item[0], item[1]))
    else:
        items = []
    for key, val in items:
        name = str(key).strip().lower()
        if name in {"cookie", "set-cookie", "authorization", "proxy-authorization"}:
            headers[name] = "[REDACTED]"
        else:
            headers[name] = _as_str(val)
    return headers


def _parse_set_cookie(header: str) -> dict[str, Any]:
    """Extract flags from a Set-Cookie string, deliberately discarding the value."""
    parts = [p.strip() for p in header.split(";")]
    flags: dict[str, Any] = {"present": True, "httponly": False, "secure": False, "samesite": ""}
    for part in parts[1:]:
        low = part.lower()
        if low == "httponly":
            flags["httponly"] = True
        elif low == "secure":
            flags["secure"] = True
        elif low.startswith("samesite="):
            flags["samesite"] = part.split("=", 1)[1].strip().lower()
    return flags


def _normalize_cookie_flags(response: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []

    explicit = response.get("set_cookie_flags") or response.get("cookie_flags")
    if isinstance(explicit, dict) and explicit:
        candidates.append(dict(explicit))
    elif isinstance(explicit, list):
        candidates.extend(dict(x) for x in explicit if isinstance(x, dict))

    cookies = response.get("cookies")
    if isinstance(cookies, list):
        candidates.extend(dict(x) for x in cookies if isinstance(x, dict))

    for key in ("set_cookie", "set-cookie", "set_cookie_header"):
        raw = response.get(key)
        if isinstance(raw, str) and raw:
            candidates.append(_parse_set_cookie(raw))
        elif isinstance(raw, list):
            candidates.extend(_parse_set_cookie(str(x)) for x in raw if x)

    if not candidates and isinstance(payload.get("set_cookie_flags"), dict):
        candidates.append(dict(payload["set_cookie_flags"]))

    if not candidates:
        return {}

    out: dict[str, Any] = {"present": True}
    out["httponly"] = all(bool(c.get("httponly")) for c in candidates)
    out["secure"] = all(bool(c.get("secure")) for c in candidates)
    samesites = [
        str(c.get("samesite") or c.get("same_site") or c.get("sameSite") or "").lower()
        for c in candidates
    ]
    out["samesite"] = samesites[0] if all(s == samesites[0] for s in samesites) else ""
    return out


def _split_url(value: str) -> tuple[str, str]:
    if not value:
        return "", ""
    if "://" in value:
        try:
            parsed = urlsplit(value)
            return parsed.path or "/", parsed.query
        except ValueError:
            return value, ""
    if "?" in value:
        path, query = value.split("?", 1)
        return path, query
    return value, ""


def normalize_request(payload: dict[str, Any]) -> dict[str, Any]:
    """Collapse any accepted input variant into the internal feature dict."""
    req = _first_dict(payload, _FIRST_KEYS)
    resp = _first_dict(payload, _RESPONSE_KEYS)
    sess = _first_dict(payload, _SESSION_KEYS)

    url = _as_str(_pick(req, payload, keys=("url", "full_url", "request_url", "absolute_url")))
    path = _as_str(_pick(req, payload, keys=("path", "request_path", "uri", "route")))
    query = _pick(req, payload, keys=("query", "query_string", "search", "params"), default="")
    query = _as_str(query)

    if (not path or not query) and url:
        url_path, url_query = _split_url(url)
        path = path or url_path
        query = query or url_query

    # Some proxies pass the full URL in the path field.
    if "://" in path:
        url_path, url_query = _split_url(path)
        path = url_path
        query = query or url_query

    # A path that accidentally carries its query string is split here.
    if "?" in path:
        path, inline_query = path.split("?", 1)
        query = query or inline_query

    method = str(_pick(req, payload, keys=("method", "http_method", "verb"), default="GET")).upper()
    if method not in {"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "TRACE", "CONNECT"}:
        method = "GET"

    headers = _normalize_headers(_pick(req, payload, keys=("headers", "request_headers"), default={}))
    body = _as_str(_pick(req, payload, keys=("body", "body_preview", "request_body", "payload"), default=""))
    content_type = _as_str(
        _pick(req, payload, keys=("content_type", "content-type"), default=headers.get("content-type", ""))
    )

    status_raw = _pick(resp, payload, keys=("status_code", "status", "response_status"), default=0)
    try:
        status_code = int(status_raw)
    except (TypeError, ValueError):
        status_code = 0

    response = {
        "status_code": status_code,
        "content_type": _as_str(
            _pick(resp, payload, keys=("content_type", "content-type"), default="")
        ),
        "cookie_flags": _normalize_cookie_flags(resp, payload),
    }

    session_raw = dict(sess)
    # Flat session aliases.
    for key in (
        "ip_change_count_5min",
        "ip_change_count",
        "ua_change_count_5min",
        "ua_change_count",
        "asn_changed",
        "request_rate",
        "requests_per_minute",
    ):
        if key not in session_raw and key in payload:
            session_raw[key] = payload[key]
    session = {
        "ip_change_count_5min": _num(
            session_raw.get("ip_change_count_5min", session_raw.get("ip_change_count", 0))
        ),
        "ua_change_count_5min": _num(
            session_raw.get("ua_change_count_5min", session_raw.get("ua_change_count", 0))
        ),
        "asn_changed": _truthy(session_raw.get("asn_changed", session_raw.get("asn_changed_5min", False))),
        "request_rate": _num(
            session_raw.get(
                "request_rate",
                session_raw.get("requests_per_minute", session_raw.get("rate_per_min", 0)),
            )
        ),
    }

    # Never let secrets reach the extractor even if a caller ignores the contract.
    return {
        "method": method,
        "path": redact_secrets(path),
        "query": redact_secrets(query),
        "body": redact_secrets(body),
        "headers": headers,
        "content_type": redact_secrets(content_type),
        "response": response,
        "session": session,
        "origin_id": _as_str(payload.get("origin_id")),
        "event_id": _as_str(payload.get("event_id")),
    }


def _num(value: Any) -> float:
    try:
        if value is None or value == "":
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}
