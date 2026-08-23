# Claude Code — bootstrap from Phase 4 spec

## Step 1 · Extract the bundle

Download `phase-4.tar.gz` and the v0.5 SoT from this chat, then:

```bash
# From wherever ChittyOS lives — confirm your actual path first
cd /Users/nb/.claude/projects/-/chittyos     # or /Users/nb/Desktop/Projects/chittyos
# back up anything that might collide
mkdir -p .backup-pre-phase-4 && cp -R chittyops .backup-pre-phase-4/ 2>/dev/null

# Drop the spec into the repo root (overlays cleanly — no existing files clobbered
# because all paths are net-new)
tar -xzf ~/Downloads/phase-4.tar.gz --strip-components=1
mv daily-updates-orchestration-v0.5.md docs/

git status   # 18 new files + 1 doc; nothing modified
```

## Step 2 · Hand Claude Code the SoT, not the artifacts

The spec is the source of truth. Boot Claude Code with this as your first message:

```
Read these as my session inputs:
- docs/daily-updates-orchestration-v0.5.md  (canonical design SoT)
- docs/RUNBOOK-deploy.md                    (deploy sequence)
- docs/PILOT.md                             (exit criteria)
- INDEX.md (phase-4 manifest)               (what's already scaffolded)

I want to start at Week 1 / Foundation per RUNBOOK §"Day 1-14".

Before any code: do the 10 pre-deploy checks (PC1-PC10). For each, tell me
whether to run it, what command to run, and what success looks like. Stop
after PC1 and wait for me to confirm before proceeding to PC2.

After all 10 checks pass, we apply the Neon migrations in this order:
  1. migrations/2026_05_actions_v1.sql
  2. migrations/2026_05_cost_ledger.sql
  3. chittyops/seeds/sensitivity_rules.sql
  4. chittyops/seeds/policy_flags.sql

Then proceed to Week 2.

Defaults to honor (per nb-development-defaults skill):
- 1Password injection for secrets, never hardcoded
- chittyregistry registration before any new worker deploys
- CHARTER.md / CHITTY.md / CLAUDE.md per chittyos-compliance skill for the
  comptroller service
- Neon is canonical TODO aggregator — write progress to actions_v1 not Notion
```

## Step 3 · Per-artifact deltas

The 18 artifacts are scaffolds, not finished code. Things Claude Code needs
to fill in locally:

| Artifact | Local work needed |
|----------|-------------------|
| `worker.ts` (both) | Generate `./types.ts` and `./crypto.ts` modules; wire real bindings in `wrangler.toml` |
| `chit/commands/triage.ts` | Wire into existing `chit` CLI entry point; resolve `../lib/mcp-client`, `../lib/render`, `../lib/date` |
| `agent-ui/triage-route.tsx` | Drop into existing Next.js app under correct route path; verify `@/lib/mcp-client` exists |
| `aribia-daily-inbox-triage.json` | Import into Workspace Studio UI manually (Studio doesn't have a CLI); after import, re-export and diff against this file |
| `notion-views/daily-triage.json` | Notion API can't add `select` options idempotently — add properties via Notion UI first, then create the view via API |
| All `wrangler.toml` files | Not in spec — Claude Code generates per existing repo convention |

## Step 4 · Loop back

When stuck or scope-changing, paste the v0.5 SoT excerpt that's relevant and
ask Claude Code to update both the local file and queue a v0.6 amendment for
the next session here.
