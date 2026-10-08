#!/usr/bin/env python3
"""Is a newer motion-film release out?  python3 <skill>/scripts/update_check.py [--json]

The skill never updates itself. At most once a week this asks GitHub for the tag of the latest release (short timeout,
no data about films or the machine) and caches the answer in $MOTION_FILM_HOME/update-check.json, so the notice shows on
every use while the network is touched weekly. Prints one line when an update exists, nothing otherwise; always exits 0.
MOTION_FILM_NO_UPDATE_CHECK=1 turns it off. Standard library only: it runs before the toolchain exists.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

REPO = "tonyprots/motion-film-skill"
RELEASES_URL = f"https://api.github.com/repos/{REPO}/releases/latest"
NOTES_URL = f"https://github.com/{REPO}/releases"
INTERVAL_SECONDS = 7 * 24 * 3600
TIMEOUT_SECONDS = 3.0
SKILL_DIR = Path(__file__).resolve().parents[1]


def state_path() -> Path:
    return Path(os.environ.get("MOTION_FILM_HOME") or Path.home() / ".cache/motion-film").expanduser() / "update-check.json"


def disabled() -> bool:
    return os.environ.get("MOTION_FILM_NO_UPDATE_CHECK", "") not in ("", "0")


def parse_version(text: str) -> tuple[int, ...] | None:
    match = re.fullmatch(r"v?(\d+(?:\.\d+)*)", text.strip())
    return tuple(int(part) for part in match.group(1).split(".")) if match else None


def installed_version(skill_dir: Path = SKILL_DIR) -> str | None:
    try:
        text = (skill_dir / "VERSION").read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return text if parse_version(text) else None


def _read_state(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def fetch_latest(timeout: float = TIMEOUT_SECONDS) -> str | None:
    request = urllib.request.Request(
        RELEASES_URL,
        headers={"Accept": "application/vnd.github+json", "User-Agent": f"motion-film/{installed_version() or '?'}"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed address
        tag = json.load(response).get("tag_name")
    return str(tag) if tag and parse_version(str(tag)) else None


def due(path: Path, *, now: float | None = None) -> bool:
    checked = _read_state(path).get("checked_at")
    current = time.time() if now is None else now
    return not isinstance(checked, (int, float)) or current - checked >= INTERVAL_SECONDS


def refresh(path: Path, *, fetch=fetch_latest, now: float | None = None) -> None:
    """Ask GitHub and store the answer. Any failure is silent and still waits a week: the film matters more."""
    try:
        latest = fetch()
    except Exception:  # noqa: BLE001 - offline, rate-limited, GitHub down
        latest = None
    state = {"checked_at": time.time() if now is None else now, "latest": latest or _read_state(path).get("latest")}
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(state), encoding="utf-8")
    except OSError:
        pass


def update_hint(latest: str, skill_dir: Path = SKILL_DIR) -> str:
    tag = f"v{latest}"
    if (skill_dir / ".git").exists():
        return f"git -C {skill_dir} fetch --depth 1 origin tag {tag} && git -C {skill_dir} checkout {tag}"
    return f"move {skill_dir} aside, then git clone --branch {tag} --depth 1 https://github.com/{REPO} {skill_dir}"


def available(path: Path, skill_dir: Path = SKILL_DIR) -> dict | None:
    """The newer release from the last cached answer, without the network."""
    installed = installed_version(skill_dir)
    latest = _read_state(path).get("latest")
    found = parse_version(str(latest)) if latest else None
    if not installed or not found or found <= parse_version(installed):
        return None
    latest = str(latest).lstrip("v")
    return {"installed": installed, "latest": latest, "how": update_hint(latest, skill_dir), "notes": NOTES_URL}


def check(path: Path | None = None, *, fetch=fetch_latest, now: float | None = None) -> dict | None:
    if disabled() or not installed_version():
        return None   # a working copy without VERSION is the source, not an install
    path = path or state_path()
    if due(path, now=now):
        refresh(path, fetch=fetch, now=now)
    return available(path)


def main(argv: list[str]) -> int:
    newer = check()
    if "--json" in argv:
        print(json.dumps(newer or {}))
    elif newer:
        print(f"motion-film {newer['latest']} is out (installed {newer['installed']}). "
              f"Update: {newer['how']}. What's new: {newer['notes']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
