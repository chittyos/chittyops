-- Migration: 2026_05_actions_v1.sql
-- Target: Neon instance `restless-grass-40598426`
-- Adds: actions_raw, actions_evaluated, actions_v1, actions_receipts, actions_auto_archived, actions_failed,
--       classification_cache, sensitivity_rules, policy_flags, pause_exemptions
-- Plus RLS policies, indexes, helper functions

BEGIN;

-- ===== Extensions =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===== Schemas =====
CREATE SCHEMA IF NOT EXISTS chittyops AUTHORIZATION current_user;

-- ===== actions_raw — every IngestItem =====
CREATE TABLE chittyops.actions_raw (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source                      text NOT NULL,
    account                     text NOT NULL,
    source_id                   text NOT NULL,
    received_at                 timestamptz NOT NULL,
    subject                     text,
    preview                     text,
    raw_ref                     text,
    sensitivity_hint            text,
    pre_evaluated_sensitivity   text,
    entity_prior                text,
    hints                       jsonb,
    ingested_at                 timestamptz NOT NULL DEFAULT now(),
    run_id                      uuid NOT NULL,
    litigation_hold             boolean NOT NULL DEFAULT false,
    retention_policy            text NOT NULL DEFAULT 'standard',
    CONSTRAINT actions_raw_unique UNIQUE (source, account, source_id)
);

CREATE INDEX idx_actions_raw_received_at ON chittyops.actions_raw (received_at DESC);
CREATE INDEX idx_actions_raw_run_id ON chittyops.actions_raw (run_id);
CREATE INDEX idx_actions_raw_account ON chittyops.actions_raw (account);
CREATE INDEX idx_actions_raw_litigation_hold ON chittyops.actions_raw (litigation_hold) WHERE litigation_hold = true;

-- ===== actions_evaluated — dispatch E+N output =====
CREATE TABLE chittyops.actions_evaluated (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_id              uuid NOT NULL REFERENCES chittyops.actions_raw(id) ON DELETE CASCADE,
    sensitivity         text NOT NULL,
    entity              text,
    binding_path        text NOT NULL,
    policy_flags        text[] NOT NULL DEFAULT ARRAY[]::text[],
    evaluated_at        timestamptz NOT NULL DEFAULT now(),
    run_id              uuid NOT NULL
);

CREATE INDEX idx_actions_evaluated_raw_id ON chittyops.actions_evaluated (raw_id);
CREATE INDEX idx_actions_evaluated_sensitivity ON chittyops.actions_evaluated (sensitivity);

