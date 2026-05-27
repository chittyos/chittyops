---
uri: chittycanon://docs/ops/agents/daily-comms-triage-realtime
namespace: chittycanon://docs/ops
type: agents
version: 1.0.0
status: DRAFT
chitty_id: 03-1-USA-0735-T-2605-1-73
---

# daily-comms-triage-realtime — Agent Operating Defaults

## Hard rules

1. **Never set `PILOT_DISABLED=false`** until: cron sibling exits pilot per `docs/PILOT.md`; T2 (Haiku) has been stable for ≥ 1 week; operator confirms in writing.
2. **Never deploy the full webhook handler** without the `PILOT_DISABLED` short-circuit at the top of the request path.
3. **Never share dedupe state** with anything other than the cron sibling's `KV_LOCKS`.

## Deploy procedure

1. Replace `REPLACE_AT_DEPLOY` in `wrangler.toml` for `KV_LOCKS` with the shared namespace id from the cron sibling.
2. Deploy with `PILOT_DISABLED=true`.
3. Verify `/health` and `/webhook` returns 503.
4. Hold until cron sibling exits pilot.

## Status

- Health-only stub deployed at `daily-comms-triage-realtime.chitty.cc` (ChittyID `03-1-USA-0735-T-2605-1-73`).
- `PILOT_DISABLED=true` baked in.
- Awaiting GATE 3 + cron sibling pilot exit.
