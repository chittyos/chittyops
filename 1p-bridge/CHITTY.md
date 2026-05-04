---
uri: chittycanon://docs/ops/architecture/chitty-1p-bridge
namespace: chittycanon://docs/ops
type: architecture
version: 0.1.0
status: DRAFT
title: "chitty-1p-bridge Architecture"
visibility: PUBLIC
---

# chitty-1p-bridge — Architecture

## Position in the ecosystem

chitty-1p-bridge is the **continuous-sync companion** to the Portal Pattern adopted by chittyconnect (and any other ChittyOS Worker that uses Cloudflare Secrets Store). Without the bridge, secret changes in 1Password only reach Workers at the next `wrangler deploy`. With the bridge, they propagate within 5 minutes — without re-introducing runtime 1P calls from the Worker itself.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 LTS on Ubuntu (chittyserv-dev) |
| 1P client | `@1password/connect` (official SDK) |
| CF client | Direct `fetch` against `api.cloudflare.com/client/v4/accounts/:id/secrets_store` |
| Process model | systemd: a long-lived CLI binary + a timer-driven sync unit |
| State | Local JSON file (`/var/lib/chitty-1p-bridge/state.json`) |
| Audit | ChittyChronicle via HTTPS |
| Config | TOML watchlist at `/etc/chitty-1p-bridge/watchlist.toml` |

## Runtime topology

```
chittyserv-dev (VM)
├── /usr/local/bin/chitty-op (CLI binary)
├── /opt/chitty-1p-bridge/ (Node app + node_modules)
├── /etc/chitty-1p-bridge/
│   ├── watchlist.toml
│   └── env (1P + CF tokens, mode 0600, owner chitty-bridge)
├── /var/lib/chitty-1p-bridge/state.json
└── systemd:
    ├── chitty-1p-bridge-sync.service (one-shot)
    └── chitty-1p-bridge-sync.timer (every 5 min)
```

## Consumers

| Consumer | How it uses the bridge |
|---|---|
| Operators (humans) | `chitty-op` CLI for ad-hoc credential lookup |
| Other VM scripts | Import `@chittyos/1p-bridge` instead of hand-rolling 1P access |
| chittyconnect Worker | Indirectly — its env bindings get refreshed by the sync daemon |
| chittyrouter, chittyfinance, etc. | Same indirect pattern when their secrets are added to the watchlist |

## Certification target

- ChittyCertify level: **Bronze** at Phase 1 (compliance triad complete, registered)
- Promotes to **Silver** when sync is observed reliable for 30 days with chronicle coverage
- **Gold** requires bi-directional sync (Phase 3) and event-driven sync (Phase 4)

## Why VM, not Worker

Putting `@1password/connect` in the chittyconnect Worker would:
1. Re-introduce runtime 1P dependency the Portal Pattern was designed to remove
2. Require a custom `IRequestClient` shim because the SDK's default `HTTPClient` uses Node `http.Agent` which is fragile under `nodejs_compat`
3. Couple bridge lifecycle to Worker deploys
4. Inherit the Worker's broad service-token blast radius

VM placement avoids all four. The SDK runs in its native Node environment with operator-scoped credentials.

## Failure modes

| Mode | Behavior | Operator action |
|---|---|---|
| 1P Connect server down | Skip tick, log error, retry | None — self-heals |
| CF API down | Skip changed entries, retry | None — self-heals |
| VM offline > 5 min | No syncs occur during outage | Run `chitty-op sync run` after VM recovery |
| Watchlist parse error | Daemon refuses to start | Fix TOML, restart unit |
| State cache corrupt | Treat all entries as changed; one-time resync | Inspect chronicle for spurious events |
| Race with `wrangler deploy` | Deploy wins; bridge re-syncs next tick | Phase 3 enforces deploy-after-1P-write ordering |
| TOTP field in watchlist | Hash never stabilizes (continuous re-syncs) | Watchlist schema rejects TOTP fields at load |

## Non-goals

- Not an HTTP service (no Hono, no /health route, no public surface)
- Not a Worker (will never deploy via wrangler)
- Not a multi-tenant system (single-VM, single-watchlist)
- Not a backup or DR tool for 1P itself
