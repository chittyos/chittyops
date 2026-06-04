---
uri: chittycanon://docs/ops/spec/canonical-channel-access-v1
namespace: chittycanon://docs/ops
type: spec
version: 1.0.0
status: DRAFT
registered_with: chittycanon://core/services/canon
title: "Canonical Channel Access — One System Through ChittyConnect"
owner: chittycanon://core/services/connect
visibility: PUBLIC
---

# Canonical Channel Access — One System Through ChittyConnect

> **Goal:** Every channel (VM-resident Claude Code, deployed Workers, mobile, ChatGPT,
> homelab nodes, future models) gets credentials by the **same** mechanism. No channel
> ever needs an operator to paste a credential in the normal flow. Long-lived service
> tokens are not handed to channels — ephemeral, audience-scoped tokens are the default.

## 0 · Charter

This is the canonical contract for **how a channel acquires the credentials it needs
to call a ChittyOS service**. It supersedes ad-hoc per-channel onboarding docs. Owner
is `chittycanon://core/services/connect` (ChittyConnect). Compliance is enforced by
the `chittyops` audit engine (new dimension: `channel-access-pattern`).

## 0.1 · Implementation status (READ FIRST)

This spec is **DRAFT**. The endpoint surface in §2 is a mix of **live** and
**proposed** routes. Do not implement against `proposed` routes until the
linked in-flight PR lands.

**Live today** (verified at `chittyconnect/src/api/router.js:146-197`, auth header
`X-ChittyOS-API-Key`):
- `POST /api/credentials/provision`
- `GET  /api/credentials/types`
- `GET  /api/credentials/health`
- `GET  /api/credentials/audit`
- `POST /api/credentials/revoke`
- `*    /api/v1/sessions/*`
- `*    /api/auth/keys/*`
- `*    /api/connections/*`
- `*    /api/v1/connect/*`
- `POST /api/execute`

