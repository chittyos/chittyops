---
uri: chittycanon://docs/ops/architecture/flow-hash-check
namespace: chittycanon://docs/ops
type: architecture
version: 1.0.0
status: DRAFT
chitty_id: 03-1-USA-6434-T-2605-1-54
---

# flow-hash-check — Architecture

| | |
|---|---|
| Tier | 4 |
| Domain | `flow-hash-check.chitty.cc` |
| Type | Cloudflare Worker (daily cron) |
| Account | ChittyCorp LLC |
| Pause-exempt | No |

## Role

Detects out-of-band edits to Workspace Studio flows that the chittyops repo wouldn't otherwise see. Studio has no PR review surface; this worker is the only thing that catches when an operator edits a flow directly in the Google UI.

## Cron

Daily 13:00 UTC (08:00 CT — after the morning triage so any drift discovered in tonight's edit window surfaces before the next 07:00 run).

## Stack

Minimal — fetch JSON from `chittyagent-gam` tunnel, SHA-256, compare against env var (set at deploy from repo file hash).

## Tail consumer

`chittytrack`.

## Certification level

Bronze (health-only stub). Promotes upon GATE 3.
