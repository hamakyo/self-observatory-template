"""Explicit rebuild and loopback-only server commands."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import uvicorn

from .index import rebuild
from .capture import check_proposal, import_captures, make_proposal
from .privacy import approve, check_staged, classify_file
from .validation import validate_feedback_tree, working_records


def main() -> None:
    parser = argparse.ArgumentParser(prog="self-observatory")
    parser.add_argument("--repo", type=Path, default=Path.cwd(), help="Git repository root")
    parser.add_argument("--ref", default=None, help="approved first-parent ref (defaults to origin/main or main)")
    commands = parser.add_subparsers(dest="command", required=True)
    index = commands.add_parser("index")
    index.add_argument("--rebuild", action="store_true", required=True)
    serve = commands.add_parser("serve")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--ui-dir", type=Path)
    capture = commands.add_parser("capture-import", help="import a minimized, reviewed plugin handoff into _local")
    capture.add_argument("source", type=Path)
    capture.add_argument("--reviewed", action="store_true")
    proposal = commands.add_parser("propose", help="prepare a local candidate and Markdown patch")
    proposal.add_argument("--capture", action="append", required=True)
    proposal.add_argument("--draft-dir", type=Path, required=True)
    check = commands.add_parser("check-proposal", help="reject stale inputs or modified proposal content")
    check.add_argument("directory", type=Path)
    check.add_argument("--require-refreshed", action="store_true", help="require a newer plugin handoff before applying")
    validate = commands.add_parser("validate-feedback", help="validate working notes against adopted Git history")
    validate.add_argument("--base", help="full approved baseline SHA; defaults to canonical ref")
    privacy_classify = commands.add_parser("privacy-classify", help="screen a quarantined input without printing values")
    privacy_classify.add_argument("source", type=Path)
    privacy_approve = commands.add_parser("privacy-approve", help="record owner approval for an exact sanitized candidate")
    privacy_approve.add_argument("source", type=Path)
    privacy_approve.add_argument("candidate", type=Path)
    privacy_approve.add_argument("--target", required=True)
    privacy_approve.add_argument("--source-class", required=True)
    privacy_approve.add_argument("--action", choices=("minimized", "anonymized", "abstracted"), required=True)
    privacy_approve.add_argument("--owner-approved", action="store_true")
    privacy_approve.add_argument("--visual-reviewed", action="store_true")
    commands.add_parser("privacy-check", help="check staged canonical bytes against local owner approvals")
    args = parser.parse_args()
    if args.command in {"capture-import", "propose", "check-proposal", "validate-feedback",
                        "privacy-classify", "privacy-approve", "privacy-check"}:
        try:
            if args.command == "capture-import":
                result = import_captures(args.repo, args.source, args.reviewed)
            elif args.command == "propose":
                result = make_proposal(args.repo, args.capture, args.draft_dir, args.ref)
            elif args.command == "check-proposal":
                result = check_proposal(args.repo, args.directory, require_refreshed=args.require_refreshed)
            elif args.command == "privacy-classify":
                result = classify_file(args.repo, args.source)
            elif args.command == "privacy-approve":
                result = approve(args.repo, args.source, args.candidate, args.target, args.source_class,
                                 args.action, args.owner_approved, args.visual_reviewed)
            elif args.command == "privacy-check":
                result = check_staged(args.repo)
                if not result["ready"]:
                    print(json.dumps(result, ensure_ascii=False))
                    raise SystemExit(1)
            else:
                errors = validate_feedback_tree(args.repo, working_records(args.repo), base=args.base, ref=args.ref)
                result = {"valid": not errors, "diagnostics": errors}
                if errors:
                    print(json.dumps(result, ensure_ascii=False))
                    raise SystemExit(1)
            print(json.dumps(result, ensure_ascii=False))
        except (ValueError, OSError) as exc:
            parser.exit(1, f"ERROR: {exc}\n")
    elif args.command == "index":
        print(json.dumps(rebuild(args.repo, args.ref), ensure_ascii=False))
    else:
        if not 1 <= args.port <= 65535:
            parser.error("port must be between 1 and 65535")
        from .api import create_app

        app = create_app(args.repo, args.ui_dir)
        uvicorn.run(app, host="127.0.0.1", port=args.port, access_log=False)


if __name__ == "__main__":
    main()
