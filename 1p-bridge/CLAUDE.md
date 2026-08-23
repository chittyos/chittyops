---
uri: chittycanon://docs/ops/procedure/chitty-1p-bridge-claude
namespace: chittycanon://docs/ops
type: procedure
version: 0.1.0
status: RETIRED
registered_with: chittycanon://core/services/canon
title: "chitty-1p-bridge Claude Guidance"
visibility: PUBLIC
---

# CLAUDE.md

**This service is RETIRED (2026-08-21).** 1Password is retired as both a credential lane
and an authority; the cold source of truth is ChittySecrets (`secrets.chitty.cc`,
fronting Cloudflare Secrets Store). `op` has zero accounts on this host, so nothing here
runs. Read the retirement section at the top of AGENTS.md before doing anything in this
directory — it is the canonical source, and this file is only Claude-specific addenda.

## Skills relevant here

| Skill | When |
|---|---|
| `chittyos-compliance` | Before tagging a release or modifying CHARTER/CHITTY/AGENTS/CLAUDE/SECURITY |
| `chitty-registry` | When (re-)registering with ChittyRegistry |
| `chitty-deploy` | NEVER — this service is retired and never deployed to Cloudflare. |
| `evidence-collect` | Not applicable — no case data here |

## Agents relevant here

| Agent | When |
|---|---|
| `chittyconnect-concierge` | The owner of any live credential need. Route credential intent here (`/chico`) instead of anywhere in this directory. |
| `chittycanon-code-cardinal` | Auditing entity-type usage (the bridge process is Person, not Thing) |
| `chittyregister-compliance-sergeant` | Validating CHARTER/CHITTY/CLAUDE/AGENTS/SECURITY before registration |

## ChittyContext binding

This repo is bound to ChittyOS-Core entity scope. Session state for work in this repo lives at:
`~/.claude/chittycontext/entities/{chittyId}/chitty-1p-bridge/current_state.json`

## Commands Claude is expected to run autonomously

None. The service is retired; there is no autonomous work to do here. If you are editing
these docs, `npm run preflight` before a commit is still reasonable — nothing else is.

## Commands Claude must NOT run

- `op` in any form — read, run, item, inject, account. There are zero accounts configured
  on this host; every invocation fails, and any audit built on it emits false findings.
- `chitty-op` in any form, including `sync run --dry-run` — the service is retired.
- Anything that registers or re-registers `chitty-1p-bridge` with ChittyRegistry.
- `npx wrangler` anything in this repo (not a Worker).
- Anything that creates, modifies, or deletes Cloudflare API tokens — that's an operator action, not an agent action.

## Memory cues

When asked about this repo, surface from memory:
- Why VM not Worker (Portal Pattern preservation)
- Smoke test results (+57 KiB gzipped, axios+http.Agent risk)
- Concierge critique of v0.1 spec (blocker on Phase 0 bootstrap, hash-on-value not envelope, etc.)
