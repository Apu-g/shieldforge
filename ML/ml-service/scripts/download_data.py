"""Fetch the public datasets used for training.

All sources are optional: scripts/train.py falls back to the built-in generated
corpus when a file is missing. Run this once before a full training run.

    python scripts/download_data.py
    python scripts/download_data.py --force
"""

from __future__ import annotations

import argparse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

PAYLOAD_FILES = {
    "xss.md": "https://raw.githubusercontent.com/swisskyrepo/PayloadsAllTheThings/master/XSS%20Injection/README.md",
    "sqli.md": "https://raw.githubusercontent.com/swisskyrepo/PayloadsAllTheThings/master/SQL%20Injection/README.md",
    "cmd.md": "https://raw.githubusercontent.com/swisskyrepo/PayloadsAllTheThings/master/Command%20Injection/README.md",
    "traversal.md": "https://raw.githubusercontent.com/swisskyrepo/PayloadsAllTheThings/master/Directory%20Traversal/README.md",
    "lfi.md": "https://raw.githubusercontent.com/swisskyrepo/PayloadsAllTheThings/master/File%20Inclusion/README.md",
}

CSIC_FILES = {
    "normalTrafficTraining.txt": "https://raw.githubusercontent.com/Monkey-D-Groot/Machine-Learning-on-CSIC-2010/master/normalTrafficTraining.txt",
    "anomalousTrafficTest.txt": "https://raw.githubusercontent.com/Monkey-D-Groot/Machine-Learning-on-CSIC-2010/master/anomalousTrafficTest.txt",
}

# CICIDS2017 is flow-level data. It is intentionally NOT downloaded by default
# (multi-GB, Kaggle login). See data/README.md for the optional adapter.
CICIDS_NOTE = "CICIDS2017 is optional and not auto-downloaded; see data/README.md."


def fetch(url: str, dest: Path, force: bool = False) -> None:
    if dest.exists() and dest.stat().st_size > 0 and not force:
        print(f"skip   {dest.relative_to(ROOT)} ({dest.stat().st_size / 1024:.0f} KB)")
        return
    print(f"fetch  {url}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "shieldforge-ml/1.0"})
    with urllib.request.urlopen(req, timeout=180) as response:
        data = response.read()
    dest.write_bytes(data)
    print(f"wrote  {dest.relative_to(ROOT)} ({len(data) / 1024:.0f} KB)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    for name, url in PAYLOAD_FILES.items():
        try:
            fetch(url, DATA / "payloads" / name, args.force)
        except Exception as exc:  # network is optional
            print(f"WARN could not fetch {name}: {exc}")

    for name, url in CSIC_FILES.items():
        try:
            fetch(url, DATA / "csic2010" / name, args.force)
        except Exception as exc:
            print(f"WARN could not fetch {name}: {exc}")

    print(CICIDS_NOTE)


if __name__ == "__main__":
    main()
