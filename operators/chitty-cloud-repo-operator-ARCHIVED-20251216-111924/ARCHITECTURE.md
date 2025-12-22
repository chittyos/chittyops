# ChittyOS Evidence-Centric Architecture
## Formal Data Flow Diagram & System Design

**Version:** 1.0.0
**Status:** Canonical
**Authority:** Non-Negotiable Invariants
**Purpose:** Legal-grade evidence pipeline with provable boundaries

---

## Executive Summary

ChittyOS operates as a **distributed, evidence-centric operating system** built on Cloudflare's edge infrastructure. This architecture enforces strict role boundaries to ensure legal defensibility, auditability, and institutional trust.

**Core Principle:** Every component has ONE authoritative role. No exceptions.

---

## Architectural Invariants (Enforced)

### 1. R2 = Source of Truth (Immutable Where Required)
- **Only** authoritative store for evidence, legal artifacts, emails, case files, agent transcripts
- Append-only for evidence buckets
- Hash every object on ingress (SHA-256)
- Never mutate without new object + pointer

### 2. Workers KV = Ephemeral, Derived, or Indexable State
- Routing state, rate limits, session pointers, R2 metadata cache, agent execution state
- **Nothing in KV is legally meaningful**
- Everything must be reconstructible from R2 or deterministic logic
- TTL required where possible
- Namespace purpose must be explicit

### 3. Vectorize = Semantic Index, Not Storage
- Represents meaning, never replaces source documents
- Must reference R2 object IDs + hashes
- One index = one semantic purpose
- Rebuildable at any time from R2

### 4. Pipelines = Evidence-Safe Transformers (Mandatory Ingestion Layer)
- Normalize documents, chunk text, generate embeddings, attach provenance metadata
- Emit both R2 artifacts and Vectorize inserts
- **No direct R2 → Vectorize writes outside Pipelines**
- Pipelines are auditable and versioned

### 5. AutoRAG = Read-Only Retrieval Fabric
- Never writes, never mutates, never reasons about authority
- Only retrieves from Vectorize + R2
- Treated as deterministic retrieval module

### 6. Workers = Agent Runtime + Policy Enforcement
- Enforce read/write rules, gate agent permissions
- Validate evidence access, log all agent actions to R2
- "Where law meets code"

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ EVIDENCE INGESTION FLOW (Cloudflare Pipeline - ONLY Path to R2)            │
└─────────────────────────────────────────────────────────────────────────────┘

