---
uri: chittycanon://docs/ops/spec/canonical-channel-access-v1
namespace: chittycanon://docs/ops
type: spec
version: 1.0.0
status: PENDING
registered_with: chittycanon://core/services/canon
title: "Canonical Channel Access — One System Through ChittyConnect"
owner: chittycanon://core/services/chittyconnect
author: ChittyConnect concierge
contributors:
  - ChittyConnect concierge
  - ChittyCanon Code Cardinal
certifier: chittycanon://core/services/chittycertify
created: 2026-06-04
modified: 2026-06-10
visibility: PUBLIC
category: access-architecture
tags:
  - access
  - credentials
  - channels
  - ephemeral-tokens
  - chittyconnect
  - compliance
references:
  - https://github.com/CHITTYOS/chittyconnect/issues/231
  - https://github.com/CHITTYOS/chittyentity/issues/343
  - https://github.com/CHITTYOS/chittyentity/issues/306
  - https://github.com/CHITTYOS/chittyconnect/pull/364
related:
  - chittycanon://docs/ops/policy/chittyconnect-charter
  - chittycanon://docs/ops/architecture/chittyconnect
decisions:
  - id: panel-2026-06-10-q1
    forum: three-wise-men dynamic panel (chittyclaw via Cloudflare AI Gateway)
    date: 2026-06-10
    subject: "§10.1 DID-vs-ChittyID reconciliation"
    verdict: "Option A — DID-as-display-label; ChittyID is canonical/authoritative"
    dissent: none
  - id: panel-2026-06-10-q2
    forum: three-wise-men dynamic panel (chittyclaw via Cloudflare AI Gateway)
    date: 2026-06-10
    subject: "§10.2 P/L/T/E/A classification of channel surfaces"
    verdict: "Option B — heterogeneous per-surface typing (P for agentic surfaces, L for venues)"
    dissent: none
  - id: lifecycle-2026-06-10-promotion
    forum: operator sign-off
    date: 2026-06-10
    subject: "Canonical lifecycle promotion"
    verdict: "DRAFT → PENDING (all 5 blockers + 5 nits + 2 architectural questions resolved; open for certifier review)"
    authorizer: operator
    dissent: none
  - id: certifier-assignment-2026-06-10
    forum: ecosystem discovery
    date: 2026-06-10
    subject: "Certifier assignment"
    verdict: "certifier := chittycanon://core/services/chittycertify"
    rationale: "ChittyCertify is the canonical owner of the certification lifecycle per CHITTYFOUNDATION/chittycertify/CHARTER.md (uri: chittycanon://docs/ops/policy/chitty-certify-charter). Distinct from ChittyCert."
    authorizer: chittycanon://core/services/chittycertify
    dissent: none
---

<!-- @canon: chittycanon://gov/governance#core-types -->
<!-- @canon: chittycanon://docs/ops/policy/chittyconnect-charter -->
<!-- @canon: chittycanon://docs/ops/architecture/chittyconnect -->

> **Architectural rulings applied (2026-06-10, three-wise-men panel via chittyclaw):**
> 1. **§10.1 — Option A**: `did:chitty:channel:*` is a derived display-label only;
>    the canonical ChittyID (`VV-G-LLL-SSSS-T-YM-C-X`) is authoritative in storage,
>    lookup, audit, and ledger. Unanimous.
> 2. **§10.2 — Option B**: heterogeneous per-surface typing. Agentic surfaces
>    (VM Claude Code, ChatGPT MCP) are **P (Synthetic)**; venues (Workers, GitHub
>    Actions runners, homelab nodes) are **L** (virtual or physical). Unanimous.
>
> Both blockers resolved. See §10 for the closed rulings.

# Canonical Channel Access — One System Through ChittyConnect

> **Goal:** Every channel (VM-resident Claude Code, deployed Workers, mobile, ChatGPT,
> homelab nodes, future models) gets credentials by the **same** mechanism. No channel
> ever needs an operator to paste a credential in the normal flow. Long-lived service
> tokens are not handed to channels — ephemeral, audience-scoped tokens are the default.

## 0 · Charter

This is the canonical contract for **how a channel acquires the credentials it needs
to call a ChittyOS service**. It supersedes ad-hoc per-channel onboarding docs. Owner
is `chittycanon://core/services/chittyconnect` (ChittyConnect; see
[`chittycanon://docs/ops/policy/chittyconnect-charter`](../../chittyconnect/CHARTER.md)
and [`chittycanon://docs/ops/architecture/chittyconnect`](../../chittyconnect/CHITTY.md)).
Compliance is enforced by the `chittyops` audit engine (new dimension:
`channel-access-pattern`).

**Terminology.** This spec uses two distinct terms (per
`chittycanon://gov/governance` and the ChittyEntity canon):

- **ChittyEntity** — an actor with agency that holds credentials and acts (e.g.
  a Claude Code session, a deployed agent, a homelab daemon). Classified as
  Person (P, Synthetic) per `chittycanon://gov/governance#core-types`.
