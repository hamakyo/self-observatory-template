"""Explicit, synthetic API for browser development/tests. Never reads owner notes."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path

import uvicorn

from self_observatory.api import create_app
from self_observatory.index import rebuild
from self_observatory.capture import import_captures


def make_fixture(root: Path) -> None:
    def git(*args: str, day: int = 1):
        env = {**os.environ, "GIT_AUTHOR_DATE": f"2026-01-{day:02d}T00:00:00Z", "GIT_COMMITTER_DATE": f"2026-01-{day:02d}T00:00:00Z"}
        return subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True, text=True, env=env).stdout.strip()

    def note(filename: str, note_id: str, title: str, body: str, extra: str = ""):
        (folder / filename).write_text(f"---\nid: {note_id}\ntype: episode\nstatus: active\ncreated: 2026-01-01\nupdated: 2026-01-01\ndomains: [learning]\n{extra}---\n# {title}\n\n{body}\n")

    def commit(subject: str, day: int):
        git("add", ".")
        git("commit", "-m", subject, day=day)

    git("init", "-b", "main")
    git("config", "user.name", "Synthetic fixture")
    git("config", "user.email", "fixture")
    git("remote", "add", "origin", "https://github.com/example/self-observatory.git")
    git("commit", "--allow-empty", "-m", "架空データ: 記録前")
    folder = root / "memory" / "episodes"
    folder.mkdir(parents=True)
    note("first.md", "example-first", "小さな観察を残す", "架空の最初の本文。", "review:\n  owner_confirmed: true\n  confirmed_at: 2026-01-01\n  review_after: 2026-01-03\n")
    note("transient.md", "example-transient", "架空の一時的な記録", "架空の削除前の本文。")
    commit("架空データ: 最初の記録", 2)
    git("mv", "memory/episodes/first.md", "memory/episodes/renamed.md")
    note("second.md", "example-second", "観察から手順を考える", "架空の二つ目の本文。", "derived_from: [example-first]\nreview:\n  owner_confirmed: false\n")
    note("missing.md", "example-missing-relation", "参照を確認する", "架空の欠落参照。", "related: [example-absent]\n")
    for index in range(24):
        note(f"sample-{index:02d}.md", f"example-sample-{index:02d}", f"架空の記録 {index + 1:02d}", f"架空の観察 {index + 1}。", "source:\n  kind: notion\n  ref: synthetic-fixture\n")
    practice = folder / "sample-01.md"
    practice.write_text(practice.read_text().replace("type: episode", "type: playbook\nmaturity: observed"))
    note("unsafe.md", "example-unsafe", "外部コンテンツの確認", '<script>window.unsafe=true</script>\n\n<iframe src="https://example.invalid/embed"></iframe>\n\n![外部画像](https://example.invalid/image.png)\n\n[リンク](javascript:alert(1))\n\n[公開リンク](https://example.invalid/)')
    transient = folder / "transient.md"
    transient.write_text(transient.read_text().replace("status: active", "status: superseded\nsuperseded_by: [example-second]"))
    commit("架空データ: 改名・由来・未確認の追加", 3)
    practice_sha = git("rev-parse", "HEAD")
    (root / "SCHEMA.md").write_text("# Synthetic observation schema\n", encoding="utf-8")
    commit("架空データ: 観測スキーマの更新", 4)
    note("renamed.md", "example-first", "小さな観察を残す", "架空の更新後の本文。", "review:\n  owner_confirmed: true\n  confirmed_at: 2026-01-01\n  review_after: 2026-01-03\n")
    p = folder / "renamed.md"
    p.write_text(p.read_text().replace("domains: [learning]", 'domains: [learning]\ntemporal:\n  experienced: {precision: year, value: "2018"}\n  noticed: {precision: month, value: "2026-01"}\n  adopted: {precision: unknown}'))
    p = folder / "second.md"
    p.write_text(p.read_text().replace("domains: [learning]", f'domains: [learning]\napplication:\n  targets:\n    - note_id: example-sample-01\n      at: "{practice_sha}"\n  outcome: failure\ntemporal:\n  experienced: {{precision: date, value: "2026-01-04"}}'))
    practice.write_text(practice.read_text().replace("maturity: observed", "maturity: tested"))
    p = folder / "sample-00.md"
    p.write_text(p.read_text().replace("type: episode", "type: review").replace("domains: [learning]", '''domains: [learning]
review: {owner_confirmed: true, confirmed_at: 2026-01-05}
consolidation:
  proposal_id: proposal-fixture
  decision: accept
  capture_refs: [github-issue-101, github-issue-102]
  target_ids: [example-first]
capture_outcomes:
  - {ref: github-issue-101, outcome: canonicalized, note_ids: [example-first]}
  - {ref: github-issue-102, outcome: deferred, note_ids: []}
maturity_changes:
  - {note_id: example-sample-01, from: observed, to: tested, evidence_ids: [example-second]}'''))
    transient.unlink()
    (root / "SCHEMA.md").write_text("# Synthetic observation schema v2\n", encoding="utf-8")
    commit("架空データ: 本文と観測スキーマの更新", 5)
    git("update-ref", "refs/remotes/origin/main", git("rev-parse", "HEAD"))
    rebuild(root)
    local = root / "_local"
    local.mkdir(exist_ok=True)
    handoff = local / "fixture-handoff.json"
    handoff.write_text(json.dumps({"repository_url": "https://github.com/example/self-observatory.git",
        "fetched_at": "2026-01-06T00:00:00Z", "complete": True,
        "selected_refs": ["github-issue-101", "github-issue-102", "github-issue-103"],
        "items": [{"ref": f"github-issue-{number}", "title": f"架空の気づき {number}", "text": "架空の安全な要約。",
                   "state": "closed", "created_at": "2026-01-04T00:00:00Z", "updated_at": "2026-01-05T00:00:00Z",
                   "related_ids": ["example-first"], "tags": []} for number in (101, 102, 103)]}))
    import_captures(root, handoff, True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8017)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="self-observatory-fixture-") as directory:
        root = Path(directory)
        make_fixture(root)
        app = create_app(root, Path("apps/observatory/dist"))
        print("Synthetic fixture only. No owner notes are loaded.", flush=True)
        uvicorn.run(app, host="127.0.0.1", port=args.port, access_log=False)


if __name__ == "__main__":
    main()
