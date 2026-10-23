"""Feature extraction for the ShieldForge attack classifier and session anomaly model.

Everything here is deterministic and dependency-free (stdlib + numpy) so the exact
same code path is used at training time and at inference time.
"""

from __future__ import annotations

import html
import math
import re
from collections import Counter
from typing import Any, Iterable
from urllib.parse import unquote, unquote_plus

import numpy as np

# --------------------------------------------------------------------------------------
# Payload lexicon. Hits are counted on the decoded, lower-cased request text.
# --------------------------------------------------------------------------------------

KEYWORDS: dict[str, tuple[str, ...]] = {
    "xss": (
        "<script",
        "</script",
        "javascript:",
        "vbscript:",
        "onerror=",
        "onerror =",
        "onload=",
        "onmouseover=",
        "onfocus=",
        "onclick=",
        "ontoggle=",
        "alert(",
        "prompt(",
        "confirm(",
        "document.cookie",
        "document.domain",
        "fromcharcode",
        "innerhtml",
        "srcdoc=",
        "<svg",
        "<iframe",
        "<img",
        "<body",
        "<object",
        "<embed",
        "<math",
        "expression(",
        "eval(",
    ),
    "sqli": (
        "union select",
        "union all select",
        "or 1=1",
        "or '1'='1",
        "' or '",
        '" or "',
        "' or 1",
        "sleep(",
        "benchmark(",
        "information_schema",
        "drop table",
        "insert into",
        "delete from",
        "update set",
        "--",
        "/*",
        "*/",
        "waitfor delay",
        "pg_sleep",
        "extractvalue(",
        "updatexml(",
        "load_file(",
        "into outfile",
        "into dumpfile",
        "xp_cmdshell",
        "having 1=1",
        "group by",
        "order by",
        "select *",
        "select count",
        "concat(",
        "char(",
        "0x27",
    ),
    "php_rce": (
        "php://",
        "expect://",
        "data://",
        "phar://",
        "zip://",
        "eval(",
        "assert(",
        "system(",
        "shell_exec",
        "passthru(",
        "popen(",
        "proc_open",
        "phpinfo(",
        "base64_decode",
        "gzinflate",
        "gzuncompress",
        "str_rot13",
        "preg_replace",
        "create_function",
        "call_user_func",
        "file_get_contents",
        "file_put_contents",
        "fopen(",
        "cmd.exe",
        "powershell",
        "/bin/sh",
        "/bin/bash",
        "wget ",
        "curl ",
        "nc -e",
        "chmod +x",
        "../",
        "..\\",
        "/etc/passwd",
        "/etc/shadow",
        "/proc/self",
        "boot.ini",
        "win.ini",
        "<?php",
        "<?=",
        "c99",
        "r57",
        "b374k",
        "wso ",
        "webshell",
        "phpshell",
    ),
    "scanner": (
        "/wp-admin",
        "/wp-login",
        "/xmlrpc.php",
        "/phpmyadmin",
        "/pma/",
        "/.env",
        "/.git",
        "/.svn",
        "/.aws",
        "/.ssh",
        "/server-status",
        "/server-info",
        "/actuator",
        "/solr/",
        "/console",
        "/cgi-bin/",
        "/vendor/",
        "/backup",
        "/config.php",
        "/db.php",
        "/manager/html",
        "/jmx-console",
        "/axis2/",
        "/owa/",
        "/autodiscover",
        "/ecm/",
        "/nacos/",
        "/druid/",
        "/trace.axd",
        "/web.config",
        "/.ds_store",
        "/dockerfile",
        "/docker-compose",
        "/kubernetes",
        "/swagger-ui",
        "/v2/api-docs",
        "/graphql",
        "/admin/",
        "/login.php",
    ),
    "cred_stuffing": (
        "/login",
        "/signin",
        "/sign-in",
        "/auth",
        "/session",
        "/token",
        "/oauth",
        "username=",
        "user=",
        "email=",
        "password=",
        "passwd=",
        "pwd=",
        "otp=",
        "credential",
    ),
}

