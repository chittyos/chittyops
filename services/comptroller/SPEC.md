# ChittyComptroller — Service Specification

**Service:** `comptroller.chitty.cc`
**Type:** Sibling infrastructure service
**Version:** 1.0.0
**Status:** Phase B build (parallel with v1 core; ships at week 5–6)
**Owner:** Nick Bianchi

---

## Identity

ChittyComptroller is an independent budget observer and delegated enforcer. It is a **sibling** to ChittyCounsel, ChittyBiz, and other consuming services — not a parent, not a child. It reports to the executive (the operator) on variance, anomalies, and forecasts, and has delegated authority to throttle (L2) or pause (L3) services per policy.

Mental model: the comptroller's office in a municipal government. Independent. Advisory. Has teeth when authorized.

## Authority levels

All three are enabled in v1 per Q17.

| Level | Capability | Default state | Constraint |
|-------|-----------|---------------|-----------|
| **L1 — Observer** | Read-only · alerts · reports · forecasts | always on | none |
| **L2 — Throttle** | Issue `tier_degrade` signals to consuming services via pub-sub | disabled for 14-day baseline-learning | honors `pause_exemptions` |
| **L3 — Halt** | Pause services that breach hard limits | disabled for 14-day baseline-learning + 24h cold-start | requires Quo SMS confirm for `pause_exemptions` services |

### Safe-state behaviors (F-R12)

- **Cold-start:** L1-only for 24h after startup. L2/L3 require operator confirmation via Quo SMS to re-enable.
- **Partition recovery:** L1-only until 100 contiguous successful 5-min polls.
- **First-deploy:** BASELINE_LEARNING flag auto-set for 14 days. Alerts fire only on hard-limit breach (not anomaly-relative thresholds).

## Scope

All ChittyOS services. v1 watches:

| Tier | Service | What's tracked |
|------|---------|---------------|
| Infrastructure | chittydispatch, chittymcp, chittyrouter, chittyregister, chittydiscovery | CF Workers compute · KV · R2 · D1 — usually free tier |
| Routing/Triage | autoassist, orchestrator | AI inference cost |
| Domain | ChittyCounsel, ChittyBiz, ChittyEvidence | AI inference cost + storage |
| Initiative | daily-comms-triage, docket-sweep, rent-roll-reconcile, etc. | AI inference cost · per-routine budgets |

## Data sources

| Source | Endpoint | Cadence | Auth |
|--------|----------|---------|------|
| CF AI Gateway | `gateway.chitty.cc/_analytics` | every 5 min | gateway API token |
| Anthropic billing | `api.anthropic.com/v1/billing` | hourly | console API key |
| Google AI Studio quota | `generativelanguage.googleapis.com/v1/quota` | hourly | AI Studio key |
| CF Workers AI metrics | CF GraphQL API | every 5 min | account API token |
| Neon `cost_ledger` (read-only) | `restless-grass-40598426` | real-time (every 60s aggregate) | `comptroller_reader` role |
| Mercury infra invoices (optional) | `api.mercury.com/v1/invoices` | daily | Mercury API token |

`cost_ledger` access is governed by row-level grant to `comptroller_reader` — Comptroller sees aggregate cost + hashed `item_id` only. **Never sees subject lines, content, or unhashed identifiers** (F-L11).

## Outputs

| Output | Surface | Cadence | Audience |
|--------|---------|---------|----------|
| Real-time anomaly alert | Notion + Quo SMS (high-severity only) | < 5 min from detected spike | operator |
| Daily cost report | Notion page (auto-updated) — Business space | 07:00 CT | operator |
| Daily cost report — Legalink | Notion page in Legalink — per-case detail | 07:00 CT | operator (in Legalink context) |
| Weekly variance + forecast | Notion + Quo SMS digest | Mon 07:00 CT | operator |
| Monthly closeout + tier-rebalancing recommendation | Notion + email | 1st of month, 09:00 CT | operator |
| Per-service spend dashboard | `comptroller.chitty.cc` UI (auth-gated) | live | operator |
| MCP tool: `comptroller.budget_status` | mcp.chitty.cc | on-demand | any MCP-LLM with scope |

### Dual-report structure (F-L13)

- **Business-space report:** Legal services aggregated into single line "Legal Operations" — no per-case or per-document breakdown
- **Legalink-only report:** Full per-case breakdown · visible inside Legalink Notion space only

## Forecasting method

EWMA (exponentially weighted moving average) over the last 14 days with simple seasonality detection (day-of-week, week-of-month). **Never uses LLM calls itself above T0** — uses statistical Python (Workers AI for any classification needed; pure JS for math) to avoid the meta-cost trap.

