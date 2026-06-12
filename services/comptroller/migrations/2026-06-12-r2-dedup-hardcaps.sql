-- ChittyComptroller R2 migration — run by neondb_owner via Neon MCP (NOT the worker).
-- The comptroller_writer role is append-only (INSERT+SELECT, no UPDATE/DELETE/DDL), so the
-- dedup DELETE, the UNIQUE constraint, and the new table all require owner privileges.
--
-- ORDER MATTERS: deploy the worker (targetless `ON CONFLICT DO NOTHING` on cost_ledger INSERT)
-- BEFORE running steps 1-2 in production, so live ingestion tolerates the new constraint.

-- ── Fix A (P1-1): cost_ledger ingest dedup ───────────────────────────────────────────────
-- 1. Remove phantom duplicate rows, keeping the lowest entry_id per item_id_hash.
WITH dupes AS (
  SELECT entry_id, row_number() OVER (PARTITION BY item_id_hash ORDER BY entry_id) AS rn
  FROM chittyops.cost_ledger
)
DELETE FROM chittyops.cost_ledger
WHERE entry_id IN (SELECT entry_id FROM dupes WHERE rn > 1);

-- 2. Enforce uniqueness so re-ingest at the HWM boundary millisecond is a harmless no-op
--    (the worker INSERT uses `ON CONFLICT DO NOTHING`, which becomes a real dedup once this lands).
ALTER TABLE chittyops.cost_ledger
  ADD CONSTRAINT cost_ledger_item_id_hash_key UNIQUE (item_id_hash);

-- ── Fix B (P0-2): per-service budget config source ───────────────────────────────────────
-- Live source of truth for daily/monthly caps; const map in worker.ts is the fallback.
CREATE TABLE IF NOT EXISTS chittyops.service_budgets (
  service         text PRIMARY KEY,
  daily_cap_usd   numeric NOT NULL,
  monthly_cap_usd numeric NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- checkHardCaps + budgetStatus read this via the comptroller_reader role (getDb).
GRANT SELECT ON chittyops.service_budgets TO comptroller_reader;
