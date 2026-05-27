# Phase 4 Build Spec — INDEX

**Status:** Complete · 18 of 18 artifacts written
**Generated:** May 27, 2026
**Source:** [daily-updates-orchestration-v0.5.md](../daily-updates-orchestration-v0.5.md)
**Deploy guide:** [docs/RUNBOOK-deploy.md](docs/RUNBOOK-deploy.md)

---

## Artifact manifest

| # | Path | Type | Deploy order | Lines |
|---|------|------|--------------|-------|
| 1 | `chittyops/routines/comms/daily-comms-triage/manifest.json` | Routine manifest | Wk 3 | ~90 |
| 2 | `chittyops/routines/comms/daily-comms-triage/README.md` | Documentation | Wk 3 | ~95 |
| 3 | `chittyops/routines/comms/daily-comms-triage/worker.ts` | CF Worker | Wk 3 | ~340 |
| 4 | `chittyops/routines/comms/daily-comms-triage-realtime/manifest.json` | Routine manifest (webhook variant; pilot-disabled) | Wk 6 | ~45 |
| 5 | `chittyops/studio-flows/aribia-daily-inbox-triage.json` | Workspace Studio flow (deploy to ws1 + ws2) | Wk 1–2 | ~120 |
| 6 | `migrations/2026_05_actions_v1.sql` | Neon DDL (10 tables + RLS + indexes + retention helpers) | Wk 1 | ~200 |
| 7 | `migrations/2026_05_cost_ledger.sql` | Neon DDL (cost_ledger + materialized views + reader role) | Wk 1 | ~110 |
| 8 | `chittyops/notion-views/daily-triage.json` | Notion view config + schema additions | Wk 1–2 | ~80 |
| 9 | `chit/commands/triage.ts` | CLI subcommand for `chit triage` | Wk 3–4 | ~150 |
| 10 | `chittyops/mcp-tools/daily_updates.json` | MCP gateway tool schemas (7 tools) | Wk 3–4 | ~140 |
| 11 | `chittyops/seeds/sensitivity_rules.sql` | Initial seed (~30 rules) | Wk 1 | ~75 |
| 12 | `chittyops/seeds/policy_flags.sql` | Initial state (PILOT_MODE, TRO, JAVL, exemptions) | Wk 1 | ~50 |
| 13 | `chittyops/services/comptroller/SPEC.md` | Service specification | Wk 3 | ~165 |
| 14 | `chittyops/services/comptroller/worker.ts` | CF Worker skeleton | Wk 3–5 | ~290 |
| 15 | `chittyops/routines/ops/flow-hash-check/manifest.json` | Drift detection routine | Wk 3 | ~55 |
| 16 | `docs/RUNBOOK-deploy.md` | Deploy runbook (10 pre-deploy checks · 19-step sequence) | reference | ~210 |
| 17 | `docs/PILOT.md` | Pilot plan (9 exit criteria · activation sequence) | reference | ~150 |
| 18 | `agent-ui/triage-route.tsx` | React route for agent.chitty.cc /triage | Wk 4 | ~290 |

---

## Deploy order summary

### Week 1 — Foundation
6 · 7 · 11 · 12 → apply Neon schemas & seeds
8 → add Notion view (+ properties manually per RUNBOOK PC9)

### Week 2 — Studio + ingest backbone
5 → deploy Studio flows to ws1 + ws2
1 · 3 → deploy daily-comms-triage worker (cron disabled initially)

### Week 3 — Surfaces & sibling
9 · 10 · 18 → CLI, MCP tools, agent.chitty.cc route
13 · 14 → Comptroller L1
15 → flow-hash-check
2 → README (in repo, no deploy)

### Weeks 5–6 — Pilot
4 → realtime variant deployed but `WEBHOOK_DISABLED=true`
14 → Comptroller L2/L3 (with safe-state on)
Enable cron triggers · set PILOT_MODE + BASELINE_LEARNING

### Week 7+ — Pilot exit
Per 17 (PILOT.md): T2 enable → T3 enable → batch decision → end BASELINE_LEARNING → enable realtime variant

---

## Adversarial fixes baked in (29 fixes across 3 passes)

All fixes from convergence record in v0.5 §13 are reflected in these artifacts:

| Fix bucket | Where it lives |
|------------|---------------|
| **F-L1 → F-L13** (Privacy/Legal) | Studio flow privileged-domain redaction (5) · RLS policies (6) · sensitivity rules (11) · privileged-metadata UI (18) · dual reports (13) · hashed cost_ledger item_id (7) |
| **F-O1 → F-O13** (Ops/UX) | Bulk-accept sample confirm (10) · pause_exemptions (12) · sensitivity rules editable (6) · cross-inbox merge (3) · auto-archive sample digest (1) · baseline-learning (13) |
| **F-R1 → F-R16** (Reliability/Security) | Distributed lock (3) · per-source circuit breaker (3) · 30s total timeout (3) · transactional outbox (3) · safe-state cold-start (14) · provider fallback chain (1) · flow-hash-check (15) · pilot paid-tier provisioned-disabled (12) · batched cost_ledger writes (3+7) |

---

## What's NOT in this build spec

- Source code for ChittyMsg's iMessage relay (assumed already shipping)
- Source code for chittyagent-gam tunnel setup (assumed already configured)
- Source code for agent.chitty.cc shell/auth (only the /triage route is provided)
- Phase B Comptroller-owned tables DDL (anomalies, forecasts, signals_emitted) — provided as inline `ddl` references in artifact 13, full migration to come with L2/L3 wiring
- The shared crypto / mcp-client / render libraries referenced in artifact 9 (`../lib/*`) — assumed in existing `chit` CLI codebase
- The shared types/crypto modules referenced in artifact 3 (`./types`, `./crypto`) — straightforward TS exports, generate locally

---

## Verification

```bash
# Count artifacts
find /mnt/user-data/outputs/phase-4 -type f -not -name "INDEX.md" | wc -l
# Expected: 18

# View tree
cd /mnt/user-data/outputs/phase-4 && find . -type f -not -name "INDEX.md" | sort
```
