#!/usr/bin/env python3
import json
import os
import sys
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
    {
        'name': 'ChittyConnect Sync / sync',
        'context': 'sync',
        'aliases': ['sync', 'ChittyConnect Sync / sync'],
    },
    {
        'name': 'Compliance Check / compliance',
        'context': 'compliance',
        'aliases': ['compliance', 'Compliance Check / compliance'],
    },
    {
        'name': 'CI / test',
        'context': 'test',
        'aliases': ['test', 'CI / test'],
    },
    {
        'name': 'CI / build',
        'context': 'build',
        'aliases': ['build', 'CI / build'],
    },
    {
        'name': 'CI / lint-and-test',
        'context': 'lint-and-test',
        'aliases': ['lint-and-test', 'CI / lint-and-test'],
    },
    {
        'name': 'CI / lint-and-format',
        'context': 'lint-and-format',
        'aliases': ['lint-and-format', 'CI / lint-and-format'],
    },
    {
        'name': 'CI / test-and-build',
        'context': 'test-and-build',
        'aliases': ['test-and-build', 'CI / test-and-build'],
    },
    {
        'name': 'CodeQL / Analyze',
        'context': 'CodeQL',
        'aliases': ['CodeQL', 'CodeQL / Analyze', 'Analyze (javascript)'],
    },
    {
        'name': 'PR Validation / validate',
        'context': 'validate',
        'aliases': ['validate', 'PR Validation / validate'],
    },
    {
        'name': 'ChittyOS Compliance Check / compliance',
        'context': 'compliance',
        'aliases': ['compliance', 'ChittyOS Compliance Check / compliance'],
    },
]


def parse_required_approving_review_count():
    raw = os.getenv('REQUIRED_APPROVING_REVIEW_COUNT', '0')
    if raw == '':
        return 0
    try:
        value = int(raw)
    except ValueError:
        sys.stderr.write(
            'ERROR: REQUIRED_APPROVING_REVIEW_COUNT must be an integer between 0 and 6; '
            f'got {raw!r}.\n'
        )
        sys.exit(1)
    if value < 0 or value > 6:
        sys.stderr.write(
            'ERROR: REQUIRED_APPROVING_REVIEW_COUNT must be between 0 and 6; '
            f'got {value}.\n'
        )
        sys.exit(1)
    return value


REQUIRED_APPROVING_REVIEW_COUNT = parse_required_approving_review_count()


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
                    'required_approving_review_count': REQUIRED_APPROVING_REVIEW_COUNT,
                    'dismiss_stale_reviews_on_push': True,
                    'require_code_owner_review': False,
                    'require_last_push_approval': False,
                    'required_review_thread_resolution': True,
                },
            },
        ],
        'bypass_actors': [],
    }


def check_ruleset(name: str, context: str, repos: list[str]):
    slug = (
        name.lower()
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
        'name': f'Require {name}',
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
                        {'context': context}
                    ],
                },
            }
        ],
        'bypass_actors': [],
    }
    return slug, payload


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
        (org_dir / '00-baseline.json').write_text(json.dumps(base, indent=2) + '\n')

        files = ['00-baseline.json']
        for check in candidate_checks:
            aliases = set(check['aliases'])
            repos = [
                r for r, checks in repo_checks.items()
                if aliases.intersection(checks)
            ]
            if not repos:
                continue
            slug, payload = check_ruleset(check['name'], check['context'], repos)
            fname = f'10-require-{slug}.json'
            (org_dir / fname).write_text(json.dumps(payload, indent=2) + '\n')
            files.append(fname)

        manifest[org] = files

    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
