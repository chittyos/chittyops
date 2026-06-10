# chittyagent-gam — provisioning runbook

Three Gmail accounts feed `daily-comms-triage`. One works today; two need an operator
OAuth grant. **Secrets are never pasted into chat** — every credential below is brokered
through `ch1tty → ChittyConnect` (`/chico`) and delivered as a Cloudflare/1Password
secret. The operator only approves consent screens.

| Account | What's needed | Owner | Status |
|---------|---------------|-------|--------|
| `ws_jeanarlene` (`nick@jeanarlene.com`) | none — GAM `[DEFAULT]` already authorized | — | ✅ live (proven: 43,031 msgs) |
| `ws_nevershitty` (`nick@nevershitty.com`) | 2nd GAM project + domain-wide delegation | operator + chico | ⚠️ pending |
| `personal_gmail` (`nichobianchi@gmail.com`) | consumer Gmail readonly OAuth token | operator + chico | ⚠️ pending |
| `gam.chitty.cc` tunnel | route → `127.0.0.1:9098` (currently 404) | chico / ch1tty | ⚠️ pending |

---

## 1. `ws_nevershitty` — second Workspace domain (GAM)

GAMADV-XTD3 currently has a single `[DEFAULT]` config for `jeanarlene.com`. Add a second
`select`-able profile named `nevershitty` for the `nevershitty.com` Workspace:

1. In **nevershitty.com** Google Workspace Admin, ensure a GCP project with the Admin SDK
   + Gmail API enabled, and a service account with **domain-wide delegation** for the GAM
   OAuth scopes (readonly Gmail scope `gmail.readonly` is sufficient for metadata-only).
2. Authorize the client ID in Admin console → Security → API controls → Domain-wide
   delegation, scopes matching GAM's `gam create project` / `gam oauth create` output.
3. On the VM, create the GAM profile (operator, in a shell — not chat):
   ```bash
   gam create section nevershitty
   gam select nevershitty create project
   gam select nevershitty oauth create
   gam select nevershitty user nick@nevershitty.com check serviceaccount
   ```
4. Verify the connector flips from `424 account_not_provisioned` to live:
   ```bash
   curl -s -XPOST http://127.0.0.1:9098/gmail/metadata \
     -H 'content-type: application/json' \
     -d '{"account":"ws_nevershitty","max":2}' | jq '.count'
   ```

The connector already maps `ws_nevershitty → select "nevershitty"`; no code change needed
once the profile exists.

## 2. `personal_gmail` — consumer Gmail readonly OAuth

GAM cannot touch a consumer `@gmail.com` account, so the worker reads it directly from the
Gmail REST API (`gmail.readonly` scope, `format=metadata`).

1. Operator grants `gmail.readonly` consent for `nichobianchi@gmail.com` via the
   ChittyConnect OAuth flow (`/chico` → Gmail readonly connection).
2. ChittyConnect stores the refresh token and mints short-lived access tokens.
3. Deliver to the worker as the `GMAIL_PERSONAL_TOKEN` secret at deploy time
   (`op run … wrangler deploy`, or ChittyConnect runtime fetch). Until present, the worker
   logs `no token provisioned; skipping` and degrades that source (F-R3) — no fake data.

## 3. `gam.chitty.cc` tunnel route (chico / ch1tty)

The ChittyMCP `gam_execute` capability and the worker's `CHITTYGAM_URL` both target
`gam.chitty.cc`, which currently returns **404** (route not mapped to the running VM
executor on `127.0.0.1:9098`). Restore the tunnel route through ch1tty so
`gam.chitty.cc/{health,gam,gmail/metadata}` proxy to the local executor, with apikey auth
at the edge. This is a ch1tty/ChittyConnect change, not a repo change.

---

## Activation order

1. Promote executor: `cp connectors/chittyagent-gam/gam-http-server.js ~/bin/` + restart (README §Deploy).
2. Fix `gam.chitty.cc` tunnel route (§3).
3. Register `chittyagent-gam` (`registrations/chittyagent-gam.json`).
4. Provision `ws_nevershitty` (§1) and `personal_gmail` (§2) — independent, any order.
5. Worker goes fully live at pilot launch (cron in `wrangler.toml` is intentionally still
   disabled until PC1–PC10 pass).
