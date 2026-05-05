# Security

## Threat model

| Asset | Held where | Protection |
|---|---|---|
| 1P Connect token (read scope) | `/etc/chitty-1p-bridge/env` mode 0600, owner `chitty-bridge` | Filesystem ACL; rotated quarterly |
| 1P Connect token (write scope, Phase 3+) | Same | Separate token from read scope; can be revoked independently |
| CF API token (`Secrets Store:Edit`) | Same | Account-scoped, not zone-scoped; rotated quarterly |
| State cache | `/var/lib/chitty-1p-bridge/state.json` mode 0644 | Contains hashes only — never values |
| Watchlist | `/etc/chitty-1p-bridge/watchlist.toml` mode 0640 | PR-reviewed; declares paths not values |

## Credential handling

- The bridge's own credentials are stored in 1Password at canonical paths and resolved on VM start via `op` CLI. They are never in environment variables on the operator's shell, never in systemd unit files, and never in the repo.
- Rotation cadence: quarterly for both 1P Connect tokens and the CF API token. Rotation is tracked in `secret-rotation.js` registry (chittyconnect) once the bridge itself is the canonical rotation actor (Phase 3).
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
