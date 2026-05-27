# Daily Updates Orchestration — v0.5 (Source of Truth)

**Date:** May 26, 2026 · **Phase:** 3 complete · **Status:** Design locked · Converged Pass 3 · Build-spec ready · **Owner:** Nick Bianchi

> **This document supersedes** v0.1, v0.2, v0.3, v0.4, and addendums A, B, C, D. Treat earlier versions as historical record only.

---

## Table of Contents

1. [Goal](#1-goal)
2. [Locked Decisions Registry](#2-locked-decisions-registry)
3. [Architecture](#3-architecture)
4. [Component Catalog](#4-component-catalog)
5. [Data Model](#5-data-model)
6. [Policy Registry](#6-policy-registry)
7. [Cost & Tier Model](#7-cost--tier-model)
8. [ChittyComptroller (Sibling Service)](#8-chittycomptroller-sibling-service)
9. [Surface Specifications](#9-surface-specifications)
10. [Pilot Plan & Exit Criteria](#10-pilot-plan--exit-criteria)
11. [Build Plan & Sequencing](#11-build-plan--sequencing)
12. [Operations & Evolution](#12-operations--evolution)
13. [Convergence Record](#13-convergence-record)
14. [Open Items](#14-open-items)
15. [Phase 4 Readiness](#15-phase-4-readiness)

---

## 1. Goal

Establish a scheduled, orchestrated daily-updates routine that ingests from all comms/event sources, categorizes & triages, prioritizes, pre-analyzes with recommendations, and surfaces a unified review queue accessible from any model / machine / surface.

**Mental model:** morning newsroom — wire ingest → assignments desk (categorize) → city editors (triage) → reporter brief (pre-analysis) → editor-in-chief (you) signs the page. Comptroller sits in the publisher's office watching costs across all desks.

**Key finding driving design:** ChittyOS substrate is ~85% built — Pentad model (P+ · E · N · T · A) is canonical in dispatch + autoassist; `triage_followup_v1` template ships in autoassist; agent.chitty.cc is a multi-model chat UI; mcp.chitty.cc exposes 23 services. This initiative is composition + 1 sibling service, not greenfield construction.

---

## 2. Locked Decisions Registry

| # | Decision | Value |
|---|----------|-------|
| Q1 | Adversarial review depth | 3-persona panel (Privacy/Legal · Ops/UX · Reliability+Security) |
| Q2 | Surfaces | All 4 — MCP tool · Notion view · CLI · iOS/web dashboard |
| Q3 | v1 source scope | Maximum — all available sources |
| Q4 | Multi-account email connection | Hybrid — chittyagent-gam for Workspace, Gmail MCP for personal |
| Q5 | Cross-inbox dedupe | Message-ID primary + composite hash fallback |
| Q6 | Account types | 2 Workspace + 1 personal |
| Q7 | Inboxes | nick@nevershitty.com (ws1) · nick@jeanarlene.com (ws2) · nichobianchi@gmail.com (personal) |
| Q9 | Pilot source | Gmail (Day-1 stress test) |
| Q11 | Workspace Studio | Yes + F-L10 privileged-domain metadata-only |
| Q12 | Batch routing | Deferred — pilot is free-tier-only; revisit if paid tier activated post-pilot |
| Q13 | Pilot sequencing | Studio + pipeline simultaneously |
| Q14 | Cash cap | $15/mo · $7.50/mo alert · $2/day hard halt |
| Q15 | Time budget | 124 hr build · 10 hr/mo ongoing · 8 hr/qtr evolution |
| Q16 | v1 scope additions | Multi-provider redundancy · Auto-archive @ conf > 0.95 · Cost-anomaly alerting · Sibling Comptroller |
| Q17 | Comptroller authority | L1 + L2 + L3 (observer · throttle · pause) |
| Q18 | Comptroller scope | All ChittyOS services |
| Q19 | Comptroller sequencing | Parallel-build with v1 core, ship together at week 5–6 |

---

## 3. Architecture

```
            ┌───────────────────────────────────────────────────┐
            │  routine  `daily-comms-triage`                    │
            │  trigger: cron 0 07:00 * * * America/Chicago      │
            │  realtime variant: webhook for priority ≥ 8       │
            └───────────────────────────────────────────────────┘
                                  │
                ┌─────────────────┼────────────────────┐
                │                 │                    │
   ┌────────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ chittyagent-gam    │  │ Gmail MCP (pers) │  │ all other MCPs   │
   │ tunnel ws1, ws2    │  │ readonly only    │  │ Quo·iMsg·Mercury │
   │                    │  │                  │  │ M365·Cal·Notion  │
   │ ───────────────    │  │                  │  │ Cloudflare·etc.  │
   │ Workspace Studio   │  │                  │  │                  │
   │ flow → Sheet       │  │                  │  │                  │
   │ handoff (F-L10)    │  │                  │  │                  │
   └────────────────────┘  └──────────────────┘  └──────────────────┘
                                  ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  dispatch.chitty.cc  ·  P+ → E → N                              │
   │  P+ (F-L1, F-L3): metadata-only sensitivity classification      │
   │      privileged → forks to Legalink-Neon path                   │
   │  E:  policy resolution  (F-L4 TRO · F-L8 JAVL · F-L7 domains)   │
   │  N:  binding path; entity prior from inbox + content            │
   └─────────────────────────────────────────────────────────────────┘
                                  │ IngestItem[]
                                  ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  DEDUPE (F-O7)  ·  Message-ID + composite hash fallback         │
   │  CROSS-AGENT CACHE  ·  hash(content) → classification (24h TTL) │
   └─────────────────────────────────────────────────────────────────┘
                                  │ deduped IngestItem[]
                                  ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  TIERED CLASSIFIER                                              │
   │  T0  CF Workers AI (Llama 3.x)  — sensitivity·injection·noise   │
   │  T1  Workspace Studio (Gemini 3) OR Gemini Flash API (pers)     │
   │  T2  Haiku via CF AI Gateway     [PILOT-DISABLED]               │
   │  T3  Sonnet via CF AI Gateway    [PILOT-DISABLED]               │
   │  Fallback chain: Anthropic ↔ Gemini ↔ Opus (F-R13 30s total)    │
   │  Pilot mode: T2/T3 trigger → flag `pilot_unresolved`            │
   └─────────────────────────────────────────────────────────────────┘
                                  │ ScoredAction[]
                                  ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  AUTO-ARCHIVE GATE  (F-L12)                                     │
   │  conf ≥ 0.95 AND priority ≤ 3 AND public AND no policy flag     │
   │  AND sender_domain ∉ privileged_domains                         │
   │       → `actions_auto_archived` (30-day reversible)             │
   └─────────────────────────────────────────────────────────────────┘
                                  │ EnrichedAction[]
                                  ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  orchestrator.chitty.cc — agent routing                         │
   │  Legal     → ChittyCounsel (Legalink-Neon only · F-L5 RLS)      │
   │  Financial → ChittyBiz · Mercury context                        │
   │  Property  → ChittyBiz · property registry                      │
   │  Infra     → chittydiscovery · worker-health-sweep              │
   │  Disputes  → chittydispute                                      │
   └─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  A: Attest  ·  Neon `actions_v1` + ChittyDNA receipt            │
   │  Transactional outbox commit (F-R6)                             │
   │  Business mirror → Task Tracker f33d20b8…                       │
   │  Legalink mirror → ChittyPro Legalink (privileged only)         │
   │  cost_ledger write (batched, hashed item_id — F-L11, F-R16)     │
   └─────────────────────────────────────────────────────────────────┘
                                  │
       ┌──────────────────┬───────┴────────────┬─────────────────────┐
       ▼                  ▼                    ▼                     ▼
  mcp.chitty.cc      Nick's Dashboard      CLI: `chit triage`   agent.chitty.cc
  daily_updates.*    Notion filtered view  Terminal w/ diff-view  /triage view
  (any MCP-LLM)      (mobile single-col)   for Reply drafts       (multi-model UI)
                                  ┃
                                  ┃ reads cost_ledger
                                  ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  comptroller.chitty.cc  (sibling — see §8)                      │
   │  L1: alerts + reports (Business + Legalink dual-report)         │
   │  L2: tier-degrade signals to consuming services                 │
   │  L3: pause services (respecting pause_exemption flags)          │
   └─────────────────────────────────────────────────────────────────┘
```

**Pentad mapping:** P+ (pre-evaluate metadata) → E (evaluate policy) → N (navigate binding) → T (transact: classify+score+recommend) → A (attest: canonical write + receipts).

---

## 4. Component Catalog

### 4.1 Substrate (existing, live — no new build)

| Component | URL | Role |
|-----------|-----|------|
| chittyregistry | registry.chitty.cc v2.0.0 | Directory of services/agents/tools |
| chittydiscovery | discovery.chitty.cc | Runtime mesh + heartbeat receiver |
| chittyregister | register.chitty.cc v2.0.0 | Compliance gateway for new services |
| chittymcp gateway | mcp.chitty.cc v2.0.0 | Exposes 23 services to any MCP-speaking model |
| chittyagent-orchestrator | orchestrator.chitty.cc v2.2.0 | Agent routing · skill-orchestration · focal-trust-gating |
| chittyagent-dispatch | dispatch.chitty.cc v1.0.0 | Pentad routing layer |
| chittyagent-autoassist | autoassist.chitty.cc v1.0.0 | Hosts `triage_followup_v1` loop template |
| chittyagent-ui | agent.chitty.cc | Multi-model · multi-provider · websocket · context-sync |
| chittyagent-gam | gam tunnel | Multi-account Google Workspace admin proxy |
| chittyevidence-db | evidence.chitty.cc | Evidence store |
| chittyid-mothership | id.chitty.cc v2.0.0 | Identity |
| chittydispute | dispute.chitty.cc v1.2.0 | Dispute lifecycle (referenced by orchestrator) |
| Neon instance | `restless-grass-40598426` | Canonical TODO aggregator + new tables |

### 4.2 New components (this initiative)

| Component | Type | Hours est. |
|-----------|------|-----------|
| `daily-comms-triage` routine | Cloudflare Worker + manifest | 8–16 |
| `daily-comms-triage-realtime` variant | CF Worker (webhook) | 4–6 |
| Workspace Studio flow ×2 (ws1, ws2) | Studio agent | 4–8 |
| Neon schema (`actions_*`, `cost_ledger`, `sensitivity_rules`, `policy_flags`, `classification_cache`) | DDL + RLS | 6–10 |
| Notion view ("Daily Triage" on f33d20b8…) | Configuration | 1–2 |
| CLI `chit triage` subcommand | Extension of existing CLI | 4–6 |
| MCP gateway tools (`daily_updates.*`) | mcp.chitty.cc additions | 3–5 |
| agent.chitty.cc `/triage` route | UI integration | 4–8 |
| **ChittyComptroller** | New sibling service | 30–35 |
| `cost_ledger` retrofits across services | Sprinkle writes into ChittyCounsel, ChittyBiz, autoassist, orchestrator | 6 |
| Sensitivity rules + policy flags seeds | Data | 2–4 |
| flow-hash-check cron | CF Worker | 2 |
| Pilot test + adversarial re-review | — | 8–14 |
| RUNBOOK + PILOT.md + README | Docs | 4–6 |
| **Total** | | **~124 hr / 5–6 weeks** |

---

## 5. Data Model

### 5.1 `IngestItem`

```json
{
  "source": "gmail|quo|imessage|mercury|notion|m365|chittymac|cloudflare|linear|cashapp|docusign|rmail",
  "account": "ws_nevershitty|ws_jeanarlene|personal_gmail|n/a",
  "source_id": "RFC822 Message-ID or service-specific stable FK",
  "received_at": "ISO 8601",
  "subject": "string",
  "preview": "first 500 chars or transcript head",
  "raw_ref": "r2://bucket/key OR mcp://service/id",
  "sensitivity_hint": "unknown|privileged|pii|public",
  "pre_evaluated_sensitivity": "privileged|pii|hoa_evidentiary|public",
  "entity_prior": "ChittyCorp|JAVL|Personal|null",
  "hints": { "from": "string", "subject": "string", "thread_id": "string", "message_id": "string" }
}
```

### 5.2 `ScoredAction`

```json
{
  "id": "did:chitty:action:YYMM-XXXX",
  "ingest_item_ref": "actions_raw row id",
  "accounts": ["ws_nevershitty", "ws_jeanarlene"],
  "cross_inbox_count": 2,
  "category": "Legal|Financial|Property|Vendor|Infra|Personal-Admin|Personal-Social|Regulatory|Other",
  "priority": 1-10,
  "priority_modifier": "+1 cross-inbox",
  "entity": "ARIBIA|JAVL|IT_CAN_BE|ChittyCorp|Personal|null",
  "property": "city_studio|cozy_castle|lakeside_loft|villa_vista|null",
  "case": "2024D007847|villa_vista_hoa|city_studio_hoa|cozy_castle_hoa|colombia|null",
  "sensitivity": "privileged|pii|hoa_evidentiary|public",
  "confidence": 0.0-1.0,
  "tier_used": "T0|T1_studio|T1_flash|T2_haiku|T3_sonnet|manual",
  "injection_suspected": false,
  "recommended_action": "Reply|Decide|Pay|File|Schedule|FYI|Archive",
  "recommended_text": "draft text (rendered as diff in UI for Reply)",
  "due": "ISO 8601 | null",
  "rationale": "1-2 sentences",
  "routing": "business|legalink",
  "policy_flags_triggered": ["TRO_REVIEW_PENDING", "JAVL_PAYROLL_PRECEDES_DISTRIBUTION"],
  "cost_constrained": false,
  "auto_archived": false
}
```

### 5.3 Neon tables

| Table | Purpose | Retention |
|-------|---------|-----------|
| `actions_raw` | Raw IngestItem (UNIQUE on source, account, source_id) | 30d soft / 90d hard unless litigation_hold |
| `actions_evaluated` | Post-dispatch E + N output | tied to actions_raw |
| `actions_v1` | Canonical ScoredAction (post-Attest) | indefinite |
| `actions_receipts` | ChittyDNA attestation receipts | indefinite |
| `actions_auto_archived` | conf > 0.95 archive items (reversible) | 30 days |
| `actions_failed` | Quarantined items (retry 3× then quarantine) | 90 days |
| `classification_cache` | content-hash → classification (shared across agents) | 24h TTL |
| `sensitivity_rules` | sender-domain + subject-keyword → sensitivity tag | editable |
| `policy_flags` | system policy state (TRO, JAVL payroll, etc.) | indefinite |
| `cost_ledger` | per-call: service · tier · provider · tokens · cost_usd · hashed_item_id · ts | 1 year |
| `pause_exemptions` | service registry pause-exemption flags | indefinite |

### 5.4 RLS / write-allowlist

- `actions_v1` RLS: rows with `routing=legalink` invisible to Business-space queries
- Notion write-allowlist: orchestrator can write Business OR Legalink, never both for same row
- `cost_ledger` writes: append-only · Comptroller has read-only · hashed `item_id` prevents reverse-lookup

---

## 6. Policy Registry

### 6.1 Sensitivity rules (initial seed)

| Trigger | Tag | Routing |
|---------|-----|---------|
| sender_domain ∈ {vanguardadvocates.com, bertonring.com, ksnlaw.com} | privileged | Legalink-Neon only |
| sender_domain ∈ {ksnlaw.com} AND subject contains "settlement" | privileged + hoa_evidentiary | Legalink + evidence pipeline |
| subject contains "attorney-client" OR "privileged" OR "confidential" | privileged | Legalink-Neon only |
| sender_domain ∈ {mercury.com, plaid.com, irs.gov} | pii | Business-Neon, encrypted-at-rest |
| sender_domain matches *.gov | regulatory | priority +2 |
| subject matches /unsubscribe|newsletter|noreply/ | public + noise | auto-archive candidate |

(Initial; editable in Neon.)

### 6.2 Policy gates

| Flag | Effect | Activation source |
|------|--------|------------------|
| `TRO_REVIEW_PENDING` | Block `recommended_action ∈ {Pay, File}` on entity=Sharon Jones note | manual (set per Rob's review) |
| `JAVL_PAYROLL_PRECEDES_DISTRIBUTION` | Block `recommended_action = Pay` on entity=JAVL | manual (cleared after W-2 payroll setup) |
| `LITIGATION_HOLD:<case>` | Block 90-day hard-delete on items tagged with case | per-case |
| `BASELINE_LEARNING` (Comptroller) | L2/L3 disabled · alerts only on hard limit breach | auto-set for 14 days post-deploy |
| `PILOT_MODE` | T2/T3 disabled · T1→T2 escalations flag as `pilot_unresolved` | auto-set during pilot, cleared on exit |

### 6.3 Auto-archive gate

```
auto_archive = (
  confidence >= 0.95
  AND recommended_action IN ('Archive', 'FYI')
  AND priority <= 3
  AND sensitivity = 'public'
  AND sender_domain NOT IN privileged_domains
  AND len(policy_flags_triggered) = 0
)
```

Reversible 30 days via any of the 4 surfaces. Weekly digest: sample-of-20 with category breakdown.

---

## 7. Cost & Tier Model

### 7.1 Tier routing

| Tier | Provider | Primary use | Fallback 1 | Fallback 2 | Cost per item |
|------|----------|------------|-----------|-----------|---------------|
| T0 | CF Workers AI (Llama 3.x) | Sensitivity · injection · newsletter · auto-archive flag | Gemini Flash | Haiku [pilot-disabled] | ~$0 within neuron budget |
| T1-WS | Workspace Studio (Gemini 3) | Workspace inbox triage | Gemini Flash API | Haiku [pilot-disabled] | $0 (paid via WS plan) |
| T1-personal | Gemini Flash via AI Studio API | Personal inbox + non-WS sources | Haiku [pilot-disabled] | Sonnet [pilot-disabled] | $0 within 1500 RPD |
| T2 | Haiku via CF AI Gateway (cached) | Ambiguous · low-conf · cross-entity | Gemini 1.5 Pro | Sonnet | ~$0.0005 cached |
| T3 | Sonnet via CF AI Gateway (cached) | High-stakes legal/financial · draft replies | Gemini 1.5 Pro | Opus (rare) | ~$0.004 cached |

### 7.2 Escalation rules

- T0 → T1: standard path (after T0 pre-filter passes)
- T1 → T2: `confidence < 0.7` OR `sensitivity = privileged` OR `category = Legal AND priority ≥ 7`
- T2 → T3: `confidence < 0.7` OR `category = Legal AND priority ≥ 7`
- **Pilot mode:** T2/T3 escalations instead flag `pilot_unresolved`, queue for manual review in same daily view

### 7.3 Fallback chain

- Trigger: primary returns error, 429, or > 30s latency
- Total end-to-end timeout: **30s** (not per-hop)
- Beyond 30s: item flagged `provider_unavailable`, surfaces in triage; never blocks daily run

### 7.4 Budget caps

| Scope | Soft | Hard |
|-------|------|------|
| Monthly cash | $7.50 alert | $15 hard halt |
| Daily cash | $1 alert | $2 hard halt |
| T2/day (post-pilot) | $0.50 | $0.50 |
| T3/day (post-pilot) | $0.50 | $0.50 |

Enforcement: Comptroller emits tier-degrade signals as soft limits approach; routes to next-cheaper tier with `cost_constrained=true` flag.

### 7.5 Steady-state cost projection

| Path | Volume/day | $/day |
|------|-----------|-------|
| T0 (free) | ~630 items | $0 |
| T1-WS Studio (free) | ~300 emails | $0 |
| T1-personal Gemini Flash (free) | ~150 emails + ~180 other | $0 within 1500 RPD |
| T2 Haiku cached | ~50 ambiguous | ~$0.025 |
| T3 Sonnet cached | ~5 high-stakes | ~$0.02 |
| Cross-agent cache savings | -20% | -$0.009 |
| **Total** | | **~$0.04/day · ~$1.20/mo** |

12× headroom under $15/mo hard cap.

---

## 8. ChittyComptroller (Sibling Service)

### 8.1 Identity

| Attribute | Value |
|-----------|-------|
| Domain | comptroller.chitty.cc |
| Tier | Infrastructure (must always run) |
| Type | CF Worker + own Neon namespace |
| Role | Independent budget observer + delegated enforcer · sibling to all ChittyOS agents |
| Mental model | Comptroller's office — independent, advisory, with delegated authority to act |

### 8.2 Authority levels (L1+L2+L3 all enabled)

| Level | Capability | Constraint |
|-------|-----------|-----------|
| L1 — Observer | Read-only · alerts · reports · forecasts | Always on |
| L2 — Throttle | Issue tier-degrade signals to consuming services | Off during 14-day baseline-learning · respects pause_exemptions |
| L3 — Halt | Pause services that breach hard limits | Off during 14-day baseline-learning · NEVER pauses services with `pause_exemption=true` without SMS-confirm from operator (Quo) · safe-state on cold-start: L1-only for 24h, manual re-enable |

### 8.3 Data sources

- CF AI Gateway analytics (5-min poll)
- Anthropic billing API (hourly)
- Google AI Studio quota (hourly)
- CF Workers AI metrics (5-min poll)
- Neon `cost_ledger` (real-time read)
- Mercury infra invoices (daily, optional)

### 8.4 Outputs

| Output | Surface | Cadence |
|--------|---------|---------|
| Real-time anomaly alert | Notion + Quo SMS (high-severity) | < 5 min from spike |
| Daily cost report | Notion auto-updated page | 7 AM CT |
| Weekly variance + forecast | Notion + email digest | Mon 7 AM CT |
| Monthly closeout + tier-rebalancing recommendation | Notion + Mercury memo | 1st of month |
| Per-service spend dashboard | comptroller.chitty.cc UI | Live |
| API: `GET /budget/:service/status` | MCP tool · CLI · any agent | On-demand |

### 8.5 Dual-report structure (F-L13)

- **Business-space report:** Legal services aggregated as single line "Legal Operations" — no per-case or per-document detail
- **Legalink-only report:** Full breakdown including per-case spend, visible inside Legalink only

### 8.6 Forecasting method

EWMA (exponentially weighted moving average) + simple seasonality detection. **Never** uses LLM calls itself above T0 — avoids the meta-cost trap.

### 8.7 Safe-state behaviors

- Cold-start: L1-only for 24h · L2/L3 require operator SMS confirm
- Partition recovery: L1-only until 100 contiguous successful 5-min polls
- Mid-month deploy: BASELINE_LEARNING flag auto-set for 14 days

### 8.8 Pause-exemption flags

Services register in chittyregistry with optional `pause_exemption` array:
- `active_deadline` — court filing window, regulatory deadline
- `litigation_hold` — case-tagged work product
- `business_critical` — revenue-critical (rent collection, lease signing)

L3 pause on exempt service requires explicit Quo SMS confirm to operator.

---

## 9. Surface Specifications

### 9.1 MCP gateway tools (mcp.chitty.cc)

```
daily_updates.list({ filter?, since?, limit? }) → ScoredAction[]
daily_updates.accept({ id, note? }) → { status: "accepted" }
daily_updates.reject({ id, reason? }) → { status: "rejected" }
daily_updates.bulk_accept({ filter, confirm_sample: ScoredAction[] }) → { count }
daily_updates.snooze({ id, until }) → { status: "snoozed" }
daily_updates.restore({ id }) → { status: "restored" }   # for auto-archived
```

### 9.2 Notion view ("Daily Triage" on Business Task Tracker f33d20b8…)

- Filter: `type=Action AND created_at >= today_minus_1d`
- Sort: priority desc, due asc
- Display: Type · Source · Priority · Property · Case · Entity · Recommended Action · Due
- Mobile: single-column layout
- Pilot items: filter chip `tier=manual` shows `pilot_unresolved`

### 9.3 CLI `chit triage`

```
chit triage list [--filter=...] [--limit=N]
chit triage accept <id> [--note "..."]
chit triage reject <id> [--reason "..."]
chit triage bulk-accept --category=legal --confirm
chit triage snooze <id> --until "tomorrow 9am"
chit triage restore <id>
chit triage diff <id>          # show recommended_text diff vs thread context
chit triage budget             # quick comptroller status
```

### 9.4 agent.chitty.cc /triage

- Multi-model chat UI's existing scaffold
- New route renders ScoredAction list with accept/reject/snooze buttons
- Diff-view rendering for Reply drafts
- Privileged items show metadata only + "Open in Legalink" link (F-L6)

### 9.5 iOS shortcut

Deep-link to Notion filtered view; no native iOS app.

---

## 10. Pilot Plan & Exit Criteria

### 10.1 Pilot configuration

- **Day 1:** Studio flows on ws1, ws2 + pipeline pickup + all other sources active simultaneously
- **Mode:** PILOT_MODE flag set → T2/T3 disabled · BASELINE_LEARNING flag set (14d)
- **Paid tier auth:** provisioned but DISABLED · emergency activation requires human consent + $0.50 burn-in test
- **Duration:** minimum 14 days; reassess weekly

### 10.2 Exit criteria (all must be met)

| Criterion | Target |
|-----------|--------|
| Heartbeat success rate | > 95% |
| Daily user-visible queue size | ≤ 30 items |
| Auto-archive false-positive rate | < 1% (weekly spot-check sample-20) |
| `pilot_unresolved` items / total | < 10% |
| Security incidents | 0 (no privileged leakage, no successful injection) |
| Comptroller anomaly false-positive rate | trending down post-baseline-learning |
| Studio flow drift incidents | 0 (or resolved within 24h) |
| Operator (you) confirms readiness for paid-tier activation | manual |

### 10.3 Pilot exit actions

- Clear PILOT_MODE flag
- Enable T2 (Haiku) first, monitor 1 week
- Enable T3 (Sonnet) after T2 stable
- Activate batch routing decision (Q12) based on actual cost data

---

## 11. Build Plan & Sequencing

### 11.1 Weeks 1–2 (~50 hr): Foundation

- Workspace Studio flows ×2 (with F-L10 privileged metadata-only)
- `cost_ledger` Neon schema + retrofit writes into existing services
- `daily-comms-triage` routine manifest + worker
- Sensitivity_rules + policy_flags seeds
- Auto-archive policy logic
- Dedupe layer (Message-ID + composite hash)
- Initial smoke test on Quo first (lowest risk), then add Gmail

### 11.2 Weeks 3–4 (~40 hr): Surfaces + Comptroller foundation

- 4 surfaces: MCP tools · Notion view · `chit triage` CLI · agent.chitty.cc /triage route
- ChittyComptroller L1 (observer + reports)
- Dual-report structure (Business + Legalink)
- flow-hash-check cron
- End-to-end smoke test

### 11.3 Weeks 5–6 (~34 hr): Comptroller L2/L3 + Pilot

- L2 throttle signals + service degrade hooks
- L3 pause + pause_exemption + Quo SMS confirm path
- Safe-state behaviors (cold-start, partition recovery)
- Adversarial re-review (3 personas, applied to deployed system)
- BASELINE_LEARNING + PILOT_MODE flags set
- Documentation: RUNBOOK · PILOT.md · per-component READMEs
- Pilot launch

### 11.4 Post-pilot (weeks 7–8)

- Pilot exit review
- T2 enablement (week 7)
- T3 enablement (week 8 if stable)
- Batch-routing decision (Q12) based on real cost data
- Comptroller exits baseline-learning, L2/L3 active

---

## 12. Operations & Evolution

### 12.1 Daily

- 7:00 AM CT: routine fires
- 7:05 AM CT: digest available
- 7–9 AM: user triage session (5–15 min)

### 12.2 Weekly

- Skim accuracy metrics (30–60 min)
- Auto-archive digest review (sample-of-20)

### 12.3 Monthly

- Tier rebalancing review (1–2 hr)
- Sensitivity rules / policy flags update (1 hr)

### 12.4 Quarterly

- Adversarial re-review (3-persona panel, 3–4 hr)
- Add new specialist agents or source connectors (4–8 hr)
- 6-month fitness check: full re-discovery + re-cost (at the 6-mo mark)

### 12.5 Ad hoc

- New TRO situation · new entity · litigation phase change · OAuth re-issuance
- Studio flow updates (manual in Google UI, then export to chittyops/studio-flows/)

---

## 13. Convergence Record

| Pass | Pre-fix critical | Pre-fix high | Pre-fix medium | Pre-fix low | Post-fix status |
|------|------------------|--------------|----------------|-------------|----------------|
| Pass 1 (v0.2) | 2 | 7 | 6 | 5 | not converged |
| Pass 2 (v0.3) | 0 | 0 | 5 | 4 | converged |
| Pass 3 (v0.4) | 0 | 4 | 5 | 3 | **converged after applying 12 fixes** |

All fixes (F-L1 through F-R16, 29 in total) folded into architecture. Three residual lows tolerable:
- O13: Comptroller false alarms in first 2 weeks (mitigated by 14-day baseline-learning)
- L13: Even with aggregated Business-space reports, some volume pattern signal remains
- R16: 50–100ms `cost_ledger` write reduced to <5ms via batching but not zero

---

## 14. Open Items

| # | Item | Status | Action |
|---|------|--------|--------|
| 1 | Verify Gemini enabled on ws1 Workspace admin | Unknown | Pre-deploy check |
| 2 | Verify Gemini enabled on ws2 Workspace admin | Unknown | Pre-deploy check |
| 3 | nevershitty.com Workspace admin access (OAuth re-issuance) | Unknown | Pre-deploy runbook step |
| 4 | CF AI Gateway enabled on CF account | Unknown | Pre-deploy check |
| 5 | CF Workers AI active | Unknown | Pre-deploy check |
| 6 | Google AI Studio API key provisioned | Unknown | Pre-deploy check |
| 7 | Anthropic prompt caching enabled (for post-pilot) | Unknown | Pre-T2-enable check |
| 8 | Litigation-hold default | Defaulting `false` (per-case opt-in) | Confirm or override |
| 9 | Q12 batch routing | Deferred to post-pilot | Decide week 6–7 based on actual cost |

Items 1–6 are pre-deploy checks captured in RUNBOOK.md (Phase 4).

---

## 15. Phase 4 Readiness

On your `go`, Phase 4 generates the following build artifacts:

| # | Artifact | Format |
|---|----------|--------|
| 1 | `chittyops/routines/comms/daily-comms-triage/manifest.json` | Routine manifest |
| 2 | `chittyops/routines/comms/daily-comms-triage/README.md` | Routine doc |
| 3 | `chittyops/routines/comms/daily-comms-triage/worker.ts` | CF Worker |
| 4 | `chittyops/routines/comms/daily-comms-triage-realtime/manifest.json` | Realtime variant |
| 5 | `chittyops/studio-flows/aribia-daily-inbox-triage.json` | Studio flow export |
| 6 | `migrations/2026_05_actions_v1.sql` | Neon DDL (10 tables + RLS + indexes) |
| 7 | `migrations/2026_05_cost_ledger.sql` | cost_ledger schema |
| 8 | `chittyops/notion-views/daily-triage.json` | Notion view diff |
| 9 | `chit/commands/triage.ts` | CLI subcommand |
| 10 | `chittyops/mcp-tools/daily_updates.json` | MCP gateway tool schemas |
| 11 | `chittyops/seeds/sensitivity_rules.sql` | Initial seed |
| 12 | `chittyops/seeds/policy_flags.sql` | Initial state |
| 13 | `chittyops/services/comptroller/SPEC.md` | Comptroller service spec |
| 14 | `chittyops/services/comptroller/worker.ts` skeleton | CF Worker scaffold |
| 15 | `chittyops/routines/ops/flow-hash-check/manifest.json` | Drift detection |
| 16 | `RUNBOOK-deploy.md` | Deploy runbook (incl. pre-deploy checks 1–6) |
| 17 | `PILOT.md` | Pilot plan with exit criteria |
| 18 | `agent-ui/triage-route.tsx` | agent.chitty.cc /triage route |

**Total: 18 artifacts.** Estimate to generate: 1–2 hours of focused output.

Say `go` to proceed. Say `subset: <numbers>` for a specific subset. Say `adjust` to revise this SoT first.
