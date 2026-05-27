---
uri: chittycanon://docs/ops/architecture/daily-comms-triage-realtime
namespace: chittycanon://docs/ops
type: architecture
version: 1.0.0
status: DRAFT
chitty_id: 03-1-USA-0735-T-2605-1-73
---

# daily-comms-triage-realtime — Architecture

| | |
|---|---|
| Tier | 4 |
| Domain | `daily-comms-triage-realtime.chitty.cc` |
| Type | Cloudflare Worker (webhook) |
| Account | ChittyCorp LLC |
| Pause-exempt | No |
| Pilot phase | **DISABLED during pilot** |

## Role

Sibling of the cron variant. Same Pentad pipeline, different trigger. Inbound webhook from a source that signals priority ≥ 8 (e.g. a court-filing notification, a critical Mercury alert). Dedups against the cron variant's KV locks so a 07:00 batch run won't reprocess realtime-already-handled items.

## Stack

Same as the cron sibling, plus shared `KV_LOCKS` namespace and an internal `fetch()` to `daily-comms-triage.chitty.cc/dispatch`.

## Certification level

Bronze (health-only stub + pilot-disabled). Promotes to Silver only after the cron sibling exits pilot and `PILOT_DISABLED=false` is set in the realtime wrangler vars.

## Tail consumer

`chittytrack`.
