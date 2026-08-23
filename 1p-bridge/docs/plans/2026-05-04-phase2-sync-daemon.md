# chitty-1p-bridge Phase 2: Sync Daemon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-shot sync daemon that propagates 1Password value changes into Cloudflare Secrets Store within 5 minutes, governed by a TOML watchlist, with hash-based change detection and ChittyChronicle audit logging.

**Architecture:** One-shot Node process triggered by systemd timer every 5 minutes. Reads watchlist TOML → resolves each path via Phase 1 OpClient → hashes value → compares with state cache → on change, writes to CF Secrets Store via REST API and updates cache. No long-running daemon (avoids restart-on-failure, drift, leak surface). State cache is JSON file at `/var/lib/chitty-1p-bridge/state.json` containing only hashes — never values.

**Tech Stack:** Node 22 LTS, TypeScript 5.x strict. Adds: `@iarna/toml` (watchlist parser), Cloudflare REST API via built-in fetch (no SDK — keep dep surface small). Reuses Phase 1 `OpClient` + chronicle + env loader.

**Working directory:** `chittyserv-dev:~/projects/github.com/CHITTYOS/chittyops/1p-bridge` (Phase 1 lib + CLI present from PR #59).

**Race rule (LOAD-BEARING):** `wrangler deploy` MUST update 1P first, then `chitty-op sync run`, then deploy. Without this ordering, the bridge would overwrite a fresh deploy value with a stale 1P value within 5 minutes. Documented + enforced via Task 9 below.

---

## File structure additions

```
1p-bridge/
├── src/
│   ├── lib/
│   │   ├── watchlist.ts            # NEW: TOML parser + schema validator
│   │   ├── cf-secrets-client.ts    # NEW: CF Secrets Store REST API
│   │   ├── state-cache.ts          # NEW: hash JSON read/write (atomic)
│   │   ├── hasher.ts               # NEW: SHA-256 of utf-8 bytes (value-only)
│   │   └── sync-runner.ts          # NEW: orchestrator (watchlist → diff → push)
│   ├── bin/
│   │   └── chitty-1p-bridge-sync.ts  # NEW: one-shot entry point
│   └── cli/
│       └── sync.ts                 # NEW: `chitty-op sync run [--pre-deploy]`
├── systemd/
│   ├── chitty-1p-bridge-sync.service  # NEW: one-shot unit
│   └── chitty-1p-bridge-sync.timer    # NEW: every 5 min
├── etc/
│   └── watchlist.example.toml         # NEW: example config
├── scripts/
│   ├── install-systemd.sh             # NEW: install + enable units
│   └── lint-watchlist.sh              # NEW: drift check vs chittyconnect
└── tests/
    ├── watchlist.test.ts
    ├── cf-secrets-client.test.ts
    ├── state-cache.test.ts
    ├── hasher.test.ts
    └── sync-runner.test.ts
```

---

## Watchlist schema (TOML)

```toml
# /etc/chitty-1p-bridge/watchlist.toml
schema_version = "1"

[[entry]]
op_path        = "op://Engineering/chittyconnect-prod/credential"
cf_account_id  = "0bc21e3a5a9de1a4cc843be9c3e98121"
cf_store_id    = "<store-id>"
cf_secret_name = "MERCURY_API_KEY"
purpose        = "chittyconnect Mercury API key"
```

**Validation rules at load:**
- TOTP / OTP fields **rejected** (rotates every 30s — not a sync target).
- Each `op_path` MUST resolve to a single string field (no item-wide sync).
- Empty values reject load.
- `cf_account_id` MUST be in the build-time allowlist.
- Duplicate `cf_secret_name` within the same `cf_store_id` rejects.

---

## Tasks

### Task 1: Watchlist parser + validator

- [ ] Implement `src/lib/watchlist.ts` exporting `parseWatchlist(path: string): Watchlist`
- [ ] Reject TOTP fields at load (any field whose 1P type is `OTP` or whose `purpose` matches /OTP|TOTP/i)
- [ ] Reject empty values, duplicates, account-allowlist violations
- [ ] Type: `{ schema_version: "1"; entries: Entry[] }`
- [ ] Tests: valid load, TOTP rejection, dup rejection, empty rejection, schema_version mismatch, unknown account

### Task 2: Hasher

- [ ] Implement `src/lib/hasher.ts` exporting `hashValue(s: string): string` (SHA-256 hex)
- [ ] **CRITICAL:** hash the STRING value only, never the 1P item envelope (envelope's `updated_at` / `version` / `id` mutate on every write — would loop in Phase 3)
- [ ] Tests: stable hash for same input, different hash for different input, unicode handling

### Task 3: State cache

- [ ] Implement `src/lib/state-cache.ts` with read/write of `{ [op_path]: { hash, last_synced_at, cf_target } }`
- [ ] Atomic write (write to `.tmp`, rename — survives crash mid-write)
- [ ] Path: `/var/lib/chitty-1p-bridge/state.json`, mode 0644 (hashes only — non-secret)
- [ ] Tests: round-trip, atomic write under simulated crash, missing-file case (treat as empty)

### Task 4: CF Secrets Store client

- [ ] Implement `src/lib/cf-secrets-client.ts` with `putSecret(accountId, storeId, name, value): Promise<void>`
- [ ] Auth via `CLOUDFLARE_API_TOKEN` resolved from `op` (1Password) at startup
- [ ] Token MUST have Secrets Store Edit scope only (not Workers Deploy)
- [ ] Use built-in fetch; retry once on 5xx; surface 4xx with body
- [ ] Tests: success path, 4xx surface, retry-on-5xx, **value redacted in all error logs and stack traces**

### Task 5: Sync runner

- [ ] Implement `src/lib/sync-runner.ts` exporting `runSync(): Promise<SyncReport>`
- [ ] For each watchlist entry: resolve via OpClient → hash → compare cache → on change push to CF + update cache + log to chronicle
- [ ] Concurrency: serial (avoid 1P rate limits + clearer audit trail)
- [ ] On any push failure: log to chronicle, continue with next entry, exit non-zero at end
- [ ] Report: counts of `unchanged` / `synced` / `failed` + per-entry detail
- [ ] Tests: no-op pass, single change, partial failure, all-fail exit code, OpClient error handling

### Task 6: One-shot entry point + CLI subcommand

- [ ] Implement `src/bin/chitty-1p-bridge-sync.ts` — load env → call `runSync()` → write report to chronicle → exit code from report
- [ ] Add to `package.json` `bin`: `"chitty-1p-bridge-sync": "./dist/bin/chitty-1p-bridge-sync.js"`
- [ ] Add `chitty-op sync run` CLI subcommand (alias for direct invocation, useful for ad-hoc + `--pre-deploy` flag)

### Task 7: systemd unit + timer

- [ ] Write `systemd/chitty-1p-bridge-sync.service` — `Type=oneshot`, `User=chitty-bridge`, `ExecStart=/opt/chitty-1p-bridge/dist/bin/chitty-1p-bridge-sync.js`, `EnvironmentFile=/etc/chitty-1p-bridge/env` (mode 0600)
- [ ] Write `systemd/chitty-1p-bridge-sync.timer` — `OnUnitActiveSec=5min`, `OnBootSec=2min`, `Persistent=true`
- [ ] Install script: `scripts/install-systemd.sh` — copies units to `/etc/systemd/system/`, creates `chitty-bridge` system user if missing, sets directory permissions, `systemctl daemon-reload` + `enable --now`

### Task 8: Watchlist linter (CI gate)

- [ ] Implement `scripts/lint-watchlist.sh` — diffs the watchlist's CF Secrets targets against `chittyconnect/wrangler.jsonc` Secrets Store bindings; fails on drift
- [ ] Add to chittyconnect CI: PRs touching `wrangler.jsonc` Secrets Store bindings run this lint against the canonical watchlist
- [ ] Add to chittyops CI: PRs touching `1p-bridge/etc/watchlist.example.toml` run the lint

### Task 9: Race-rule enforcement

- [ ] Add `1p-bridge/docs/deploy-protocol.md` documenting the 1P-first → sync → deploy ordering
- [ ] Add `chitty-op sync run --pre-deploy` flag — runs sync once, blocks until report is `synced` for all entries touched, then prints OK
- [ ] Add to chittyconnect deploy script: `chitty-op sync run --pre-deploy` invocation before `wrangler deploy` (gated by env var so non-1P-touching deploys skip)

### Task 10: Preflight + ship

- [ ] All Phase 2 tests green (`npm run preflight` + bash handler tests)
- [ ] Update CHARTER.md / CHITTY.md to mark Phase 2 as shipped
- [ ] Update `registration.json` capabilities: add `["sync.run", "sync.dry-run"]`
- [ ] Tag `v0.2.0`
- [ ] Update `project_chitty_1p_bridge.md` memory entry

---

## Out of scope (Phase 3-4)

- **Bi-directional sync** (KV-rotated values written back to 1P) — Phase 3
- **1P Events API client** (sub-minute propagation) — Phase 4
- **Multi-tenant watchlists** — Phase 4+
- **Web dashboard** — never (CLI + chronicle audit only by design)

---

## Acceptance criteria

- [ ] systemd timer is enabled and active on chittyserv-dev
- [ ] First post-install run succeeds (or no-ops cleanly if no changes)
- [ ] Manually rotating a 1P field results in the matching CF Secret being updated within 5 minutes
- [ ] Chronicle logs show every sync attempt with redacted values
- [ ] State cache contains only hashes, never values (audit by inspecting `/var/lib/chitty-1p-bridge/state.json`)
- [ ] CI lint catches a deliberately-introduced `wrangler.jsonc` drift in synthetic test
- [ ] Pre-deploy sync prevents the "stale-1P-overwrites-fresh-deploy" race in synthetic test

---

## Dependencies on other services / decisions

- **CF Secrets Store API** — token with `Secrets Store: Edit` scope (not Workers Deploy) provisioned via 1P; user creates the token, stores in 1P at known path, references in env file.
- **chittyconnect deploy script** — Task 9 wires bridge into chittyconnect's deploy. Coordination needed when chittyconnect rolls a new deploy script version.
- **chitty-bridge system user** — created idempotently by install script. Needs read on `/etc/chitty-1p-bridge/env`, write on `/var/lib/chitty-1p-bridge/`, no sudo.
- **op CLI signed in** (Phase 0 prereq, unchanged) — runtime depends on `op read` succeeding for the bridge's CF API token resolution.
