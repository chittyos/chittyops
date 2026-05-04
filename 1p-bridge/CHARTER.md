---
uri: chittycanon://docs/ops/policy/chitty-1p-bridge-charter
namespace: chittycanon://docs/ops
type: policy
version: 0.1.0
status: DRAFT
registered_with: chittycanon://core/services/canon
title: "chitty-1p-bridge Charter"
certifier: chittycanon://core/services/chittycertify
visibility: PUBLIC
---

# chitty-1p-bridge Charter

## Classification
- **Canonical URI**: chittycanon://core/services/chitty-1p-bridge
- **Tier**: 3 (Operational)
- **Organization**: CHITTYOS
- **Domain**: N/A (VM-resident; no public surface)
- **Deployment model**: systemd service on chittyserv-dev (NOT a Cloudflare Worker)

## Mission

Bridge 1Password Connect and Cloudflare Secrets Store so that secret rotation in 1P propagates to running Workers within 5 minutes, and provide a single canonical 1Password client for all operator and automation tooling on chittyserv-dev.

## Scope

### IS responsible for
- Polling 1Password Connect on a 5-minute cron and pushing changed values to the Cloudflare Secrets Store API per a declarative watchlist
- Providing the `chitty-op` CLI (get / list / otp / sync) for operator-grade 1P access
- Providing a reusable Node module (`@chittyos/1p-bridge`) that other VM tools import for 1P access
- Logging every sync event and CLI invocation to ChittyChronicle
- Owning the per-vault state cache used to detect changes between ticks
- (Phase 3+) Writing rotated values from KV back to 1P so 1P remains canonical
- (Phase 4+) Subscribing to the 1P Events API for sub-minute propagation

### IS NOT responsible for
- Generating, minting, or rotating ChittyIDs (ChittyID)
- Issuing service tokens or OAuth credentials (ChittyAuth)
- Modifying Worker `wrangler.jsonc` to bind new secrets — operators do that
- Replacing chittyconnect's legacy `OnePasswordConnectClient` (it stays as-is on its deprecation arc)
- Synchronizing to legacy Workers Secrets (only Secrets Store is supported)
- Holding any Worker service token

## Dependencies

| Type | Service | Purpose |
|------|---------|---------|
| Upstream | 1Password Connect (local on VM) | Source of truth for credential values |
| Upstream | Cloudflare Secrets Store API | Write target for synced secrets |
| Upstream | ChittyRegistry | Service discovery and registration |
| Peer | ChittyChronicle | Audit trail for syncs and CLI invocations |
| Peer | chittyconnect | Consumer of synced secrets via env bindings (Portal Pattern) |

## Public surface

### CLI: `chitty-op`
- `chitty-op get <vault>/<item>/<field>` → field value to stdout
- `chitty-op list [vault]` → vaults or items
- `chitty-op otp <vault>/<item>` → current TOTP
- `chitty-op sync status` → per-entry hash, last-sync timestamp from local state
- `chitty-op sync run [--dry-run]` → execute one sync cycle on demand

### Node module: `@chittyos/1p-bridge`
- `getItem(vault, item)`, `getField(vault, item, field)`, `getOtp(vault, item)`
- `listItems(vault)`, `listVaults()`
- `createItem(vault, builder)`, `updateItem(vault, item, mutator)` (Phase 3+)

### systemd unit: `chitty-1p-bridge-sync.timer`
- Runs `chitty-1p-bridge-sync.service` every 5 minutes
- Reads watchlist from `/etc/chitty-1p-bridge/watchlist.toml`
- Writes state cache to `/var/lib/chitty-1p-bridge/state.json`

### Health
- No HTTP `/health` endpoint (non-Worker, no public network surface)
- Liveness via `systemctl status chitty-1p-bridge-sync.timer`
- Last-success readout via `chitty-op sync status`
- Sync events flow to ChittyChronicle for external observability

## Compliance and registration

- Registers with ChittyRegistry at first install (Phase 1 acceptance criterion)
- Compliance triad complete: CHARTER.md, CHITTY.md, CLAUDE.md, AGENTS.md, SECURITY.md
- Bound to chittycanon://gov/governance entity types — bridge runs as a **synthetic Person (P)** actor with its own ChittyID
