-- ChittyOS Evidence Registry Schema (Neon PostgreSQL)
-- Legal-Grade Evidence Management with Chain of Custody
-- Database: chittyos-core
-- Version: 1.0.0
-- Authority: Canonical

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For full-text search

-- =============================================================================
-- ENUMS & CUSTOM TYPES
-- =============================================================================

-- Evidence tier based on Federal Rules of Evidence (FRE) hierarchy
CREATE TYPE evidence_tier AS ENUM (
    'SELF_AUTHENTICATING',        -- FRE 902 (certified records, newspapers, government docs)
    'GOVERNMENT',                  -- FRE 803(8) (public records)
    'FINANCIAL_INSTITUTION',       -- FRE 803(6) (business records - bank)
    'INDEPENDENT_THIRD_PARTY',     -- FRE 803(6) (business records - neutral party)
    'BUSINESS_RECORDS',            -- FRE 803(6) (business records - general)
    'FIRST_PARTY_ADVERSE',         -- FRE 801(d)(2) (admission by party-opponent)
    'FIRST_PARTY_FRIENDLY',        -- FRE 803(5) (recorded recollection)
    'UNCORROBORATED_PERSON'        -- Lowest tier, requires corroboration
);

-- Evidence status workflow
CREATE TYPE evidence_status AS ENUM (
    'PENDING_REVIEW',
    'VERIFIED',
    'ADMITTED',
    'CHALLENGED',
    'EXCLUDED',
    'SEALED'
);

-- Chain of custody event types
CREATE TYPE custody_event_type AS ENUM (
    'INGESTION',
    'TRANSFER',
    'ACCESS',
    'COPY',
    'EXPORT',
    'SEAL',
    'UNSEAL',
    'DESTRUCTION_REQUEST',
    'DESTRUCTION_APPROVED',
    'DESTRUCTION_EXECUTED'
);

-- =============================================================================
-- MAIN EVIDENCE TABLE
-- =============================================================================

CREATE TABLE evidence (
    -- Primary identifiers
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chitty_id TEXT NOT NULL UNIQUE,  -- Minted via ChittyID service

    -- Case reference (assumes cases table exists)
    case_id UUID NOT NULL,  -- REFERENCES cases(id) ON DELETE CASCADE

    -- Thing reference (ChittyLedger integration)
    thing_id UUID NOT NULL,  -- REFERENCES things(id) ON DELETE CASCADE

    -- Legal classification
    evidence_number TEXT,  -- Exhibit number (e.g., "EX-001-A", "DEF-42")
    evidence_tier evidence_tier NOT NULL,
    evidence_weight DECIMAL(3,2) DEFAULT 0.0 CHECK (evidence_weight >= 0.0 AND evidence_weight <= 1.0),
    evidence_status evidence_status DEFAULT 'PENDING_REVIEW',

    -- R2 reference (SOURCE OF TRUTH for artifact)
    r2_bucket TEXT NOT NULL DEFAULT 'chittyevidence-originals',
    r2_key TEXT NOT NULL UNIQUE,  -- Must be unique across all evidence
    r2_cdn_url TEXT,  -- CDN URL for authenticated access

    -- File integrity
    sha256_hash TEXT NOT NULL,  -- Required for all evidence
    file_size BIGINT NOT NULL,
    mime_type TEXT NOT NULL,

    -- Authentication method (FRE compliance)
    authentication_method TEXT CHECK (authentication_method IN (
        'SEAL',                  -- Official seal (government docs)
        'STAMP',                 -- Notary stamp
        'CERTIFICATION',         -- Certification by custodian
        'NOTARIZATION',          -- Notary public verification
        'DIGITAL_SIGNATURE',     -- Cryptographic signature (ChittyCert)
        'METADATA',              -- Metadata verification
        'WITNESS',               -- Witness testimony required
        'CHAIN_OF_CUSTODY',      -- COC verification
        'NONE'                   -- No authentication yet
    )),

    -- Admissibility tracking
    bates_number TEXT,           -- For document production
    production_set TEXT,         -- Which production set this belongs to
    privilege_log_reference TEXT, -- If subject to privilege claim

    -- Timestamps (immutable after creation)
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    verified_at TIMESTAMPTZ,
    admitted_at TIMESTAMPTZ,

    -- Audit (who created/verified)
    created_by UUID,  -- REFERENCES identities(id)
    verified_by UUID, -- REFERENCES identities(id)

    -- Full-text search
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(evidence_number, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(bates_number, '')), 'B')
    ) STORED
);

