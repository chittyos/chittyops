# Phase 4 Worker Registration Payloads

Scaffolded registration payloads for the four new Phase 4 workers. Submit each to **register.chitty.cc/api/v1/register** (the Gatekeeper) — not directly to registry.chitty.cc. The Gatekeeper handles proof-of-control, ChittyID minting, certification, and propagation to the registry.

## Files
- `daily-comms-triage.json` — cron routine (07:00 CT)
- `daily-comms-triage-realtime.json` — webhook variant (pilot-disabled)
- `comptroller.json` — sibling budget observer (5-min cron, always on)
- `flow-hash-check.json` — Studio drift detector

## Submission (operator workflow)

Each worker must serve `/health` over HTTPS **before** submission so register.chitty.cc can complete proof-of-control. The flow:

1. **Deploy a minimal /health-only version** of the worker (cron still disabled).
2. **Obtain a challenge token** for the worker's domain:
   ```bash
   curl -X POST https://register.chitty.cc/api/v1/challenge \
     -H 'Content-Type: application/json' \
     -d '{"domain":"daily-comms-triage.chitty.cc"}'
   ```
3. **Serve `key_authorization` at** `/.well-known/chitty-register-challenge/<token>` on the worker.
4. **Submit the registration payload:**
   ```bash
   for f in registrations/*.json; do
     curl -X POST https://register.chitty.cc/api/v1/register \
       -H 'Content-Type: application/json' \
       -H "Authorization: Bearer $(op read 'op://chittyos/chittyconnect/api_key')" \
       --data @"$f"
     echo
   done
   ```
5. **Verify** each worker now appears at `registry.chitty.cc/api/v1/service/<id>` with status `200`.

This sequence (deploy /health → challenge → register → enable full deploy → enable cron) satisfies GATE 2 of the Phase 4 staged-goal plan.

## Why these payloads aren't auto-submitted

Submission is a sensitive-intent action per `/home/ubuntu/.ch1tty/canon/system-wide-sensitive-intent-contract-v1.md` and must route through ChittyConnect. The ch1tty gateway currently shows 0/14 backends connected; until that's resolved or operator explicitly authorizes a bypass, these files stay as deploy-ready scaffolds.
