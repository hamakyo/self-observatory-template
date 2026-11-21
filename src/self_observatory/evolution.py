"""Versioned path classification, independent of note parsing and inferred meaning."""

from .schema import TARGETS, canonical_path

OBSERVATORY_DIRECTORIES = frozenset(("src", "apps", "scripts", "docs", "design", "tests", ".github", "templates"))
OBSERVATORY_FILES = frozenset((
    "SCHEMA.md", "DATA_POLICY.md", "AGENTS.md", "README.md", "README.ja.md",
    "pyproject.toml", "package.json", "uv.lock", "pnpm-lock.yaml", "pnpm-workspace.yaml",
    "playwright.config.ts", ".gitignore", ".prettierignore",
))


def classify_paths(paths: list[str]) -> tuple[list[str], list[str]]:
    """Return changed self-model and observatory paths, not psychological claims.

    Canonical-path eligibility does not require valid frontmatter. README files
    describe the system; assets and unrecognized paths remain unclassified.
    Update CLASSIFICATION_VERSION whenever these rules change.
    """
    self_paths = sorted(path for path in paths if canonical_path(path))
    observatory_paths = sorted(path for path in paths if (
        path.split("/", 1)[0] in OBSERVATORY_DIRECTORIES
        or path in OBSERVATORY_FILES
        or (path.split("/", 1)[0] in TARGETS and path.endswith("/README.md"))
    ))
    return self_paths, observatory_paths