**Proposed** (tracked in [chittyconnect#364](https://github.com/CHITTYOS/chittyconnect/pull/364), not yet
deployed; do NOT consume):
- `POST /api/v1/tokens/mint`
- `POST /api/v1/tokens/verify`
- `POST /api/v1/channels/register`
- `POST /api/v1/channels/{id}/rotate-key`

The `agent.chitty.cc/api/v1/channels/register` alias is a **target** state once
chittyconnect#364 lands; it returns 404 today.

## 1 · The one system

```
┌────────────┐  1. register   ┌──────────────────┐
│  Channel   │ ─────────────▶ │ ChittyConnect    │
│ (any node) │ ◀───────────── │ /api/v1/channels │
└────────────┘  2. channel_id └──────────────────┘
       │                                ▲
       │ 3. mint (audience-scoped)      │ cold source:
       │    X-ChittyOS-API-Key:         │ 1Password (vaults
       │      <broker_key>              │ ChittyOS, ChittyOS-Core)
       ▼                                │
┌──────────────────┐ 4. ephemeral token  │
│ ChittyConnect    │ ─────────────────┐  │
│ /api/v1/tokens/  │ (ttl=300s, aud,  │  │
│ mint             │  scope, jti)     │  │
└──────────────────┘                  │  │
                                      ▼  │
                            ┌────────────────────┐
                            │ Target service     │
                            │ (e.g. tasks)       │
                            │ verifies aud+scope │
                            └────────────────────┘
```

**Five mandates** (binding for every channel):

1. **Registration is the only onboarding step.** A new channel registers once via
   `POST connect.chitty.cc/api/v1/channels/register` (target alias
   `agent.chitty.cc/api/v1/channels/register` once chittyconnect#364 lands; the
   alias 404s today). It receives a `channel_id`
   (`did:chitty:channel:<host>-<surface>-<n>`) and an `X-ChittyOS-API-Key` that
   is **broker-scoped, not target-scoped** — it can only mint, it cannot call target
   services directly.

2. **Targets accept only ChittyConnect-minted tokens.** Every Tier 2+ service that
   accepts inter-service auth verifies the token at `connect.chitty.cc/api/v1/tokens/verify`
   OR validates a short-TTL JWT signed by ChittyConnect with the target's audience.
   The current pattern of `if (token !== env.CHITTY_AUTH_SERVICE_TOKEN)` is
   **deprecated** — see §4 migration.

3. **Cold source is 1Password.** Canonical vaults are `ChittyOS` (per-service
   registry) and `ChittyOS-Core` (broker + gateway keys). No new vaults are
   introduced for channel onboarding; **no `Chitty-Services` vault exists** and
   none should be requested.

4. **Channels never paste, never store long-lived secrets.** The broker key on a
   channel is itself rotation-friendly (TTL ≤ 30 days, auto-rotated by
   ChittyConnect). Operator visibility is the **last** signal, gated by §5.

5. **Recovery is deterministic.** On a `401/403` from a target, a channel runs
   the recovery routine in §3 (re-register → re-mint → retry) before any
   human-facing surface (TODO, issue, log) is created.

## 2 · Endpoints (canonical)

| Endpoint | Method | Auth | Status¹ | Purpose |
|----------|--------|------|---------|---------|
| `/api/v1/channels/register` | POST | none + proof | **proposed** | Register a new channel; receive `channel_id` + broker key |
| `/api/v1/channels/{id}` | GET | broker key | **proposed** | Read channel state, capabilities, policy bundle |
| `/api/v1/channels/{id}/rotate-key` | POST | broker key | **proposed** | Rotate broker key for an existing channel |
| `/api/v1/tokens/mint` | POST | broker key | **proposed** | Mint audience-scoped ephemeral token (ttl ≤ 600) |
| `/api/v1/tokens/verify` | POST | target service | **proposed** | Verify a presented token (audience + scope match) |
| `/api/credentials/provision` | POST | `X-ChittyOS-API-Key` | **live** | Provision credentials (current path; will remain for GH Actions) |
| `/api/credentials/types` | GET | `X-ChittyOS-API-Key` | **live** | Discover what credential types exist |
| `/api/credentials/health` | GET | `X-ChittyOS-API-Key` | **live** | Credential subsystem health |
| `/api/credentials/audit` | GET | `X-ChittyOS-API-Key` | **live** | Credential issuance audit log |
| `/api/credentials/revoke` | POST | `X-ChittyOS-API-Key` | **live** | Revoke an issued credential |
| `/api/v1/sessions/*` | * | `X-ChittyOS-API-Key` | **live** | Session lifecycle |
| `/api/auth/keys/*` | * | `X-ChittyOS-API-Key` | **live** | API key management |
| `/api/connections/*` | * | `X-ChittyOS-API-Key` | **live** | Connection registry |
| `/api/v1/connect/*` | * | `X-ChittyOS-API-Key` | **live** | Connect protocol |
| `/api/execute` | POST | `X-ChittyOS-API-Key` | **live** | Generic execute surface |

¹ `live` = deployed at `connect.chitty.cc` and verified at
`chittyconnect/src/api/router.js:146-197`. `proposed` = tracked in
[chittyconnect#364](https://github.com/CHITTYOS/chittyconnect/pull/364);
returns 404 until merged + deployed.

`/api/v1/tokens/mint` request shape:

```json
{
  "audience": "chittyagent-tasks",
  "scope": ["tasks:ingest"],
  "channel_id": "did:chitty:channel:chittyserv-vm-claude-code",
  "ttl": 300,
  "reason": "agent_emit for chittyentity#306"
}
```

Response:

```json
{
  "token": "ct.v1.<jwt>",
  "audience": "chittyagent-tasks",
  "scope": ["tasks:ingest"],
  "exp": 1717557600,
  "jti": "01HG..."
}
```

Channels send the minted token as `Authorization: Bearer ct.v1.<jwt>` to the
target. Targets verify via the JWT signature (offline) or call
`POST /api/v1/tokens/verify`.

## 3 · Recovery routine (binding for every channel)

When a channel hits 401/403 on a target, it MUST execute, in order:

```
1. Re-mint:    POST /api/v1/tokens/mint  with same audience+scope, fresh ttl.
2. If 401:     POST /api/v1/channels/register  with current host fingerprint.
               (idempotent — returns existing channel_id if already known)
3. If 401:     Check broker key freshness:
               GET /api/v1/channels/{channel_id}  → if `key_expires_at` < now,
               trigger key rotation: POST /api/v1/channels/{id}/rotate-key.
4. If 401:     POST chittyconnect-internal: report drift event
               (target's deployed token ≠ canonical token in 1Password).
               This is the ONLY path that may surface to operator.
5. Retry target call once with new minted token.
6. If still failing: emit `agent_event` of type `policy_blocked_channel_access`
   to chittyagent-tasks ingest (using the recovered token from step 5) so the
   gap shows up in the work surface, not in operator chat.
```

A channel may emit operator-visible artifacts (GH issue, TODO, blocker) **only
after** step 4 fires and the operator-visibility gate in §5 is satisfied.

## 4 · Migration: deprecate shared `CHITTY_AUTH_SERVICE_TOKEN`

Current state (verified 2026-06-04 on `tasks.chitty.cc`):

```ts
// chittyagent-tasks/src/auth.ts
if (h.slice(7) !== c.env.CHITTY_AUTH_SERVICE_TOKEN) return c.json({...}, 403);
```

This pattern is the root cause of the false-alarm issues
chittyconnect#231 / chittyentity#343. The shared token in 1Password vault
`ChittyOS/CHITTY_AUTH_SERVICE_TOKEN` (`ca1d75…`) does not match what is
deployed in the worker's `env.CHITTY_AUTH_SERVICE_TOKEN`. The drift is invisible
to channels — they only see `403 Invalid token`.

**Migration (Tier 2+):**

```ts
// canonical bearerAuth
import { verifyMintedToken } from "@chittyos/connect-verify";
if (!await verifyMintedToken(h.slice(7), {
  audience: "chittyagent-tasks",
  scope: "tasks:ingest",
  env: c.env,
})) return c.json({ success: false, error: "Invalid token" }, 403);
```

`@chittyos/connect-verify` is published by chittyconnect; offline JWT verify
with a 24h cache of ChittyConnect's signing key (KV: `connect:jwks`). One
codebase change per Tier 2+ service; rollout tracked as chittyops compliance
dimension #8 (`channel-access-pattern`).

## 5 · Operator-visibility gate (the goal's triple-verified gate, programmable)

A channel/agent may surface a credential/access blocker to the operator
**only when ALL of the following are true** (checked programmatically, not by
human discretion):

| Check | Programmable signal |
|-------|---------------------|
| Recovery routine §3 ran to completion | `recovery_routine_exhausted: true` event in tasks |
| All other blockers in scope cleared | `chittyops audit --service=<X>` exit 0 on every dimension except `channel-access-pattern` |
| All GH/Linear/Notion issues for relevant repos addressed | `gh issue list --state=open --label=blocker` empty AND `chittyagent-tasks` queue has no `priority>=8` items for the repo |
| All PR comments/conversations/conflicts cured | `gh pr list --search "review:required OR is:dirty"` empty |
| All branches reviewed; GH status clean | `gh pr checks` green on all open PRs for the repo |
| ChittyConnect + chico were invoked | An ingest record exists with `source_type=concierge_invocation, payload.concierge in ['chico','chittyconnect']` within the active session (no fixed time bound — fresh sessions must not auto-trip this gate) |

These are checked by a new `chittyops` script
`scripts/operator-visibility-gate.sh`, which returns exit 0 only if all six
pass. The Stop hook installed by the operator this session can call this
script and refuse to render any credential/access blocker text otherwise.

## 6 · Wiring per channel surface

| Surface | Registration trigger | Where broker key lives |
|---------|----------------------|------------------------|
| **VM-resident Claude Code** | `SessionStart` hook on first run, idempotent | `op://ChittyOS-Core/<host>-channel-broker/credential` (per-host item, auto-created on registration) |
| **Cloudflare Worker** | `wrangler deploy` post-hook, registers as `did:chitty:channel:worker-<name>-<env>` | Worker secret `CHITTYCONNECT_BROKER_KEY` (set by chittyops reusable deploy workflow) |
| **GitHub Actions** | Workflow `getchitty-creds` action runs registration if no cached channel_id | Repo secret `CHITTYCONNECT_API_KEY` |
| **Homelab node** | `chittymarket-sync-daemon.sh` on first boot | `~/.ops/channel-broker-key` (mode 600, written by registration response) |
| **ChatGPT cloud MCP** | Gateway-mediated registration via `ch1tty.com/mcp` (server-side policy + sync, per global CLAUDE.md Capability Registration §) | ChittyConnect-held; never exposed to the client | 
| **Mobile** | OAuth flow returns channel_id + broker key (slim-MCP `search` + `execute`) | Provider's secure keystore |
| **Future channels** | Register → Receive → Sync → Report → Enforce (per Channel Registration Protocol) | Channel-specific; broker-only key |

## 7 · Compliance dimension (new)

Add to `chittyops/compliance/checks.yml`:

```yaml
channel-access-pattern:
  description: |
    Tier 2+ services must verify ChittyConnect-minted tokens (audience+scope),
    NOT compare against a shared env.CHITTY_AUTH_SERVICE_TOKEN.
  applies_to_tier: [2, 3, 4, 5]
  signal:
    - file: src/auth.ts (or equivalent)
    - must_contain: "verifyMintedToken"  OR  "connect-verify"
    # The live deprecated pattern in chittyagent-tasks/src/auth.ts:7 is
    #   h.slice(7) !== c.env.CHITTY_AUTH_SERVICE_TOKEN
    # so the signal must catch any reference to the shared env var, not just
    # a single equality form.
    - must_not_contain_regex: "c\\.env\\.CHITTY_AUTH_SERVICE_TOKEN|env\\.CHITTY_AUTH_SERVICE_TOKEN"
  remediation_template: templates/migrate-to-minted-auth.md
```

## 8 · What this spec closes / redirects

Closure of the issues below is **gated** on §9.3 — the mint/verify routes must
be live and verified in production before the originating issues are closed,
because both issues are about credential paths that depend on those routes.

- **chittyconnect#231** — Filed in error. The VM Connect token already has
  `ChittyOS` and `ChittyOS-Core` vault scope; the canonical credentials are
  readable. Redirect: the real gap is the broker-token-drift between
  1Password and the deployed worker's `env.CHITTY_AUTH_SERVICE_TOKEN`,
  closed by §4 migration. **Close only after §9.3 verification.**
- **chittyentity#343** — Filed in error. No `Chitty-Services` vault exists;
  the documentation in `chittyagent-tasks/INGESTION.md` referenced the
  wrong path. Redirect: update INGESTION.md to use
  `/api/v1/tokens/mint` (per §2) and stop referencing
  `op://Chitty-Services/...`. **Close only after §9.3 verification.**
- **chittyentity#306** (parked tracking task) — Fires under §3 recovery
  routine once §4 migration lands on `chittyagent-tasks`. Until then, fires
  via legacy path with a freshly-rotated `CHITTY_AUTH_SERVICE_TOKEN`
  (tracked as a `policy_blocked_channel_access` event).

## 9 · Implementation order

1. Publish `@chittyos/connect-verify` from chittyconnect (one library).
2. Implement `/api/v1/tokens/mint` + `/verify` + `/channels/register` +
   `/channels/{id}/rotate-key` in chittyconnect (chittyconnect#364). Wire
   `chittyops` compliance dimension #8.
3. **Verify live**: `curl -fsS connect.chitty.cc/api/v1/tokens/mint` and
   `/verify` return non-404 with documented shapes; record evidence in PR
   body. This is the gate for §8 issue closure.
4. Migrate chittyagent-tasks (`workers/chittyagent-tasks/src/auth.ts`) to use
   `verifyMintedToken`. Re-deploy.
5. Migrate every other Tier 2+ service. Track in chittyops weekly audit.
6. Add `scripts/operator-visibility-gate.sh` + wire to the operator's Stop hook.
7. Update `chittyagent-tasks/INGESTION.md` to canonical mint flow.
8. **Only now**: close chittyconnect#231 + chittyentity#343 with redirect
   to this spec, citing §9.3 verification evidence.

— filed by ChittyConnect concierge, 2026-06-04