```
forecast(day) = alpha * actual(yesterday) + (1 - alpha) * forecast(yesterday)
where alpha = 0.3
```

Anomaly: `actual > forecast + 3 * stdev` over rolling window.

## L2 / L3 contract with consuming services

Consuming services register in chittyregistry with:

```json
{
  "service_id": "chittycounsel",
  "supports_signals": ["tier_degrade", "pause", "resume"],
  "tier_degrade_endpoint": "https://chittycounsel.chitty.cc/_admin/degrade",
  "pause_endpoint": "https://chittycounsel.chitty.cc/_admin/pause",
  "resume_endpoint": "https://chittycounsel.chitty.cc/_admin/resume",
  "auth_method": "shared_secret_hmac"
}
```

### L2 `tier_degrade` signal

```json
POST /_admin/degrade
{
  "from_tier": "T3_sonnet",
  "to_tier": "T2_haiku",
  "reason": "monthly_cap_at_70pct",
  "scope": "service",
  "expires_at": "2026-06-01T00:00:00Z"
}
```

Service must honor (route subsequent calls to `to_tier`), or respond `409` if exempt. Service decides whether the cost-quality tradeoff is acceptable for its workload.

### L3 `pause` signal

```json
POST /_admin/pause
{
  "reason": "hard_cap_breached",
  "expires_at": "2026-05-27T08:00:00Z",
  "confirm_token": "sms_confirmation_token_from_operator"
}
```

Service either pauses (returns 503 on subsequent calls) or refuses with reason. Services with `pause_exemption` flag REQUIRE `confirm_token` from Quo SMS to operator.

## Database schema (owned)

Comptroller-owned tables in `chittyops` schema (additional to `cost_ledger`):

- `comptroller.anomalies` — detected anomalies with severity, recommendation, ack state
- `comptroller.forecasts` — daily forecast snapshots (for accuracy tracking)
- `comptroller.signals_emitted` — audit log of all L2/L3 signals sent
- `comptroller.tier_rebalancing_recommendations` — monthly outputs

DDL provided in `migrations/2026_06_comptroller.sql` (Phase B).

## MCP tool exposure

| Tool | Purpose |
|------|---------|
| `comptroller.budget_status` | Get current budget status for a service |
| `comptroller.daily_report` | Fetch the latest daily cost report |
| `comptroller.weekly_forecast` | Fetch weekly forecast + variance |
| `comptroller.list_anomalies` | List active/unacknowledged anomalies |
| `comptroller.ack_anomaly` | Acknowledge an anomaly (auth required) |
| `comptroller.set_authority_level` | Toggle L2/L3 (auth + SMS-confirm required) |

## Operational invariants

1. Comptroller is itself never above T0 — uses statistical methods, not LLM reasoning.
2. Comptroller has read-only access to `cost_ledger`; cannot mutate.
3. L3 pause on `pause_exemption` services requires SMS-confirm from operator.
4. Comptroller's own infra cost is included in its dashboards (self-tracking).
5. On Comptroller downtime: services fail open (no degrade signal received = proceed). This is a deliberate design choice for fault tolerance.

## Failure modes

| Mode | Behavior |
|------|----------|
| Comptroller unreachable | Services proceed (fail open) |
| Comptroller misclassifies anomaly | Throttle signal may degrade quality; operator can override |
| L3 pause cascades incorrectly | `pause_exemption` services hold; SMS confirms prevent accidental halt |
| `cost_ledger` write lag | Forecasts use slightly stale data; not load-bearing for hard caps (those use real-time provider APIs) |

## Build plan summary

| Phase | Component | Hours |
|-------|-----------|-------|
| Foundation | Schema · CF Worker scaffold · cost_ledger reader | 8 |
| L1 | Anomaly detection · daily/weekly reports · dashboard UI | 12 |
| L2 | Tier-degrade signal dispatcher · service registry contract | 8 |
| L3 | Pause signal · SMS-confirm flow · safe-state behaviors | 8 |
| Tests + docs | Per-level unit tests, integration tests, runbook | 4 |
| **Total** | | **40 hr (over 5–6 weeks)** |

Note: above is the Comptroller-only estimate; actual integration hours include retrofitting `cost_ledger` writes into existing ChittyOS services (~6 hr counted separately in v0.5 SoT).

## See also

- Architecture: v0.5 SoT §8 (ChittyComptroller)
- cost_ledger schema: `migrations/2026_05_cost_ledger.sql`
- Pause exemptions seed: `chittyops/seeds/policy_flags.sql`
- Adversarial fixes baked in: F-L11 hashed item_id · F-L13 dual reports · F-O10 pause_exemption · F-O13 baseline-learning · F-R12 safe-state · F-R16 batched cost_ledger writes
