---
uri: chittycanon://docs/ops/policy/chitty-1p-bridge-security
namespace: chittycanon://docs/ops
type: policy
version: 0.1.0
status: RETIRED
registered_with: chittycanon://core/services/canon
title: "chitty-1p-bridge Security Policy"
visibility: PUBLIC
---

# Security

> **RETIRED — 2026-08-21.** The 1Password lane this service secured is retired as both
> a lane and an authority; the cold source of truth is ChittySecrets. `op` has zero
> accounts on this host, so the credential-resolution and rotation procedures below
> cannot be carried out. Sections marked historical are retained as a record of what
> the service held while it ran, not as live procedure. Whether the tokens named here
> have actually been revoked is NOT asserted — verifying and revoking them is an
> operator act.

## Threat model (historical — what the service held while it ran)

| Asset | Held where | Protection |
|---|---|---|
| 1P Connect token (read scope) | `/etc/chitty-1p-bridge/env` mode 0600, owner `chitty-bridge` | Filesystem ACL; rotated quarterly |
| 1P Connect token (write scope, Phase 3+) | Same | Separate token from read scope; can be revoked independently |
| CF API token (`Secrets Store:Edit`) | Same | Account-scoped, not zone-scoped; rotated quarterly |
| State cache | `/var/lib/chitty-1p-bridge/state.json` mode 0644 | Contains hashes only — never values |
| Watchlist | `/etc/chitty-1p-bridge/watchlist.toml` mode 0640 | PR-reviewed; declares paths not values |

## Credential handling (historical — procedure no longer executable)

- The bridge's own credentials were stored in 1Password at canonical paths and resolved on VM start via the `op` CLI. That resolution path is dead: `op` has no accounts configured on this host, so no `op read` succeeds. Do not attempt it, and do not add an `op`-based bootstrap back.
- No rotation cadence is in force for this service. The quarterly 1P-Connect/CF-token rotation described here cannot run without the `op` lane, and the bridge never became the canonical rotation actor. Auditing or revoking any credential this service was issued is an operator act — route it through `ch1tty → ChittyConnect` (`/chico`), not through this repo.
- The chronicle logger redacts any field whose label matches `/password|token|secret|key|credential|otp/i` before emitting.

## Non-secrets that must not leak

- Vault titles and item titles can be sensitive (they reveal what services exist and how they're named). The chronicle log includes them; chronicle access is gated by ChittyAuth.
- The watchlist file is similarly sensitive and must not be world-readable.

## Vulnerability disclosure

Report security issues to `security@chitty.cc` (encrypted PGP available on `https://chitty.cc/.well-known/security.txt`). Do NOT open a GitHub issue. Coordinated disclosure timeline: 90 days standard, accelerated for active exploitation.

## Things that are NOT security boundaries

- The CLI does not authenticate the local operator beyond filesystem permissions on `/etc/chitty-1p-bridge/env`. Anyone who can read that file can run `chitty-op get` for any vault path. This is intentional — VM access IS the security boundary.
- The Node module exposes the same surface; importing it gives the importing process the bridge's full read scope.
- The state cache hash is not a cryptographic commitment to a value; it is purely a change-detection signal. Do not rely on it for integrity attestations.

## Audit

- Every CLI invocation logs `{actor: nb, path, result, timestamp}` to ChittyChronicle.
- Every sync tick logs aggregate counts plus one event per changed entry.
- Bridge process startup logs token fingerprints (first 8 chars hashed) so token rotations are visible in chronicle without exposing the token.
