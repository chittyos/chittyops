# AGENTS.md

Vendor-neutral guidance for AI coding agents (Claude, Codex, Cursor, Gemini, etc.) working in this repo. Claude-specific addenda live in CLAUDE.md.

## What this repo is

`chitty-1p-bridge` — a Node systemd service on chittyserv-dev that syncs 1Password to Cloudflare Secrets Store and provides a CLI for operator 1P access. Tier 3 (Operational). Read CHARTER.md and CHITTY.md before changing anything.

## Hard rules

- **Never put this code in a Cloudflare Worker.** The whole reason this service exists is to keep runtime 1P dependency OUT of Workers. If you find yourself porting to wrangler, stop and re-read CHITTY.md § "Why VM, not Worker."
- **Never log credential values.** Log credential paths and hashes, never the value itself. The chronicle logger MUST redact.
- **Never write to 1Password before Phase 3.** `createItem`/`updateItem` are gated behind a Phase 3 feature flag. Adding write code earlier is a scope violation.
- **Never bypass the watchlist.** Sync only what the TOML declares. Auto-discovery of vault contents for sync is explicitly out of scope.
- **Never ask the operator for a credential.** Discover via `op` CLI on the VM or fail with a clear error. Operators are not KV stores.

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

## Common tasks

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
