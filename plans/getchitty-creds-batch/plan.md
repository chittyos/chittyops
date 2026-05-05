# getchitty-creds Batch Endpoint

**Repos (cross-repo plan):**
- Phase 1: `CHITTYOS/chittyconnect` — branch `feat/credentials-batch-endpoint`
- Phase 2: `CHITTYOS/chittyops` — branch `feat/getchitty-creds-batch` (off `feat/getchitty-creds-zones`)

**Plan home (this file):** `CHITTYOS/chittyops/plans/getchitty-creds-batch/plan.md`

**Description:** Add `POST /api/credentials/batch` to chittyconnect so the `getchitty-creds` action fetches multiple credentials in a single round-trip, then refactor the action to use it.

## Goal

Today the `getchitty-creds` action's API-key path tries to extract NPM/GITHUB/NEON/CHITTYREGISTER tokens from a `cloudflare_workers_deploy` provision response that never contains them — a latent bug. After PR #54 (action-side zones input + correct API-key shape) and the chittyconnect OIDC zones plan land, the obvious fix is N single calls per credential type. Scope C avoids that fan-out by introducing one batch endpoint that handles a heterogeneous list of credential requests in a single round-trip with one rate-limit charge.

## Context (from research)

- **Auth model:** `chittyconnect/src/api/router.js:90` mounts `authenticate` (API-key middleware) on all `/api/*`. `/api/github-actions/*` is mounted **outside** that router (`src/index.js:1422`) precisely to use OIDC instead. Twin endpoints (one per auth method) sharing one handler module is the established pattern.
- **Single-cred endpoint exists:** `POST /api/credentials/provision` (`src/api/routes/credentials.js:47-115`) — `{type, context}` shape, rate-limited, validated, audited. The model to mirror.
- **Static-cred map:** `src/api/routes/github-actions.js:119-149` `credentialMap` — covers CLOUDFLARE_*, NEON_DATABASE_URL, GITHUB_APP_*, OPENAI_API_KEY, NOTION_TOKEN. **NPM_TOKEN and CHITTYREGISTER_TOKEN are absent from chittyconnect entirely** (also absent from `src/lib/credential-paths.js`).
- **Path divergence:** `github-actions.js` uses `infrastructure/neon/database_url`; `credential-paths.js` uses `integrations/neon/database_url`. Pre-existing inconsistency that the batch endpoint either inherits or must resolve.
- **Provisioner shape:** `provision()` returns `{success, credential: {type, value, ...type-specific fields}, usage_instructions, metadata}`. CF deploy adds `expires_at`, `scopes`, `account_id`, `token_id`. Neon adds `database`, `readonly`, `provider`. Integration API keys add `platform`, `purpose`.
- **Rate limit:** `provisioner.checkRateLimit(requestingService)` charges 1 per call against `provision:${service}:${hour}` KV key, hard cap 10/hour. Batch must decide: 1 charge per batch, or N charges.
- **Test pattern:** All `tests/api/*.test.js` use `vi.mock` + `createMockContext`. No real-provisioner integration test exists. Binding policy ("no mocks for new tests against DB/services") requires a new pattern OR explicit user override.
- **Real callers / rollout risk:** In addition to `chittycommand/.github/workflows/getchitty-creds-example.yml` (example), `chittyops/.github/workflows/reusable-package-publish.yml` is a real in-tree caller: it checks out and invokes `.github/actions/getchitty-creds` to fetch `cloudflare_token`, `account_id`, `npm_token`, and `github_token`. `chittyops/.github/workflows/reusable-worker-deploy.yml` still does NOT use the action and continues to use static `CLOUDFLARE_API_TOKEN`. Phase 2 therefore has real backward-compatibility and rollout risk; changes to outputs, missing credential support, or partial-response semantics can break an existing repository workflow and must be validated before ship.
- **Dependencies on prior work:**
  - **PR #54** (chittyops, OPEN): action.yml zones input + correct `{type, context}` API-key shape. Phase 2 of this plan rebases on it.
  - **chittyconnect OIDC zones plan** (`plans/chittyconnect-oidc-zones-support/plan.md`): teaches `/api/github-actions/credentials` to route through provisioner. Phase 2 of this plan needs the batch equivalent of that route.
- **Branch state risk:** chittyconnect is on `smoke/1password-sdk-eval` with uncommitted WIP (3 modified, 1 untracked) that likely belongs to a parallel session. Phase 1 must use `git worktree add` off `origin/main`, never disturb the smoke branch.

## Locked decisions

All six decisions locked in (2026-05-04). Override before Phase 1 implementation if any of these need to change.