- **Channel** — the access surface through which a ChittyEntity (or a service)
  reaches a target. Per the §10.2 ruling (Option B, 2026-06-10), channel
  surfaces are typed heterogeneously: agentic surfaces are **P (Synthetic)**;
  venue surfaces (workers, runners, nodes) are **L** (virtual or physical).
  See §6 for the per-surface map.

Where prior drafts wrote "channel/agent" interchangeably, this revision uses
**ChittyEntity** when an actor with agency is meant and **channel** when the
access surface is meant.

## 0.1 · Implementation status (READ FIRST)

This spec is **PENDING** (promoted from DRAFT 2026-06-10 by operator sign-off; open
for certifier review). The endpoint surface in §2 is a mix of **live** and
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
   alias 404s today). The registration response returns the canonical
   `chitty_id` (`VV-G-LLL-SSSS-T-YM-C-X`, authoritative — per §10.1 ruling) and a
   derived display-label `did:chitty:channel:<host>-<surface>-<n>` (alias only,
   never the storage/lookup key). It also returns an `X-ChittyOS-API-Key` that
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

Valid once §0.1 proposed routes ship (chittyconnect#364); until then the legacy
shared-token recovery path applies — see §4. When a channel hits 401/403 on a
target, it MUST execute, in order:

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

A ChittyEntity (via its channel) may surface a credential/access blocker to the operator
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

<!-- @canon: chittycanon://gov/governance#core-types -->
Entity type per §10.2 ruling (Option B, 2026-06-10): agentic surfaces are
**P (Synthetic)**; venue surfaces are **L** (virtual or physical). Per §10.1
ruling, every row is identified by canonical ChittyID
(`VV-G-LLL-SSSS-T-YM-C-X`) at the wire; the `did:chitty:channel:*` form is a
display label only.

| Surface | Entity type | Registration trigger | Where broker key lives |
|---------|-------------|----------------------|------------------------|
| **VM-resident Claude Code** | **P (Synthetic)** | `SessionStart` hook on first run, idempotent | `op://ChittyOS-Core/<host>-channel-broker/credential` (per-host item, auto-created on registration) |
| **Cloudflare Worker** | **L (Virtual)** | `wrangler deploy` post-hook | Worker secret `CHITTYCONNECT_BROKER_KEY` (set by chittyops reusable deploy workflow) |
| **GitHub Actions runner** | **L (Virtual)** | Workflow `getchitty-creds` action runs registration if no cached chitty_id | Repo secret `CHITTYCONNECT_API_KEY` |
| **Homelab node** | **L (Physical)** | `chittymarket-sync-daemon.sh` on first boot | `~/.ops/channel-broker-key` (mode 600, written by registration response) |
| **ChatGPT cloud MCP** | **P (Synthetic)** | Gateway-mediated registration via `ch1tty.com/mcp` (server-side policy + sync, per global CLAUDE.md Capability Registration §) | ChittyConnect-held; never exposed to the client |
| **Mobile** | **L (Virtual)** acting on behalf of a **P** | OAuth flow returns chitty_id + broker key (slim-MCP `search` + `execute`) | Provider's secure keystore |
| **Future channels** | classified at registration | Register → Receive → Sync → Report → Enforce (per Channel Registration Protocol) | Channel-specific; broker-only key |

## 7 · Compliance dimension (new)

Add to `chittyops/compliance/checks.yml` (canonical compliance dimension
source: `chittycanon://chittyos/registry/services` — see
`compliance/service-registry.yml` and the existing dimension definitions in
`compliance/checks.yml`):

```yaml
# @canon: chittycanon://chittyos/registry/services
# @canon: chittycanon://docs/ops/architecture/chittyconnect
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

Closure of the issues below is **gated** on §9.2 — the mint/verify routes must
be live and verified in production before the originating issues are closed,
because both issues are about credential paths that depend on those routes.

- **chittyconnect#231** — Filed in error. The VM Connect token already has
  `ChittyOS` and `ChittyOS-Core` vault scope; the canonical credentials are
  readable. Redirect: the real gap is the broker-token-drift between
  1Password and the deployed worker's `env.CHITTY_AUTH_SERVICE_TOKEN`,
  closed by §4 migration. **Close only after §9.2 verification.**
- **chittyentity#343** — Filed in error. No `Chitty-Services` vault exists;
  the documentation in `chittyagent-tasks/INGESTION.md` referenced the
  wrong path. Redirect: update INGESTION.md to use
  `/api/v1/tokens/mint` (per §2) and stop referencing
  `op://Chitty-Services/...`. **Close only after §9.2 verification.**
- **chittyentity#306** — emit landed via legacy shared-token path:
  `task_id dadb508b-0420-4d36-aa71-a09f5b3f1439` (classifier tagged
  `sensitivity: privileged, routing: legalink`). #306 remains the open
  anchor for the §4 migration that retires the shared-token path; closure
  ties to §9.2 verification, not to this emit.

## 9 · Implementation order

### 9.1 · Library + endpoints

1. Publish `@chittyos/connect-verify` from chittyconnect (one library).
2. Implement `/api/v1/tokens/mint` + `/verify` + `/channels/register` +
   `/channels/{id}/rotate-key` in chittyconnect (chittyconnect#364). Wire
   `chittyops` compliance dimension #8.

### 9.2 · Live verification gate

3. **Verify live**: `curl -fsS connect.chitty.cc/api/v1/tokens/mint` and
   `/verify` return non-404 with documented shapes; record evidence in PR
   body. This is the gate for §8 issue closure.

### 9.3 · Migration + closure

4. Migrate chittyagent-tasks (`workers/chittyagent-tasks/src/auth.ts`) to use
   `verifyMintedToken`. Re-deploy.
5. Migrate every other Tier 2+ service. Track in chittyops weekly audit.
6. Add `scripts/operator-visibility-gate.sh` + wire to the operator's Stop hook.
7. Update `chittyagent-tasks/INGESTION.md` to canonical mint flow.
8. **Only now**: close chittyconnect#231 + chittyentity#343 with redirect
   to this spec, citing §9.2 verification evidence.

## 10 · Architectural rulings (closed)

Both architectural questions previously open in this section were adjudicated
on **2026-06-10** by the three-wise-men dynamic panel (chittyclaw via
Cloudflare AI Gateway). Both verdicts were **unanimous (no dissent)**. The
rulings below are binding for this spec and downstream implementations.

### 10.1 · Q1 — DID-vs-ChittyID reconciliation → **RULING: Option A**

<!-- @canon: chittycanon://gov/governance#identityRules -->

**Verdict.** DID syntax (`did:chitty:channel:<host>-<surface>-<n>`) is retained
as a **human-readable alias only**. The canonical ChittyID
(`VV-G-LLL-SSSS-T-YM-C-X`) is minted alongside at registration and is the
**authoritative identifier** in storage, lookup, audit, and ledger.

**Reasoning.** Respects `chittycanon://gov/governance#identityRules.prohibition`
("secondary internal numbering schemes that duplicate ChittyID semantics are
prohibited") while preserving the human-grep affordance of readable channel
naming. No new canonical identifier class is created.

**Wire effect.**

- `POST /api/v1/channels/register` returns `chitty_id` as the canonical key;
  `did` is returned as a derived display label.
- All API payloads, audit log records, ledger entries, and KV/D1 storage
  use `chitty_id` as the primary key.
- The `did:chitty:channel:*` string appears only in human-rendering surfaces
  (status lines, dashboards, log prefixes) and is reconstructable from
  `chitty_id` + host/surface metadata.

**Dissent:** none.

### 10.2 · Q2 — P/L/T/E/A classification of channel surfaces → **RULING: Option B (heterogeneous)**

<!-- @canon: chittycanon://gov/governance#core-types -->

**Verdict.** Channel surfaces are classified **heterogeneously**, per surface,
by their actual semantics. The earlier "channels are uniformly L" framing is
**overridden**.

| Surface class | Canonical type |
|---------------|----------------|
| Cloudflare Workers, GitHub Actions runners | **L (Location, virtual)** |
| VM Claude Code, ChatGPT MCP, agent surfaces | **P (Person, Synthetic)** |
| Homelab nodes | **L (Location, physical)** |
| Mobile client (handset) | **L (Virtual)** acting on behalf of a **P** |

**Reasoning.** Uniform L flattens distinct semantics. Per global CLAUDE.md
("Claude contexts are Person (P), Synthetic characterization — NEVER Thing")
and `chittycanon://gov/governance#core-types`, surfaces with agency are P;
surfaces that are venues without agency are L. Per-surface typing aligns
classification with actual agency vs. venue and prevents the canonical
"Claude-as-Thing" / "agent-as-L" heresies.

**Wire effect.**

- `POST /api/v1/channels/register` requires `entity_type ∈ {P, L}` at
  registration (per §6 map).
- Policy bundle, broker key semantics, and recovery routine may differ by
  type (e.g. P surfaces may carry session-scoped capabilities that L
  surfaces cannot).
- §6 wiring table reflects the per-surface typing canonically.

**Dissent:** none.

### 10.3 · Other open items

- `agent.chitty.cc/api/v1/channels/register` — registry status: **not yet
  registered** in `chittycanon://chittyos/registry/services`. Will be
  registered once chittyconnect#364 lands and the alias is live; until then
  it is a target name, not a discoverable endpoint. (Tracked under §0.1.)

---

**Provenance**

- Filed by: ChittyConnect concierge (see frontmatter `author`)
- Originated: 2026-06-04
- Last revision: 2026-06-10 (lifecycle promotion DRAFT → PENDING, operator sign-off)
- Prior revision: 2026-06-10 (three-wise-men panel rulings applied: §10.1 Option A, §10.2 Option B; both unanimous, commit 67a63f9)
- Prior revision: 2026-06-10 (canonical remediation per Code Cardinal audit, commit 743fcf9)
- Lifecycle: DRAFT (2026-06-04) → PENDING (2026-06-10, operator sign-off)
