# CLAUDE.md

Claude-specific addenda for this repo. For vendor-neutral agent guidance, read AGENTS.md first — that's the canonical source.

## Skills relevant here

| Skill | When |
|---|---|
| `chittyos-compliance` | Before tagging a release or modifying CHARTER/CHITTY/AGENTS/CLAUDE/SECURITY |
| `chitty-registry` | When (re-)registering with ChittyRegistry |
| `chitty-deploy` | NEVER — this service does not deploy to Cloudflare. Use systemd directly. |
| `evidence-collect` | Not applicable — no case data here |

## Agents relevant here

| Agent | When |
|---|---|
| `chittyconnect-concierge` | Reviewing changes that touch the sync watchlist or CF Secrets Store interaction |
| `chittycanon-code-cardinal` | Auditing entity-type usage (the bridge process is Person, not Thing) |
| `chittyregister-compliance-sergeant` | Validating CHARTER/CHITTY/CLAUDE/AGENTS/SECURITY before registration |

## ChittyContext binding

This repo is bound to ChittyOS-Core entity scope. Session state for work in this repo lives at:
`~/.claude/chittycontext/entities/{chittyId}/chitty-1p-bridge/current_state.json`

## Commands Claude is expected to run autonomously

- `ssh chittyserv-dev 'cd ~/projects/github.com/CHITTYOS/chittyops/1p-bridge && <cmd>'` — all dev happens on the VM
- `npm run preflight` before any commit
- `gh pr create` after pushing a feature branch
- `curl -s https://registry.chitty.cc/api/v1/search?q=1p-bridge` to confirm registration

## Commands Claude must NOT run

- `npx wrangler` anything in this repo (not a Worker)
- `op write` or any 1Password write-path operation before Phase 3 ships
- `chitty-op sync run` against production without `--dry-run` first
- Anything that creates, modifies, or deletes Cloudflare API tokens — that's an operator action, not an agent action

## Memory cues

When asked about this repo, surface from memory:
- Why VM not Worker (Portal Pattern preservation)
- Smoke test results (+57 KiB gzipped, axios+http.Agent risk)
- Concierge critique of v0.1 spec (blocker on Phase 0 bootstrap, hash-on-value not envelope, etc.)
