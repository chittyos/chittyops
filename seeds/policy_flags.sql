-- Seed: policy_flags
-- Initial system policy state for daily-comms-triage.
-- Activate / deactivate by updating `active` column with operator audit trail.

INSERT INTO chittyops.policy_flags (flag_name, active, scope_entity, scope_case, activated_at, activated_by, notes) VALUES
    -- ===== System-wide flags =====
    ('PILOT_MODE', true, NULL, NULL, now(), 'system', 'Disables T2/T3 paid tiers during pilot. Clear after pilot exit criteria met.'),
    ('BASELINE_LEARNING', true, NULL, NULL, now(), 'system', 'Comptroller L2/L3 actions disabled for first 14 days; alerts only on hard limit breach.'),

    -- ===== Entity-specific gates =====
    ('TRO_REVIEW_PENDING', true, 'Personal', NULL, now(), 'nick',
     'Sharon Jones promissory note path paused pending TRO review with Rob Alexander. Blocks recommended_action IN (Pay, File) on entity-tagged items.'),
    ('JAVL_PAYROLL_PRECEDES_DISTRIBUTION', true, 'JAVL', NULL, now(), 'system',
     'W-2 payroll required before JAVL distributions. Blocks recommended_action = Pay on entity=JAVL.'),

    -- ===== Case-specific litigation holds (set to false; activate when needed) =====
    ('LITIGATION_HOLD', false, NULL, '2024D007847', NULL, NULL, 'Arias v. Bianchi — toggle to true if discovery is anticipated to require extended retention'),
    ('LITIGATION_HOLD', false, NULL, 'villa_vista_hoa', NULL, NULL, 'Villa Vista HOA — toggle on if needed'),
    ('LITIGATION_HOLD', false, NULL, 'city_studio_hoa', NULL, NULL, 'City Studio HOA — toggle on if needed'),
    ('LITIGATION_HOLD', false, NULL, 'cozy_castle_hoa', NULL, NULL, 'Cozy Castle HOA — toggle on if needed'),

    -- ===== Service-specific (referenced by orchestrator) =====
    ('PRIVILEGED_ROUTING_STRICT', true, NULL, NULL, now(), 'system',
     'Privileged-tagged items NEVER write to actions_v1 with routing=business. RLS enforces; this flag provides defense-in-depth.')
;

-- ===== Pause exemptions for Comptroller L3 =====
INSERT INTO chittyops.pause_exemptions (service_id, exemption_reasons, requires_sms_confirm, updated_at) VALUES
    ('chittycounsel', ARRAY['active_deadline', 'litigation_hold', 'business_critical'], true, now()),
    ('chittybiz', ARRAY['business_critical'], true, now()),
    ('chittyevidence-db', ARRAY['litigation_hold'], true, now()),
    ('orchestrator.chitty.cc', ARRAY['business_critical'], true, now()),
    ('dispatch.chitty.cc', ARRAY['business_critical'], true, now()),
    ('autoassist.chitty.cc', ARRAY['business_critical'], true, now()),
    ('mcp.chitty.cc', ARRAY['business_critical'], true, now()),
    ('id.chitty.cc', ARRAY['business_critical'], true, now()),
    ('registry.chitty.cc', ARRAY['business_critical'], true, now())
;

-- ===== Verification =====
SELECT flag_name, active, scope_entity, scope_case
FROM chittyops.policy_flags
ORDER BY active DESC, flag_name;

SELECT service_id, exemption_reasons
FROM chittyops.pause_exemptions
ORDER BY service_id;
