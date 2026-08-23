---
uri: chittycanon://docs/ops/procedure/chitty-1p-bridge-agents
namespace: chittycanon://docs/ops
type: procedure
version: 0.1.0
status: RETIRED
registered_with: chittycanon://core/services/canon
title: "chitty-1p-bridge Agent Guidance"
visibility: PUBLIC
---

# AGENTS.md

Vendor-neutral guidance for AI coding agents (Claude, Codex, Cursor, Gemini, etc.) working in this repo. Claude-specific addenda live in CLAUDE.md.

## Status: RETIRED (2026-08-21)

`chitty-1p-bridge` was a Node systemd service on chittyserv-dev that synced 1Password
to Cloudflare Secrets Store and provided a CLI for operator 1P access. It is retired.
1Password is retired as both a lane and an authority; the cold source of truth is
ChittySecrets (`secrets.chitty.cc`, fronting Cloudflare Secrets Store), and Cloudflare
Secrets remain runtime delivery. `op` is installed on this host with zero accounts
configured, so every code path here fails at the first 1P call.

**What this means for you as an agent:**

- Do not run, install, or invoke this service, its CLI (`chitty-op`), or its sync timer.
- Do not run `op` in any form. It cannot succeed, and an audit or lookup run against a
  vault with zero accounts produces false findings.
- Do not "fix" `src/**` by re-pointing it at ChittySecrets. That is a re-architecture no
  authority has ratified. The code is left in place as dead code, deliberately.
- Route any real credential need through `ch1tty → ChittyConnect` (`/chico`). If the
  broker path is unavailable, fail closed with `POLICY_BLOCKED_CHITTYCONNECT_UNAVAILABLE`.
- Deleting this service, de-registering it, or replacing it is an operator act.

The generic policy modules under `src/lib/` (`policy.ts`, `leak-containment.ts`,
`destination-resolver.ts`) are still referenced by `policy/canon/` as enforcement
layers; leave them alone rather than deleting the directory wholesale.

Everything below is the historical guide from when the service was live. Read
CHARTER.md and CHITTY.md for the retirement context before acting on any of it.

## Hard rules (historical)

- **Never put this code in a Cloudflare Worker.** The whole reason this service exists is to keep runtime 1P dependency OUT of Workers. If you find yourself porting to wrangler, stop and re-read CHITTY.md § "Why VM, not Worker."
- **Never log credential values.** Log credential paths and hashes, never the value itself. The chronicle logger MUST redact.
- **Never write to 1Password before Phase 3.** `createItem`/`updateItem` are gated behind a Phase 3 feature flag. Adding write code earlier is a scope violation.
- **Never bypass the watchlist.** Sync only what the TOML declares. Auto-discovery of vault contents for sync is explicitly out of scope.
- **Never ask the operator for a credential.** Operators are not KV stores. (The original instruction here — "discover via `op` CLI on the VM" — is void: `op` has no accounts on this host. Fail closed and route through `ch1tty → ChittyConnect`.)

## Where things are

| Path | Purpose |
|---|---|
| `src/lib/op-client.ts` | Singleton wrapper around `@1password/connect` |
| `src/lib/cf-client.ts` | Minimal Cloudflare Secrets Store client (fetch-based) |
| `src/lib/chronicle.ts` | ChittyChronicle logger with credential redaction |
| `src/cli/index.ts` | `chitty-op` entry point |
| `src/sync/daemon.ts` | Sync tick implementation |
| `src/sync/watchlist.ts` | Watchlist loader, validator, TOTP rejector |
| `src/sync/state.ts` | State cache reader/writer |
| `config/watchlist.toml` | Production watchlist (PR-gated) |
| `systemd/` | Unit files |

## Common tasks (historical — the runtime ones no longer work)

| Task | Command |
|---|---|
| Install deps | `npm ci` |
| Test | `npm test` |
| Lint | `npm run lint` |
| Build CLI | `npm run build` |
| Run sync once locally | `node dist/sync/daemon.js --once --dry-run` |
| Run CLI | `node dist/cli/index.js <args>` |
| Lint watchlist against chittyconnect inventory | `npm run lint:watchlist` |
| Full preflight | `npm run preflight` (lint + typecheck + test + watchlist lint) |

## Conventions

- TypeScript strict mode
- All credential paths follow the `vault/item/field` form used by chittyconnect's legacy client
- Errors thrown to systemd are non-zero exit; chronicle logs are best-effort and never crash the process
- Entity types (chittycanon://gov/governance): the bridge process is a **synthetic Person (P)** actor with its own ChittyID. Operators using the CLI are **natural Person (P)** actors.

## Discovery before designing

Per the global agent contract: do not design new ChittyOS surfaces in a vacuum. Before adding a feature that talks to other services, query `https://registry.chitty.cc/api/services` and read the target service's CHARTER.md.
