# ChittyConnect OIDC Zones Support

**Repo (implementation target):** `CHITTYOS/chittyconnect`
**Plan home (this file):** `CHITTYOS/chittyops/plans/chittyconnect-oidc-zones-support/plan.md`
**Branch:** `feat/oidc-credentials-zones-support`
**Description:** Teach `/api/github-actions/credentials` to honor `context.zones` by routing `cloudflare_workers_deploy` requests through `EnhancedCredentialProvisioner`, unblocking zone-scoped CF tokens via OIDC.

## Goal

Today the OIDC route in chittyconnect bypasses `EnhancedCredentialProvisioner` and just returns static stored credentials via `credentialMap` + `broker.get(path)`. As a result, zones cannot be honored on the OIDC path — the only way to get a zone-scoped CF API token is the API-key path. This is the gap called out as a follow-up in `chittyops` PR #54 (`feat(getchitty-creds): add zones input + fix API-key payload shape`). Closing it enables the chittyconnect OIDC endpoint to mint zone-scoped Cloudflare credentials when callers send `context.zones`, but existing chittyops worker-deploy workflows will still require separate workflow adoption before they can stop relying on stored `CHITTYCONNECT_API_KEY`, `CLOUDFLARE_API_TOKEN`, or `CLOUDFLARE_ACCOUNT_ID` secrets.

## Context (from research)

- **OIDC route:** `src/api/routes/github-actions.js`
  - L120: `credentialMap` (static path → stored secret)
  - L175–180: `broker.get(config.path)` — bypasses provisioner entirely
  - Returns `{success, credentials: {NAME: value, ...}, metadata: {...}}`
- **Provisioner:** `src/services/credential-provisioner-enhanced.js`
  - `provision(type, context, requestingService, requestMetadata)` already supports `cloudflare_workers_deploy` with `context.zones` (L97, L224, L569–608, L1144). Drops zone-scoped permissions cleanly when zones absent (L582 log).
  - Returns single-cred shape `{success, credential: {type, value, account_id, expires_at, scopes, ...}, usage_instructions}`.
- **API-key route:** `src/api/routes/credentials.js` already wires the provisioner correctly with `{type, context}` shape — the model to mirror.
- **Tests:** Existing scenarios in `tests/scenarios/`, no current `github-actions-credentials.test.js` — add one.
- **Caller:** `chittyops/.github/actions/getchitty-creds/action.yml` already forwards `zones` in the OIDC payload as of PR #54 (currently ignored server-side — exactly what this plan addresses).
- **Chittyconnect branch state (blocker):** `smoke/1password-sdk-eval` has uncommitted WIP unrelated to this work. The new branch must fork from clean `main`.

## Open clarifications

All defaults locked in (decided 2026-05-03):

- **Q1 → Branch base = `origin/main`** (clean). The chittyconnect WIP on `smoke/1password-sdk-eval` is unrelated and is not a prerequisite for this PR.
- **Q2 → Keep legacy `{credentials: [...]}` request shape** as-is. The new `{type, context}` shape lands alongside (discriminator on body); callers migrate when they need zones. Deprecation of the legacy shape is a separate future PR.
- **Q3 → Z1 (uniform response shape).** Map provisioner's single-cred output into the existing OIDC multi-cred envelope: `credentials.CLOUDFLARE_API_TOKEN = credential.value`, `credentials.CLOUDFLARE_ACCOUNT_ID = credential.account_id`. No client-side changes needed beyond what chittyops PR #54 already ships.
- **Q4 → Integration-test against the deployed worker once `connect.chitty.cc` recovers.** Per CLAUDE.md "no mocks." If recovery drags long enough to block this PR, fall back to `wrangler dev` against a Cloudflare sandbox account + Neon test branch — but only as an explicitly-noted mitigation in the PR body, not the default.
- **Q5 → `requestingService = "github:" + oidcResult.claims.repository`** (e.g. `github:CHITTYOS/chittyops`). Mirrors the API-key path's `apiKeyInfo.service` namespace for rate-limit and audit consistency.

## Implementation Steps

### Step 1: Route OIDC `cloudflare_workers_deploy` through provisioner
**Files:**
- `src/api/routes/github-actions.js` (modify)

**What:**
1. Parse request body once, branch on shape:
   - `{type, context}` → new provisioner path (this PR)
   - `{credentials: [...]}` → existing broker path (unchanged)
   - Neither → 400
