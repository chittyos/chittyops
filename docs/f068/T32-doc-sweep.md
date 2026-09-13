---
uri: chittycanon://docs/ops/sweep/T32-chittyledger-doc-sweep
namespace: chittycanon://docs/ops
type: doc-sweep
task_id: T#32
related_fix: F-068
generated: 2026-05-27
status: COMPLETE
---

# T#32 — ChittyLedger Doc Sweep

**Scope:** Identify documents across the chittyops + chittyledger ecosystem that conflate the canonical ChittyLedger substrate (`CHITTYFOUNDATION/chittyledger`) with the Finance/Evidence projection fork (`CHITTYOS/chittyledger`). Per F-068, the substrate is canon; the projection is an archive candidate.

**Method:** Grep across local mirror at `/home/ubuntu/projects/github.com/CHITTYFOUNDATION/`, `/home/ubuntu/projects/github.com/CHITTYOS/`, and `chittyops/{docs,spec,services,routines}/`.

## 1. Files reviewed

### Canonical (no change needed)
- `CHITTYFOUNDATION/chittyledger/CHARTER.md` — Tier 3, `ledger.chitty.cc`, hash-chain. ✅ Authoritative.
- `CHITTYFOUNDATION/chittyledger/CHITTY.md` — Stack + components. ✅ Authoritative.
- `CHITTYFOUNDATION/chittyledger/CLAUDE.md` — Dev guidance. ✅ Authoritative.
- `CHITTYFOUNDATION/chittyledger/api/wrangler.jsonc` — `name: chittyledger`, route `ledger.chitty.cc/*`. ✅ Authoritative.

### Drift-laden (action required — gated)
| File | Drift | Recommended action |
|---|---|---|
| `CHITTYOS/chittyledger/AGENTS.md` | Tier=9, URI=`.../chittyledger` (canon=`.../chitty-ledger`), `service_chittyid: TBD-pending-canonical-mint`, stub | Archive parent repo per `docs/f068/api-chittyledger-archive-plan.md` — file goes away with the archive |
| `CHITTYOS/chittyledger/SECURITY.md` | Same stub pattern | Same — disappears on archive |
| `CHITTYOS/chittyledger/CLAUDE.md` | Replit-flavored, predates F-068 | Same — disappears on archive |
| `CHITTYOS/chittyledger/replit.md` | Replit boilerplate | Same — disappears on archive |
| `CHITTYOS/chittyledger/attached_assets/*` (46 files) | Mixed Replit-era pasted prompts and design docs (`CHITTYCHAIN-CLI-MCP-README_*.md`, `EVIDENCE-LEDGER-SCHEMA_*.md`, `Pasted--*.txt`) | Audit before archive — see PA-5 in archive plan |
| `CHITTYOS/chittyledger/integrations/github/{worker.ts,wrangler.toml,manifest.yml}` | A separate worker (`tail_consumers = chittytrack` so it's at least on-canon for that) but lives under the archive-candidate repo | Move to a dedicated `chittyledger-github-integration` repo OR roll into `chittyledger`'s `api/` worker; do NOT archive in-place |

### Within chittyops itself (this repo) — sweep results
- No existing chittyops doc references `CHITTYOS/chittyledger` as a dependency or canonical service.
- `compliance/service-registry.yml` (chittyops): NOT scanned in this sweep (was not in scope) — recommend follow-up to verify `chittyledger` row points to FOUNDATION not OS.

### Other repos that may reference chittyledger (not exhaustively swept here)
Per F-068 scope, a follow-up sweep needs to grep across all CHITTYOS / CHITTYFOUNDATION / ChittyCorp repos for the strings `CHITTYOS/chittyledger`, `chittyos/chittyledger`, and `chittycanon://core/services/chittyledger` (no hyphen — drift) and rewrite each to point at the canon. **Out of scope for this sweep but documented as next gate.**

## 2. Findings summary

| | Count |
|---|---|
| Files reviewed in canon | 4 ✅ no action |
| Files identified as drift in `CHITTYOS/chittyledger` | 4 documents + 46 attached_assets + 1 integration subproject |
| Files in `chittyops/` referencing chittyledger | only the F-068 docs authored in this sweep |
| Outstanding sweep targets (not in this scope) | all other CHITTYOS / CHITTYFOUNDATION / ChittyCorp repos |

## 3. Status

**Completed:** Local-scope sweep across canon + archive-candidate + chittyops.

**Blocked on (NEEDS_APPROVAL):**
- Cross-repo grep + rewrite across ~120 repos — needs operator approval to run because each rewrite is a PR (and PR creation is gated).
- `attached_assets/` content audit — needs operator-driven sensitivity review.
- Decision on `CHITTYOS/chittyledger/integrations/github` — move to dedicated repo or roll into canon's `api/`.

## 4. Classification

| Item | Class |
|---|---|
| Local file inventory + drift mapping | SAFE_REPO ✅ done |
| Author this sweep report | SAFE_REPO ✅ done |
| Cross-repo grep + rewrite | NEEDS_APPROVAL — PR creation gated |
| Update `compliance/service-registry.yml` if it points at the wrong chittyledger | SAFE_REPO — pending confirmation of current state |
| Archive `CHITTYOS/chittyledger` | NEEDS_APPROVAL — destructive |
