-- Migration: 2026_05_cost_ledger.sql
-- Target: Neon instance `restless-grass-40598426`
-- Adds cost_ledger as shared infrastructure: every AI-consuming service writes; Comptroller reads.
-- Hashed item_id (F-L11) prevents reverse-lookup of case/document identifiers.

BEGIN;

-- ===== cost_ledger =====
CREATE TABLE chittyops.cost_ledger (
    entry_id            bigserial PRIMARY KEY,
    service             text NOT NULL,
    tier                text NOT NULL CHECK (tier IN ('T0','T1_workspace','T1_personal','T2_haiku','T3_sonnet','T2_pro','T3_opus','manual')),
    provider            text NOT NULL,
    model               text,
    tokens_in           int NOT NULL DEFAULT 0,
    tokens_out          int NOT NULL DEFAULT 0,
    cached_tokens_in    int NOT NULL DEFAULT 0,
    cost_usd            numeric(10,6) NOT NULL DEFAULT 0,
    latency_ms          int,
    item_id_hash        text NOT NULL,
    run_id              uuid,
    fallback_chain      text[],
    ts                  timestamptz NOT NULL DEFAULT now(),
    -- For Comptroller forecast methods
    cost_constrained    boolean NOT NULL DEFAULT false
);

-- Aggressively indexed for Comptroller's read patterns
CREATE INDEX idx_cost_ledger_service_ts ON chittyops.cost_ledger (service, ts DESC);
CREATE INDEX idx_cost_ledger_tier_ts ON chittyops.cost_ledger (tier, ts DESC);
CREATE INDEX idx_cost_ledger_provider_ts ON chittyops.cost_ledger (provider, ts DESC);
CREATE INDEX idx_cost_ledger_ts ON chittyops.cost_ledger (ts DESC);
CREATE INDEX idx_cost_ledger_run_id ON chittyops.cost_ledger (run_id);

-- ===== Materialized aggregations for fast Comptroller dashboards =====
CREATE MATERIALIZED VIEW chittyops.cost_ledger_daily AS
SELECT
    date_trunc('day', ts AT TIME ZONE 'America/Chicago') AS day_ct,
    service,
    tier,
    provider,
    count(*)                AS call_count,
    sum(tokens_in)          AS total_tokens_in,
    sum(tokens_out)         AS total_tokens_out,
    sum(cached_tokens_in)   AS total_cached_tokens_in,
    sum(cost_usd)           AS total_cost_usd,
    avg(latency_ms)         AS avg_latency_ms,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms
FROM chittyops.cost_ledger
GROUP BY 1, 2, 3, 4;

CREATE UNIQUE INDEX idx_cost_ledger_daily ON chittyops.cost_ledger_daily (day_ct, service, tier, provider);

-- Refresh job — Comptroller invokes this every 5 minutes
CREATE OR REPLACE FUNCTION chittyops.refresh_cost_ledger_daily()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY chittyops.cost_ledger_daily;
END;
$$;

-- ===== Helper view for current-month-to-date =====
CREATE VIEW chittyops.cost_mtd AS
SELECT
    service,
    tier,
    sum(cost_usd) AS mtd_cost_usd,
    count(*)      AS mtd_call_count
FROM chittyops.cost_ledger
WHERE ts >= date_trunc('month', now() AT TIME ZONE 'America/Chicago')
GROUP BY 1, 2;

-- ===== Helper view for today (CT) =====
CREATE VIEW chittyops.cost_today AS
SELECT
    service,
    tier,
    sum(cost_usd) AS today_cost_usd,
    count(*)      AS today_call_count
FROM chittyops.cost_ledger
WHERE ts >= date_trunc('day', now() AT TIME ZONE 'America/Chicago')
GROUP BY 1, 2;

-- ===== Retention policy =====
-- cost_ledger raw entries: 1 year
-- Aggregations: indefinite
CREATE OR REPLACE FUNCTION chittyops.cost_ledger_retention()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM chittyops.cost_ledger WHERE ts < now() - interval '1 year';
END;
$$;

-- ===== Read-only role for Comptroller (F-L11) =====
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comptroller_reader') THEN
        CREATE ROLE comptroller_reader;
    END IF;
END $$;

GRANT USAGE ON SCHEMA chittyops TO comptroller_reader;
GRANT SELECT ON chittyops.cost_ledger TO comptroller_reader;
GRANT SELECT ON chittyops.cost_ledger_daily TO comptroller_reader;
GRANT SELECT ON chittyops.cost_mtd TO comptroller_reader;
GRANT SELECT ON chittyops.cost_today TO comptroller_reader;
GRANT EXECUTE ON FUNCTION chittyops.refresh_cost_ledger_daily() TO comptroller_reader;

-- Comptroller NEVER gets access to actions_v1 contents — only cost_ledger (hashed item_id).
-- F-L11: item_id is SHA256-hashed before INSERT; comptroller cannot reverse to case/document.

COMMIT;
