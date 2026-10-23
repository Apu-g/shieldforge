"""Configuration, all overridable through environment variables."""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_ARTIFACT = BASE_DIR / "artifacts" / "model.joblib"

MODEL_PATH = Path(os.getenv("MODEL_PATH", str(DEFAULT_ARTIFACT)))
MODEL_VERSION = os.getenv("MODEL_VERSION", "shieldforge-ml-1.0.0")

# Policy bands (a per-origin policy can override these later at the proxy).
LOG_BELOW = float(os.getenv("LOG_BELOW", "0.60"))
ALERT_BELOW = float(os.getenv("ALERT_BELOW", "0.90"))

# Keep responses small; the proxy only needs the typed decision.
MAX_BODY_CHARS = int(os.getenv("MAX_BODY_CHARS", "4000"))

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
