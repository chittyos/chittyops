# chittyagent-gam

Multi-account **Google Workspace** connector. Backs the ChittyMCP `gam_execute`
capability and provides the Workspace-Gmail ingest path for `daily-comms-triage`.

It is a thin HTTP wrapper (`gam-http-server.js`) around **GAMADV-XTD3** running on
the VM, exposed to the ecosystem through the ch1tty tunnel:

```
worker / ChittyMCP  ──►  gam.chitty.cc  ──(tunnel)──►  127.0.0.1:9098  ──►  gamadv-xtd3
```

The executor binds to `127.0.0.1` only — it is never publicly exposed. All auth and
TLS termination happen at the tunnel edge.

## Accounts (spec daily-updates-orchestration-v0.5 §Q7)

| Logical account  | Inbox                     | Type      | Path        | Status        |
|------------------|---------------------------|-----------|-------------|---------------|
| `ws_jeanarlene`  | `nick@jeanarlene.com`     | Workspace | this connector | ✅ live (GAM default OAuth) |
| `ws_nevershitty` | `nick@nevershitty.com`    | Workspace | this connector | ✅ live (same default OAuth — authorized across both domains) |
| `personal_gmail` | `nichobianchi@gmail.com`  | consumer  | **NOT here** — readonly Gmail REST in the worker | ⚠️ pending OAuth token |

The configured GAM default OAuth is authorized across **both** Workspace domains
(verified: it reads `nick@jeanarlene.com` and `nick@nevershitty.com` directly), so
both accounts use the `default` profile — no per-domain section is needed.

GAM only reaches **Google Workspace** domains via domain-wide delegation. The
consumer `@gmail.com` account is intentionally **out of scope** for this connector
(`/gmail/metadata` returns `403 account_not_permitted` for it); the worker reads it
directly from the Gmail REST API instead (spec Q4 hybrid design).

## F-L10 — privileged-domain metadata-only (binding)

The two Workspace inboxes carry privileged legal mail (senders `vanguardadvocates.com`,
`bertonring.com`, `ksnlaw.com` → Legalink-Neon only). The connector **must not** let
message bodies or snippets cross the domain boundary.

`/gmail/metadata` enforces this in code:
- It constructs its own GAM args — caller-supplied args are discarded, so there is no
  way to inject `showbody` / `showsize`.
- It only ever requests the `From,Subject,Date` headers (plus the message/thread IDs
  GAM emits). There is no code path that returns a body or snippet.

In-domain Workspace **Studio** triage (Gemini-in-Workspace) can later enrich
`pre_evaluated_sensitivity` on these items without changing this boundary.

## Endpoints

### `GET /health`
```json
{ "status": "ok", "service": "gam-executor", "gam": "...", "workspace_accounts": ["ws_jeanarlene","ws_nevershitty"] }
```

### `POST /gam`  — generic GAMADV-XTD3 passthrough (backs `gam_execute`)
```json
{ "account": "default", "command": "user", "args": ["nick@jeanarlene.com","show","gmailprofile"] }
```
Returns `{ stdout, stderr, exitCode }`.

### `POST /gmail/metadata`  — F-L10 metadata-only inbox listing
```json
{ "account": "ws_jeanarlene", "query": "in:inbox newer_than:1d", "max": 200 }
```
Returns:
```json
{
  "account": "ws_jeanarlene",
  "email": "nick@jeanarlene.com",
  "query": "in:inbox newer_than:1d",
  "metadata_only": true,
  "count": 3,
  "items": [
    { "message_id": "...", "thread_id": "...", "from": "Mercury <hello@mercury.com>",
      "subject": "Your review is needed for a bill", "date": "Wed, 10 Jun 2026 03:12:13 +0000" }
  ]
}
```
- `account` must be in the allowlist (`ws_jeanarlene`, `ws_nevershitty`). Anything else → `403`.
- Unprovisioned profile (e.g. `ws_nevershitty` before OAuth) → `424 account_not_provisioned`
  with `{ "code": "account_not_provisioned" }` so callers degrade rather than crash.

## Deploy / activate

The repo copy is canonical. To activate on the VM:

```bash
cp connectors/chittyagent-gam/gam-http-server.js ~/bin/gam-http-server.js
# restart the executor (operator action — shared infra):
pkill -f '/home/ubuntu/bin/gam-http-server.js'; nohup node ~/bin/gam-http-server.js &
curl -s http://127.0.0.1:9098/health | jq .
```

The `/gam` and `/health` routes are unchanged from the prior version (backward
compatible); only `/gmail/metadata` is new, so existing `gam_execute` consumers are
unaffected by the upgrade.

The `gam.chitty.cc → 127.0.0.1:9098` tunnel route must be live for remote consumers
(currently returns 404 — see RUNBOOK). Tunnel/route changes go through ch1tty/chico.
