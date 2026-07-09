---
uri: chittycanon://docs/ops/agents/comptroller
namespace: chittycanon://docs/ops
type: agents
version: 1.0.0
status: DRAFT
chitty_id: 03-1-USA-9636-T-2605-1-75
---

# ChittyComptroller — Agent Operating Defaults

## Hard rules

1. **Never enable L2/L3** while `chittyops.policy_flags.BASELINE_LEARNING=true`. The 14-day timer starts at first deploy.
2. **Never pause** any service with `chittyops.pause_exemptions.requires_sms_confirm=true` without an explicit Quo SMS confirm from the operator.
3. **Never read `actions_v1`.** Only `cost_ledger`. The `comptroller_reader` role grants exactly this scope.
4. **Never use LLM calls above T0** for forecasting. EWMA + seasonality only.
5. **Never pause** `chittycounsel`, `chittybiz`, `chittyevidence-db`, `orchestrator.chitty.cc`, `dispatch.chitty.cc`, `autoassist.chitty.cc`, `mcp.chitty.cc`, `id.chitty.cc`, `registry.chitty.cc` under any condition without SMS confirm.

## Safe-state behaviors

- Cold-start: L1-only for 24h, regardless of `BASELINE_LEARNING`.
- Partition recovery: L1-only until 100 contiguous successful 5-min polls.
- Mid-month deploy: `BASELINE_LEARNING` auto-set for 14 days.

## Deploy procedure

1. Replace `REPLACE_AT_DEPLOY` in `wrangler.toml` for `NEON_COMPTROLLER`, `KV_STATE`, `NOTION_BUSINESS_REPORT_PAGE_ID`, `NOTION_LEGALINK_REPORT_PAGE_ID`.
2. Set secrets:
   - `wrangler secret put CF_AI_GATEWAY_TOKEN`
   - `wrangler secret put ANTHROPIC_BILLING_KEY`
   - `wrangler secret put GOOGLE_AI_STUDIO_KEY`
   - `wrangler secret put CF_ACCOUNT_API_TOKEN`
   - `wrangler secret put QUO_API_KEY`
   - `wrangler secret put NOTION_API_KEY`
3. Deploy: `cf deploy` — cron (`*/5 * * * *`) is enabled by default; comptroller is always-on.
4. Verify `/health`, `/api/v1/status`, `/budget/:service/status`, `/reports/daily`.

## Status

- Health-only stub deployed at `comptroller.chitty.cc` (ChittyID `03-1-USA-9636-T-2605-1-75`).
- Full worker logic + cron pending GATE 3.
