# PILOT.md — daily-comms-triage

**Owner:** Nick Bianchi
**Pilot start:** Day 1 of deploy week 6
**Pilot duration:** Minimum 14 days; weekly reassessment
**Pilot policy:** Free-tier-only · T2/T3 disabled · Comptroller in BASELINE_LEARNING

---

## Goal of pilot

Validate that the free-tier stack (T0 + T1) handles enough of the daily volume to make paid tiers (T2 Haiku · T3 Sonnet) optional, not mandatory. The escalation-to-`pilot_unresolved` path acts as the dataset that justifies (or refutes) paid-tier activation.

---

## Pilot configuration

- All sources enabled (Gmail × 3 inboxes + Quo + iMessage + Mercury + Calendar + ...)
- Daily 07:00 CT batch run
- Real-time webhook variant **disabled** during pilot
- T2 Haiku · T3 Sonnet **disabled** by `PILOT_MODE` flag
- Comptroller in BASELINE_LEARNING (alerts only on hard limit)
- Paid-tier auth **provisioned but disabled** — emergency activation requires SMS-confirm

---

## Pilot exit criteria

All must be met before clearing `PILOT_MODE`:

| # | Criterion | Target | Measurement |
|---|-----------|--------|-------------|
| 1 | Heartbeat success rate | > 95% | discovery.chitty.cc heartbeat log, 14-day rolling |
| 2 | Daily user-visible queue size | ≤ 30 items median | actions_v1 where created_at = today AND auto_archived = false |
| 3 | Auto-archive false-positive rate | < 1% | Weekly spot-check of sample-20 auto-archived items |
| 4 | `pilot_unresolved` items as % of total | < 10% | actions_v1 where policy_flags_triggered @> ARRAY['PILOT_MODE_UNRESOLVED'] |
| 5 | Security incidents | 0 | No privileged leakage · no successful injection · no PII in Business space |
| 6 | Comptroller anomaly false-positive rate | trending down | comptroller.anomalies acknowledged-as-false-positive count |
| 7 | Studio flow drift incidents | 0 (or resolved within 24h) | studio_flow_drift_log entries |
| 8 | Cost actually used | ≤ $0.50/day | sum(cost_ledger.cost_usd) — should be near zero in pilot |
| 9 | Operator subjective: "I trust the queue" | yes | Operator self-report at end of week 2 |

---

## Per-week ritual

### Every weekday morning (5–15 min)
- Open Notion → Nick's Dashboard → Daily Triage view
- Accept/reject items
- Use `chit triage diff <id>` for Reply drafts before accepting

### Every Monday morning (30–60 min)
- Review Comptroller weekly report
- Review auto-archive sample-20 — flag any false-archives in Notion
- Skim `pilot_unresolved` queue — are these items genuinely ambiguous, or could T0/T1 prompting be improved?
- Update sensitivity_rules if drift observed

### End of week 2
- Score each exit criterion
- If all met: proceed to paid-tier activation sequence
- If 1–2 fail: extend pilot another week, address gaps
- If 3+ fail: pause routine, escalate to v0.5 design review

---

## Pilot exit → paid-tier activation sequence

### Step 1 (week 3, if criteria met) — Enable T2 (Haiku)

```sql
UPDATE chittyops.policy_flags SET active = false WHERE flag_name = 'PILOT_MODE';
```

`pilot_unresolved` items now route to T2 instead. Monitor 1 week:
- T2 daily spend should be < $0.10
- T2 → T3 escalation rate should be < 20%
- Quality: spot-check 10 T2 decisions per day for first 3 days

### Step 2 (week 4) — Enable T3 (Sonnet)

Worker reads `ai_routing.tiers.T3_sonnet.pilot_disabled` from manifest. Update manifest:
```json
{ "T3_sonnet": { "pilot_disabled": false } }
```

`cf deploy` to apply. T3 calls now flow for high-stakes items.

### Step 3 (week 4–5) — Decide batch policy (Q12 reopens)

With 1–2 weeks of real cost data:
- If T2 + T3 total < $0.50/day → no batch needed; real-time everything
- If T2 + T3 total > $1/day → enable T2 batch (50% savings, 1–4h async typical)
- T3 always real-time (high-stakes urgency)

### Step 4 (end of week 5) — End BASELINE_LEARNING

```bash
curl -X POST https://comptroller.chitty.cc/_admin/baseline_learning/end \
     -H "X-Confirm-Token: $(prompt-sms-token)"
```

L2 (throttle) signals become active. L3 (pause) remains gated behind SMS-confirm for exempt services.

### Step 5 (week 6+) — Enable real-time variant

Update `daily-comms-triage-realtime` manifest, remove `WEBHOOK_DISABLED` env var, redeploy.

Priority ≥ 8 items now surface via Quo SMS in real time. Lower-priority items remain in daily batch.

---

## Hard-fail conditions (pause pilot immediately)

| Condition | Action |
|-----------|--------|
| Privileged content appears in Business-space Notion | Pause routine · review Studio flow F-L10 instruction set · rerun adversarial Pass 4 |
| Comptroller incorrectly emits L3 pause on exempt service | Pause Comptroller L2/L3 · review safe-state logic |
| Auto-archive false-positive rate > 5% | Pause auto-archive (set `auto_archive.enabled = false`) · increase confidence threshold · retrain Studio prompt |
| `pilot_unresolved` > 25% of total | Indicates T0/T1 prompting needs work · iterate on prompts before activating paid tiers |
| Cost exceeds $2/day in pilot (should be ~$0) | Investigation — paid tier may be misconfigured · confirm `pilot_disabled=true` on T2/T3 |
| Studio flow drift not resolved within 24h | Operator investigates; flow-hash-check escalates to daily Quo SMS |

---

## Success looks like

After week 2:
- Daily queue: ≤ 25 items
- 5–10 min daily triage
- Cost: ~$0/day
- Comptroller producing trustworthy daily reports
- 0 privileged leakages
- Operator confident enough to delegate (via Auto-Archive policy on more categories) → reducing manual review further over time

After week 6 (full activation):
- T2 + T3 active for refinement
- Real-time push for priority ≥ 8
- Comptroller L2 throttling proves itself a few times (catches genuine cost spikes)
- L3 never fires (no breach approaches limits)
- Steady-state cost: ~$0.04/day
- Quarterly adversarial re-review schedule in calendar
