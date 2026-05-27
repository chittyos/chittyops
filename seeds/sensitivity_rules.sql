-- Seed: sensitivity_rules
-- Initial classification rules for daily-comms-triage P+ stage.
-- Editable in Neon via the chittyops admin UI; this is just the starting set.

INSERT INTO chittyops.sensitivity_rules (rule_type, pattern, sensitivity_tag, routing_override, priority_modifier, notes) VALUES
    -- ===== Privileged: attorney/legal counsel =====
    ('sender_domain', 'vanguardadvocates.com', 'privileged', 'legalink', 0, 'Rob Alexander — domestic relations counsel'),
    ('sender_domain', 'bertonring.com', 'privileged', 'legalink', 0, 'Berton Ring — HOA eviction defense'),
    ('sender_domain', 'ksnlaw.com', 'privileged', 'legalink', 0, 'KSN — opposing counsel HOA cases'),
    ('subject_keyword', 'attorney-client', 'privileged', 'legalink', 0, 'Self-flagged privilege'),
    ('subject_keyword', 'privileged', 'privileged', 'legalink', 0, 'Self-flagged privilege'),
    ('subject_keyword', 'attorney work product', 'privileged', 'legalink', 0, 'Self-flagged WP'),
    ('subject_keyword', 'confidential', 'privileged', 'legalink', 0, 'Often privilege-adjacent'),

    -- ===== Privileged: Colombian counsel =====
    ('sender_domain', 'guzman-orrego.com.co', 'privileged', 'legalink', 0, 'Dr. Andrés David Guzmán Orrego — ARIBIA v. Arias Colombia'),

    -- ===== HOA evidentiary =====
    ('subject_keyword', 'settlement agreement', 'hoa_evidentiary', NULL, 1, 'Settlement docs — track for HOA cases'),
    ('subject_keyword', 'lien release', 'hoa_evidentiary', NULL, 1, 'Lien-release tied to settlement'),

    -- ===== PII: financial =====
    ('sender_domain', 'mercury.com', 'pii', NULL, 0, 'Banking — financial PII'),
    ('sender_domain', 'mercurybank.com', 'pii', NULL, 0, 'Banking — financial PII'),
    ('sender_domain', 'cash.app', 'pii', NULL, 0, 'Cash App transactions'),
    ('sender_domain', 'stripe.com', 'pii', NULL, 0, 'Stripe receipts'),
    ('sender_domain', 'plaid.com', 'pii', NULL, 0, 'Plaid bank linking'),

    -- ===== Regulatory: government =====
    ('content_regex', '\.gov$', 'public', NULL, 2, 'Government correspondence — bump priority'),
    ('sender_domain', 'irs.gov', 'pii', NULL, 3, 'IRS — highest urgency, PII'),
    ('sender_domain', 'illinoiscourts.gov', 'public', NULL, 3, 'Cook County court notifications'),
    ('sender_domain', 'cookcountyclerkofcourt.org', 'public', NULL, 3, 'Cook County court notifications'),
    ('sender_domain', 'dhs.illinois.gov', 'pii', NULL, 2, 'Illinois DHS / ABE benefits'),

    -- ===== Noise: newsletters, receipts =====
    ('subject_keyword', 'unsubscribe', 'public', NULL, -3, 'Likely newsletter'),
    ('subject_keyword', 'newsletter', 'public', NULL, -3, 'Likely newsletter'),
    ('content_regex', '^noreply@', 'public', NULL, -2, 'No-reply addresses are typically transactional'),
    ('content_regex', '^no-reply@', 'public', NULL, -2, 'No-reply addresses are typically transactional'),
    ('subject_keyword', 'receipt for', 'public', NULL, -2, 'Receipt — file but low priority'),
    ('subject_keyword', 'your order', 'public', NULL, -2, 'E-commerce order confirmation'),

    -- ===== Property ops =====
    ('subject_keyword', 'maintenance request', 'public', NULL, 2, 'Property maintenance — tenant-facing'),
    ('subject_keyword', 'rent payment', 'public', NULL, 2, 'Rent collection'),
    ('subject_keyword', 'lease', 'public', NULL, 1, 'Lease activity'),

    -- ===== ChittyOS infra =====
    ('sender_domain', 'cloudflare.com', 'public', NULL, 1, 'CF alerts/billing'),
    ('sender_domain', 'neon.tech', 'public', NULL, 1, 'Neon DB notifications'),
    ('sender_domain', 'anthropic.com', 'public', NULL, 0, 'Anthropic notifications'),

    -- ===== Personal services (non-business) =====
    ('subject_keyword', 'birthday', 'public', NULL, -1, 'Personal — social'),
    ('content_regex', 'venmo\.com', 'public', NULL, -1, 'Venmo — personal payments')
;

-- ===== Verification =====
SELECT count(*) AS rule_count, rule_type, sensitivity_tag
FROM chittyops.sensitivity_rules
WHERE active = true
GROUP BY rule_type, sensitivity_tag
ORDER BY rule_type, sensitivity_tag;
