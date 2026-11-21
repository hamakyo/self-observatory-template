"""Build a larger synthetic history, measure its API, optionally serve its UI."""

from __future__ import annotations

import argparse
import json
import os
import platform
import statistics
import subprocess
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import uvicorn
from fastapi.testclient import TestClient

from self_observatory.api import create_app
from self_observatory.index import rebuild


def make_large_fixture(root: Path, count: int = 120, size: int = 240):
    def git(*args, tick=0):
        date = (datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=tick)).isoformat()
        env = {**os.environ, "GIT_AUTHOR_DATE": date, "GIT_COMMITTER_DATE": date}
        return subprocess.run(["git", "-C", str(root), *args], env=env, check=True, capture_output=True, text=True).stdout.strip()

    git("init", "-b", "main")
    git("config", "user.name", "Synthetic fixture")
    git("config", "user.email", "fixture")
    git("remote", "add", "origin", "https://github.com/example/self-observatory.git")
    folder = root / "memory/episodes"
    folder.mkdir(parents=True)

    def write(index, tick):
        related = [f"example-large-{n:04d}" for n in range(max(0, index - 3), index)]
        (folder / f"{index:04d}.md").write_text(
            f"---\nid: example-large-{index:04d}\ntype: episode\nstatus: {'superseded' if tick and tick % 15 == 0 else 'active'}\n"
            f"created: 2026-01-01\nupdated: 2026-01-01\nrelated: {json.dumps(related)}\n---\n"
            f"# Synthetic note {index:04d}\n\nSynthetic revision {tick}.\n", encoding="utf-8")

    for index in range(size):
        write(index, 0)
    first = None
    for tick in range(count):
        if tick % 7 == 0:
            (root / "SCHEMA.md").write_text(f"# Synthetic observatory revision {tick}\n", encoding="utf-8")
        else:
            write(tick % size, tick)
        if tick and tick % 20 == 0:
            (folder / "0000.md").unlink(missing_ok=True)
        elif tick % 20 == 1:
            write(0, tick)
        git("add", ".")
        git("commit", "-m", f"Synthetic snapshot {tick:04d}", tick=tick)
        if first is None:
            first = git("rev-parse", "HEAD")
    git("update-ref", "refs/remotes/origin/main", git("rev-parse", "HEAD"))
    return first


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serve", action="store_true")
    parser.add_argument("--port", type=int, default=8018)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="self-time-volume-benchmark-") as directory:
        root = Path(directory)
        first = make_large_fixture(root)
        start = time.perf_counter()
        result = rebuild(root)
        build_seconds = time.perf_counter() - start
        app = create_app(root, Path("apps/observatory/dist"))
        client = TestClient(app)
        timings = []
        response = None
        for _ in range(20):
            start = time.perf_counter()
            response = client.get("/api/time-volume", params={"from": first})
            response.raise_for_status()
            timings.append((time.perf_counter() - start) * 1000)
        data = response.json()
        assert data["coverage"]["returned_snapshots"] == 24
        assert data["coverage"]["returned_notes"] == 60
        print(json.dumps({"source": "synthetic-only", "platform": platform.system(), "snapshots": result["snapshots"],
              "note_ids": 240, "head_sha": result["commit_sha"], "index_seconds": round(build_seconds, 2), "api_samples": len(timings),
              "api_median_ms": round(statistics.median(timings), 2), "api_p95_ms": round(sorted(timings)[18], 2),
              "response_bytes": len(response.content), "coverage": data["coverage"],
              "points": sum(len(s["points"]) for s in data["slices"])}), flush=True)
        if args.serve:
            uvicorn.run(app, host="127.0.0.1", port=args.port, access_log=False)


if __name__ == "__main__":
    main()
