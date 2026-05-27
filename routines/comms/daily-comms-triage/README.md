# daily-comms-triage

**Routine ID:** `did:chitty:routine:daily-comms-triage`
**Version:** 1.0.0
**Trigger:** Daily 07:00 America/Chicago + webhook variant for priority ≥ 8
**Owner:** Nick Bianchi

## Purpose

Ingest from 12+ comms/event sources daily, categorize & triage with tiered AI routing (T0 free → T1 free → T2 Haiku → T3 Sonnet), auto-archive high-confidence noise, and surface a unified review queue across 4 user surfaces.

## Architecture

```
sources → dispatch (P+ E N) → tiered classifier → orchestrator → Neon actions_v1 → 4 surfaces
```

See [v0.5 SoT](../../../../docs/v0.5-source-of-truth.md) for full architecture, data model, and policy registry.

## Source connectors (12+)

| Source | Connector | Account(s) |
|--------|-----------|------------|
| Workspace email | `chittyagent-gam` tunnel | ws_nevershitty, ws_jeanarlene |
| Personal email | Gmail MCP | personal_gmail |
| SMS / calls | Quo MCP | default inbox |
| iMessage | ChittyMsg | local imsg |
| Apple Notes | ChittyMsg | local |
| Calendar | chittymac / Google Calendar MCP | all |
| Notion mentions/comments | Notion MCP | workspace |
| Microsoft 365 | M365 MCP | corp |
| Mercury | Mercury MCP | all entities |
| Cloudflare alerts | Cloudflare MCP | account |
| Linear issues | Linear MCP | assigned |
| Cash App | Cash App MCP | transactions |
| Docusign | Docusign MCP | envelope status |
| RMail | Zapier RMail | events |

## Execution sequence (Pentad: P+ · E · N · T · A)

1. **P+ (Pre-evaluate)** — `dispatch.chitty.cc`: metadata-only sensitivity classification BEFORE LLM body access. Privileged-domain senders → fork to Legalink-Neon path.
2. **E (Evaluate)** — policy resolution: `TRO_REVIEW_PENDING`, `JAVL_PAYROLL_PRECEDES_DISTRIBUTION`, sensitivity rules.
3. **N (Navigate)** — binding path selection: entity prior from inbox + content.
4. **Dedupe** — Message-ID primary + composite hash (`sender, normalized_subject, ±5min`); cross-agent classification cache lookup (24h TTL).
5. **T (Transact)** — tiered classifier:
   - T0 CF Workers AI: sensitivity + injection + newsletter pre-filter
   - T1 Workspace Studio (Gemini 3) for ws accounts; Gemini Flash API for personal
   - **T2/T3 disabled in PILOT_MODE** — flag as `pilot_unresolved`
6. **Auto-archive gate** — conf ≥ 0.95 AND priority ≤ 3 AND public AND no policy flag AND not privileged-domain
7. **Orchestrator routing** — Legal → ChittyCounsel, Financial → ChittyBiz, etc.
8. **A (Attest)** — Neon `actions_v1` + ChittyDNA receipt + `cost_ledger` write (batched, hashed item_id)

## Surfaces

| Surface | URL/command |
|---------|-------------|
| MCP gateway tools | `mcp.chitty.cc/daily_updates.*` |
| Notion view | "Daily Triage" filtered view on Business Task Tracker `f33d20b8…` |
| CLI | `chit triage list / accept / reject / bulk-accept / snooze / diff` |
| Chat UI | `agent.chitty.cc/triage` |
| Mobile | iOS shortcut → deep-link to filtered Notion view |

## Operational flags

| Flag | Default | Purpose |
|------|---------|---------|
| `PILOT_MODE` | true | Disables T2/T3 paid tiers; escalations queue as `pilot_unresolved` |
| `BASELINE_LEARNING` | true (first 14 days) | Comptroller L2/L3 disabled; alerts only on hard limit |
| `LITIGATION_HOLD:<case>` | per-case | Blocks 90-day hard-delete |

## Cost envelope

- Steady state: ~$0.04/day (~$1.20/mo) within free tiers
- Hard cap: $2/day, $15/mo (ChittyComptroller enforces tier-degrade)

## Deploy

```bash
wrangler deploy --config wrangler.toml
```

Pre-deploy checks: see [RUNBOOK-deploy.md](../../../../docs/RUNBOOK-deploy.md).

## Pilot

See [PILOT.md](../../../../docs/PILOT.md) for exit criteria and paid-tier activation sequence.

## Related

- Real-time variant: `daily-comms-triage-realtime` (webhook, priority ≥ 8)
- Studio flow: `chittyops/studio-flows/aribia-daily-inbox-triage.json`
- Sibling: `chittyops/services/comptroller`
- Drift detection: `chittyops/routines/ops/flow-hash-check`