[Attorney Upload]                  [API Import]              [Email Routing]
      │                                  │                          │
      └──────────────┬───────────────────┴──────────────────────────┘
                     ▼
        ┌────────────────────────────┐
        │ Worker: Upload Endpoint    │ ◄── JWT Auth (ChittyAuth)
        │ POST /api/evidence/upload  │ ◄── ChittyID verification
        │                            │ ◄── Rate limiting (KV: 24h TTL)
        │ ENFORCEMENT POINT 1:       │
        │ - Validate JWT             │
        │ - Check file size (<100MB) │
        │ - Virus scan (Workers AI)  │
        │ - Compute SHA256           │
        │ - NO R2 BINDING            │
        └────────────┬───────────────┘
                     │
                     │ ✅ ONLY PATH: Queue Pipeline
                     │ ❌ FORBIDDEN: Direct R2 write
                     ▼
        ┌────────────────────────────────────────────────────────────┐
        │ CLOUDFLARE PIPELINE: Evidence Ingestion                    │
        │ Source: Queue (from upload worker)                         │
        │ ENFORCEMENT POINT 2: NO direct R2 writes allowed from      │
        │ workers - ONLY pipelines can write to R2                   │
        └────────────────────────────────────────────────────────────┘
                     │
        ┌────────────▼─────────────┐
        │ Transform Step 1:        │
        │ Metadata Extraction      │
        │ - PDF text extraction    │
        │ - EXIF data (images)     │
        │ - Document type detect   │
        │ - Legal tier assignment  │
        │   (FRE hierarchy)        │
        └────────────┬─────────────┘
                     │
        ┌────────────▼─────────────┐
        │ Transform Step 2:        │
        │ Security & Integrity     │
        │ - Verify hash integrity  │
        │ - Re-scan for malware    │
        │ - Generate thumbnail     │
        │ - Create R2 key:         │
        │   evidence/{case_id}/    │
        │   {chitty_id}/{hash}/    │
        │   {filename}             │
        └────────────┬─────────────┘
                     │
        ┌────────────▼─────────────┐
        │ Transform Step 3:        │
        │ Chain of Custody Event   │
        │ - Mint ChittyID (if new) │
        │ - Create COC record      │
        │ - Sign with ChittyCert   │
        │ - Timestamp (drand)      │
        └────────────┬─────────────┘
                     │
                     ├──────────────────────┬──────────────────────┬────────────────┐
                     ▼                      ▼                      ▼                ▼
        ┌─────────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐
        │ Sink 1: R2          │  │ Sink 2: Neon     │  │ Sink 3: D1       │  │ Sink 4:      │
        │ EVIDENCE_ORIGINALS  │  │ Metadata Index   │  │ Vector Registry  │  │ Analytics    │
        │ ─────────────────── │  │ (chittyos-core)  │  │ (local worker)   │  │ Engine       │
        │ SOURCE OF TRUTH ✓   │  │                  │  │                  │  │              │
        │                     │  │ INSERT INTO      │  │ INSERT INTO      │  │ DATASET:     │
        │ - Original file     │  │ evidence (       │  │ vector_indexes ( │  │ INGEST       │
        │ - customMetadata:   │  │   id,            │  │   evidence_id,   │  │              │
        │   * evidence_id     │  │   case_id,       │  │   r2_key,        │  │ FIELDS:      │
        │   * case_id         │  │   thing_id,      │  │   indexed_at,    │  │ - event_id   │
        │   * sha256_hash     │  │   r2_key,        │  │   doc_count,     │  │ - case_id    │
        │   * ingested_at     │  │   sha256_hash,   │  │   model_version  │  │ - tier       │
        │   * custodian_id    │  │   tier,          │  │ )                │  │ - file_size  │
        │   * tier            │  │   created_at,    │  │                  │  │ - duration   │
        │   * coc_chitty_id   │  │   coc_chain_id   │  │                  │  │              │
        │                     │  │ )                │  │                  │  │              │
        │ - Immutable ✓       │  │                  │  │                  │  │              │
        │ - Hashed ✓          │  │ INSERT INTO      │  │                  │  │              │
        │ - Append-only ✓     │  │ evidence_chain_  │  │                  │  │              │
        │                     │  │ of_custody (     │  │                  │  │              │
        └─────────┬───────────┘  │   evidence_id,   │  └──────────────────┘  └──────────────┘
                  │              │   coc_chitty_id, │
                  │              │   event_type,    │
                  │              │   to_custodian_id│
                  │              │ )                │
                  │              └──────────┬───────┘
                  │                         │
                  │              ┌──────────▼───────┐
                  │              │ INSERT INTO      │
                  │              │ evidence_access_ │
                  │              │ log (initial)    │
                  │              └──────────────────┘
                  │
                  │ R2 Event Notification (object.create)
                  ▼
        ┌────────────────────────────────────────────────────────────┐
        │ CLOUDFLARE PIPELINE: Vectorization (Async)                 │
        │ Source: R2 Event Notifications (object.create)             │
        │ ENFORCEMENT POINT 3: Read-only R2, Write-only Vectorize    │
        └────────────────────────────────────────────────────────────┘
                  │
        ┌─────────▼────────────┐
        │ Transform:           │
        │ Document Processing  │
        │ - Fetch from R2 ✓    │
        │ - Chunk (512 tokens) │
        │ - Generate embeddings│
        │   (@cf/baai/bge-base)│
        │ - Attach metadata:   │
        │   * r2_key (ref) ✓   │
        │   * evidence_id ✓    │
        │   * chunk_index      │
        │   * NEVER full text ✓│
        └─────────┬────────────┘
                  │
        ┌─────────▼────────────┐
        │ Sink: Vectorize      │
        │ Index: evidence-docs │
        │ ──────────────────── │
        │ SEMANTIC INDEX ONLY ✓│
        │                      │
        │ - vectors (768-dim)  │
        │ - metadata {         │
        │    r2_key,           │
        │    evidence_id,      │
        │    chunk_idx         │
        │   }                  │
        │ - NO source content ✓│
        │                      │
        │ Rebuildable from R2 ✓│
        └──────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ EVIDENCE QUERY FLOW (AutoRAG - Read-Only)                                  │
└─────────────────────────────────────────────────────────────────────────────┘

[Attorney Query: "Find all bank statements for Case #2024-123"]
      │
      ▼
┌─────────────────────┐
│ Worker: AutoRAG     │ ◄── JWT Auth ✓
│ POST /api/query     │ ◄── Read-only bindings ✓
│                     │ ◄── Rate limit (KV: 1hr) ✓
│ ENFORCEMENT POINT 4:│
│ - Validate access   │
│ - Check permissions │
│ - NO write bindings │
└─────────┬───────────┘
          │
          │ Query Vectorize (similarity search)
          ▼
┌──────────────────────┐
│ Vectorize.query()    │
│ - Similarity search  │
│ - Return metadata:   │
│   {r2_key, ev_id}    │
│ - NO vector writes ✓ │
└─────────┬────────────┘
          │
          │ Retrieve R2 keys from metadata
          ▼