-- Indexes for performance
CREATE INDEX idx_evidence_case_id ON evidence(case_id);
CREATE INDEX idx_evidence_chitty_id ON evidence(chitty_id);
CREATE INDEX idx_evidence_sha256 ON evidence(sha256_hash);
CREATE INDEX idx_evidence_r2_key ON evidence(r2_key);
CREATE INDEX idx_evidence_status ON evidence(evidence_status);
CREATE INDEX idx_evidence_tier ON evidence(evidence_tier);
CREATE INDEX idx_evidence_created_at ON evidence(created_at);
CREATE INDEX idx_evidence_search_vector ON evidence USING GIN(search_vector);

-- =============================================================================
-- CHAIN OF CUSTODY TABLE (Immutable Audit Trail)
-- =============================================================================

CREATE TABLE evidence_chain_of_custody (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Evidence reference
    evidence_id UUID NOT NULL,  -- REFERENCES evidence(id) ON DELETE CASCADE

    -- Chain of custody ChittyID (for blockchain verification)
    coc_chitty_id TEXT NOT NULL UNIQUE,

    -- Event details
    event_type custody_event_type NOT NULL,
    event_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- Custodian tracking
    from_custodian_id UUID,  -- REFERENCES identities(id)
    to_custodian_id UUID,    -- REFERENCES identities(id)

    -- Transfer method
    transfer_method TEXT CHECK (transfer_method IN (
        'SEALED_ENVELOPE',
        'CERTIFIED_MAIL',
        'SECURE_DIGITAL',
        'COURT_FILING',
        'NOTARY_TRANSFER',
        'DIRECT_HANDOFF',
        'ELECTRONIC_PIPELINE'
    )),

    -- Integrity verification
    integrity_verified BOOLEAN DEFAULT TRUE,
    integrity_check_method TEXT CHECK (integrity_check_method IN (
        'HASH_VERIFICATION',      -- SHA-256 match
        'SEAL_INTACT',            -- Physical seal verification
        'WITNESS_CONFIRMATION',   -- Witness confirmed integrity
        'METADATA_MATCH',         -- Metadata unchanged
        'DIGITAL_SIGNATURE'       -- ChittyCert signature valid
    )),

    -- Location and environment
    location TEXT,
    ip_address INET,
    user_agent TEXT,

    -- Notes (optional)
    notes TEXT,

    -- Blockchain integration
    chittychain_tx_id TEXT,
    drand_round BIGINT,

    -- Immutable (no updates allowed after insert)
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes
CREATE INDEX idx_coc_evidence_id ON evidence_chain_of_custody(evidence_id);
CREATE INDEX idx_coc_event_type ON evidence_chain_of_custody(event_type);
CREATE INDEX idx_coc_timestamp ON evidence_chain_of_custody(event_timestamp);
CREATE INDEX idx_coc_chitty_id ON evidence_chain_of_custody(coc_chitty_id);
CREATE INDEX idx_coc_from_custodian ON evidence_chain_of_custody(from_custodian_id);
CREATE INDEX idx_coc_to_custodian ON evidence_chain_of_custody(to_custodian_id);

-- =============================================================================
-- EVIDENCE ACCESS LOG (Who Accessed What When)
-- =============================================================================

CREATE TABLE evidence_access_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Evidence reference
    evidence_id UUID NOT NULL,  -- REFERENCES evidence(id) ON DELETE CASCADE

    -- Access details
    accessed_by UUID NOT NULL,  -- REFERENCES identities(id)
    accessed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- Access type
    access_type TEXT CHECK (access_type IN (
        'VIEW',
        'DOWNLOAD',
        'QUERY',
        'SEARCH',
        'EXPORT',
        'PRINT'
    )) NOT NULL,

    -- Context
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,

    -- AutoRAG query context (if applicable)
    query_text TEXT,
    query_chitty_id TEXT,

    -- Audit trail (immutable)
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes
CREATE INDEX idx_access_log_evidence_id ON evidence_access_log(evidence_id);
CREATE INDEX idx_access_log_accessed_by ON evidence_access_log(accessed_by);
CREATE INDEX idx_access_log_accessed_at ON evidence_access_log(accessed_at);
CREATE INDEX idx_access_log_access_type ON evidence_access_log(access_type);

-- =============================================================================
-- EVIDENCE RELATIONSHIPS (Contradictions, Supports, Supersedes)
-- =============================================================================

CREATE TABLE evidence_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Evidence references
    evidence_id UUID NOT NULL,  -- REFERENCES evidence(id) ON DELETE CASCADE
    related_evidence_id UUID NOT NULL,  -- REFERENCES evidence(id) ON DELETE CASCADE

    -- Relationship type
    relationship_type TEXT CHECK (relationship_type IN (
        'CONTRADICTS',
        'SUPPORTS',
        'SUPERSEDES',
        'SUPPLEMENTS',
        'DUPLICATES',
        'REDACTS'
    )) NOT NULL,

    -- Legal significance
    significance_score DECIMAL(3,2) CHECK (significance_score BETWEEN 0.0 AND 1.0),

    -- Resolution (for contradictions)
    resolved BOOLEAN DEFAULT FALSE,
    resolution_method TEXT,
    resolution_notes TEXT,

    -- Timestamps
    identified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,

    -- Audit
    identified_by UUID,  -- REFERENCES identities(id)
    resolved_by UUID,    -- REFERENCES identities(id)

    UNIQUE(evidence_id, related_evidence_id, relationship_type)
);

