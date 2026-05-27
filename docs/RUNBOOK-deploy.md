# RUNBOOK — Deploy: daily-comms-triage + ChittyComptroller

**Owner:** Nick Bianchi
**Target environment:** Cloudflare Workers (production) · Neon `restless-grass-40598426`
**Estimated deploy time:** 2–3 hours (one-shot) · 5–6 weeks (with build)
**Last updated:** May 26, 2026

---

## Pre-deploy checks (all must pass)

### PC1 · Workspace Gemini access (ws1)
```bash
# In Workspace admin console (admin.google.com) as super-admin of nevershitty.com:
# Apps → Workspace Studio → User access → confirm Nick is enabled
# Apps → Workspace Studio → Gemini features → confirm enabled on user
```
Verify: log in to `studio.workspace.google.com/u/0/` as nick@nevershitty.com, confirm "Create flow" + Gemini step type available.

### PC2 · Workspace Gemini access (ws2)
Same as PC1 but for jeanarlene.com Workspace tenant.

### PC3 · OAuth re-issuance check (nevershitty.com)
- Verify domain admin access still valid
- If nevershitty.com is in transition: re-create OAuth consent screen, re-authorize gam tunnel
- Test: `chittyagent-gam test --account ws_nevershitty` returns OK

### PC4 · CF AI Gateway enabled
```bash
# CF dashboard → AI → AI Gateway → confirm enabled
# If not: enable + create gateway named "chitty-ai-gateway"
# Update DNS: gateway.chitty.cc → CF AI Gateway endpoint
```

### PC5 · CF Workers AI active
```bash
# CF dashboard → Workers & Pages → AI → confirm Workers AI binding available
# Test from a worker: env.AI.run("@cf/meta/llama-3.2-3b-instruct", { prompt: "hello" })
```

### PC6 · Google AI Studio API key
- Visit `aistudio.google.com/app/apikey`
- Create new key tied to Nick's personal Google account (for personal-gmail tier)
- Store in 1Password: `op item create --category="API Credential" --title="google-ai-studio-key"`

### PC7 · Anthropic prompt caching (post-pilot only)
- Confirm caching available on Anthropic console
- Not required for pilot (T2/T3 disabled). Required before activating paid tiers.

### PC8 · Neon migrations dry-run
```bash
cd migrations
psql $NEON_URL -f 2026_05_actions_v1.sql --single-transaction --dry-run 2>&1 | tee dry-run-actions.log
psql $NEON_URL -f 2026_05_cost_ledger.sql --single-transaction --dry-run 2>&1 | tee dry-run-cost.log
# Review logs; confirm no warnings/errors before real apply.
```