2. New path:
   - Derive `requestingService = "github:" + oidcResult.claims.repository`
   - Build `requestMetadata` from headers (matches credentials.js:55-62 pattern)
   - Validate `type` is in provisioner's allowlist (initially: `cloudflare_workers_deploy` only — others rejected with 400)
   - Allow-org check still runs (lines 76–97)
   - Call `provisioner.validateRequest(type, context, requestingService)` → `provisioner.checkRateLimit(requestingService)` → `provisioner.provision(type, context, requestingService, requestMetadata)`
   - Map error throws to status: rate limit → 429, DENIED → 403, required/Unknown type → 400, not configured → 503, else 500 (mirror credentials.js:82-114)
3. Response shape (Z1 — recommended): transform provisioner output to the existing OIDC envelope:
   ```json
   {
     "success": true,
     "credentials": {
       "CLOUDFLARE_API_TOKEN": "<credential.value>",
       "CLOUDFLARE_ACCOUNT_ID": "<credential.account_id>"
     },
     "metadata": {
       "repository": "...", "workflow": "...", "actor": "...",
       "ref": "...", "sha": "...", "run_id": "...",
       "issued_at": "...",
       "expires_at": "<credential.expires_at>",
       "scopes": ["<credential.scopes...>"],
       "type": "cloudflare_workers_deploy"
     }
   }
   ```
4. Existing D1 `github_actions_credential_access` log keeps firing (annotated `credentials = type` for the new path).

**Testing:**
- Boot `wrangler dev` (or hit deployed once recovered) with a synthetic OIDC token from a test rig.
- Verify: `{type:"cloudflare_workers_deploy", context:{service:"chittyops",purpose:"package-publish",zones:["<zone_id>"]}}` returns a token whose policies include the `com.cloudflare.api.account.zone.<zone_id>` resource block (provisioner's existing zone-scoping logic at L601-608).
- Verify: same payload without `zones` still returns a token (account-scoped policies only) and the provisioner emits the "Dropping zone-scoped permissions…" log.
- Verify: legacy `{credentials:["CLOUDFLARE_API_TOKEN"]}` payload still returns the broker-fetched stored token, byte-for-byte equal to current behavior.
- Verify error mapping: `type` not in allowlist → 400; rate limit exhausted → 429; missing required `context.service` → 400.

### Step 2: Integration tests
**Files:**
- `tests/scenarios/github-actions-credentials.test.js` (new)

**What:**
- Pick the test runner already in use (`tests/scenarios/*.test.js` pattern).
- Cases (all using real Cloudflare API + Neon test branch + real OIDC token from a test rig — no mocks):
  1. New shape, with zones → token includes zone-scoped permissions for those zones.
  2. New shape, no zones → token is account-scoped only.
  3. New shape, unknown `type` → 400 with allowlist in error.
  4. Legacy `credentials` array → unchanged behavior.
  5. Org not in allowlist → 403 (regression test for existing behavior).
  6. Missing OIDC token → 401 (regression).

**Testing:**
- `npm test tests/scenarios/github-actions-credentials.test.js`
- Run in CI as a required check.

### Step 3: Docs and capability advertisement
**Files:**
- `src/api/routes/github-actions.js` (top-of-file docstring)
- `CHARTER.md` and/or `.chittyconnect.yml` (capability list — confirm location)
- (cross-repo follow-up, not part of this PR) `chittyops/.github/actions/getchitty-creds/action.yml` — update the `zones` input description to drop the "currently ignored on OIDC" caveat once this PR merges.

**What:**
- Document new request shape and response in the route's JSDoc.
- Add `cloudflare_workers_deploy` (with optional zones) to the chittyconnect capability manifest.

**Testing:**
- `npm run lint` / docs build (whatever chittyconnect uses).
- Visual review of CHARTER.md diff.

## Out of scope (deliberate)

- Adding more `type` values to the OIDC path (e.g. `neon_database_create`, `npm_publish`). One type at a time; add when there's demand and a provisioner implementation.
- Removing the legacy `credentials`-array request shape. Deprecate later in a separate PR after callers migrate.
- Updating chittyops PR #54 wording — that goes as a tiny follow-up commit in chittyops once this lands.

## Risk & rollback

- **Risk:** A subtle regression in the existing legacy-path behavior. Mitigation: test case #4 above asserts byte-for-byte equality.
- **Risk:** Provisioner mints a token without zone-scoped permissions when caller intended zone scoping (typo in zone ID, etc.). Mitigation: provisioner already logs the drop (L582); add `metadata.dropped_permissions` to response so callers can detect silent demotion.
- **Rollback:** Pure additive change to a single route. Revert the route file commit; legacy callers continue working.