-- ===== actions_v1 — canonical ScoredAction =====
CREATE TABLE chittyops.actions_v1 (
    id                          text PRIMARY KEY,
    raw_id                      uuid REFERENCES chittyops.actions_raw(id) ON DELETE SET NULL,
    accounts                    text[] NOT NULL,
    cross_inbox_count           int NOT NULL DEFAULT 1,
    category                    text NOT NULL,
    priority                    int NOT NULL CHECK (priority BETWEEN 1 AND 10),
    priority_modifier           text,
    entity                      text,
    property                    text,
    "case"                      text,
    sensitivity                 text NOT NULL,
    confidence                  numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    tier_used                   text NOT NULL,
    injection_suspected         boolean NOT NULL DEFAULT false,
    recommended_action          text NOT NULL,
    recommended_text            text,
    due                         timestamptz,
    rationale                   text,
    routing                     text NOT NULL CHECK (routing IN ('business','legalink')),
    policy_flags_triggered      text[] NOT NULL DEFAULT ARRAY[]::text[],
    cost_constrained            boolean NOT NULL DEFAULT false,
    auto_archived               boolean NOT NULL DEFAULT false,
    status                      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','snoozed','restored')),
    user_note                   text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_actions_v1_status ON chittyops.actions_v1 (status);
CREATE INDEX idx_actions_v1_priority ON chittyops.actions_v1 (priority DESC, due ASC NULLS LAST);
CREATE INDEX idx_actions_v1_category ON chittyops.actions_v1 (category);
CREATE INDEX idx_actions_v1_routing ON chittyops.actions_v1 (routing);
CREATE INDEX idx_actions_v1_created_at ON chittyops.actions_v1 (created_at DESC);

-- ===== actions_receipts — ChittyDNA attestations =====
CREATE TABLE chittyops.actions_receipts (
    receipt_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id           text NOT NULL REFERENCES chittyops.actions_v1(id) ON DELETE CASCADE,
    pentad_stage        text NOT NULL CHECK (pentad_stage IN ('P+','E','N','T','A')),
    payload_hash        text NOT NULL,
    signature           text NOT NULL,
    signed_at           timestamptz NOT NULL DEFAULT now(),
    signing_key_id      text NOT NULL
);

CREATE INDEX idx_actions_receipts_action_id ON chittyops.actions_receipts (action_id);

-- ===== actions_auto_archived — reversible 30-day =====
CREATE TABLE chittyops.actions_auto_archived (
    id                  text PRIMARY KEY,
    action_data         jsonb NOT NULL,
    archived_at         timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
    category            text NOT NULL,
    sender_domain       text,
    confidence          numeric(4,3) NOT NULL,
    restored            boolean NOT NULL DEFAULT false,
    restored_at         timestamptz
);

CREATE INDEX idx_auto_archived_expires_at ON chittyops.actions_auto_archived (expires_at);
CREATE INDEX idx_auto_archived_category ON chittyops.actions_auto_archived (category);

-- ===== actions_failed — quarantined items =====
CREATE TABLE chittyops.actions_failed (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_id              uuid REFERENCES chittyops.actions_raw(id),
    failure_stage       text NOT NULL,
    failure_reason      text NOT NULL,
    retry_count         int NOT NULL DEFAULT 0,
    last_attempt_at     timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

-- ===== classification_cache — cross-agent shared =====
CREATE TABLE chittyops.classification_cache (
    content_hash        text PRIMARY KEY,
    classification      jsonb NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    hit_count           int NOT NULL DEFAULT 0,
    last_hit_at         timestamptz
);

CREATE INDEX idx_classification_cache_expires_at ON chittyops.classification_cache (expires_at);

-- ===== sensitivity_rules — editable seed =====
CREATE TABLE chittyops.sensitivity_rules (
    rule_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_type           text NOT NULL CHECK (rule_type IN ('sender_domain','subject_keyword','sender_email','content_regex')),
    pattern             text NOT NULL,
    sensitivity_tag     text NOT NULL,
    routing_override    text,
    priority_modifier   int DEFAULT 0,
    active              boolean NOT NULL DEFAULT true,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sensitivity_rules_active ON chittyops.sensitivity_rules (active);
CREATE INDEX idx_sensitivity_rules_type ON chittyops.sensitivity_rules (rule_type);

-- ===== policy_flags — system state =====
CREATE TABLE chittyops.policy_flags (
    flag_name           text PRIMARY KEY,
    active              boolean NOT NULL DEFAULT false,
    scope_entity        text,
    scope_case          text,
    activated_at        timestamptz,
    activated_by        text,
    deactivated_at      timestamptz,
    deactivated_by      text,
    notes               text
);

-- ===== pause_exemptions — for ChittyComptroller L3 =====
CREATE TABLE chittyops.pause_exemptions (
    service_id          text PRIMARY KEY,
    exemption_reasons   text[] NOT NULL,
    requires_sms_confirm boolean NOT NULL DEFAULT true,
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ===== Row-Level Security (F-L5) =====
ALTER TABLE chittyops.actions_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE chittyops.actions_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY actions_v1_business_can_read ON chittyops.actions_v1
    FOR SELECT
    USING (
        routing = 'business' OR current_setting('app.context', true) = 'legalink'
    );

CREATE POLICY actions_v1_legalink_can_write ON chittyops.actions_v1
    FOR INSERT
    WITH CHECK (
        (routing = 'business' AND current_setting('app.context', true) IN ('business','pipeline')) OR
        (routing = 'legalink' AND current_setting('app.context', true) IN ('legalink','pipeline'))
    );

CREATE POLICY actions_receipts_isolated ON chittyops.actions_receipts
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM chittyops.actions_v1 a
            WHERE a.id = actions_receipts.action_id
              AND (a.routing = 'business' OR current_setting('app.context', true) = 'legalink')
        )
    );

-- ===== Retention helpers =====
CREATE OR REPLACE FUNCTION chittyops.apply_retention()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Soft-delete actions_raw at 30 days unless litigation_hold
    UPDATE chittyops.actions_raw
       SET retention_policy = 'soft_deleted'
     WHERE ingested_at < now() - interval '30 days'
       AND litigation_hold = false
       AND retention_policy = 'standard';

    -- Hard-delete actions_raw at 90 days unless litigation_hold
    DELETE FROM chittyops.actions_raw
     WHERE ingested_at < now() - interval '90 days'
       AND litigation_hold = false;

    -- Purge expired auto-archived
    DELETE FROM chittyops.actions_auto_archived
     WHERE expires_at < now()
       AND restored = false;

    -- Purge expired failed
    DELETE FROM chittyops.actions_failed WHERE expires_at < now();

    -- Purge expired cache
    DELETE FROM chittyops.classification_cache WHERE expires_at < now();
END;
$$;

-- Schedule via pg_cron once enabled, or via Cloudflare cron calling this function

-- ===== Triggers =====
CREATE OR REPLACE FUNCTION chittyops.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER set_updated_at_actions_v1
    BEFORE UPDATE ON chittyops.actions_v1
    FOR EACH ROW EXECUTE FUNCTION chittyops.tg_set_updated_at();

CREATE TRIGGER set_updated_at_sensitivity_rules
    BEFORE UPDATE ON chittyops.sensitivity_rules
    FOR EACH ROW EXECUTE FUNCTION chittyops.tg_set_updated_at();

COMMIT;
