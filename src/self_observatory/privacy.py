"""Local, advisory privacy screening and Git-blob-bound owner review.

No source text, excerpts, filenames, or matched values are emitted in reports.
This module never rewrites a source or candidate file.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
import subprocess
import warnings
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree

from PIL import Image, UnidentifiedImageError
from pypdf import PdfReader

from .schema import canonical_path, safe_asset_path

CLASSES = frozenset({"PUBLIC", "SELF_PRIVATE", "SELF_HIGH_SENSITIVITY", "THIRD_PARTY_PERSONAL",
                     "EMPLOYER_CONFIDENTIAL", "CREDENTIAL"})
TEXT_EXTENSIONS = frozenset({".txt", ".md", ".csv", ".json", ".yaml", ".yml"})
IMAGE_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"})
MAX_BYTES = 20 * 1024 * 1024
MAX_DECODED_PIXELS = 30_000_000
APPROVAL_SCHEMA_VERSION = 2
REASONS = {
    "credential": "Remove the credential entirely; rotate it if exposed.",
    "direct_contact": "Remove or generalize direct contact details.",
    "personal_identifier": "Replace identifiers with a role or broad context.",
    "high_sensitivity": "Keep only an abstracted lesson, not the underlying record.",
    "work_confidential": "Reconstruct a generic lesson without work source material.",
    "private_communication": "Paraphrase the lesson without quoting private messages.",
    "indirect_reidentification": "Remove enough combined details that a person or event cannot be singled out.",
    "document_embedded_media": "Inspect and sanitize every embedded image or object.",
    "document_metadata": "Remove author, editor, application and other document metadata.",
    "document_no_text": "Inspect the document visually; text extraction was incomplete.",
    "media_visual_unknown": "Inspect all visible content, including faces and internal UI.",
    "media_metadata": "Remove metadata from the derivative before review.",
    "media_multiple_frames": "Inspect every frame or make a single sanitized derivative.",
    "unsupported_format": "Convert to a supported sanitized derivative and inspect it.",
}

PATTERNS = {
    "credential": [
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
        re.compile(r"(?i)\b(?:password|passwd|api[_-]?key|access[_-]?token|secret)\s*[:=]\s*['\"]?[^\s'\"]{8,}"),
        re.compile(r"\b(?:ghp_|github_pat_|sk-proj-|AKIA)[A-Za-z0-9_\-]{12,}"),
    ],
    "direct_contact": [
        re.compile(r"(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
        re.compile(r"(?<!\d)0[789]0[- ]?\d{4}[- ]?\d{4}(?!\d)"),
    ],
    "personal_identifier": [
        re.compile(r"(?<!\d)\d{12}(?!\d)"),
        re.compile(r"(?i)\b(?:passport|マイナンバー|運転免許証|住所|address)\b"),
    ],
    "high_sensitivity": [re.compile(r"(?i)\b(?:diagnosis|medical record|bank account|病名|診断書|口座番号|身分証)\b")],
    "work_confidential": [re.compile(r"(?i)(?:社外秘|機密資料|顧客名簿|社内限定|内部設計|customer list|internal only|confidential pricing|non-public architecture)")],
    "private_communication": [re.compile(r"(?i)(?:private message|direct message|DMの原文|社内チャット|非公開の会話)")],
}
QUASI = {
    "date": re.compile(r"\b\d{4}[-/年]\d{1,2}(?:[-/月]\d{1,2})?日?\b"),
    "place": re.compile(r"(?:東京都|大阪府|北海道|[一-龥]{2,5}[県市区町村]|\b[A-Z][a-z]+ (?:City|County)\b)"),
    "role": re.compile(r"(?i)(?:上司|同僚|部下|取引先|顧客|教師|医師|manager|coworker|vendor|customer)"),
    "organization": re.compile(r"(?:株式会社|有限会社|学校|病院|部署|事業部|\b(?:Inc\.|Ltd\.|LLC)\b)"),
    "age": re.compile(r"(?:\b\d{2}歳\b|\baged? \d{2}\b)"),
}


def _sha(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _staged_oid(root: Path, target: str) -> str | None:
    stage = subprocess.check_output(["git", "ls-files", "--stage", "-z", "--", target], cwd=root).split(b"\0")
    entries = [entry for entry in stage if entry]
    header, separator, staged_path = entries[0].partition(b"\t") if len(entries) == 1 else (b"", b"", b"")
    fields = header.split()
    if (not separator or staged_path != os.fsencode(target) or len(fields) != 3
            or fields[0] != b"100644" or fields[2] != b"0"
            or not re.fullmatch(rb"[0-9a-f]{40}|[0-9a-f]{64}", fields[1])):
        return None
    return fields[1].decode("ascii")


def _review_versions(root: Path, *, staged_policy: bool = False) -> dict:
    policy = root.resolve() / "DATA_POLICY.md"
    if policy.is_symlink() or not policy.is_file():
        raise ValueError("repository data policy is unavailable")
    if staged_policy:
        policy_oid = _staged_oid(root, "DATA_POLICY.md")
        if policy_oid is None:
            raise ValueError("staged data policy is unavailable") from None
    else:
        policy_oid = _git_blob_oid(root, "DATA_POLICY.md", policy.read_bytes())
    classifier_bytes = Path(__file__).read_bytes()
    classifier_oid = (_staged_oid(root, "src/self_observatory/privacy.py") if staged_policy else
                      _git_blob_oid(root, "src/self_observatory/privacy.py", classifier_bytes))
    if classifier_oid is None:
        raise ValueError("staged privacy classifier is unavailable")
    return {"approval_schema_version": APPROVAL_SCHEMA_VERSION,
            "policy_blob_oid": policy_oid,
            "classifier_blob_oid": classifier_oid,
            "classifier_sha256": _sha(classifier_bytes)}


def _git_blob_oid(root: Path, target: str, content: bytes) -> str:
    """Hash the exact bytes Git would store at target, including clean filters."""
    result = subprocess.run(["git", "hash-object", "--stdin", f"--path={target}"], cwd=root,
                            input=content, capture_output=True)
    oid = result.stdout.strip()
    if result.returncode or not re.fullmatch(rb"[0-9a-f]{40}|[0-9a-f]{64}", oid):
        raise ValueError("cannot compute Git blob for candidate")
    return oid.decode("ascii")


def _inside(path: Path, parent: Path) -> bool:
    return path != parent and parent in path.parents


def _read_local(root: Path, path: Path, area: str) -> bytes:
    root = root.resolve()
    allowed = (root / area).resolve()
    if not _inside(allowed, root):
        raise ValueError("ignored local area must remain inside the repository")
    supplied = path if path.is_absolute() else root / path
    if supplied.is_symlink() or not _inside(supplied.resolve(), allowed) or not supplied.is_file():
        raise ValueError("input must be a regular file in the expected ignored local area")
    if supplied.stat().st_size > MAX_BYTES:
        raise ValueError("input exceeds the local privacy review size limit")
    return supplied.read_bytes()


def _document_text(content: bytes, suffix: str) -> tuple[str, set[str]]:
    reasons: set[str] = set()
    if suffix == ".pdf":
        try:
            reader = PdfReader(io.BytesIO(content), strict=True)
            if reader.is_encrypted or not reader.pages:
                raise ValueError
            pages = []
            for page in reader.pages:
                pages.append(page.extract_text() or "")
                if "/XObject" in page.get("/Resources", {}):
                    reasons.add("document_embedded_media")
                if page.get("/Annots"):
                    reasons.add("document_embedded_media")
            if reader.attachments:
                reasons.add("document_embedded_media")
            if reader.metadata:
                reasons.add("document_metadata")
            extracted = "\n".join(pages)
        except Exception:  # malformed/encrypted/unsupported PDF stays in quarantine
            return "", {"document_no_text"}
    else:
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                names = archive.namelist()
                if not "word/document.xml" in names or len(names) > 1000:
                    raise ValueError
                if any(name.startswith("word/media/") or name.startswith("word/embeddings/") for name in names):
                    reasons.add("document_embedded_media")
                if any(name.startswith("docProps/") for name in names):
                    reasons.add("document_metadata")
                if any("comments" in name or "people" in name for name in names):
                    reasons.add("document_embedded_media")
                parts = []
                total_xml = 0
                for name in names:
                    if name.startswith("word/") and name.endswith(".xml") and not name.startswith("word/theme/"):
                        total_xml += archive.getinfo(name).file_size
                        if total_xml > MAX_BYTES:
                            raise ValueError
                        node = ElementTree.fromstring(archive.read(name))
                        parts.extend(n.text for n in node.iter() if n.tag.endswith("}t") and n.text)
                extracted = "\n".join(parts)
        except (ValueError, OSError, zipfile.BadZipFile, ElementTree.ParseError):
            return "", {"document_no_text"}
    if not extracted.strip():
        reasons.add("document_no_text")
    return extracted, reasons


def classify(content: bytes, suffix: str) -> dict:
    """Return codes only. A clean result is never proof that content is safe."""
    suffix = suffix.lower()
    reasons: set[str] = set()
    text = ""
    medium = "text"
    if suffix in TEXT_EXTENSIONS:
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            reasons.add("unsupported_format")
    elif suffix in {".pdf", ".docx"}:
        medium = "document"
        text, found = _document_text(content, suffix)
        reasons |= found
    elif suffix in IMAGE_EXTENSIONS:
        medium = "media"
        reasons.add("media_visual_unknown")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(content)) as image:
                    if image.format not in {"PNG", "JPEG", "WEBP", "GIF"}:
                        reasons.add("unsupported_format")
                    frames = getattr(image, "n_frames", 1)
                    if frames > 1:
                        reasons.add("media_multiple_frames")
                    if frames > 200 or frames * image.width * image.height > MAX_DECODED_PIXELS:
                        reasons.add("unsupported_format")
                    if set(image.info) - {"jfif", "jfif_version", "jfif_unit", "jfif_density", "dpi", "loop", "duration"}:
                        reasons.add("media_metadata")
                    if image.getexif():
                        reasons.add("media_metadata")
                    if "unsupported_format" not in reasons:
                        for frame in range(frames):
                            image.seek(frame)
                            image.load()
        except (OSError, UnidentifiedImageError, ValueError, Image.DecompressionBombWarning):
            reasons.add("unsupported_format")
    else:
        medium = "unsupported"
        reasons.add("unsupported_format")
    for code, patterns in PATTERNS.items():
        if any(pattern.search(text) for pattern in patterns):
            reasons.add(code)
    # A combination is worth review even when each detail alone looks harmless.
    if len([kind for kind, pattern in QUASI.items() if pattern.search(text)]) >= 3:
        reasons.add("indirect_reidentification")
    classes = {"SELF_PRIVATE"}
    if reasons & {"direct_contact", "personal_identifier", "private_communication", "indirect_reidentification"}:
        classes.add("THIRD_PARTY_PERSONAL")
    if "high_sensitivity" in reasons:
        classes.add("SELF_HIGH_SENSITIVITY")
    if "work_confidential" in reasons:
        classes.add("EMPLOYER_CONFIDENTIAL")
    if "credential" in reasons:
        classes.add("CREDENTIAL")
    return {"medium": medium, "likely_classes": sorted(classes), "reason_codes": sorted(reasons),
            "suggestions": [REASONS[code] for code in sorted(reasons)], "confidence": "low"}


def classify_file(root: Path, source: Path) -> dict:
    content = _read_local(root, source, ".quarantine")
    return classify(content, source.suffix)


def _audit_path(root: Path) -> Path:
    root = root.resolve()
    local = root / "_local"
    if local.is_symlink() or not _inside(local.resolve(), root):
        raise ValueError("ignored local area must remain inside the repository")
    path = local / "privacy" / "approvals.jsonl"
    if path.is_symlink() or path.parent.is_symlink():
        raise ValueError("privacy approval path must not be a symlink")
    return path


def approve(root: Path, source: Path, candidate: Path, target: str, source_class: str,
            action: str, owner_approved: bool, visual_reviewed: bool = False) -> dict:
    if not owner_approved:
        raise ValueError("explicit owner approval is required")
    if source_class not in CLASSES or action not in {"minimized", "anonymized", "abstracted"}:
        raise ValueError("invalid source class or review action")
    if source_class == "CREDENTIAL":
        raise ValueError("credential sources cannot be approved for Git")
    if not (canonical_path(target) or safe_asset_path(target)) or target.endswith("/README.md"):
        raise ValueError("target must be a canonical note or safe asset path")
    source_bytes = _read_local(root, source, ".quarantine")
    candidate_bytes = _read_local(root, candidate, "_local")
    source_analysis = classify(source_bytes, source.suffix)
    source_blockers = set(source_analysis["reason_codes"]) & {"unsupported_format", "document_no_text"}
    if source_blockers:
        raise ValueError("source remains on hold: " + ", ".join(sorted(source_blockers)))
    if "credential" in source_analysis["reason_codes"]:
        raise ValueError("credential source cannot be approved for Git")
    mandatory_classes = set(source_analysis["likely_classes"]) - {"SELF_PRIVATE"}
    if mandatory_classes and source_class not in mandatory_classes:
        raise ValueError("declared source class does not cover detected risk")
    if source_bytes == candidate_bytes:
        raise ValueError("candidate must be a separate minimized derivative")
    if Path(target).suffix.lower() != candidate.suffix.lower():
        raise ValueError("candidate and target formats must match")
    analysis = classify(candidate_bytes, candidate.suffix)
    blockers = set(analysis["reason_codes"]) - {"media_visual_unknown"}
    if blockers:
        raise ValueError("candidate remains on hold: " + ", ".join(sorted(blockers)))
    if (source_analysis["medium"] in {"media", "document"} or analysis["medium"] in {"media", "document"}) and not visual_reviewed:
        raise ValueError("visual review of source and candidate media is required")
    if analysis["medium"] == "unsupported":
        raise ValueError("unsupported candidate format")
    record = {"at": datetime.now(timezone.utc).isoformat(), "target": target,
              "source_sha256": _sha(source_bytes), "candidate_sha256": _sha(candidate_bytes),
              "candidate_blob_oid": _git_blob_oid(root, target, candidate_bytes),
              "source_class": source_class, "action": action, "medium": analysis["medium"],
              "visual_reviewed": visual_reviewed, "owner_approved": True,
              "source_reason_codes": source_analysis["reason_codes"],
              "classifier_reason_codes": analysis["reason_codes"], **_review_versions(root)}
    path = _audit_path(root)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    with os.fdopen(fd, "a", encoding="utf-8") as stream:
        stream.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
    return {"approved": True, "target": target, "candidate_blob_oid": record["candidate_blob_oid"]}


def check_staged(root: Path) -> dict:
    """Require an approved Git blob under the current policy for staged notes/assets."""
    root = root.resolve()
    versions = _review_versions(root, staged_policy=True)
    path = _audit_path(root)
    approved = set()
    if path.is_file():
        try:
            for line in path.read_text(encoding="utf-8").splitlines():
                record = json.loads(line)
                if record.get("owner_approved") is True and all(record.get(key) == value for key, value in versions.items()):
                    approved.add((record["target"], record["candidate_blob_oid"]))
        except (ValueError, KeyError, TypeError):
            raise ValueError("local privacy approvals are invalid") from None
    changed = subprocess.check_output(["git", "diff", "--cached", "--name-only", "--diff-filter=ACMRT", "-z"], cwd=root)
    checked, missing = [], []
    for raw in changed.split(b"\0"):
        if not raw:
            continue
        target = raw.decode("utf-8", errors="surrogateescape")
        if not (canonical_path(target) or safe_asset_path(target)):
            continue
        staged_oid = _staged_oid(root, target)
        if staged_oid is None:
            checked.append(target)
            missing.append(target)
            continue
        checked.append(target)
        if (target, staged_oid) not in approved:
            missing.append(target)
    # Paths may contain private names; only counts are printed by the CLI.
    return {"checked": len(checked), "unapproved": len(missing), "ready": not missing}
