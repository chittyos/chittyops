# chittyagent-gam — provisioning runbook

Three Gmail accounts feed `daily-comms-triage`. One works today; two need an operator
OAuth grant. **Secrets are never pasted into chat** — every credential below is brokered
through `ch1tty → ChittyConnect` (`/chico`) and delivered as a Cloudflare/chittysecrets
secret. The operator only approves consent screens.

| Account | What's needed | Owner | Status |
|---------|---------------|-------|--------|
| `ws_jeanarlene` (`nick@jeanarlene.com`) | none — default GAM OAuth authorized | — | ✅ live (proven: 43,031 msgs) |
| `ws_nevershitty` (`nick@nevershitty.com`) | none — same default OAuth, authorized across both domains | — | ✅ live (proven: 11,037 msgs) |
| `personal_gmail` (`nichobianchi@gmail.com`) | consumer Gmail readonly OAuth token | operator + chico | ⚠️ pending |
| `gam.chitty.cc` tunnel | route → `127.0.0.1:9098` (currently 404) | chico / ch1tty | ⚠️ pending |

Both Workspace inboxes are already reachable through the configured GAM default OAuth —
no second project or domain-wide-delegation setup is required. Only the consumer inbox
and the tunnel route remain.

---

## 1. `personal_gmail` — consumer Gmail readonly OAuth

GAM cannot touch a consumer `@gmail.com` account, so the worker reads it directly from the
Gmail REST API (`gmail.readonly` scope, `format=metadata`).

1. Operator grants `gmail.readonly` consent for `nichobianchi@gmail.com` via the
   ChittyConnect OAuth flow (`/chico` → Gmail readonly connection).
2. ChittyConnect stores the refresh token and mints short-lived access tokens.
3. Deliver to the worker as the `GMAIL_PERSONAL_TOKEN` secret at deploy time
   (`chittysecrets run … cf deploy`, or ChittyConnect runtime fetch). Until present, the worker
   logs `no token provisioned; skipping` and degrades that source (F-R3) — no fake data.

## 2. `gam.chitty.cc` tunnel route (chico / ch1tty)

The ChittyMCP `gam_execute` capability and the worker's `CHITTYGAM_URL` both target
`gam.chitty.cc`, which currently returns **404** (route not mapped to the running VM
executor on `127.0.0.1:9098`). Restore the tunnel route through ch1tty so
`gam.chitty.cc/{health,gam,gmail/metadata}` proxy to the local executor, with apikey auth
at the edge. This is a ch1tty/ChittyConnect change, not a repo change.

---

## Activation order

1. Promote executor: `cp connectors/chittyagent-gam/gam-http-server.js ~/bin/` + restart (README §Deploy).
2. Fix `gam.chitty.cc` tunnel route (§2).
3. Register `chittyagent-gam` (`registrations/chittyagent-gam.json`).
4. Provision `personal_gmail` (§1) — the two Workspace inboxes are already live.
5. Worker goes fully live at pilot launch (cron in `wrangler.toml` is intentionally still
   disabled until PC1–PC10 pass).
