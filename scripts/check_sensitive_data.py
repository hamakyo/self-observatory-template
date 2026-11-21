#!/usr/bin/env python3
"""Conservative text guardrail for likely direct identifiers and secret material.

This is not a compliance scanner. Matched values are never printed to CI logs.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT_SUFFIXES = {'.md', '.txt', '.yaml', '.yml', '.json', '.csv', '.py', '.js', '.ts', '.tsx', '.jsx'}
SKIP_FILES = {Path('scripts/check_sensitive_data.py')}

PATTERNS = {
    'email-address': re.compile(r'(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![A-Za-z0-9.-])'),
    'jp-mobile-phone': re.compile(r'(?<![A-Za-z0-9])0[789]0[- ]?\d{4}[- ]?\d{4}(?![A-Za-z0-9])'),
    'jp-landline-phone': re.compile(r'(?<![A-Za-z0-9])0\d{1,4}[- ]?\d{1,4}[- ]?\d{4}(?![A-Za-z0-9])'),
    'twelve-digit-id': re.compile(r'(?<!\d)\d{12}(?!\d)'),
    'private-key-material': re.compile(r'BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY'),
    'literal-secret-assignment': re.compile(r'''(?i)\b(?:password|token|secret|api[_-]?key)\b\s*[:=]\s*["'][^"'${}]{8,}["']'''),
}


def files_to_scan():
    # Include tracked files even when someone used git add -f on an ignored path.
    # Also inspect ordinary untracked files before they are staged.
    listed = subprocess.check_output(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        cwd=ROOT,
    )
    for name in listed.split(b'\0'):
        if not name:
            continue
        rel = Path(name.decode('utf-8', errors='surrogateescape'))
        path = ROOT / rel
        if not path.is_file():
            continue
        if rel in SKIP_FILES:
            continue
        if path.suffix.lower() in TEXT_SUFFIXES:
            yield path, rel


def main() -> int:
    findings: list[tuple[str, Path, int]] = []
    for path, rel in files_to_scan():
        try:
            lines = path.read_text(encoding='utf-8').splitlines()
        except UnicodeDecodeError:
            continue
        for lineno, line in enumerate(lines, 1):
            for kind, pattern in PATTERNS.items():
                if pattern.search(line):
                    findings.append((kind, rel, lineno))

    if findings:
        print('Sensitive-data guardrail blocked this repository state.')
        print('Matched values are intentionally omitted from logs.')
        for kind, path, line in findings:
            print(f'ERROR {path}:{line}: potential {kind}')
        print('\nSanitize or anonymize the source before committing.')
        return 1

    print('OK: no configured sensitive text patterns detected.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
