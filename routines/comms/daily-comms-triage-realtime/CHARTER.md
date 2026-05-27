---
uri: chittycanon://docs/ops/charter/daily-comms-triage-realtime
namespace: chittycanon://docs/ops
type: charter
version: 1.0.0
status: DRAFT
chitty_id: 03-1-USA-0735-T-2605-1-73
---

# daily-comms-triage-realtime — Charter

## Scope

Webhook-triggered sibling of `daily-comms-triage`. Fires only on priority ≥ 8 inbound events. **PILOT-DISABLED**: returns `503 { status: "pilot_disabled" }` on every webhook until exit criteria met.

## API contract

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe |
| GET | `/api/v1/status` | Returns mode + pilot_disabled state |
| POST | `/webhook` | Inbound priority-8 event (returns 503 while pilot-disabled) |

## Dependencies

- `daily-comms-triage.chitty.cc/dispatch` — forwards to cron sibling's pipeline
- `KV_LOCKS` — Message-ID dedupe (composite-hash fallback)
- `discovery.chitty.cc/heartbeat/daily-comms-triage-realtime`

## Scope boundaries

- Pilot-disabled flag `PILOT_DISABLED=true` short-circuits all webhooks to 503.
- Shares dedupe locks with the cron variant via the same KV namespace.

## Pause-exemption

None.

## Compliance level

Phase 4 health-only stub. ChittyID `03-1-USA-0735-T-2605-1-73`. Full webhook handler awaits GATE 3 + explicit pilot-exit.
