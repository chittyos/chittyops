# SOP: Health-Only Proof-of-Control Deploy

**Status:** Approved
**Applies to:** Any new Cloudflare Worker registering with `register.chitty.cc`
**Codifies:** Practice used for Phase 4 worker registration (2026-05-27)

## Why this SOP exists

The Channel Registration Protocol says **register before deploy**. `register.chitty.cc/api/v1/register` requires `endpoints` to be a list of HTTPS URLs **including `/health`**, and the Gatekeeper performs proof-of-control by:

1. Issuing a challenge token via `POST /api/v1/challenge`
2. Expecting the caller to serve `key_authorization` at `/.well-known/chitty-register-challenge/<token>` on the registered host
3. Verifying that path resolves to the expected value before accepting registration

This creates a chicken-and-egg: the worker must be live at the registered host **before** registration can complete. A literal "no deploy until registered" rule is unachievable.

## The exception

A **health-only proof-of-control deploy** is permitted **for the sole purpose of completing registration**, subject to the constraints below.

## Allowed surface area

The health-only deploy MAY serve:

- `GET /health` — `{ status, service, version, ts }` only
- `GET /api/v1/status` — same, with `mode: "health-only-stub"` flag
- `GET /.well-known/chitty-register-challenge/<token>` — the `key_authorization` string returned by `/api/v1/challenge`
- `GET /` — informational stub (optional, no business logic)

Everything else MUST return `404`.

## Prohibited in a health-only deploy

- Cron triggers (`[triggers] crons = [...]`) — keep commented out
- Bindings to data stores (Hyperdrive, KV, R2) other than what's required for `/health` — keep `REPLACE_AT_DEPLOY` placeholders
- Secrets — none required for health/challenge surface
- Routes to any pipeline, queue, or downstream service
- Any code path that reads or writes user data, PII, or privileged content

## Procedure

1. **Scaffold registration payload** at `registrations/<name>.json` per compliance triad requirements.
2. **Request challenge** from register.chitty.cc:
   ```bash
   curl -X POST https://register.chitty.cc/api/v1/challenge \
     -H 'Content-Type: application/json' \
     -d '{"name":"<name>","endpoint":"https://<name>.chitty.cc/health"}'
   ```
   Captures `{ token, key_authorization }` (expires ~15 min).
3. **Deploy health-only worker** to the registered hostname with the challenge token + key_authorization baked in:
   ```js
   if (url.pathname === `/.well-known/chitty-register-challenge/${TOKEN}`) {
     return new Response(KEY_AUTHORIZATION, { headers: { 'content-type': 'text/plain' } });
   }
   ```
4. **Attach custom domain** to the worker:
   ```bash
   cf deploy   # or PUT /accounts/{id}/workers/domains
   ```
5. **Verify `/health` is reachable** at `https://<name>.chitty.cc/health` returning 200.
6. **Submit registration**:
   ```bash
   curl -X POST https://register.chitty.cc/api/v1/register \
     -H 'Content-Type: application/json' \
     -d @registrations/<name>.json
   ```
   Capture the assigned `chitty_id`.
7. **Verify** `https://registry.chitty.cc/api/v1/tools/<chitty_id>` returns 200.

The worker is now registered. It is **not yet** a production deployment.

## Promotion to full deploy

Health-only stubs MUST be replaced with the full worker logic before being treated as production. The promotion sequence:

1. Stubs serve `/health` only — production traffic does NOT go to a stub.
2. Once registration is confirmed, replace the worker code with the full `worker.ts` from the repo. The full worker.ts MUST also export `/health` and `/api/v1/status`.
3. Provision real bindings (Hyperdrive, KV, R2 ids; secrets via wrangler secret).
4. Run Two-Space RLS synthetic test (`docs/PILOT.md` §exit-criteria) and any service-specific compliance test.
5. **Enable cron triggers last** — only after every preceding step is verified.

## Audit trail

Each health-only deploy MUST leave a record:

- A row in the relevant `*/CHARTER.md` and `*/AGENTS.md` under "Status" noting the health-only stub state.
- A registration JSON at `registrations/<name>.json` committed to the repo.
- The assigned `chitty_id` annotated in the worker's compliance triad.

## What this SOP is NOT

- This SOP does **not** authorize bypassing chittyregister. The Gatekeeper still validates payload schema and proof-of-control.
- This SOP does **not** authorize skipping the compliance triad (CHARTER.md, CHITTY.md, AGENTS.md). Those MUST exist for a worker to be considered ChittyOS-compliant.
- This SOP does **not** authorize enabling production behavior (cron, real data writes, secrets) on a health-only stub.

## Provenance

This SOP was written after the Phase 4 deploy (2026-05-27) used this pattern to register four workers: `daily-comms-triage`, `daily-comms-triage-realtime`, `comptroller`, `flow-hash-check`. Auditor feedback flagged the practice as operationally reasonable but undocumented; this SOP closes that gap.
