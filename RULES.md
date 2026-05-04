---
uri: chittycanon://chittyos/services/chittyops/rules
namespace: chittyos.operations.chittyops.rules
type: scope-rules
version: 1.0.0
status: ACTIVE
last_updated: 2026-05-04
---

# chittyops — Rules and Constraints

Governance for the chittyops monorepo and the `@chittyops` npm scope. All packages published from this repo MUST satisfy these rules.

## 1. Scope of the monorepo

**Belongs here** — operational tooling that runs ChittyOS, not product services it runs:

- CI/CD workflows, GitHub Actions, reusable workflows
- Ecosystem compliance auditing + remediation
- Operator CLIs (`chitty-op`, `getchitty-creds`, etc.)
- VM-resident bridge services (1Password ↔ secrets store, sync daemons, etc.)
- Onboarding + provisioning automation
- Cross-org workflow management

**Does NOT belong here** — these have their own homes:

| Concern | Home |
|---|---|
| Application / product services | their own service repo (chittyconnect, chittyauth, etc.) |
| Identity generation | ChittyID (Tier 0) |
| Token / OAuth issuance | ChittyAuth (Tier 1) |
| Service registration runtime | ChittyRegister (Tier 1) |
| LLM / AI routing | ChittyGateway (Tier 2) |
| Application monitoring runtime | ChittyBeacon (Tier 3) |
| Shared product libraries | `@chittyos/*` scope (e.g. `@chittyos/core`, `@chittyos/auth`) |

If a package would be a peer to a product service rather than supporting infra, it belongs in its own repo, not here.

## 2. npm scope

- Every published package from this repo is **`@chittyops/<name>`**.
- `@chittyos/*` is reserved for product / shared libraries (chitcommit-published).
- Packages MUST set `publishConfig.access = "public"` unless an explicit private decision is recorded in CHARTER.md.
- Package `name` in package.json MUST match the directory name (`@chittyops/1p-bridge` → `1p-bridge/`).
- Package `repository` field MUST include `{ type, url, directory }` pointing to its subdir in this repo.

## 3. Layout

- Each package is a top-level subdirectory at the repo root (e.g. `1p-bridge/`, `cli/`, `compliance/`).
- This is **not** an npm/pnpm workspace — packages are independent and install their own dependencies.
- New package PRs MUST land via `git subtree add` if migrating from a standalone repo, to preserve history. Greenfield packages start with their own commit history in this repo.

## 4. Required artifacts per package

Every package MUST ship the compliance pentad:

| File | Purpose | Mandatory for |
|---|---|---|
| `CHARTER.md` | API contract, scope, dependencies | all packages |
| `CHITTY.md` | architecture, ecosystem position, consumers | all packages |
| `CLAUDE.md` | dev patterns, commands, integration details | all packages |
| `SECURITY.md` | trust boundaries, secrets handling, threat model | runtime services + anything handling secrets/PII |
| `AGENTS.md` | AI agent integration surface | anything touched by ChittyOS agents |
| `registration.json` | ChittyRegistry payload | runtime services (anything exposing health, endpoints, or systemd units) |

CI/CD-only utilities (e.g. a reusable workflow with no runtime) MAY skip SECURITY.md / registration.json with explicit note in CHARTER.md.

## 5. Service identity vs npm name

- **npm package name** (e.g. `@chittyops/1p-bridge`) is the publish artifact.
- **Service identity** (e.g. `chitty-1p-bridge` for systemd units, `/etc/chitty-1p-bridge/`, canonical URI `chittycanon://core/services/chitty-1p-bridge`) is the runtime identity.
- These MAY differ. Service identity is stable across source-of-truth moves; npm name follows the publishing scope.
- Both MUST be cross-referenced in CHARTER.md.

## 6. Quality gates

Every package MUST define and pass before merge:

- `npm run preflight` = `typecheck && lint && test` (or language-equivalent)
- ESLint flat config (or language-native equivalent) with no errors
- Unit + integration tests where applicable; minimum bash-level handler tests for CLIs
- For runtime services: `registration.json` validates against ChittyRegistry schema
- Compliance pentad files exist and reference `chittycanon://` URIs correctly

## 7. Secrets

- **No long-lived secrets in package source or workflows.** Use ChittyConnect ephemeral credential provisioning.
- Only org-level secret tolerated: `CHITTYCONNECT_API_KEY`.
- 1Password Connect is read-only from packages; writes go through approved bridges (e.g. `@chittyops/1p-bridge`).
- Secrets in package config files MUST be referenced by path / handle, never embedded.

## 8. Canonical ontology

Per `chittycanon://gov/governance`, every entity reference MUST use the 5 core types — Person (P) / Location (L) / Thing (T) / Event (E) / Authority (A). Code that introduces or validates entity types MUST cite the canonical source:

```
// @canon: chittycanon://gov/governance#core-types
```

Claude / agent contexts are **Person (Synthetic)** — never Thing.

## 9. Branch + PR rules

- Default branch: `main`. CODEOWNERS approval required for `/.github/workflows/` and setup scripts.
- Cross-package work goes in one PR; package-isolated work in its own PR.
- ChittyBeacon integration is required for any runtime package — verified in CI.
- Force-push to `main` is prohibited.

## 10. Deprecation

A package is deprecated by:

1. Setting `package.json` `deprecated` field with reason + replacement.
2. Updating its `registration.json` `status` to `deprecated`.
3. Removing it from active compliance scope (`compliance/service-registry.yml`).
4. Keeping the source in-tree until the next major bump of the monorepo or 90 days, whichever is later.

Removing a package from npm requires registry deprecation tag plus a CHARTER.md retirement note.

---

Questions / amendments: open a PR touching this file with rationale. Material changes require CODEOWNERS approval.