-- Indexes
CREATE INDEX idx_evidence_rel_evidence_id ON evidence_relationships(evidence_id);
CREATE INDEX idx_evidence_rel_related_id ON evidence_relationships(related_evidence_id);
CREATE INDEX idx_evidence_rel_type ON evidence_relationships(relationship_type);

-- =============================================================================
-- EVIDENCE PIPELINE TRACKING (Ingestion State)
-- =============================================================================

CREATE TABLE evidence_ingestion_pipeline (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Pipeline execution
    pipeline_id TEXT NOT NULL UNIQUE,
    evidence_id UUID,  -- REFERENCES evidence(id) ON DELETE SET NULL

    -- Pipeline stages
    stage TEXT CHECK (stage IN (
        'UPLOAD',
        'VIRUS_SCAN',
        'HASH_COMPUTE',
        'R2_STORE',
        'METADATA_EXTRACT',
        'NEON_REGISTER',
        'VECTORIZE',
        'COC_EVENT',
        'COMPLETE',
        'FAILED'
    )) NOT NULL,

    -- Status
    status TEXT CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')) NOT NULL,

    -- Timing
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,

    -- Error tracking
    error_message TEXT,
    error_stack TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_pipeline_evidence_id ON evidence_ingestion_pipeline(evidence_id);
CREATE INDEX idx_pipeline_status ON evidence_ingestion_pipeline(status);
CREATE INDEX idx_pipeline_stage ON evidence_ingestion_pipeline(stage);
CREATE INDEX idx_pipeline_started_at ON evidence_ingestion_pipeline(started_at);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Function: Calculate evidence weight based on tier and authentication
CREATE OR REPLACE FUNCTION calculate_evidence_weight(tier evidence_tier, auth_method TEXT)
RETURNS DECIMAL(3,2) AS $$
BEGIN
    CASE tier
        WHEN 'SELF_AUTHENTICATING' THEN RETURN 1.0;
        WHEN 'GOVERNMENT' THEN RETURN 0.95;
        WHEN 'FINANCIAL_INSTITUTION' THEN RETURN 0.90;
        WHEN 'INDEPENDENT_THIRD_PARTY' THEN RETURN 0.85;
        WHEN 'BUSINESS_RECORDS' THEN RETURN 0.80;
        WHEN 'FIRST_PARTY_ADVERSE' THEN RETURN 0.75;
        WHEN 'FIRST_PARTY_FRIENDLY' THEN RETURN 0.60;
        WHEN 'UNCORROBORATED_PERSON' THEN RETURN 0.40;
        ELSE RETURN 0.50;
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger: Auto-calculate evidence weight on insert/update
CREATE OR REPLACE FUNCTION update_evidence_weight_trigger()
RETURNS TRIGGER AS $$
BEGIN
    NEW.evidence_weight := calculate_evidence_weight(NEW.evidence_tier, NEW.authentication_method);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evidence_weight_auto_calculate
    BEFORE INSERT OR UPDATE OF evidence_tier, authentication_method ON evidence
    FOR EACH ROW
    EXECUTE FUNCTION update_evidence_weight_trigger();

-- =============================================================================
-- VIEWS
-- =============================================================================

-- View: Evidence review queue (pending review, sorted by weight)
CREATE VIEW evidence_review_queue AS
SELECT
    e.id,
    e.chitty_id,
    e.evidence_number,
    e.case_id,
    e.evidence_tier,
    e.evidence_weight,
    e.created_at,
    e.file_size,
    e.mime_type,
    e.r2_cdn_url
FROM evidence e
WHERE e.evidence_status = 'PENDING_REVIEW'
ORDER BY e.evidence_weight DESC, e.created_at ASC;

-- View: Chain of custody summary per evidence
CREATE VIEW evidence_custody_summary AS
SELECT
    e.id AS evidence_id,
    e.chitty_id,
    e.evidence_number,
    COUNT(coc.id) AS custody_events,
    MIN(coc.event_timestamp) AS first_custody_event,
    MAX(coc.event_timestamp) AS last_custody_event,
    bool_and(coc.integrity_verified) AS all_integrity_verified
FROM evidence e
LEFT JOIN evidence_chain_of_custody coc ON e.id = coc.evidence_id
GROUP BY e.id, e.chitty_id, e.evidence_number;

-- View: Evidence access summary
CREATE VIEW evidence_access_summary AS
SELECT
    e.id AS evidence_id,
    e.chitty_id,
    COUNT(DISTINCT eal.accessed_by) AS unique_accessors,
    COUNT(eal.id) AS total_accesses,
    MIN(eal.accessed_at) AS first_access,
    MAX(eal.accessed_at) AS last_access
FROM evidence e
LEFT JOIN evidence_access_log eal ON e.id = eal.evidence_id
GROUP BY e.id, e.chitty_id;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE evidence IS 'Legal-grade evidence registry with R2 source of truth references';
COMMENT ON COLUMN evidence.r2_key IS 'Authoritative R2 object key - source of truth for artifact';
COMMENT ON COLUMN evidence.sha256_hash IS 'SHA-256 hash for integrity verification - must match R2 object metadata';
COMMENT ON TABLE evidence_chain_of_custody IS 'Immutable audit trail of evidence custody events';
COMMENT ON TABLE evidence_access_log IS 'Immutable log of all evidence access events for legal compliance';

-- =============================================================================
-- GRANTS (Example - adjust based on your role structure)
-- =============================================================================

-- Grant read-only access to evidence_viewer role (example)
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO evidence_viewer;

-- Grant full access to evidence_admin role (example)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO evidence_admin;

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================

-- Version: 1.0.0
-- Last Updated: 2025-12-15
-- Authority: ChittyOS Core Team
-- Status: Canonical
