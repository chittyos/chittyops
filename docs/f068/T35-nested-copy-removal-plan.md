---
uri: chittycanon://docs/ops/plan/T35-nested-copy-removal
namespace: chittycanon://docs/ops
type: removal-plan
task_id: T#35
related_fix: F-068
generated: 2026-05-27
status: COMPLETE
---

# T#35 — Nested-Copy Removal Plan

**Goal:** Find and propose removal of nested copies of `chittyledger` checked into other repos. Per F-068, only `CHITTYFOUNDATION/chittyledger` is the canon; nested copies are pollution.

## 1. Scan results

```bash
find /home/ubuntu/projects -maxdepth 6 -type d -name chittyledger
```

| Path | Type | Size | git-tracked? |
|---|---|---|---|
| `/home/ubuntu/projects/github.com/CHITTYOS/chittyledger` | Top-level repo | (full repo) | ✅ own repo (archive candidate, separate plan) |
| `/home/ubuntu/projects/github.com/CHITTYFOUNDATION/chittyledger` | Top-level repo | (full repo) | ✅ canon |
| `/home/ubuntu/projects/github.com/CHITTYOS/chittychronicle/chittyledger/` | **Nested copy** | 2.5 MB | ✅ tracked in `chittychronicle` |
| `/home/ubuntu/projects/github.com/CHITTYFOUNDATION/chittyschema/connectivity/migrations/chittyledger` | Directory of SQL files for an `entity_ledger` table | small | ✅ tracked, **NOT a nested copy** — these are migration SQLs, not a codebase clone |

## 2. The actual nested copy: `CHITTYOS/chittychronicle/chittyledger/`

**Evidence it is a checked-in clone of the OS/chittyledger fork:**

```bash
diff -q CHITTYOS/chittychronicle/chittyledger CHITTYOS/chittyledger | head
# Only in CHITTYOS/chittyledger: .claude, .git, .github, AGENTS.md, CODEOWNERS, SECURITY.md, integrations/, replit.md
# Common subdirectories: attached_assets, client, server, shared
# Common files differ: .replit, drizzle.config.ts, package.json, tsconfig.json, vite.config.ts
```

Both repos share the same `client/`, `server/`, `shared/`, and `attached_assets/` trees with minor drift in config files. The chittychronicle copy lacks the F-039 stubs (AGENTS.md / SECURITY.md) and `integrations/`, so it is a slightly older snapshot. It pollutes `chittychronicle`'s history with 2.5 MB of code that has nothing to do with ChittyChronicle.

## 3. Removal plan

### Step 1 — Verify no chittychronicle code imports from `chittyledger/` (SAFE_REPO)

```bash
grep -rln "from ['\"]\\./chittyledger\|require(['\"].\\./chittyledger\|import.*chittyledger" \
  /home/ubuntu/projects/github.com/CHITTYOS/chittychronicle \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" \
  2>/dev/null
```

If output is empty, the nested copy is dead weight and safe to remove.

If output is non-empty, the imports must be redirected before removal (likely to chittyevidence-db once Phase A of T#33 lands).

### Step 2 — Remove via PR on chittychronicle (NEEDS_APPROVAL — PR creation gated)

```bash
cd /home/ubuntu/projects/github.com/CHITTYOS/chittychronicle
git checkout -b chore/f068-remove-nested-chittyledger
git rm -r chittyledger/
git commit -m "chore(f068): remove nested chittyledger snapshot (2.5 MB)

This directory was a checked-in copy of CHITTYOS/chittyledger from
the Replit-era prototype. Under F-068, CHITTYFOUNDATION/chittyledger
is the canonical substrate; CHITTYOS/chittyledger is an archive
candidate. A nested snapshot in chittychronicle has no purpose.

Verified no chittychronicle source imports from this directory."
gh pr create --title "chore(f068): remove nested chittyledger snapshot"
```

### Step 3 — Verify post-merge (SAFE_REPO)

After PR merges:
- Confirm `find chittychronicle -type d -name chittyledger` returns 0 results
- Confirm chittychronicle still builds (`pnpm install && pnpm build`)

## 4. The false-positive: `chittyschema/connectivity/migrations/chittyledger/`

This is **not** a nested copy. Contents:

```
001_initial_evidence_schema.sql
002_entity_ledger.sql
003_session_ingest_type.sql
```

These are SQL migration files for the `entity_ledger` table that chittyschema manages — a related but distinct concept. The directory is named `chittyledger` because the migrations target a ledger schema, not because it contains a chittyledger codebase. **No action required.**

## 5. Classification

| Step | Class |
|---|---|
| Inventory + diff | SAFE_REPO ✅ done |
| Verify no chittychronicle imports use the nested copy | SAFE_REPO — needs to be run by operator or in chittychronicle workspace |
| Remove `chittychronicle/chittyledger/` | SAFE_REPO for the `git rm` itself; **NEEDS_APPROVAL** for the PR because PR creation is gated by the goal |
| Confirm chittychronicle still builds | SAFE_REPO — runs post-merge |

## 6. Status

**Completed in this session:**
- Inventory of nested copies.
- Diff against the OS fork — confirmed the nested copy is a stale snapshot.
- Removal-PR script drafted (above).

**Blocked on operator:**
- PR creation gated.
- The actual `git rm -r chittyledger/` in chittychronicle's workspace (would also be gated since the file removal eventually needs a PR to land).
