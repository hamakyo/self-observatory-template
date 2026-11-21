"""Privacy ingress must fail closed without echoing protected input."""

from __future__ import annotations

import io
import json
import subprocess
import zipfile
from pathlib import Path

import pytest
from PIL import Image, PngImagePlugin
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

import self_observatory.privacy as privacy
from self_observatory.privacy import approve, check_staged, classify, classify_file


def _git(root: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=root, check=True, capture_output=True)


def _review_root(root: Path) -> None:
    _git(root, "init", "-q")
    (root / ".quarantine").mkdir()
    (root / "_local").mkdir()
    (root / "DATA_POLICY.md").write_text("Store the lesson, not the secret.\n")
    _git(root, "add", "DATA_POLICY.md")
    classifier = root / "src/self_observatory/privacy.py"
    classifier.parent.mkdir(parents=True)
    classifier.write_bytes(Path(privacy.__file__).read_bytes())
    _git(root, "add", "src/self_observatory/privacy.py")


def _readable_pdf() -> bytes:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                             NameObject("/Subtype"): NameObject("/Type1"),
                             NameObject("/BaseFont"): NameObject("/Helvetica")})
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"):
        DictionaryObject({NameObject("/F1"): writer._add_object(font)})})
    stream = DecodedStreamObject()
    stream.set_data(b"BT /F1 12 Tf 10 100 Td (Synthetic lesson) Tj ET")
    page[NameObject("/Contents")] = writer._add_object(stream)
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def test_text_risk_codes_do_not_repeat_values():
    secret = "api" + "_key=" + "abcdefghijk123"
    contact = "alex" + "@" + "example.test"
    source = f"{secret}\n{contact}\nmanager in Tokyo City on 2026-09-27, aged 32"
    result = classify(source.encode(), ".txt")
    assert {"credential", "direct_contact", "indirect_reidentification"} <= set(result["reason_codes"])
    assert {"CREDENTIAL", "THIRD_PARTY_PERSONAL"} <= set(result["likely_classes"])
    output = json.dumps(result)
    assert secret not in output and contact not in output and "Tokyo" not in output


def test_document_and_media_unknowns_are_explicit():
    assert "document_no_text" in classify(b"not a pdf", ".pdf")["reason_codes"]
    image = Image.new("RGB", (2, 2), "red")
    info = PngImagePlugin.PngInfo()
    info.add_text("Comment", "private")
    content = io.BytesIO()
    image.save(content, format="PNG", pnginfo=info)
    reasons = classify(content.getvalue(), ".png")["reason_codes"]
    assert "media_visual_unknown" in reasons and "media_metadata" in reasons
    document = io.BytesIO()
    with zipfile.ZipFile(document, "w") as archive:
        archive.writestr("word/document.xml", '<w:document xmlns:w="x"><w:t>generic text</w:t></w:document>')
        archive.writestr("word/media/image1.png", b"image")
    assert "document_embedded_media" in classify(document.getvalue(), ".docx")["reason_codes"]


def test_owner_review_is_bound_to_exact_staged_bytes(tmp_path: Path):
    root = tmp_path
    _review_root(root)
    source = root / ".quarantine" / "source.md"
    candidate = root / "_local" / "candidate.md"
    source.write_text("A manager in Tokyo City on 2026-09-27, aged 32 discussed an event.")
    candidate.write_text("A broad work situation suggested a reusable reflection.")
    assert "indirect_reidentification" in classify_file(root, source)["reason_codes"]
    target = "memory/episodes/example.md"
    with pytest.raises(ValueError, match="owner approval"):
        approve(root, source, candidate, target, "THIRD_PARTY_PERSONAL", "anonymized", False)
    result = approve(root, source, candidate, target, "THIRD_PARTY_PERSONAL", "anonymized", True)
    assert result["approved"]
    ledger = (root / "_local/privacy/approvals.jsonl").read_text()
    assert "Tokyo" not in ledger and "manager" not in ledger
    destination = root / target
    destination.parent.mkdir(parents=True)
    destination.write_bytes(candidate.read_bytes())
    _git(root, "add", target)
    assert check_staged(root) == {"checked": 1, "unapproved": 0, "ready": True}
    destination.write_text("Unapproved later edit")
    _git(root, "add", target)
    assert check_staged(root)["ready"] is False


