---
uri: chittycanon://docs/ops/plan/api-chittyledger-archive
namespace: chittycanon://docs/ops
type: archive-plan
version: 1.0.0
status: DRAFT
related_fix: F-068
generated: 2026-05-27
---

# api-chittyledger Archive PR Plan — F-068

## Naming clarification

The term **"api-chittyledger"** does not refer to a standalone GitHub repo (verified: no `CHITTYOS/api-chittyledger`, no `CHITTYFOUNDATION/api-chittyledger`, no `ChittyCorp/api-chittyledger`). It refers to **the `api/` subproject inside `CHITTYFOUNDATION/chittyledger`** — the Cloudflare Workers + Hono implementation that powers `ledger.chitty.cc`. That subproject has its own `package.json` (`"name": "chitty-ledger-api"`) and `wrangler.jsonc`.

This plan covers the **archive PR for `CHITTYOS/chittyledger`** (the fork that is mistakenly named `chittyledger` but is actually a Finance/Evidence projection), since that is the artifact F-068 identifies as a cleanup candidate. The canonical `api/` subproject is **not** archived — it is the canon.

## Target

- **Repo:** `CHITTYOS/chittyledger`
- **Action:** Archive on GitHub (`gh repo archive CHITTYOS/chittyledger`)
- **Reason:** Repo squats the canonical name `chittyledger` while implementing a non-canonical Vite/React/Drizzle stack with Evidence-pipeline modules. Pentad drift documented in `docs/f068/chittyledger-pentad-drift-report.md`.

## Pre-archive checklist (must pass before archive)

| # | Check | Status |
|---|---|---|
| PA-1 | All non-trivial code in `CHITTYOS/chittyledger/server/` has a target projection identified (chittyevidence-db, chittycounsel, chittyfinance, or "discard") | ⏳ blocked — needs operator review of each module |
| PA-2 | No live production worker is deployed from this repo to any `chitty.cc` subdomain | ⏳ blocked — needs CF dashboard scan |
| PA-3 | No external service registers `CHITTYOS/chittyledger` in its CHARTER as a dependency | ⏳ blocked — needs grep across the ecosystem |
| PA-4 | Any open PRs, issues, or branches have a migration plan to the target projection | ⏳ blocked — `gh pr list -R CHITTYOS/chittyledger` |
| PA-5 | `replit.md` and `attached_assets/` removed or audited for sensitive content | ⏳ blocked — needs separate review |
| PA-6 | `README.md` updated with archive notice + pointers to canon + projections | ✅ — content drafted in §"Archive README" below |

## Archive README (drop-in)

To be committed to `CHITTYOS/chittyledger` as the new `README.md` immediately before archival:

```markdown
# chittyledger (ARCHIVED)

This repository has been **archived** as part of F-068.

**Why archived:** This repo squatted the canonical name `chittyledger` while
implementing a Vite/React/Drizzle Evidence-pipeline prototype that is not the
canonical ChittyLedger service.

**Canonical ChittyLedger:** https://github.com/CHITTYFOUNDATION/chittyledger
- API worker at `ledger.chitty.cc`
- Hash-chain integrity, sequence enforcement, audit trail
- Canonical URI: `chittycanon://core/services/chitty-ledger`

**Where this repo's code went:**
- Fact extraction / contradiction detection / trust scoring → CHITTYOS/chittyevidence-db
- Legal compliance → CHITTYOS/chittycounsel
- Any Finance use case → (new) chittyfinance projection

**Last commit before archive:** see git log.
**Reference:** chittyops/docs/f068/api-chittyledger-archive-plan.md
```

## Archive PR sequence (NEEDS_APPROVAL — not executed)

1. Branch `archive/f068-deprecate-chittyledger` off main of `CHITTYOS/chittyledger`.
2. Replace `README.md` with the §"Archive README" content above.
3. Add a top-level `ARCHIVED.md` containing the F-068 holding and the date.
4. Open PR titled "archive(f068): deprecate CHITTYOS/chittyledger in favor of CHITTYFOUNDATION canon".
5. Operator review + merge.
6. `gh repo archive CHITTYOS/chittyledger`.
7. Submit to chittyregister: a removal request for any `chittycanon://core/services/chittyledger` entry that points at the wrong repo (separate from the canonical `chitty-ledger`).
8. Search the ecosystem for any CHARTER/CHITTY/README referencing `CHITTYOS/chittyledger` and rewrite to point at the canon.

## Classification

| Step | Class |
|---|---|
| Write this plan | SAFE_REPO ✅ done |
| Open archive PR on `CHITTYOS/chittyledger` | NEEDS_APPROVAL — goal says "no PR creation" |
| Archive the repo on GitHub | NEEDS_APPROVAL — destructive |
| Modify other repos' CHARTERs to point at canon | SAFE_REPO (per-repo, separate PR) — but PR creation gated |
| Mutate registry to remove stale entries | NEEDS_APPROVAL — registry mutation gated |

## Open questions for operator

1. Is `CHITTYOS/chittyledger` currently deployed anywhere? (If so, decommission before archive.)
2. Are any open issues or PRs against it that need migration?
3. Is `attached_assets/` safe to retain in the archive or does it contain sensitive material?
4. Should the archive be `gh repo archive` (read-only public) or `gh repo edit --visibility private` (hidden)?
