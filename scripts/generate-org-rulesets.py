#!/usr/bin/env python3
import json
import sys
import time
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'compliance' / 'rulesets' / 'orgs'
OUT.mkdir(parents=True, exist_ok=True)
INV = ROOT / 'compliance' / 'rulesets' / 'check-inventory'
INV.mkdir(parents=True, exist_ok=True)

org_files = {
    'furnished-condos': INV / 'furnished-condos.txt',
    'chittycorp': INV / 'chittycorp.txt',
    'chittyos': INV / 'chittyos.txt',
    'chittyapps': INV / 'chittyapps.txt',
    'chicagoapps': INV / 'chicagoapps.txt',
}

candidate_checks = [
    'ChittyConnect Sync / sync',
    'Compliance Check / compliance',
    'CI / test',
    'CI / build',
    'CI / lint-and-test',
    'CI / lint-and-format',
    'CI / test-and-build',
    'CodeQL / Analyze',
    'PR Validation / validate',
    'ChittyOS Compliance Check / compliance',
]


def parse_repo_checks(p: Path):
    repo = None
    repo_checks = {}
    for line in p.read_text(errors='ignore').splitlines():
        if line.startswith('## '):
            parts = line[3:].strip().split('/', 1)
            repo = parts[1] if len(parts) == 2 else parts[0]
            repo_checks[repo] = []
        elif line.startswith('- ') and repo:
            repo_checks[repo].append(line[2:].strip())
    return repo_checks


def baseline_ruleset(org: str):
    return {
        'name': 'Org Baseline Branch Protection',
        'target': 'branch',
        'enforcement': 'active',
        'conditions': {
            'ref_name': {'include': ['~DEFAULT_BRANCH'], 'exclude': []},
            'repository_name': {'include': ['~ALL'], 'exclude': []},
        },
        'rules': [
            {'type': 'deletion'},
            {'type': 'non_fast_forward'},
            {
                'type': 'pull_request',
                'parameters': {
                    'required_approving_review_count': 1,
                    'dismiss_stale_reviews_on_push': True,
                    'require_code_owner_review': False,
                    'require_last_push_approval': False,
                    'required_review_thread_resolution': True,
                },
            },
        ],
        'bypass_actors': [],
    }


def check_ruleset(check: str, repos: list[str]):
    slug = (
        check.lower()
        .replace(' / ', '-')
        .replace('/', '-')
        .replace(' ', '-')
        .replace(':', '')
        .replace('${{', '')
        .replace('}}', '')
    )
    while '--' in slug:
        slug = slug.replace('--', '-')
    payload = {
        'name': f'Require {check}',
        'target': 'branch',
        'enforcement': 'active',
        'conditions': {
            'ref_name': {'include': ['~DEFAULT_BRANCH'], 'exclude': []},
            'repository_name': {'include': sorted(repos), 'exclude': []},
        },
        'rules': [
            {
                'type': 'required_status_checks',
                'parameters': {
                    'strict_required_status_checks_policy': True,
                    'required_status_checks': [
                        {'context': check}
                    ],
                },
            }
        ],
        'bypass_actors': [],
    }
    return slug, payload


def safe_write_text(path: Path, text: str, retries: int = 5, delay_sec: float = 0.5):
    """
    Write via temp file + replace with retry to tolerate transient filesystem timeouts.
    """
    last_err = None
    for attempt in range(retries):
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=path.parent,
                prefix=f".{path.name}.",
                suffix=".tmp",
                delete=False,
            ) as fh:
                fh.write(text)
                tmp_path = Path(fh.name)
            tmp_path.replace(path)
            return
        except (TimeoutError, OSError) as exc:
            last_err = exc
            if tmp_path is not None:
                try:
                    tmp_path.unlink(missing_ok=True)
                except OSError:
                    pass
            if attempt < retries - 1:
                time.sleep(delay_sec * (attempt + 1))
    if last_err is not None:
        raise last_err


def main():
    selected_orgs = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    manifest = {}
    for org, src in org_files.items():
        if selected_orgs is not None and org not in selected_orgs:
            continue
        if not src.exists():
            continue
        repo_checks = parse_repo_checks(src)
        org_dir = OUT / org
        org_dir.mkdir(parents=True, exist_ok=True)

        base = baseline_ruleset(org)
        safe_write_text(org_dir / '00-baseline.json', json.dumps(base, indent=2) + '\n')

        files = ['00-baseline.json']
        for check in candidate_checks:
            repos = [r for r, checks in repo_checks.items() if check in checks]
            if not repos:
                continue
            slug, payload = check_ruleset(check, repos)
            fname = f'10-require-{slug}.json'
            safe_write_text(org_dir / fname, json.dumps(payload, indent=2) + '\n')
            files.append(fname)

        manifest[org] = files

    safe_write_text(OUT / 'manifest.json', json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
