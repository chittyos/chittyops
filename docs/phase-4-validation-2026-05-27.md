# Phase 4 Validation Report — May 27, 2026

**Updated:** May 27, 2026 (post-deploy)
**SoT:** `spec/daily-updates-orchestration-v0.5.md` (locked, 3 adversarial passes converged)
**Status:** **GATE 1 ✅ · GATE 2 ✅ (with caveat) · GATE 3 not started**

> **Auditor note (incorporated 2026-05-27):** The original goal-cmd referenced `registry.chitty.cc/api/v1/service/<id>`. That endpoint returns 404 — chittyregistry's actual lookup is `/api/v1/tools/<chitty_id>` (entity_type=T for services). All four Phase 4 workers verified at the corrected URL.

> **Report path:** The goal-set path `/mnt/user-data/outputs/phase-4-validation-YYYY-MM-DD.md` is a Claude.ai sandbox path that doesn't exist on this Linux VM. This report lives in-repo at `docs/phase-4-validation-2026-05-27.md`.

---

## 1. What landed

| Step | Status | Evidence |
|------|--------|----------|
| 18/18 INDEX artifacts at canonical chittyops paths | ✅ | PR #72 (merged to main) |
| Compliance triad (CHARTER.md + CHITTY.md + AGENTS.md) × 4 workers | ✅ | 12 files under `routines/comms/*`, `routines/ops/flow-hash-check/`, `services/comptroller/` |
| Local stubs (types.ts + crypto.ts + wrangler.toml × 4) | ✅ | PR #72 |
| `wrangler deploy --dry-run` × 4 | ✅ | Verified locally |
| `tail_consumers = chittytrack` × 4 | ✅ | Corrected from initial `chittytail` |
| `/health` + `/api/v1/status` in worker.ts × 4 | ✅ | Added in this PR |
| Registration payloads × 4 | ✅ | `registrations/*.json` |
| SOP for health-only proof-of-control | ✅ | `docs/SOP-health-only-proof-of-control.md` |
| Neon schema + seeds applied to **prod** (`restless-grass-40598426/main`) | ✅ | 9 tables + RLS + seeds + comptroller_reader role |
| Neon dev branch `phase4-dev-2026-05-27` validated | ✅ | `br-square-shape-aeqt6njp` |
| `PILOT_MODE=true AND BASELINE_LEARNING=true` in `chittyops.policy_flags` (prod) | ✅ | Confirmed via SELECT |
| 4 workers deployed as health-only stubs at `*.chitty.cc` | ✅ | 200 OK on `/health` |
| 4 workers registered at register.chitty.cc | ✅ | ChittyIDs assigned (see §3) |
| 4 workers return 200 from `registry.chitty.cc/api/v1/tools/<chitty_id>` | ✅ | See §3 |

## 2. GATE map

| Gate | Status | Notes |
|------|--------|-------|
| **GATE 1** — Repo scaffold + stubs + validation in-PR | ✅ Complete | All 18 + stubs + registry#68 blocker called out; landed via PR #72 |
| **GATE 2** — Workers registered + dry-runs pass + PR merged | ✅ Complete (wording corrected) | Registry endpoint is `/api/v1/tools/<chitty_id>` not `/api/v1/service/<id>` |
| **GATE 3** — 07:00 CT cron + comptroller daily report + privileged-domain test | ❌ Not started | Health-only stubs are deployed; full worker logic + bindings + secrets + cron NOT enabled |

## 3. Worker registry state

| Worker | ChittyID | Registry URL | Deploy state |
|--------|----------|--------------|--------------|
| daily-comms-triage | `03-1-USA-0955-T-2605-1-37` | https://registry.chitty.cc/api/v1/tools/03-1-USA-0955-T-2605-1-37 | health-only stub |
| daily-comms-triage-realtime | `03-1-USA-0735-T-2605-1-73` | https://registry.chitty.cc/api/v1/tools/03-1-USA-0735-T-2605-1-73 | health-only stub, PILOT_DISABLED |
| comptroller | `03-1-USA-9636-T-2605-1-75` | https://registry.chitty.cc/api/v1/tools/03-1-USA-9636-T-2605-1-75 | health-only stub |
| flow-hash-check | `03-1-USA-6434-T-2605-1-54` | https://registry.chitty.cc/api/v1/tools/03-1-USA-6434-T-2605-1-54 | health-only stub |

All four return HTTP 200 from registry; all four serve HTTPS `/health` returning `{ status: "ok", service, version, ts }`.

## 4. Documented exception: health-only proof-of-control deploy

The Channel Registration Protocol's "register before deploy" rule is unachievable as literally written because `register.chitty.cc` requires proof-of-control via an HTTPS `/health` endpoint and a `/.well-known/chitty-register-challenge/<token>` route. **A health-only deploy is therefore permitted strictly for registration, under the constraints in `docs/SOP-health-only-proof-of-control.md`.** Production behavior (cron, real bindings, secrets) is explicitly out of scope for a health-only stub.

This SOP was written after the Phase 4 deploy (2026-05-27) as auditor remediation.

## 5. GATE 3 — what remains

Per `docs/SOP-health-only-proof-of-control.md` §"Promotion to full deploy":

1. Replace each `/health`-only stub with the full `worker.ts` from this repo (which now also exports `/health` + `/api/v1/status` for compliance).
2. Provision real bindings:
   - `daily-comms-triage` — `KV_LOCKS` namespace id, `NEON` Hyperdrive id pointing at `restless-grass-40598426`, R2 bucket `chittyops-actions-raw`
   - `daily-comms-triage-realtime` — same `KV_LOCKS` shared with cron sibling
   - `flow-hash-check` — `GAM_TUNNEL_URL`, `NOTION_ALERT_PAGE_ID`, `REPO_FLOW_HASH_WS1`, `REPO_FLOW_HASH_WS2`
   - `comptroller` — `NEON_COMPTROLLER` Hyperdrive (`comptroller_reader` role), `KV_STATE`, `NOTION_BUSINESS_REPORT_PAGE_ID`, `NOTION_LEGALINK_REPORT_PAGE_ID`
3. Provision secrets via `wrangler secret put`:
   - `comptroller` — `CF_AI_GATEWAY_TOKEN`, `ANTHROPIC_BILLING_KEY`, `GOOGLE_AI_STUDIO_KEY`, `CF_ACCOUNT_API_TOKEN`, `QUO_API_KEY`, `NOTION_API_KEY`
   - `flow-hash-check` — `NOTION_API_KEY`
4. Run **Two-Space RLS synthetic test** — insert a synthetic privileged-domain (`*@vanguardadvocates.com`) IngestItem; assert it lands in `actions_v1` with `routing=legalink`; assert a Business-space `SET app.context='business'; SELECT FROM actions_v1` returns 0 rows for that item.
5. Enable cron triggers (uncomment in each `wrangler.toml`).
6. Wait for first 07:00 CT scheduled run; confirm heartbeat at `discovery.chitty.cc/heartbeat/daily-comms-triage`.
7. Confirm comptroller daily report appears in Business Notion at 07:00 CT.

Steps 1–7 are operator-driven and route through ChittyConnect when its backends are reconnected.

## 6. Operator-required actions to close GATE 3

- Bring ChittyConnect backends online (currently 0/14 connected on ch1tty v4.1.0) so wrangler/Neon/Notion bindings can be provisioned through the canonical broker.
- Alternatively, authorize each binding/secret push via a recorded operator override.
- Quote the post-GATE-3 confirmation: "OK".
