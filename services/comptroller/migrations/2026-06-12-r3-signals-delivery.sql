-- ChittyComptroller R3 migration — run by neondb_owner via Neon MCP (NOT the worker).
-- The comptroller_writer role is append-only (INSERT+SELECT only). Both new tables and all
-- grants are owner-only DDL. The worker NEVER runs DDL/UPDATE/DELETE — the feedback state
-- machine is modelled as APPEND-ONLY rows sharing a `signal_id` correlation id, with `seq`
-- providing deterministic latest-state ordering. The mutable pre-signal run-rate marker lives
-- in KV (TTL-bounded), never as an updatable column.

-- ── P0-3: service endpoint discovery (replaces the 404-ing registry lookup) ────────────────
-- fetchServiceFromRegistry reads this FIRST (comptroller_reader / getDb), registry as fallback.
CREATE TABLE IF NOT EXISTS chittyops.service_endpoints (
  service               text PRIMARY KEY,
  tier_degrade_endpoint text,
  pause_endpoint        text,
  resume_endpoint       text,
  enabled               boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON chittyops.service_endpoints TO comptroller_reader;

-- Seed the real, live ChittyRouter row. Its POST /admin/tier-degrade verifies the
-- X-Comptroller-Signature HMAC and writes a self-expiring KV tier-override.
INSERT INTO chittyops.service_endpoints (service, tier_degrade_endpoint, pause_endpoint, resume_endpoint, enabled)
VALUES ('chittyrouter', 'https://router.chitty.cc/admin/tier-degrade', NULL, NULL, true)
ON CONFLICT (service) DO UPDATE
  SET tier_degrade_endpoint = EXCLUDED.tier_degrade_endpoint,
      enabled               = EXCLUDED.enabled;

-- ── P1-3: persistent signal audit trail (required for sovereignty) ─────────────────────────
-- APPEND-ONLY. Every signal attempt (real / gated-skip / dry-run) and every feedback
-- transition is a NEW row. State transitions correlate via `signal_id`; `seq` gives a
-- monotonic tiebreak so DISTINCT ON (signal_id) ORDER BY seq DESC yields current state even
-- when several rows share the same `ts` (same-transaction now()).
CREATE TABLE IF NOT EXISTS chittyops.signals_emitted (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id     uuid NOT NULL,
  seq           bigint GENERATED ALWAYS AS IDENTITY,
  ts            timestamptz NOT NULL DEFAULT now(),
  level         text NOT NULL,
  service       text NOT NULL,
  signal_json   jsonb,
  http_status   int,
  dry_run       boolean NOT NULL DEFAULT false,
  confirm_token text,
  outcome       text NOT NULL,  -- delivered_200 | gated_baseline | gated_safe_state |
                                -- endpoint_404 | endpoint_disabled | hmac_failed |
                                -- exempt_skip | dry_run_ok | effective | escalated |
                                -- resolved | delivery_error | sms_confirm_denied
  reason        text
);
CREATE INDEX IF NOT EXISTS signals_emitted_signal_id_idx  ON chittyops.signals_emitted (signal_id);
CREATE INDEX IF NOT EXISTS signals_emitted_ts_idx         ON chittyops.signals_emitted (ts DESC);
CREATE INDEX IF NOT EXISTS signals_emitted_signal_seq_idx ON chittyops.signals_emitted (signal_id, seq DESC);

-- Writer gets INSERT+SELECT (append-only). Reader gets SELECT for GET /api/v1/signals.
GRANT SELECT, INSERT ON chittyops.signals_emitted TO comptroller_writer;
GRANT SELECT          ON chittyops.signals_emitted TO comptroller_reader;