# Tokens that are strong typology signals, kept as individual dense features.
TOP_KEYWORDS: tuple[str, ...] = (
    "<script>",
    "<script",
    "</script>",
    "union select",
    "or 1=1",
    "sleep(",
    "information_schema",
    "select *",
    "../",
    "..\\",
    "php://",
    "expect://",
    "data://",
    "eval(",
    "base64_decode",
    "shell_exec",
    "system(",
    "passthru(",
    "cmd.exe",
    "powershell",
    "/etc/passwd",
    "<?php",
    "document.cookie",
    "javascript:",
    "onerror",
    "alert(",
    "/.env",
    "/.git",
    "/wp-admin",
    "/wp-login",
    "/phpmyadmin",
    "/server-status",
    "/actuator",
    "/xmlrpc",
    "password=",
    "/login",
)

SCANNER_PATH_TOKENS: tuple[str, ...] = (
    "/.env",
    "/.git",
    "/.svn",
    "/.aws",
    "/.ssh",
    "/.ds_store",
    "/wp-login",
    "/wp-admin",
    "/xmlrpc.php",
    "/phpmyadmin",
    "/pma/",
    "/server-status",
    "/server-info",
    "/actuator",
    "/solr/",
    "/manager/html",
    "/jmx-console",
    "/axis2/",
    "/cgi-bin/",
    "/vendor/",
    "/config.php",
    "/backup",
    "/db.sql",
    "/dump.sql",
    "/swagger-ui",
    "/v2/api-docs",
    "/graphql",
    "/console",
    "/admin/",
    "/trace.axd",
    "/web.config",
    "/docker-compose",
    "/dockerfile",
    "/.well-known/security.txt",
)

SENSITIVE_EXT_RE = re.compile(
    r"(?i)(?:^|/)(?:\.env(?:\.[a-z]+)?|\.git|\.svn|\.aws|\.ssh|\.ds_store|"
    r"web\.config|dockerfile|docker-compose\.ya?ml|backup|dump|db)\.?"
    r"(?:[a-z0-9_-]*)(?:\.(?:bak|old|save|swp|sql|zip|tar|gz|yml|yaml|json|txt|php|env))?$"
)

SCANNER_UA_MARKERS: tuple[str, ...] = (
    "sqlmap",
    "nikto",
    "nmap",
    "masscan",
    "zgrab",
    "nuclei",
    "dirbuster",
    "gobuster",
    "feroxbuster",
    "wfuzz",
    "ffuf",
    "hydra",
    "acunetix",
    "nessus",
    "openvas",
    "burp",
    "python-requests",
    "go-http-client",
    "curl/",
    "wget/",
    "libwww-perl",
    "python-urllib",
    "scrapy",
    "httpclient",
    "okhttp",
)

_SCANNER_UA_RE = re.compile("|".join(re.escape(x) for x in SCANNER_UA_MARKERS))

_SPECIAL_CHARS = set("<>'\"();=&%/\\\\.-_+:#{}[]|`$*!?@~^")
_HEX_RE = re.compile(r"\b[0-9a-fA-F]{16,}\b")
_B64_RE = re.compile(r"\b[A-Za-z0-9+/]{20,}={0,2}\b")
_WORD_RE = re.compile(r"[A-Za-z0-9_]+")


