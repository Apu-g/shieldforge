"""FastAPI entrypoint for the ShieldForge ML detection engine.

Run locally:
    uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import CORS_ORIGINS, LOG_BELOW, ALERT_BELOW, MODEL_PATH, MODEL_VERSION
from .decision import decide
from .model import Detector
from .schemas import ClassifyRequest, ClassifyResponse, HealthResponse, normalize_request

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("shieldforge.api")

STARTED_AT = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    started = time.perf_counter()
    app.state.detector = Detector(MODEL_PATH, MODEL_VERSION)
    app.state.started_at = STARTED_AT
    log.info("Detector ready in %.0f ms (loaded=%s)", (time.perf_counter() - started) * 1000, app.state.detector.loaded)
    yield


app = FastAPI(
    title="ShieldForge ML Detection Engine",
    description=(
        "Standalone typed decision layer for the ShieldForge proxy. "
        "One endpoint classifies HTTP request features into an attack class, "
        "a calibrated confidence, a 1-5 risk score and a recommended action."
    ),
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse, tags=["ops"])
def health(request: Request) -> HealthResponse:
    detector: Detector = request.app.state.detector
    return HealthResponse(
        status="ok",
        model_loaded=bool(detector.loaded),
        model_version=detector.version,
        uptime_s=round(time.time() - getattr(request.app.state, "started_at", STARTED_AT), 3),
    )


@app.get("/", tags=["ops"])
def root() -> dict:
    return {
        "service": "shieldforge-ml",
        "version": __version__,
        "endpoints": {"classify": "POST /classify", "health": "GET /health", "docs": "GET /docs"},
        "contract": "CONTRACT.md",
    }


@app.post("/classify", response_model=ClassifyResponse, tags=["detection"])
def classify(payload: ClassifyRequest, request: Request) -> ClassifyResponse:
    """Classify one HTTP request. Target latency is < 300 ms (usually single-digit ms)."""
    t0 = time.perf_counter()
    detector: Detector = request.app.state.detector

    normalized = normalize_request(payload.model_dump(exclude_none=True))
    probabilities, anomaly_score, info = detector.predict(normalized)

    decision = decide(
        probabilities,
        anomaly_score,
        normalized.get("session") or info.get("session") or {},
        info,
        log_below=LOG_BELOW,
        alert_below=ALERT_BELOW,
    )
    latency_ms = (time.perf_counter() - t0) * 1000.0

    log.info(
        "classify origin=%s class=%s conf=%.3f risk=%d action=%s anomaly=%.3f latency=%.1fms",
        normalized.get("origin_id") or "-",
        decision["attack_class"],
        decision["confidence"],
        decision["risk_score"],
        decision["action_recommended"],
        decision["anomaly_score"],
        latency_ms,
    )

    return ClassifyResponse(
        **decision,
        model_version=detector.version,
        latency_ms=round(latency_ms, 2),
    )


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )
