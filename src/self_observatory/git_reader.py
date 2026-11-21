"""Read only approved Git objects, never the checkout or arbitrary user refs."""

from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from .schema import canonical_path, safe_asset_path

SHA_RE = re.compile(r"^[0-9a-f]{40}$")
DEFAULT_REF = "refs/remotes/origin/main"
FALLBACK_REF = "refs/heads/main"
SSH_REMOTE_RE = re.compile(r"^(?:ssh://)?[^@]+@([^:/]+)[:/](.+)$")


class GitError(RuntimeError):
    pass


def normalize_remote(url: str) -> str:
    cleaned = url.strip().rstrip("/")
    match = SSH_REMOTE_RE.match(cleaned)
    if match:
        host, path = match.group(1), match.group(2).lstrip("/")
        cleaned = f"https://{host}/{path}"
    if cleaned.endswith(".git"):
        cleaned = cleaned[:-4]
    return cleaned


def github_web_url(origin: str | None) -> str | None:
    if not origin:
        return None
    normalized = normalize_remote(origin)
    parsed = urlparse(normalized)
    if parsed.scheme in {"http", "https"} and parsed.hostname == "github.com":
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) >= 2:
            return f"https://github.com/{parts[0]}/{parts[1]}"
    return None


def repository_name(root: Path, origin: str | None) -> str:
    if origin:
        normalized = normalize_remote(origin)
        parsed = urlparse(normalized)
        path = parsed.path.strip("/")
        if parsed.scheme in {"http", "https"} and path:
            return path
    return root.resolve().name


def detect_default_ref(root: Path) -> str:
    for candidate in (DEFAULT_REF, FALLBACK_REF):
        result = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "--verify", f"{candidate}^{{commit}}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if result.returncode == 0:
            return candidate
    return DEFAULT_REF


@dataclass(frozen=True)
class Commit:
    sha: str
    tree: str
    parents: tuple[str, ...]
    committed_at: str
    subject: str


class GitReader:
    def __init__(self, root: Path, ref: str | None = None, *, expected_origin: str | None = None):
        self.root = root.resolve()
        resolved_ref = ref or detect_default_ref(self.root)
        if not re.fullmatch(r"refs/(?:remotes/origin|heads)/[A-Za-z0-9][A-Za-z0-9._/-]*", resolved_ref) or ".." in resolved_ref:
            raise GitError("invalid canonical ref")
        self.ref = resolved_ref
        try:
            self.origin_url: str | None = self._git("remote", "get-url", "origin").decode().strip() or None
        except GitError:
            self.origin_url = None
        pinned = expected_origin if expected_origin is not None else os.environ.get("SELF_OBSERVATORY_EXPECTED_ORIGIN")
        if pinned:
            if not self.origin_url or normalize_remote(self.origin_url) != normalize_remote(pinned):
                raise GitError("origin does not match SELF_OBSERVATORY_EXPECTED_ORIGIN")

    def _git(self, *args: str) -> bytes:
        try:
            return subprocess.run(["git", "-C", str(self.root), *args], check=True,
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout
        except subprocess.CalledProcessError as exc:
            raise GitError(f"Git operation failed: {args[0]}") from exc

    def resolve(self) -> str:
        sha = self._git("rev-parse", "--verify", f"{self.ref}^{{commit}}").decode().strip()
        if not SHA_RE.fullmatch(sha):
            raise GitError("invalid resolved commit")
        return sha

    def is_shallow(self) -> bool:
        return self._git("rev-parse", "--is-shallow-repository").strip() == b"true"

    def commits(self, head: str) -> list[Commit]:
        if not SHA_RE.fullmatch(head):
            raise GitError("invalid commit SHA")
        shas = self._git("rev-list", "--first-parent", "--reverse", head).decode().splitlines()
        result = []
        for sha in shas:
            fields = self._git("show", "-s", "--format=%T%n%P%n%cI%n%s", sha).decode().splitlines()
            # Pretty formats hide parents at a shallow boundary; the object does not.
            header = self._git("cat-file", "commit", sha).split(b"\n\n", 1)[0]
            parents = tuple(line[7:].decode("ascii") for line in header.splitlines() if line.startswith(b"parent "))
            utc_time = datetime.fromisoformat(fields[2]).astimezone(timezone.utc).isoformat()
            result.append(Commit(sha, fields[0], parents, utc_time, fields[3]))
        return result

    def changed_paths(self, commit: Commit) -> list[str]:
        """Compare to the actual first parent, or the empty tree for a true root.

        Call only when the first parent is available. Disabling rename detection
        retains both sides of moves, including moves across projection boundaries.
        """
        refs = (commit.parents[0], commit.sha) if commit.parents else ("--root", commit.sha)
        raw = self._git("diff-tree", "--no-commit-id", "--no-renames", "--name-only", "-r", "-z", *refs)
        return sorted(path.decode("utf-8", errors="replace") for path in raw.split(b"\0") if path)

    def tree(self, sha: str, *, assets: bool = False) -> dict[str, str]:
        if not SHA_RE.fullmatch(sha):
            raise GitError("invalid commit SHA")
        result = {}
        paths = ("assets",) if assets else ("memory", "playbooks", "decisions", "journals", "reviews", "media")
        raw = self._git("ls-tree", "-r", "-z", sha, "--", *paths)
        for item in raw.split(b"\0"):
            if not item:
                continue
            meta, path_bytes = item.split(b"\t", 1)
            mode, kind, blob = meta.decode("ascii").split()
            path = path_bytes.decode("utf-8")
            if mode not in {"100644", "100755"} or kind != "blob":
                continue
            if (safe_asset_path(path) if assets else canonical_path(path)):
                result[path] = blob
        return result

    def blob(self, sha: str) -> bytes:
        if not SHA_RE.fullmatch(sha):
            raise GitError("invalid blob SHA")
        return self._git("cat-file", "blob", sha)
