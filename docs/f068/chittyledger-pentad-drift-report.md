---
uri: chittycanon://docs/ops/drift/chittyledger-pentad
namespace: chittycanon://docs/ops
type: drift-report
version: 1.0.0
status: DRAFT
related_fix: F-068
generated: 2026-05-27
---

# ChittyLedger Pentad Drift Report — F-068

**Scope:** Comparison of Pentad-template adherence between the canonical substrate (`CHITTYFOUNDATION/chittyledger`) and the projection/fork (`CHITTYOS/chittyledger`).

**Canonical Pentad reference:** `chittycanon://gov/sops/020-service-authoring-pentad`

**TL;DR:** `CHITTYOS/chittyledger` violates the canonical Pentad in multiple ways. It is **not** a Pentad-compliant variant of the canonical service; it is a separate React/Drizzle web app that should be reclassified as a **Finance/Evidence projection** under F-068 and archived as `chittyledger` (the name conflicts with the canonical service).

---

## 1. Canonical baseline

`CHITTYFOUNDATION/chittyledger` (canon):

| Aspect | Value |
|---|---|
| Canonical URI | `chittycanon://core/services/chitty-ledger` |
| Tier | 3 (Service Layer) |
| Domain | `ledger.chitty.cc` |
| Stack | Cloudflare Workers + Hono + Neon PostgreSQL |
| Pentad triad | CHARTER.md + CHITTY.md + CLAUDE.md (all v1.0+ DRAFT, registered with canon) |
| Pentad version (CLAUDE.md inferred) | not declared explicitly; matches v0.1.0 SOP |
| Service ChittyID | (assigned via mint pipeline; see §6) |
| Scope per CHARTER | Immutable hash-chain log, chain of custody, sequence enforcement, SHA-256 signature verification |

## 2. Projection drift

`CHITTYOS/chittyledger` (fork — archive candidate):

| Aspect | Value | Drift vs canon |
|---|---|---|
| Canonical URI claim | `chittycanon://core/services/chittyledger` | **Drift:** missing hyphen — canon URI is `chitty-ledger` (CHARTER) but this AGENTS.md says `chittyledger`. Two different canonical URIs would refer to two different services. |
| Tier claim | `9` | **Drift:** canon is Tier 3. Tier 9 doesn't exist in the standard 0–5 stack. |
| Pentad triad | AGENTS.md + SECURITY.md only; **CHARTER.md missing, CHITTY.md missing, CLAUDE.md present but stub** | **Drift:** Pentad incomplete. Missing the 3 documents the canon defines. |
| Pentad version | `0.1.0` (stub per F-039) | **Drift:** stub never filled in. AGENTS.md / SECURITY.md both say "TBD per template" 88 days after stub date. |
| Service ChittyID | `TBD-pending-canonical-mint` | **Drift:** never minted. Cannot be registered with `register.chitty.cc` until minted. |
| Stack | Vite + React + Drizzle + Express server (not Cloudflare Worker) | **Drift:** completely different runtime, framework, and DB-access pattern. The two repos cannot share a deploy target. |
| Scope drift | `server/fact-extraction.ts`, `server/contradiction-detection.ts`, `server/scientific-trust-scoring.ts`, `server/legal-compliance.ts` | **Drift:** these are Evidence-pipeline concerns, not ledger concerns. They belong in `chittyevidence-db` / `chittyverify` / a dedicated `chittycounsel` fork. |
| Domain | unset (no production deploy observed at `ledger.chitty.cc` from this repo) | **Drift:** if this fork ever deployed to `ledger.chitty.cc`, it would conflict with the canonical worker. |

## 3. Pentad SOP §020 conformance scorecard

| Pentad element (per SOP §020) | FOUNDATION | OS |
|---|---|---|
| CHARTER.md present + frontmatter complete | ✅ | ❌ missing |
| CHITTY.md present + frontmatter complete | ✅ | ❌ missing |
| CLAUDE.md present + content > stub | ✅ | ⚠ present, stub |
| AGENTS.md (optional, where agents touch the service) | n/a (not required for ledger) | ⚠ present, stub |
| SECURITY.md (optional, where sensitive surfaces exist) | n/a | ⚠ present, stub |
| `service_chittyid` populated | ✅ (via mint) | ❌ `TBD-pending-canonical-mint` |
| Canonical URI matches registry entry | ✅ | ❌ different slug |
| Tier matches ecosystem standard (0–5) | ✅ (3) | ❌ (9 — invalid) |

**Conformance:** FOUNDATION 5/5 hard rules · OS 0/5 hard rules + 4 soft stubs.

## 4. Root cause

`CHITTYOS/chittyledger` was created from a Replit template (`replit.md` is at the repo root). It was named `chittyledger` before the canon was established. It is a Finance/Evidence-projection prototype mistakenly squatting on the canonical service name.

The F-039 Pentad-completion sweep added stub `AGENTS.md` + `SECURITY.md` mechanically across all ChittyOS repos; that sweep made the drift visible but did not author real content because no agent could (in good conscience) fill in stubs claiming to be the canonical ledger when the canon already exists at FOUNDATION.

## 5. Remediation under F-068

Per F-068's holding "ChittyLedger substrate + Finance/Evidence projections":

1. **Substrate** = `CHITTYFOUNDATION/chittyledger` — canonical, no changes required.
2. **Projection** = `CHITTYOS/chittyledger` content should be reclassified into one of:
   - **chittyevidence-db** — the contradiction-detection, fact-extraction, trust-scoring pipeline
   - **chittycounsel** — the legal-compliance module
   - **chittyfinance** projection (new repo, if Finance use case exists) — any actual ledger-adjacent finance use
3. **Archive `CHITTYOS/chittyledger`** with a redirect in its README to the canon + the appropriate projection.

See companion docs:
- `docs/f068/api-chittyledger-archive-plan.md`
- `docs/f068/T33-duplicate-archive-plan.md`
- `docs/f068/T35-nested-copy-removal-plan.md`

## 6. Mint → Ledger pending

`CHITTYOS/chittyledger` has `service_chittyid: TBD-pending-canonical-mint`. This block resolves on archive: an archived repo does not need a minted ChittyID. The mint pipeline for the canonical ledger has already completed (per `CHITTYFOUNDATION/chittyledger/CHITTY.md` registration entry).

## 7. Classification

| Item | Class |
|---|---|
| Read canon CHARTER + Pentad SOP | SAFE_REPO ✅ done |
| Author this drift report | SAFE_REPO ✅ done |
| Archive `CHITTYOS/chittyledger` on GitHub | NEEDS_APPROVAL — out of scope per "no PR creation, no registry mutation" |
| Move Finance/Evidence content into target projections | NEEDS_APPROVAL — per-target review required |
| Update canon registry to remove `CHITTYOS/chittyledger` entry (if any) | NEEDS_APPROVAL — registry mutation gated |