def _clamp_len(value: str, limit: int = 4000) -> str:
    if len(value) <= limit:
        return value
    return value[: limit // 2] + " " + value[-limit // 2 :]


def decode_layers(value: str, rounds: int = 3) -> str:
    """Percent-decode repeatedly, then unescape HTML entities.

    Attackers commonly double-encode payloads to slip past signature rules.
    Decoding is bounded so pathological inputs cannot cause quadratic work.
    """
    out = value or ""
    for _ in range(rounds):
        try:
            nxt = unquote_plus(out, errors="replace")
        except Exception:
            break
        if nxt == out:
            break
        out = nxt
    try:
        out = html.unescape(out)
    except Exception:
        pass
    return out


def shannon_entropy(value: str) -> float:
    if not value:
        return 0.0
    counts = Counter(value)
    total = float(len(value))
    ent = 0.0
    for count in counts.values():
        p = count / total
        ent -= p * math.log2(p)
    return ent


def _to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return "&".join(f"{k}={_to_text(v)}" for k, v in value.items())
    if isinstance(value, (list, tuple)):
        return "&".join(_to_text(v) for v in value)
    return str(value)


def build_text(
    method: str,
    path: str,
    query: str,
    body: str,
    headers: dict[str, str],
    content_type: str = "",
) -> str:
    """Normalized text blob used by the char n-gram TF-IDF vectorizer."""
    ua = headers.get("user-agent", "")
    referer = headers.get("referer", "")
    text = " ".join(
        [
            method.lower(),
            path.lower(),
            query.lower(),
            body.lower(),
            ua.lower(),
            referer.lower(),
            content_type.lower(),
        ]
    )
    return _clamp_len(text, 4000)


def keyword_counts(decoded_text: str) -> dict[str, int]:
    return {
        name: sum(decoded_text.count(token) for token in tokens)
        for name, tokens in KEYWORDS.items()
    }


def extract_features(request: dict[str, Any]) -> tuple[np.ndarray, str, list[str], dict[str, Any]]:
    """Turn a normalized request dict into a dense float32 vector.

    The returned metadata is safe to log: no cookie values or passwords are read.
    """
    method = str(request.get("method") or "GET").upper()
    path = _to_text(request.get("path"))
    query = _to_text(request.get("query"))
    body = _to_text(request.get("body"))
    headers = {str(k).lower(): _to_text(v) for k, v in (request.get("headers") or {}).items()}
    content_type = _to_text(request.get("content_type") or headers.get("content-type", ""))

    raw = " ".join([path, query, body, headers.get("user-agent", ""), headers.get("referer", "")])
    decoded = decode_layers(raw)
    text = build_text(method, path, query, body, headers, content_type)

    ua = headers.get("user-agent", "")
    referer = headers.get("referer", "")
    low_raw = raw.lower()
    low_text = decoded.lower()
    lengths = [len(path), len(query), len(body), len(ua), len(referer), len(decoded)]

    values: dict[str, float] = {}

    # Length features (log-scaled: raw lengths are heavy tailed).
    values["len_path"] = math.log1p(len(path))
    values["len_query"] = math.log1p(len(query))
    values["len_body"] = math.log1p(len(body))
    values["len_ua"] = math.log1p(len(ua))
    values["len_referer"] = math.log1p(len(referer))
    values["len_total"] = math.log1p(sum(lengths))

    # Character distribution.
    total = max(len(decoded), 1)
    values["ratio_special"] = sum(ch in _SPECIAL_CHARS for ch in decoded) / total
    values["ratio_alpha"] = sum(ch.isalpha() for ch in decoded) / total
    values["ratio_digit"] = sum(ch.isdigit() for ch in decoded) / total
    values["ratio_upper"] = sum(ch.isupper() for ch in decoded) / total
    values["ratio_nonascii"] = sum(ord(ch) > 127 for ch in decoded) / total
    values["ratio_space"] = sum(ch.isspace() for ch in decoded) / total
    values["entropy"] = shannon_entropy(decoded)
    values["entropy_path"] = shannon_entropy(path)

    # Character counts (capped: the tree split does not need exact large counts).
    for name, ch in (
        ("lt", "<"),
        ("gt", ">"),
        ("quote", "'"),
        ("dquote", '"'),
        ("paren", "("),
        ("semi", ";"),
        ("eq", "="),
        ("amp", "&"),
        ("pct", "%"),
        ("slash", "/"),
        ("backslash", "\\"),
        ("dot", "."),
        ("comma", ","),
        ("plus", "+"),
        ("hash", "#"),
        ("brace", "{"),
        ("bracket", "["),
        ("pipe", "|"),
        ("backtick", "`"),
        ("dollar", "$"),
        ("colon", ":"),
        ("dash", "-"),
        ("underscore", "_"),
        ("at", "@"),
        ("star", "*"),
        ("newline", "\n"),
    ):
        values[f"cnt_{name}"] = min(decoded.count(ch), 50)

    values["dotdot"] = min(low_text.count("../") + low_text.count("..\\"), 20)
    values["pct_encoded"] = min(low_raw.count("%"), 20)
    values["null_byte"] = 1.0 if ("%00" in low_raw or "\x00" in low_raw) else 0.0
    values["crlf"] = 1.0 if ("%0d" in low_raw or "%0a" in low_raw or "\r" in raw or "\n" in raw) else 0.0
    values["has_scheme"] = 1.0 if ("://" in low_raw) else 0.0

    # Path structure.
    low_path = path.lower()
    path_segments = [s for s in path.split("/") if s]
    values["path_depth"] = min(len(path_segments), 20)
    values["path_len_max_seg"] = math.log1p(max((len(s) for s in path_segments), default=0))
    values["path_has_ext"] = 1.0 if re.search(r"\.[A-Za-z0-9]{1,5}$", path.split("?")[0]) else 0.0
    values["path_is_root"] = 1.0 if path in ("", "/") else 0.0
    values["path_dot_segments"] = min(sum(s in (".", "..") for s in path_segments), 10)
    values["scanner_path_hits"] = min(sum(tok in low_path for tok in SCANNER_PATH_TOKENS), 10)
    values["sensitive_ext"] = 1.0 if SENSITIVE_EXT_RE.search(path) else 0.0
    values["hidden_path_segment"] = 1.0 if any(s.startswith(".") and s not in (".", "..") for s in path_segments) else 0.0

    # Query structure.
    params = [p for p in re.split(r"[&;]", query) if p]
    values["num_params"] = min(len(params), 20)
    values["param_max_len"] = math.log1p(max((len(p) for p in params), default=0))
    values["param_no_value"] = min(sum("=" not in p for p in params), 10)

    # Method flags.
    for m in ("GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "TRACE", "CONNECT"):
        values[f"method_{m.lower()}"] = 1.0 if method == m else 0.0
    values["method_other"] = 0.0 if method in {
        "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "TRACE", "CONNECT"
    } else 1.0
    values["has_body"] = 1.0 if body.strip() else 0.0

    # Lexical tokens.
    words = _WORD_RE.findall(decoded)
    values["num_words"] = min(len(words), 200)
    values["max_word_len"] = min(max((len(w) for w in words), default=0), 200)
    values["avg_word_len"] = (sum(len(w) for w in words) / len(words)) if words else 0.0
    values["hex_blob"] = 1.0 if _HEX_RE.search(decoded) else 0.0
    values["b64_blob"] = 1.0 if _B64_RE.search(decoded) else 0.0

    # Keyword groups + selected individual signatures.
    ki = keyword_counts(low_text)
    for name, count in ki.items():
        values[f"kw_{name}"] = min(count, 20)
    values["kw_total"] = min(sum(ki.values()), 50)

    for token in TOP_KEYWORDS:
        safe = re.sub(r"[^a-z0-9]+", "_", token).strip("_")
        values[f"sig_{safe}"] = 1.0 if token in low_text else 0.0

    # Header hygiene.
    values["ua_missing"] = 1.0 if not ua else 0.0
    values["ua_scanner"] = 1.0 if _SCANNER_UA_RE.search(ua.lower()) else 0.0
    values["referer_missing"] = 1.0 if not referer else 0.0
    values["referer_foreign"] = 1.0 if (
        referer and headers.get("host") and headers["host"].split(":")[0] not in referer
    ) else 0.0
    values["has_forwarded_for"] = 1.0 if "x-forwarded-for" in headers or "forwarded" in headers else 0.0

    # Response metadata: cookie flags only, never values.
    response = request.get("response") or {}
    status = response.get("status_code")
    try:
        status_val = float(status) if status is not None else 0.0
    except (TypeError, ValueError):
        status_val = 0.0
    values["status_code"] = status_val if 200 <= status_val <= 599 else 0.0
    values["status_4xx"] = 1.0 if 400 <= status_val < 500 else 0.0
    values["status_5xx"] = 1.0 if status_val >= 500 else 0.0
    flags = response.get("cookie_flags") or {}
    values["cookie_no_httponly"] = 1.0 if flags.get("httponly") is False else 0.0
    values["cookie_no_secure"] = 1.0 if flags.get("secure") is False else 0.0
    samesite = str(flags.get("samesite") or "").lower()
    values["cookie_samesite_none"] = 1.0 if samesite == "none" else 0.0
    values["cookie_samesite_missing"] = 1.0 if not samesite else 0.0
    values["cookie_no_flags_seen"] = 1.0 if flags.get("present") is False else 0.0
    resp_ct = str(response.get("content_type") or "").lower()
    values["resp_html"] = 1.0 if "html" in resp_ct else 0.0
    values["resp_json"] = 1.0 if "json" in resp_ct else 0.0

    # Session/behavior features (already pre-computed by the proxy).
    session = request.get("session") or {}
    ip_change = _num(session.get("ip_change_count_5min"), default=0.0)
    ua_change = _num(session.get("ua_change_count_5min"), default=0.0)
    request_rate = _num(session.get("request_rate"), default=0.0)
    asn_changed = 1.0 if _truthy(session.get("asn_changed")) else 0.0

    values["ip_change_count"] = min(ip_change, 100.0)
    values["ua_change_count"] = min(ua_change, 100.0)
    values["asn_changed"] = asn_changed
    values["request_rate"] = min(max(request_rate, 0.0), 10000.0)
    values["log_request_rate"] = math.log1p(max(request_rate, 0.0))
    values["log_ip_change"] = math.log1p(max(ip_change, 0.0))
    values["log_ua_change"] = math.log1p(max(ua_change, 0.0))
    values["ip_ua_ratio"] = (ip_change + 1.0) / (ua_change + 1.0)
    values["session_volatility"] = ip_change * 2.0 + ua_change * 1.5 + asn_changed * 3.0
    values["rate_x_volatility"] = math.log1p(max(request_rate, 0.0)) * values["session_volatility"]
    values["login_path"] = 1.0 if any(
        tok in path.lower() for tok in ("/login", "/signin", "/sign-in", "/auth", "/session", "/token")
    ) else 0.0


    names = list(values.keys())
    vector = np.asarray([values[n] for n in names], dtype=np.float32)

    info = {
        "method": method,
        "path": path,
        "num_params": int(values["num_params"]),
        "len_total": int(sum(lengths)),
        "entropy": round(float(values["entropy"]), 4),
        "keyword_hits": {k: int(v) for k, v in ki.items() if v},
        "ua_scanner": bool(values["ua_scanner"]),
        "session": {
            "ip_change_count_5min": ip_change,
            "ua_change_count_5min": ua_change,
            "asn_changed": bool(asn_changed),
            "request_rate": request_rate,
        },
        "cookie_flags": {
            "httponly": flags.get("httponly"),
            "secure": flags.get("secure"),
            "samesite": samesite or None,
        },
    }
    return vector, text, names, info


def session_vector(session: dict[str, Any]) -> np.ndarray:
    """Four-dimensional vector used by the Isolation Forest."""
    return np.asarray(
        [
            min(max(_num(session.get("ip_change_count_5min"), 0.0), 0.0), 1000.0),
            min(max(_num(session.get("ua_change_count_5min"), 0.0), 0.0), 1000.0),
            1.0 if _truthy(session.get("asn_changed")) else 0.0,
            min(max(_num(session.get("request_rate"), 0.0), 0.0), 100000.0),
        ],
        dtype=np.float32,
    )


SESSION_FEATURE_NAMES = [
    "ip_change_count_5min",
    "ua_change_count_5min",
    "asn_changed",
    "request_rate",
]


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def dense_feature_names(sample: np.ndarray | None = None) -> list[str]:
    """Feature names are produced by extract_features; this helper exists for tests."""
    if sample is None:
        raise ValueError("sample vector required")
    return [f"f{i}" for i in range(len(sample))]


def dedupe(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out