┌──────────────────────┐
│ R2.get(key)          │
│ - Fetch originals ✓  │
│ - Read-only access ✓ │
│ - Log access (Neon) ✓│
└─────────┬────────────┘
          │
          ▼
┌──────────────────────┐
│ INSERT INTO          │
│ evidence_access_log  │
│ (evidence_id,        │
│  accessed_by,        │
│  accessed_at,        │
│  ip_address,         │
│  action: 'QUERY')    │
└──────────────────────┘
          │
          ▼
┌──────────────────────┐
│ Analytics Engine     │
│ DATASET: QUERY       │
│ - query_text         │
│ - results_count      │
│ - user_id            │
│ - duration_ms        │
└──────────────────────┘
          │
          ▼
[Return results: {evidence_id, filename, r2_url, tier, snippet}]

┌─────────────────────────────────────────────────────────────────────────────┐
│ ENFORCEMENT POINTS (Worker Middleware at Every Boundary)                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│ Worker 1: Upload      → Can QUEUE pipeline only (no R2 write)    │
│ Worker 2: AutoRAG     → Can READ R2 only (no write binding)      │
│ Worker 3: Admin       → Can READ metadata only (no R2 write)     │
│ Pipeline 1: Ingestion → Can WRITE R2, Neon, D1 (controlled)      │
│ Pipeline 2: Vectorize → Can READ R2, WRITE Vectorize only        │
│                                                                   │
│ ALL operations logged to Analytics Engine + Neon audit table     │
└───────────────────────────────────────────────────────────────────┘
```

---

## Role Boundaries (Authority Matrix)

| Component | Authoritative For | Can Read | Can Write | Reconstructible From |
|-----------|------------------|----------|-----------|---------------------|
| **R2** | Evidence artifacts, emails, documents | All | Pipelines only | N/A (source) |
| **Vectorize** | Semantic indexes | AutoRAG, Pipelines | Pipelines only | R2 + Pipeline |
| **Neon PostgreSQL** | Metadata, COC, relationships | Workers, Pipelines | Pipelines, Workers (metadata only) | R2 references |
| **D1** | Operational metadata, registries | Workers | Workers, Pipelines | Neon, R2 |
| **Workers KV** | Nothing (ephemeral) | Workers | Workers (TTL required) | R2, deterministic logic |
| **Analytics Engine** | Nothing (metrics) | Workers (query API) | Workers, Pipelines | R2 (raw events) |
| **Workers** | Policy enforcement | All (as authorized) | KV, Queues only | N/A (stateless) |
| **Pipelines** | Transformation logic | R2, Neon, D1 | R2, Vectorize, Neon, D1, Analytics | Pipeline config |

---

## Audit Trail Flows

Every operation in ChittyOS generates audit events:

### Evidence Ingestion Audit
```
Upload → Pipeline → [R2 Write, Neon Insert, Analytics Event]
                 → Chain of Custody Event (ChittyCert signed)
                 → drand Timestamp (cryptographic proof)
```

### Evidence Access Audit
```
Query → AutoRAG → Vectorize → R2 → [Neon Access Log, Analytics Event]
                            → IP Address, User Agent, Query Text logged
```

### Evidence Modification Audit (Prohibited)
```
Mutation Attempt → Worker → StorageGuard.validateR2Operation()
                         → DENY + Alert + Audit Log
