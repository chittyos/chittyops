# Governance Automation

This directory is the source of truth for branch governance rollout across:

- `furnished-condos`
- `chittycorp`
- `chittyos`
- `chittyapps`
- `chicagoapps`

## Autopilot

Workflow: `.github/workflows/org-governance-autopilot.yml`

It runs:

1. `scripts/apply-org-rulesets.sh` for org-level rulesets (when org plan supports it)
2. `scripts/apply-repo-branch-protections.sh --apply` for repo-level fallback

The fallback ensures new repos are picked up automatically on each scheduled run, so you do not need to manually apply protection per repository.

## Required Secret

Create org/repo secret in `chittyops`:

- `ORG_GOVERNANCE_TOKEN`

Recommended scopes for classic PAT:

- `admin:org` (org rulesets)
- `repo` (repo branch protection updates)

## Manual Commands

Regenerate inventory + ruleset payloads:

```bash
bash ./scripts/discover-org-checks.sh furnished-condos chittycorp chittyos chittyapps chicagoapps
python3 ./scripts/generate-org-rulesets.py furnished-condos chittycorp chittyos chittyapps chicagoapps
```

Apply org rulesets:

```bash
bash ./scripts/apply-org-rulesets.sh furnished-condos chittycorp chittyos chittyapps chicagoapps
```

Apply repo fallback protections:

```bash
bash ./scripts/apply-repo-branch-protections.sh --apply furnished-condos chittycorp chittyapps chicagoapps
```
