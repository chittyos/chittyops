# Capability Continuity — Phase 0 Evidence and Ownership

Work key: `chittyos-capability-continuity-regression-assurance`  
Canonical work item: https://github.com/chittyos/chittyops/issues/129  
Observed: 2026-10-18  
Status: evidence gathering; no unattended recovery proven.

## Verified source responsibilities
- ChittyOps CHARTER.md: Tier 3 CI/CD/compliance engine; explicitly **not** application monitoring runtime. Owns workflow/CI governance and compliance remediation. `https://github.com/chittyos/chittyops/blob/main/CHARTER.md`
- ChittyRegistry CHARTER.md: directory/catalog, duplicate prevention and search; expressly not runtime discovery. `https://github.com/chittyos/chittyregistry/blob/main/CHARTER.md`
- ChittyRegistry AGENTS.md remains a stub and reports tier 9, inconsistent with charter tier 2; do not treat its operational contract as complete. `https://github.com/chittyos/chittyregistry/blob/main/AGENTS.md`
- ChittyOps governance autopilot GitHub workflow has scheduled cron `17 7 * * *`, but it mutates organization settings/rulesets/webhooks. It is **not** a safe functional-regression monitoring loop and should not be repurposed or triggered for this investigation. `https://github.com/chittyos/chittyops/blob/main/.github/workflows/org-governance-autopilot.yml`

## Direct deployed observations
Cloudflare ChittyCorp Worker inventory returned: `chittyagent-monitor`, `chittyagent-heartbeat`, `chittytrace`, `chittymcp`, `ch1tty` (among others). Their Worker detail lookups succeeded. Presence is **not** evidence of healthy service or a functioning scheduler.

Workers Observability keys query for 2026-10-17T18:00:00Z through 2026-10-18T18:00:00Z returned `$metadata.service`, `$metadata.error`, `$metadata.traceId`, `$workers.outcome`, `$workers.event.response.status` and other fields. Targeted events queries with `$metadata.service eq` for ch1tty, chittyagent-monitor, chittyagent-heartbeat, chittymcp each returned `[]`. This is **inconclusive**: could reflect service-field naming, ingestion scope, absence of events, or configuration. Do not claim outage or monitoring success.

Deployed code retrieval succeeded for chittyagent-heartbeat and chittyagent-monitor; the heartbeat bundle's domain manifest defines `TOOLS = []`. This does not by itself prove absence of scheduling or a functional probe: inspect actual route/cron handler and bindings. Monitor bundle is large and not yet fully audited.

## First concrete ownership conclusion
ChittyOps should coordinate CI/CD and code changes, not assume ownership of runtime monitoring. Determine whether ChittyBeacon, chittyagent-monitor, or another existing service owns the runtime. Verify against live registration, actual scheduled executions, source, bindings, and functional receipts.

## Next proof gates
1. Read the runtime-monitoring owner's CHARTER/CHITTY/AGENTS and actual source entrypoint; compare deployed code and bindings.
2. Confirm scheduler trigger (Cron/Workflow/DO alarm/GitHub Action) with a real run receipt; do not confuse configured cron with executed cron.
3. Identify canonical capability registry read route. The ChittyRegistry charter advertises `/api/v1/tools`, not the historical `/api/services` route. Check actual deployed endpoint.
4. Implement or reuse a read-only functional probe for one non-legal tool, recording success/failure, version, last-good/first-bad and trace IDs.
5. Verify deduplicated incident creation in the existing work chain without user prompting.
6. Demonstrate independent fallback when the MCP gateway fails; verify monitor-of-monitor.
7. Only then authorize preapproved reversible remediation, retest, and persistence.

## Risk controls
No new registry/schema/service; no secrets or privileged token copying; no production deployments, destructive mutations or auth changes without approval. Keep legal evidence out of generic monitoring payloads. A successful HTTP 200 alone cannot close a capability regression.