```

---

## Legal Defensibility Features

### 1. Immutability Guarantees
- R2 evidence buckets configured with append-only policies
- Object deletions denied via IAM
- All writes include SHA-256 hash in metadata
- Hash verification on every retrieval

### 2. Chain of Custody Tracking
- Every evidence item has unique ChittyID
- Every custody event signed by ChittyCert
- Timestamps from drand (verifiable randomness beacon)
- Complete event history in `evidence_chain_of_custody` table

### 3. Access Logging
- Every read logged to `evidence_access_log`
- Includes: WHO (ChittyID), WHAT (evidence_id), WHEN (timestamp), WHY (query text), WHERE (IP address)
- Immutable audit trail
- Real-time analytics via Analytics Engine

### 4. Source Attribution
- Every artifact includes original source platform
- Metadata tracks: uploaded_by, client_ip, user_agent
- Email routing preserves original headers
- API imports include source attribution

---

## Guardrail Enforcement Layers

### Layer 1: IAM Policies (Cloudflare Account Level)
- Workers: Deny R2 write operations
- Pipelines: Allow R2 write with conditions (hash metadata required)
- AutoRAG: Read-only access to Vectorize

### Layer 2: Wrangler Bindings (Configuration)
- Upload worker: NO R2 binding (cannot write)
- AutoRAG worker: R2 binding without put() method
- Pipeline: Full R2 access with audit logging

### Layer 3: Runtime Middleware (TypeScript)
```typescript
StorageGuard.validateR2Operation('put', 'upload-worker', env)
// Throws SecurityViolation if unauthorized
```

### Layer 4: Type Guards (Compile-Time)
```typescript
function isReadOnlyR2Binding(bucket: R2Bucket): boolean {
  if (typeof bucket.put === 'function') {
    console.error('SECURITY: R2 bucket has write capability');
    return false;
  }
  return true;
}
```

### Layer 5: Audit Logging (All Operations)
- All storage operations logged to Analytics Engine
- All R2 operations logged to Neon `storage_audit_log`
- Violations trigger Slack alerts

---

## Reconstruction Procedures

### Scenario: Vectorize Index Corruption
**Impact:** Semantic search temporarily degraded
**Recovery:**
1. Query R2 for all evidence objects in affected bucket
2. Re-run vectorization pipeline on each object
3. Rebuild index from scratch using R2 source documents
4. Verify index completeness against D1 registry

**RTO:** < 2 hours (parallelized pipeline)
**RPO:** 0 (no data loss, R2 is source of truth)

### Scenario: Neon Database Failure
**Impact:** Metadata queries unavailable
**Recovery:**
1. Restore Neon from automated backup
2. Replay missing transactions from R2 object metadata
3. Verify COC chain integrity
4. Rebuild KV caches from restored Neon

**RTO:** < 30 minutes (Neon automated restore)
**RPO:** < 5 minutes (R2 metadata provides ground truth)

### Scenario: KV Namespace Deleted
**Impact:** Rate limiting and caching temporarily degraded
**Recovery:**
1. Rate limits reset (temporarily allow all traffic)
2. Session cache rebuilt from R2 session archives
3. Query cache rebuilt on first miss
4. Pipeline state rebuilt from Neon table

**RTO:** < 5 minutes (all data is reconstructible)
**RPO:** 0 (no permanent data loss)

---

## Performance Characteristics

### Ingestion Latency
- Upload to R2: ~500ms (p95)
- Pipeline processing: ~2-5s (includes security scan, metadata extraction)
- Vectorization: ~10-30s (async, does not block ingestion)
- Total user-visible latency: ~3s (accepted, queued for pipeline)

### Query Latency
- Vectorize similarity search: ~50-100ms (p95)
- R2 object retrieval: ~100-200ms (p95)
- Metadata lookup (Neon): ~20-50ms (p95)
- Total query latency: ~200-400ms (p95)

### Throughput
- Concurrent uploads: 1000/s (limited by rate limiting, not infrastructure)
- Concurrent queries: 10,000/s (global edge network)
- Pipeline processing: 100 evidence items/s (parallelized)

---

## Security Boundaries

### Worker Isolation
- Each worker has dedicated namespace
- No cross-worker memory access
- Binding permissions enforced at deployment

### Pipeline Isolation
- Pipelines run in isolated execution contexts
- Source → Transform → Sink boundaries enforced
- Dead letter queues for failed messages

### Data Plane Isolation
- Evidence buckets separated by case_id
- Metadata filtered by user permissions in Neon
- Vectorize indexes scoped to legal domain

---

## Compliance & Standards

### Federal Rules of Evidence (FRE)
- Evidence tier classification based on FRE hierarchy
- Authentication methods mapped to FRE 902 (self-authenticating)
- Chain of custody satisfies FRE 901 (authentication requirements)

### ISO 27001
- Access controls via JWT + ChittyAuth
- Audit logging of all evidence access
- Encryption at rest (R2 AES-256)
- Encryption in transit (TLS 1.3)

### NIST Cybersecurity Framework
- Identify: Asset registry in D1
- Protect: IAM policies + middleware guards
- Detect: Analytics Engine + audit logs
- Respond: Slack alerts + incident workflow
- Recover: Reconstruction procedures documented

---

## Future Enhancements

### Planned (Q1 2026)
- [ ] Multi-region R2 replication for evidence
- [ ] Enhanced vectorization with document layout understanding
- [ ] Real-time COC verification via ChittyChain
- [ ] ML-based legal tier classification

### Under Consideration
- [ ] Zero-knowledge proofs for evidence existence without disclosure
- [ ] Homomorphic encryption for computation on encrypted evidence
- [ ] Federated learning for legal pattern detection

---

## References

- **Invariants Source:** `/operators/chitty-cloud-repo-operator/STORAGE_AUTHORITY.md`
- **KV Policy:** `/operators/chitty-cloud-repo-operator/KV_NAMESPACE_POLICY.md`
- **Pipeline Templates:** `/operators/chitty-cloud-repo-operator/pipelines/`
- **Worker Examples:** `/operators/chitty-cloud-repo-operator/workers/`
- **IAM Policies:** `/operators/chitty-cloud-repo-operator/iam-policies/cloudflare-iam.json`

---

**Status:** Canonical Architecture
**Last Updated:** 2025-12-15
**Authority:** ChittyOS Core Team
**Distribution:** Internal + Legal Counsel
