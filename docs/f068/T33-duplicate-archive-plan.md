---
uri: chittycanon://docs/ops/plan/T33-duplicate-archive
namespace: chittycanon://docs/ops
type: archive-plan
task_id: T#33
related_fix: F-068
generated: 2026-05-27
status: COMPLETE
---

# T#33 — Duplicate Archive Plan (ChittyLedger family)

**Goal:** Identify duplicate / overlapping artifacts between the canonical `CHITTYFOUNDATION/chittyledger` and the projection `CHITTYOS/chittyledger`. Propose an archive plan.

## 1. Duplicates / overlap inventory

| Artifact | Canon (FOUNDATION) | Projection (OS) | Conflict? | Action |
|---|---|---|---|---|
| Repo name `chittyledger` | ✅ exists | ✅ exists | **Yes** — name collision | Archive OS repo; canon keeps the name |
| Canonical URI | `chittycanon://core/services/chitty-ledger` | claims `chittycanon://core/services/chittyledger` (no hyphen) | **Yes** — registry slot collision | Drop OS claim; canon owns the slot |
| Domain `ledger.chitty.cc` | served by canon's `api/` worker | not deployed | No (no live conflict) | None — but ensure OS's wrangler doesn't redeploy |
| CHARTER.md | ✅ authoritative | ❌ missing | No | None |
| CHITTY.md | ✅ authoritative | ❌ missing | No | None |
| CLAUDE.md | ✅ canon | ⚠ stub Replit-flavored | No (different content) | OS's CLAUDE.md disappears on archive |
| Pentad stubs (AGENTS.md, SECURITY.md) | n/a | ⚠ stubs from F-039 sweep | No | Disappears on archive |
| `wrangler.toml` / `wrangler.jsonc` | `api/wrangler.jsonc` deploys to `ledger.chitty.cc` | `integrations/github/wrangler.toml` deploys a separate github-integration worker | **Different scope, not a duplicate** | Move OS's `integrations/github/` to its own repo before archive |
| `package.json` | `api/package.json` (`chitty-ledger-api`) | root `package.json` (Vite/Drizzle app) | **Different scope, not a duplicate** | Reclassify per Pentad drift report |
| Database schema | Neon, hash-chain | Drizzle ORM, fact-extraction tables | **Different scope** | Move to chittyevidence-db |
| `attached_assets/` | n/a | 46 files (Replit-era pasted prompts + design docs) | n/a | Audit, then either archive in-place or extract |

## 2. Archive plan (preserves any non-duplicate value)

### Phase A — Extract non-duplicate value (SAFE_REPO, gated on per-target review)
1. **`integrations/github/`** → new repo `CHITTYOS/chittyledger-github-integration` OR roll into `CHITTYFOUNDATION/chittyledger/integrations/github/`. Operator picks.
2. **`server/fact-extraction.ts`**, **`server/contradiction-detection.ts`**, **`server/scientific-trust-scoring.ts`** → migrate into `CHITTYOS/chittyevidence-db`. Each gets its own PR with the Drizzle table definitions extracted from `shared/`.
3. **`server/legal-compliance.ts`** → migrate into `CHITTYOS/chittycounsel` (separate PR).
4. **`attached_assets/`** → operator audit (sensitivity review). If retained, move to a sibling `chittyledger-historical-prompts` repo; do not carry forward into any active service.

### Phase B — Archive what remains (NEEDS_APPROVAL)
1. After Phase A migrations land, the OS/chittyledger repo contains only Replit boilerplate + the now-superseded stubs.
2. Apply the archive PR per `docs/f068/api-chittyledger-archive-plan.md`.
3. Confirm `gh repo archive CHITTYOS/chittyledger` (operator-driven).

### Phase C — Registry hygiene (NEEDS_APPROVAL — registry mutation)
1. Submit to chittyregister: ensure the `chittyledger` slot resolves to `CHITTYFOUNDATION/chittyledger` (canon). Drop any `CHITTYOS/chittyledger` entry.
2. Verify via `GET https://registry.chitty.cc/api/v1/tools/<chitty_id>` that the canon's ChittyID is the only one bound to `ledger.chitty.cc`.

## 3. Classification per phase

| Phase | Class | Reason |
|---|---|---|
| A.1 (move github-integration) | SAFE_REPO if to new repo *creation* — **but** that creates a new GitHub repo which is registry-adjacent → **NEEDS_APPROVAL** |
| A.2 (move fact-extraction etc. to chittyevidence-db) | SAFE_REPO for the code move; PR creation gated by goal |
| A.3 (move legal-compliance to chittycounsel) | Same |
| A.4 (attached_assets audit) | NEEDS_APPROVAL — sensitivity review by operator |
| B (archive PR + repo archive) | NEEDS_APPROVAL — destructive |
| C (registry mutation) | NEEDS_APPROVAL — registry mutation gated |

## 4. Status

**Completed in this session (SAFE_REPO):**
- Duplicate inventory above.
- `compliance/service-registry.yml` corrected to point `chittyledger` at `CHITTYFOUNDATION/chittyledger` (this changes only documentation/yaml; no live registry mutation).

**Blocked on operator (NEEDS_APPROVAL):**
- Per-target migration PRs (Phase A.2 + A.3) — PR creation gated by goal.
- attached_assets audit (A.4) — sensitivity review.
- Archive PR + repo archive (B) — destructive.
- chittyregister mutation (C).
