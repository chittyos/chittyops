# Ralph loop: governed development and runner pilot

Status: **proposed control contract; not an enabled autonomous agent**. Tracking: #127.

## Goal

Repeat **plan → implement → execute → observe → diagnose → repair → verify** until independently established acceptance criteria pass, or stop on a classified blocker. The user should not need to reissue 'continue' between successful iterations. Never interpret loop exhaustion as completion.

## Durable state (per task)

Record `task_id`, `repository`, `issue`, `branch`, `head_sha`, `attempt`, `attempt_budget`, `deadline`, `acceptance_criteria`, `checks`, `security_findings`, `blockers`, `last_failure_fingerprint`, `last_progress_sha`, `approvals`, and `evidence_links`. Store metadata and source links, not source secrets, legal evidence, or full logs. Use the existing governed task/chronicle facility after verifying its actual contract; GitHub issue + PR + Actions runs are the bootstrap audit trail, not a new authoritative entity registry.

## Loop invariants

1. Start only from an authorized issue and dedicated branch; never run untrusted PR code with production credentials or organization-admin tokens.
2. Pin inputs and tools; one active loop lease per task. Acquire lease before changes; use head SHA compare-and-swap and reject stale attempts.
3. Run deterministic checks before invoking an AI repair agent. Every repair must identify the failing invariant and include a test that would have caught the defect.
4. Use isolated one-job execution workers; runner enrollment/teardown belongs to a separately authorized infrastructure executor. GitHub Actions is the execution record, not the source of governance authority.
5. A green CI run is necessary, not sufficient. Independent security/adversarial review and source-level authorization gates are required for security-sensitive changes.
6. No self-approval, self-merge, deploy, secret rotation, runner-group administration or changes to release protections by the repairing agent.
7. Bound iterations (initial default 5), wall time (initial default 90 minutes), token/cost budget, and consecutive identical failure fingerprints (stop after 2 without progress). Escalate to a human only for specific irreducible decisions or blocked permissions.
8. On cancellation, timeout, crash, or lease expiry: stop writes, revoke temporary credentials, terminate runner, and persist evidence of teardown. Resume from last verified SHA, never from an untrusted narrative summary.

## State transitions

`QUEUED → AUTHORIZED → LEASED → RUNNING → VERIFYING → {REPAIRING → RUNNING | AWAITING_REVIEW | BLOCKED | COMPLETE}`.

`COMPLETE` requires every stated acceptance criterion satisfied by linked evidence and an independent review where required. `BLOCKED` must identify a concrete unavailable permission, contract, host, or reproducible test failure; it must not be disguised as a successful delivery.

## Pilot sequence (#127)

1. Verify live Nomad fleet and available isolated worker capacity; do not rely on historical fleet documentation as live state.
2. Verify GitHub App and runner-group administration contracts, task lease/journal ownership, and the current reusable ChittyOps workflow. Resolve existing auto-merge defaults before onboarding security-sensitive workloads.
3. Provision a restricted ephemeral runner through an authorized executor, with repository allowlist and no production secrets.
4. Dispatch a test job to that runner, record runner identity and job ID, then prove runner teardown and registration revocation.
5. Enable a bounded repair agent on a deliberately failing, non-sensitive fixture repository; demonstrate a test-producing fix, idempotent retry, lease exclusion, stop-on-repeat, and crash recovery.
6. Exercise adversarial cases: malicious PR, token exfiltration, persistent workspace, poisoned cache/artifact, revoked permission, runner offline, stale head SHA, duplicate delivery, and agent attempting self-approval.
7. Apply to private ChittyCounsel PR #4 only after the runner pilot passes. ChittyCounsel's source ACL and authorization gates remain independent acceptance criteria.

## Ownership discovery

Do not assign components by name. Determine authoritative ownership from implemented contracts and governing Canon/Registry rules. Candidate integration points: ChittyOps CI; Nomad execution; ChittyConnect credential broker; existing task/agent orchestration and Chronicle evidence; ChittyConfig projections. No new service or registry without a demonstrated gap.

## Rollback

Disable task dispatch, revoke short-lived credentials, deregister runners, unset `CHITTYOS_CI_RUNNER_JSON` to restore hosted CI, preserve GitHub evidence, and require explicit approval for any deployment rollback.