- **[Q1] → C1 (mixed batch).** Each batch entry is one of `{type, context}` (provisioner mint) OR `{credential: "NAME"}` (static 1P fetch via the github-actions credential map). Action gets everything in 1 call. C2 (pure provisioner) was rejected — it forces the action to make 2 calls per workflow run, defeating the purpose.
- **[Q2] → (b) Defer NPM_TOKEN and CHITTYREGISTER_TOKEN.** Phase 2 of this plan ships without these outputs. The latent bug already drops them in practice (the action extracts them from a CF response that never contains them), so no real caller depends on them today. A separate follow-up plan adds them once vault paths and rotation policies are decided. The `infrastructure/neon` vs `integrations/neon` path divergence is also out of scope here — separate cleanup issue, non-blocking.
- **[Q3] → Real-backend tests only (no mocks).** Per the global binding "No Mocks" rule, this PR adds no new `vi.mock`/`jest.mock` of DB or service modules. Phase 1 ships one integration test file (`tests/integration/credentials-batch.test.js`) that targets `wrangler dev` bound to a Neon test branch + sandbox Cloudflare account + a synthetic-OIDC-token test rig. Building that rig is part of Phase 1, not deferred. Existing chittyconnect mock-based tests stay untouched; they are not migrated by this PR. Mock-based override (the original (b) option) is **not on the table** — proposing it would normalize a binding-rule violation.
- **[Q4] → Sequencing.** PR #54 must merge first; Phase 2 rebases on the resulting `main`. The OIDC zones plan is genuinely independent of both phases of this plan because Phase 1's batch handler inlines provisioner routing (Step 1.1 — `provisioner.provision()` called directly per entry), and Phase 2 uses only the new batch route. Neither phase depends on the OIDC zones plan teaching the single-cred OIDC route to do the same thing. The two efforts can land in any order.
- **[Q5] → 1 charge per batch call.** Mirrors the cost shape (one HTTP call) and prevents legit batch use from exhausting limits faster than equivalent single calls would.
- **[Q6] → Per-entry success/error in `results[]`.** Top-level `success: true` if any entry succeeded, `metadata.partial: true` if any failed. Caller decides whether partial counts as success. Action explicitly checks per-entry `success` and only writes outputs for successful entries (see Phase 2 Step 2.1).

## Implementation Steps

### Phase 1 — chittyconnect

#### Step 1.1: Worktree off clean main, batch handler module
**Repo:** `chittyconnect`
**Branch creation:** `git -C ../chittyconnect worktree add ../chittyconnect-batch -b feat/credentials-batch-endpoint origin/main`
**Files:**
- `src/api/handlers/credentials-batch.js` (new) — shared handler
- `src/api/routes/credentials.js` (modify) — mount `/batch` (API-key auth)
- `src/api/routes/github-actions.js` (modify) — mount `/credentials/batch` (OIDC auth)

**What:**
- Shared handler accepts:
  ```json
  { "requests": [
      { "id": "cf",   "type": "cloudflare_workers_deploy", "context": {"service":"chittyops","zones":["..."]}},
      { "id": "neon", "type": "neon_database_connection",  "context": {"database":"chittyops"}},
      { "id": "npm",  "credential": "NPM_TOKEN" }
  ]}
  ```
  (Q1 locked to C1 — mixed entries supported.)
- Rate-limit: 1 charge against `requestingService` (Q5).
- Per entry: provisioner.provision() OR broker.get(credentialMap[name].path) with same fallback to env var that the existing OIDC route uses.
- Response:
  ```json
  { "success": true, "metadata": {...}, "results": [
      { "id": "cf",   "success": true, "credential": {...} },
      { "id": "neon", "success": true, "credential": {...} },
      { "id": "npm",  "success": false, "error": {"code":"...", "message":"..."} }
  ]}
  ```
- Two thin route shims (one per auth method) call the shared handler with `requestingService` derived appropriately:
  - API-key route: `apiKey.service || apiKey.name || "unknown"`
  - OIDC route: `"github:" + claims.repository`
- Org allow-list (`github-actions.js:76-97`) runs on the OIDC shim only.

**Testing:**
- Real-backend integration test only (Q3 locked — no mocks). New file `tests/integration/credentials-batch.test.js` runs against `wrangler dev` bound to a Neon test branch + sandbox CF account + synthetic-OIDC-token rig. Build the rig as part of Phase 1.
- Cases: mixed-entry success, partial failure (one bad entry), empty array → 400, oversize (>10 entries) → 400, invalid `type` → entry-level error not 4xx top-level, missing `context.service` → entry-level error, rate limit exceeded → 429 top-level.
- Unit-test the request-shape parser separately (pure-function, no mocks needed).

#### Step 1.2: Capability advertisement + docs
**Files:**
- `src/api/routes/credentials.js` (modify) — extend `GET /api/credentials/types` to add a `batch` capability marker.
- `CHARTER.md` (modify) — document new endpoint.
- JSDoc on the new handler module.

**What:** Document the request/response shape, max batch size, rate-limit behavior, mixed-entry rules.

**Testing:** lint + manual review.

