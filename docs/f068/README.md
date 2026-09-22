# F-068 — ChittyLedger Cleanup

**Holding (A):** ChittyLedger substrate + Finance/Evidence projections.

**Canonical substrate:** `CHITTYFOUNDATION/chittyledger` (Tier 3, `ledger.chitty.cc`).
**Archive candidate:** `CHITTYOS/chittyledger` (Vite/Drizzle fork — Evidence/Finance projection misnamed as the canonical ledger).

## Documents in this directory

| Doc | Purpose | Status |
|---|---|---|
| [chittyledger-pentad-drift-report.md](./chittyledger-pentad-drift-report.md) | Pentad SOP §020 conformance scorecard (canon 5/5 · fork 0/5) | ✅ Complete |
| [T32-doc-sweep.md](./T32-doc-sweep.md) | Local doc sweep results | ✅ Complete |
| [T33-duplicate-archive-plan.md](./T33-duplicate-archive-plan.md) | Duplicate inventory + 3-phase archive plan | ✅ Complete |
| [T35-nested-copy-removal-plan.md](./T35-nested-copy-removal-plan.md) | Nested-copy removal (`chittychronicle/chittyledger/` is 2.5 MB stale snapshot) | ✅ Complete |
| [api-chittyledger-archive-plan.md](./api-chittyledger-archive-plan.md) | Archive PR plan (terminology clarified — `api-chittyledger` = canon's `api/` subproject, not a separate repo) | ✅ Plan written; PR gated |
| [SOP-085-tailscaled-path.md](./SOP-085-tailscaled-path.md) | Accept `/usr/local/bin/tailscaled` + 3 other canonical paths | ✅ Proposed |
| [phase-classification-mint-and-canon-audit-log.md](./phase-classification-mint-and-canon-audit-log.md) | Mint→Ledger and canon_audit_log→Ledger phases classified NEEDS_APPROVAL | ✅ Complete |
| [verification-ledger-2026-05-27.md](./verification-ledger-2026-05-27.md) | Session ledger — changes, skips, blockers, next gates | ✅ Complete |

## What changed in this PR

- `compliance/service-registry.yml` — `chittyledger` row repointed at `CHITTYFOUNDATION/chittyledger` (was: `CHITTYOS/chittyledger`).
- 8 new docs in `docs/f068/`.

## What is gated (not done)

- All PR creation across other repos (chittyledger archive PR, chittychronicle nested-copy removal PR, chittyevidence-db migration PRs).
- Any chittyregister mutation.
- Any production deploy.
- Any secret provisioning.
- Sensitivity audit of `attached_assets/`.

See `verification-ledger-2026-05-27.md` §"Blockers / next approval gates" for the full list.
