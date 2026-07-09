---
uri: chittycanon://docs/ops/agents/daily-comms-triage
namespace: chittycanon://docs/ops
type: agents
version: 1.0.0
status: DRAFT
chitty_id: 03-1-USA-0955-T-2605-1-37
---

# daily-comms-triage — Agent Operating Defaults

For any agent (Claude, ChatGPT, autonomous routine) touching this worker.

## Hard rules

1. **Never enable cron triggers** until: PC1–PC10 all pass per `docs/RUNBOOK-deploy.md`; bindings substituted (no `REPLACE_AT_DEPLOY`); Two-Space RLS synthetic test green.
2. **Never deploy the full `worker.ts`** until cron-disable is committed in the deployed config. Deploy order is: full logic → verify health → enable cron last.
3. **Never write to `actions_v1.routing='business'` for privileged-tagged items.** RLS enforces; defense-in-depth only.
4. **Never invoke T2/T3** while `chittyops.policy_flags.PILOT_MODE=true`. Flag escalations as `pilot_unresolved`.
5. **Never bypass** `TRO_REVIEW_PENDING`, `JAVL_PAYROLL_PRECEDES_DISTRIBUTION`, or `LITIGATION_HOLD:*` policy flags.

## Soft defaults

- Use chittysecrets injection for all secrets at deploy: `op run --env-file=.../neon.env -- wrangler deploy`.
- Use the canonical `chittytrack` tail consumer; never inline log destinations.
- Heartbeat to `discovery.chitty.cc/heartbeat/daily-comms-triage` on every `scheduled` invocation.

## Deploy procedure (operator-only)

1. Replace `REPLACE_AT_DEPLOY` placeholders in `wrangler.toml` for `KV_LOCKS`, `NEON` (Hyperdrive id), with real values.
2. Provision secrets via wrangler secret (NEVER inline):
   - none required (pure bindings — connectors are CF service-binding or env URLs)
3. Deploy with cron commented out: `wrangler deploy`.
4. Verify `/health` returns 200 + valid JSON.
5. Verify `/api/v1/status` returns mode-aware status.
6. Run synthetic privileged-domain test (`docs/PILOT.md` §exit-criteria).
7. Only then: uncomment `[triggers] crons = ["0 12 * * *"]` and redeploy.

## Status as of last update

- **Health-only stub deployed** at `daily-comms-triage.chitty.cc` (ChittyID `03-1-USA-0955-T-2605-1-37`).
- Full `worker.ts` committed to repo; **NOT YET deployed**.
- Cron triggers commented out in `wrangler.toml`.
- Awaiting GATE 3.