def test_ambiguous_candidate_and_credential_source_stay_in_quarantine(tmp_path: Path):
    root = tmp_path
    _review_root(root)
    source = root / ".quarantine" / "source.md"
    candidate = root / "_local" / "candidate.md"
    source.write_text("A reflection with more detail than needed.")
    candidate.write_text("A manager in Tokyo City on 2026-09-27, aged 32.")
    with pytest.raises(ValueError, match="hold"):
        approve(root, source, candidate, "memory/episodes/example.md", "SELF_PRIVATE", "minimized", True)
    source.write_text("api" + "_key=" + "abcdefghijk123")
    candidate.write_text("A generic lesson.")
    with pytest.raises(ValueError, match="credential source"):
        approve(root, source, candidate, "memory/episodes/example.md", "SELF_PRIVATE", "abstracted", True)
    assert not (root / "_local/privacy/approvals.jsonl").exists()


def test_media_needs_clean_metadata_and_visual_review(tmp_path: Path):
    root = tmp_path
    _review_root(root)
    source = root / ".quarantine" / "raw.png"
    candidate = root / "_local" / "candidate.png"
    Image.new("RGB", (2, 2), "red").save(source)
    Image.new("RGB", (2, 2), "blue").save(candidate)
    with pytest.raises(ValueError, match="visual review"):
        approve(root, source, candidate, "assets/images/example.png", "SELF_PRIVATE", "minimized", True)
    assert approve(root, source, candidate, "assets/images/example.png", "SELF_PRIVATE", "minimized", True,
                   visual_reviewed=True)["approved"]


def test_truncated_image_source_and_candidate_stay_on_hold(tmp_path: Path):
    root = tmp_path
    _review_root(root)
    original = io.BytesIO()
    Image.new("RGB", (200, 200), "red").save(original, format="JPEG", quality=90)
    broken = original.getvalue()[:-10]
    source = root / ".quarantine/source.jpg"
    candidate = root / "_local/candidate.jpg"
    source.write_bytes(broken)
    Image.new("RGB", (2, 2), "blue").save(candidate, format="JPEG")
    assert "unsupported_format" in classify_file(root, source)["reason_codes"]
    with pytest.raises(ValueError, match="source remains on hold"):
        approve(root, source, candidate, "assets/images/example.jpg", "SELF_PRIVATE", "abstracted", True,
                visual_reviewed=True)
    source.write_bytes(original.getvalue())
    candidate.write_bytes(broken)
    with pytest.raises(ValueError, match="candidate remains on hold"):
        approve(root, source, candidate, "assets/images/example.jpg", "SELF_PRIVATE", "abstracted", True,
                visual_reviewed=True)


def test_staged_symlink_cannot_reuse_an_approval(tmp_path: Path):
    root = tmp_path
    _review_root(root)
    source = root / ".quarantine/source.md"
    candidate = root / "_local/candidate.md"
    source.write_text("Original private detail.")
    candidate.write_text("Generic lesson.")
    target = "memory/episodes/example.md"
    approve(root, source, candidate, target, "SELF_PRIVATE", "minimized", True)
    destination = root / target
    destination.parent.mkdir(parents=True)
    destination.symlink_to(candidate)
    _git(root, "add", target)
    assert check_staged(root)["ready"] is False


