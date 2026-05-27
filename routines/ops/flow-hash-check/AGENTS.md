---
uri: chittycanon://docs/ops/agents/flow-hash-check
namespace: chittycanon://docs/ops
type: agents
version: 1.0.0
status: DRAFT
chitty_id: 03-1-USA-6434-T-2605-1-54
---

# flow-hash-check — Agent Operating Defaults

## Hard rules

1. **Never auto-rollback** a drifted Studio flow. Alert only.
2. **Never enable cron** until: `GAM_TUNNEL_URL` resolves; `NOTION_ALERT_PAGE_ID` exists; repo-side `REPO_FLOW_HASH_WS1` + `REPO_FLOW_HASH_WS2` are populated from the actual SHA-256 of `studio-flows/aribia-daily-inbox-triage.json`.
3. **Never store the live flow JSON** in this worker. Hash, compare, discard.

## Deploy procedure

1. Compute the repo file hashes:
   ```bash
   sha256sum studio-flows/aribia-daily-inbox-triage.json
   ```
2. Set those as `REPO_FLOW_HASH_WS1` and `REPO_FLOW_HASH_WS2` in `wrangler.toml` (same value for now; differs per-tenant after first re-export).
3. Replace `GAM_TUNNEL_URL` and `NOTION_ALERT_PAGE_ID` placeholders.
4. Set secret: `wrangler secret put NOTION_API_KEY`.
5. Deploy with cron commented out.
6. Manually trigger via `wrangler tail` + dry-run to verify hash comparison.
7. Then uncomment `[triggers] crons = ["0 13 * * *"]` and redeploy.

## Status

- Health-only stub deployed at `flow-hash-check.chitty.cc` (ChittyID `03-1-USA-6434-T-2605-1-54`).
- Awaiting GATE 3.
