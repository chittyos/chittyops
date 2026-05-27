---
uri: chittycanon://docs/ops/classification/mint-and-canon-audit-log
namespace: chittycanon://docs/ops
type: classification
related_fix: F-068
generated: 2026-05-27
---

# Phase Classification — Mint → Ledger and canon_audit_log → Ledger

**Goal:** Classify two pending migration phases as `SAFE_REPO` or `NEEDS_APPROVAL` so the operator knows which can move forward this session vs. which require explicit gating.

## Phase: Mint → Ledger

**What it means:** Routing ChittyMint emissions (ChittyID issuance events, service registrations, certificate mints) into the canonical ChittyLedger hash-chain so every mint becomes a ledger entry with sequence number + signature.

**Current state:**
- `CHITTYFOUNDATION/chittymint` exists as a canonical service.
- `CHITTYFOUNDATION/chittyledger/api/` exposes the hash-chain at `ledger.chitty.cc`.
- No wire integration yet (chittymint does not currently call ledger.chitty.cc on emission).
- Per F-068, ChittyLedger substrate is canonical, so this routing is architecturally correct.

**Required changes (if greenlit):**
1. Add a `LEDGER_URL` env var to `chittymint/wrangler.toml` (or its equivalent config).
2. In chittymint's emission path, POST each mint event to `ledger.chitty.cc/api/v1/entries` with the canonical payload shape (entry_type=mint, payload_hash, sig).
3. Add a circuit-breaker so ledger downtime does not block mint emission — buffer to KV + retry, or queue.
4. Add a chittymint-side ledger reference field to the mint record (so the ledger sequence number is recoverable).
5. End-to-end test: mint a synthetic ChittyID, verify it appears in `ledger.chitty.cc/api/v1/entries?type=mint`.

**Classification:**

| Sub-step | Class | Reason |
|---|---|---|
| Architecture doc | SAFE_REPO | Doc-only |
| chittymint code change (POST to ledger) | SAFE_REPO for the diff; **NEEDS_APPROVAL** for the PR (PR creation gated) |
| Add LEDGER_URL secret | NEEDS_APPROVAL | secret change |
| Add KV namespace for circuit-breaker buffer | NEEDS_APPROVAL | binding change requires deploy |
| Deploy the change | NEEDS_APPROVAL | deploys gated |
| End-to-end test against production | NEEDS_APPROVAL | live mint mutation |

**Overall:** **NEEDS_APPROVAL** for execution. **SAFE_REPO** for authoring the design doc.

## Phase: canon_audit_log → Ledger

**What it means:** Routing chittycanon's `canon_audit_log` events (governance changes, doc registrations, certificate issuances by the canon registry) into ChittyLedger so canonical governance has the same hash-chain integrity guarantee as evidence.

**Current state:**
- `chittycanon://core/services/canon` is the canon registry.
- `canon_audit_log` is an internal table/event stream within the canon service (per the spec; not directly inspected in this session).
- No wire integration to ChittyLedger today.

**Required changes (if greenlit):**
1. In the canon service's audit-log emitter, mirror each entry to `ledger.chitty.cc/api/v1/entries` with `entry_type=canon_audit`, including the chittycanon URI of the document/policy changed.
2. Same circuit-breaker pattern as Mint → Ledger.
3. End-to-end test: register a new SOP via canon, verify a `canon_audit` entry appears in ledger.

**Classification:**

| Sub-step | Class | Reason |
|---|---|---|
| Architecture doc | SAFE_REPO | Doc-only |
| canon service code change | SAFE_REPO for diff; **NEEDS_APPROVAL** for PR |
| Add LEDGER_URL secret to canon | NEEDS_APPROVAL | secret change |
| Deploy canon update | NEEDS_APPROVAL | deploy + canon is a Tier-1 service; high blast radius |
| Verify in production | NEEDS_APPROVAL | live canon registration |

**Overall:** **NEEDS_APPROVAL** for execution. **SAFE_REPO** for authoring the design doc.

## Why both phases are NEEDS_APPROVAL

Both phases require:
- Code changes that need to land via PRs (gated by current goal).
- Secret provisioning for `LEDGER_URL` and per-service write tokens.
- Production deploys to high-tier services (chittymint = Tier 2, canon = Tier 1).
- End-to-end tests that mutate live registries.

None of these are SAFE_LOCAL or SAFE_REPO without operator gating.

## Recommended next gate

When the operator is ready, the natural sequence is:

1. Write design docs for both phases (SAFE_REPO — can be done now if useful).
2. Open chittyledger-side PRs that ensure `POST /api/v1/entries` accepts `entry_type=mint` and `entry_type=canon_audit` schemas. (Possibly already supported — needs a check against the canonical API.)
3. Open chittymint-side and canon-side PRs that emit to ledger.
4. Provision `LEDGER_URL` + per-service write tokens via ChittyConnect.
5. Deploy in order: ledger schema → chittymint → canon. Each with rollback.
6. Verify end-to-end.

Time estimate (operator-driven): 4–8 hours per phase, sequential.