#### Step 1.3: Deploy to staging, smoke test, PR
**Files:** none in repo
**What:**
- `wrangler deploy --env staging`
- Hit `https://chittyconnect-staging.chittyos.workers.dev/api/credentials/batch` with a real API key, batch including a real `cloudflare_workers_deploy` request with zones. Confirm:
  - CF token is minted (check Cloudflare dashboard for new API token entry)
  - Token's policy block includes `com.cloudflare.api.account.zone.<zone_id>` resource (provisioner's zone-scoping at `credential-provisioner-enhanced.js:601-608`)
  - Response shape matches spec
- Open PR. Include staging-test evidence in PR body (token ID + screenshot of policies, redacted token value).

**Testing:** real-backend smoke against staging worker; PR auto-checks (lint, existing test suite).

### Phase 2 — chittyops

**Prereq:** PR #54 merged. Phase 1 PR merged and deployed to production (`connect.chitty.cc`). The OIDC zones plan is *not* a prereq — Phase 1 inlines provisioner routing in the batch handler, so this plan stands alone.

#### Step 2.1: Refactor action to use batch endpoint
**Repo:** `chittyops`
**Branch:** `feat/getchitty-creds-batch` off `feat/getchitty-creds-zones` (which will be `main` after #54 merges)
**Files:**
- `.github/actions/getchitty-creds/action.yml` (modify)

**What:**
- Build a batch request from the comma-separated `credentials` input. Map each credential name to either a provisioner type or a static-fetch entry:
  - `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` → single `{type:"cloudflare_workers_deploy", context:{service, zones, purpose}}` entry — provisioner returns both fields in `credential.value` + `credential.account_id`.
  - `NEON_DATABASE_URL` → `{type:"neon_database_connection", context:{database, readonly:false}}`.
  - `GITHUB_TOKEN` → `{credential: "GITHUB_APP_ID"}` + `{credential: "GITHUB_APP_PRIVATE_KEY"}` static-fetch entries.
  - `NPM_TOKEN`, `CHITTYREGISTER_TOKEN` → **dropped from this PR per Q2** (deferred). Action emits empty outputs for these names; downstream workflows that need them must supply via `secrets.NPM_TOKEN` / `secrets.CHITTYREGISTER_TOKEN` until the follow-up plan adds them to chittyconnect.
- One POST to `/api/github-actions/credentials/batch` (OIDC) or `/api/credentials/batch` (API-key fallback).
- Parse `results[]` by `id`, populate the appropriate output (`cloudflare_token`, `account_id`, `npm_token`, `github_token`, `neon_database_url`, `register_token`).
- Mask all returned secrets (existing `::add-mask::` loop, extended).
- Drop fields that come back with `success: false` (don't error the action — caller might not need them all).

**Testing:**
- Manual: trigger `chittycommand/getchitty-creds-example.yml` (or a new test workflow) against the deployed batch endpoint. Verify all requested credentials are populated in workflow outputs.
- Add a smoke test workflow in chittyops that runs the action with each combination of inputs and prints (masked) which outputs are populated.

#### Step 2.2: Update example workflow + docs
**Files:**
- `chittycommand/.github/workflows/getchitty-creds-example.yml` (modify, separate PR in that repo)
- `chittyops/.github/actions/getchitty-creds/README.md` (new or modify) — document zones, batch behavior, output mapping.

**What:** Sync the example to call the action with `zones` set and document the new behavior.

**Testing:** workflow runs green; README renders correctly on github.com.

## Out of scope (deliberate)

- Migrating chittyconnect's existing mock-based tests to real-backend. The Q3 lock binds only this PR's *new* tests; pre-existing mocked tests stay untouched. A separate ecosystem-wide migration plan handles those.
- Removing the existing `POST /api/credentials/provision` single-cred endpoint. Keep it; batch is additive.
- Adding more credential types to the provisioner (NPM mint, GitHub App install token mint, etc.) — separate plans per type.
- Updating `chittyops/.github/workflows/reusable-worker-deploy.yml` to use the action. Currently uses static `CLOUDFLARE_API_TOKEN`. Switching it to ChittyConnect is a separate plan with its own rollout risk.

## Risk & rollback

- **Risk:** Batch endpoint introduces an attack surface where a single API key can request many credentials per call. Mitigation: existing per-cred validation + DENIED checks run per entry; rate limit caps total calls; max 10 entries per batch.
- **Risk:** Partial-success response shape gets misinterpreted by the action as full success, missing creds silently. Mitigation: action explicitly checks per-entry `success` and only writes outputs for successful entries; failed entries log a warning to the action summary.
- **Risk:** Phase 1 deployment to production hits the chicken-and-egg (chittyconnect's own deploy.yml uses static creds). No mitigation needed — explicitly out of scope, documented.
- **Rollback:** Phase 1 is purely additive (new route + new handler module). Revert is a single commit. Phase 2's action change is also revert-friendly (single-file modification).