@pytest.mark.parametrize("suffix,content", [(".md", b"\xff"), (".pdf", b"broken pdf")])
def test_unreadable_source_cannot_be_approved(tmp_path: Path, suffix: str, content: bytes):
    root = tmp_path
    _review_root(root)
    source = root / ".quarantine" / f"source{suffix}"
    candidate = root / "_local/candidate.md"
    source.write_bytes(content)
    candidate.write_text("A generic lesson.\n")
    with pytest.raises(ValueError, match="source remains on hold"):
        approve(root, source, candidate, "memory/episodes/example.md", "SELF_PRIVATE", "abstracted", True,
                visual_reviewed=True)


def test_readable_pdf_source_to_markdown_requires_source_visual_review(tmp_path: Path):
    root = tmp_path
    _review_root(root)
    source = root / ".quarantine/source.pdf"
    candidate = root / "_local/candidate.md"
    source.write_bytes(_readable_pdf())
    candidate.write_text("A generic lesson.\n")
    assert "document_no_text" not in classify_file(root, source)["reason_codes"]
    with pytest.raises(ValueError, match="visual review"):
        approve(root, source, candidate, "memory/episodes/example.md", "SELF_PRIVATE", "abstracted", True)
    assert approve(root, source, candidate, "memory/episodes/example.md", "SELF_PRIVATE", "abstracted", True,
                   visual_reviewed=True)["approved"]


def test_crlf_candidate_matches_git_index_after_clean_filter(tmp_path: Path):
    root = tmp_path
    _review_root(root)
    _git(root, "config", "core.autocrlf", "true")
    (root / "DATA_POLICY.md").write_bytes(b"Store the lesson, not the secret.\r\n")
    _git(root, "add", "DATA_POLICY.md")
    source = root / ".quarantine/source.md"
    candidate = root / "_local/candidate.md"
    source.write_text("Original private detail.\n")
    candidate.write_bytes(b"Generic lesson.\r\n")
    target = "memory/episodes/example.md"
    approval = approve(root, source, candidate, target, "SELF_PRIVATE", "abstracted", True)
    destination = root / target
    destination.parent.mkdir(parents=True)
    destination.write_bytes(candidate.read_bytes())
    _git(root, "add", target)
    staged_oid = subprocess.check_output(["git", "rev-parse", f":{target}"], cwd=root).decode().strip()
    assert approval["candidate_blob_oid"] == staged_oid
    assert check_staged(root)["ready"] is True


def test_policy_classifier_and_legacy_approvals_are_not_reused(tmp_path: Path):
    root = tmp_path
    _review_root(root)
    source = root / ".quarantine/source.md"
    candidate = root / "_local/candidate.md"
    source.write_text("Original private detail.\n")
    candidate.write_text("Generic lesson.\n")
    target = "memory/episodes/example.md"
    approve(root, source, candidate, target, "SELF_PRIVATE", "abstracted", True)
    destination = root / target
    destination.parent.mkdir(parents=True)
    destination.write_bytes(candidate.read_bytes())
    _git(root, "add", target)
    assert check_staged(root)["ready"] is True
    ledger = root / "_local/privacy/approvals.jsonl"
    current = json.loads(ledger.read_text())
    legacy = {key: value for key, value in current.items() if key not in
              {"approval_schema_version", "policy_blob_oid", "classifier_blob_oid", "classifier_sha256"}}
    ledger.write_text(json.dumps(legacy) + "\n")
    assert check_staged(root)["ready"] is False
    ledger.write_text(json.dumps(current) + "\n")
    (root / "DATA_POLICY.md").write_text("A stricter policy.\n")
    _git(root, "add", "DATA_POLICY.md")
    assert check_staged(root)["ready"] is False
    approve(root, source, candidate, target, "SELF_PRIVATE", "abstracted", True)
    assert check_staged(root)["ready"] is True
    classifier = root / "src/self_observatory/privacy.py"
    classifier.write_bytes(classifier.read_bytes() + b"\n# stricter classifier\n")
    _git(root, "add", "src/self_observatory/privacy.py")
    assert check_staged(root)["ready"] is False