### PC9 · Notion schema diff
- Open Business Task Tracker (f33d20b8…) → Settings → Properties
- Compare against `chittyops/notion-views/daily-triage.json` `schema_additions_required`
- Add missing properties manually (Notion API can't add select-with-options idempotently)

### PC10 · Studio handoff Sheet
- Create new Google Sheet in nick@nevershitty.com Drive: "ARIBIA Triage Handoff"
- Tab name: `triage_handoff`
- Share with: nick@jeanarlene.com (edit), chittyagent-gam service account (edit)
- Set Sheet ID into Workspace Studio flow variable `handoff_sheet_id`
- Set Sheet ID into worker env: `STUDIO_HANDOFF_SHEET_ID`

---

## Deploy sequence

### Day 1–14 (Weeks 1–2) · Foundation
1. Apply Neon migrations:
   ```bash
   psql $NEON_URL -f migrations/2026_05_actions_v1.sql
   psql $NEON_URL -f migrations/2026_05_cost_ledger.sql
   ```
2. Apply seeds:
   ```bash
   psql $NEON_URL -f chittyops/seeds/sensitivity_rules.sql
   psql $NEON_URL -f chittyops/seeds/policy_flags.sql
   ```
3. Add Notion view properties (manual per PC9).
4. Apply Notion view: `notion-cli view create --config chittyops/notion-views/daily-triage.json`
5. Deploy Workspace Studio flows:
   - In `studio.workspace.google.com/u/0/` (nick@nevershitty.com): import `chittyops/studio-flows/aribia-daily-inbox-triage.json`
   - Repeat in nick@jeanarlene.com tenant
   - Test mode: run once with last 24h of mail; confirm rows appear in handoff Sheet
6. Retrofit existing services to write to `cost_ledger`:
   - ChittyCounsel · ChittyBiz · autoassist · orchestrator — add ledger write after each AI call

### Day 15–28 (Weeks 3–4) · Pipeline + Surfaces + Comptroller L1
7. Deploy daily-comms-triage worker:
   ```bash
   cd chittyops/routines/comms/daily-comms-triage
   wrangler deploy --env production
   ```
8. Deploy realtime variant (webhooks disabled in pilot):
   ```bash
   cd ../daily-comms-triage-realtime
   wrangler deploy --env production --var WEBHOOK_DISABLED=true
   ```
9. Deploy flow-hash-check:
   ```bash
   cd ../../ops/flow-hash-check
   wrangler deploy --env production
   ```
10. Deploy ChittyComptroller (L1 only — safe-state on):
    ```bash
    cd ../../../services/comptroller
    wrangler deploy --env production
    ```
11. Surfaces:
    - MCP tools: register `daily_updates.*` on mcp.chitty.cc gateway
    - CLI: build & ship `chit triage` subcommand
    - agent.chitty.cc: deploy `/triage` route

### Day 29–42 (Weeks 5–6) · Comptroller L2/L3 + Pilot launch
12. Build & test Comptroller L2 signal dispatcher.
13. Build & test Comptroller L3 pause + SMS-confirm flow.
14. Wire service degrade/pause endpoints in ChittyCounsel, ChittyBiz, autoassist.
15. Run adversarial re-review (3-persona panel) against deployed system.
16. Verify all pre-deploy checks still pass.
17. Set policy flags:
    ```sql
    UPDATE chittyops.policy_flags SET active = true WHERE flag_name = 'PILOT_MODE';
    UPDATE chittyops.policy_flags SET active = true WHERE flag_name = 'BASELINE_LEARNING';
    ```
18. Enable cron triggers in CF dashboard for both daily-comms-triage and flow-hash-check.
19. Confirm first scheduled run.

---

## Smoke tests (post-deploy)

| Test | Expected |
|------|----------|
| Heartbeat from daily-comms-triage | Reaches discovery.chitty.cc within 25h of last run |
| `chit triage list` | Returns < 30 items (after auto-archive) |
| `chit triage budget` | Shows $0 today, $0 MTD initially |
| Workspace Studio test run | Rows written to handoff Sheet within 5 min |
| `daily_updates.list` via MCP | Returns ScoredAction[] JSON |
| flow-hash-check first run | Logs "flow hash matches snapshot" |
| Comptroller anomaly poll | Logs activity every 5 min |
| Comptroller daily report | Written to Business + Legalink Notion pages at 07:00 CT |

---

## Rollback procedure

### Per-component rollback

**daily-comms-triage cron:** disable cron trigger in CF dashboard. Last run output remains in Neon.

**Comptroller:** disable cron + set `safe_state_active=true` in KV. L2/L3 signals halt immediately; reports still generate.

**Studio flows:** disable flow in Studio UI. Pipeline picks up zero rows from handoff Sheet; gracefully continues with other sources.

**Neon migrations:** intentional schema rollback requires manual `DROP TABLE` statements. Strongly prefer forward-fix to rollback.

### Full rollback (catastrophic case)

1. Disable all CF cron triggers
2. Disable Studio flows in both Workspace tenants
3. Set `policy_flags.active = false` for `PILOT_MODE` (prevents the routine from doing classification work even if cron fires)
4. Notify operator via Quo
5. Investigate via Comptroller anomalies + heartbeat logs

---

## Observability

| Where to look | What you'll see |
|---------------|-----------------|
| discovery.chitty.cc/heartbeats | Every routine + service liveness |
| comptroller.chitty.cc/reports/daily | Cost broken down by service/tier |
| Notion → Nick's Dashboard | Daily triage view + auto-archive sample + alerts |
| CF dashboard → Workers Analytics | Per-worker request rates, errors, latency |
| Neon → chittyops.cost_ledger | Raw cost data |
| Quo SMS | High-severity alerts only (Comptroller anomaly · drift detection · SMS-confirm requests) |

---

## Pilot exit → paid tier activation

See [PILOT.md](PILOT.md) for exit criteria. Once met:

```sql
-- Clear pilot mode
UPDATE chittyops.policy_flags SET active = false WHERE flag_name = 'PILOT_MODE';

-- Enable T2 first (Haiku)
-- This is policy-only; worker reads policy_flags at run time
```

Wait 1 week. If T2 stable, repeat for T3 (Sonnet).

End BASELINE_LEARNING manually (with SMS confirm):
```bash
curl -X POST https://comptroller.chitty.cc/_admin/baseline_learning/end \
     -H "X-Confirm-Token: $SMS_CONFIRM_TOKEN" \
     -d '{}'
```

---

## Contact

If something breaks at 3 AM: heartbeat alert lands on your Quo line. Most-likely failure modes:
- Workspace Studio rate-limit (mitigation: pipeline reads handoff Sheet — if Sheet stale, pipeline continues with other sources)
- Gemini Flash quota exhaustion (mitigation: fall through to `pilot_unresolved`)
- Neon cold-start (mitigation: retry with backoff)
- CF Worker cold-start at 07:00 CT (mitigation: first run may be 30s late, no impact)

For deeper failures: see Comptroller alerts in Notion + check `cost_ledger` + `actions_failed`.
