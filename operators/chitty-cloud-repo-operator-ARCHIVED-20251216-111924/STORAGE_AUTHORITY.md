# ChittyOS Storage Authority Matrix
## Definitive Classification of All Data Types

**Version:** 1.0.0
**Status:** Canonical
**Authority:** Non-Negotiable
**Purpose:** Quick reference for storage authority decisions

---

## Quick Decision Tree

```
Is this legally admissible evidence? → R2 (immutable)
Is this a semantic index? → Vectorize (references R2)
Is this queryable metadata? → Neon (references R2)
Is this operational state? → D1 (reconstructible)
Is this ephemeral cache? → KV (TTL required)
Is this metrics/analytics? → Analytics Engine (→ R2 archive)
Is this a transformation? → Pipeline (auditable)
Is this policy enforcement? → Worker (stateless)
```

---

## Comprehensive Authority Matrix

| Data Type | Authoritative Store | Ephemeral Cache | Semantic Index | Reconstruction Source | TTL | Legal Significance |
|-----------|-------------------|-----------------|----------------|----------------------|-----|-------------------|
| **Evidence Artifacts** | R2 | - | - | N/A (permanent) | None | HIGH |
| **Legal Documents (PDFs)** | R2 | - | Vectorize | N/A (permanent) | None | HIGH |
| **Emails (evidence)** | R2 | - | Vectorize | N/A (permanent) | None | HIGH |
| **Bank Statements** | R2 | - | Vectorize | N/A (permanent) | None | HIGH |
| **Corporate Documents** | R2 | - | Vectorize | N/A (permanent) | None | HIGH |
| **Communications** | R2 | - | Vectorize | N/A (permanent) | None | HIGH |
| **Agent Transcripts (final)** | R2 | KV (24h) | - | N/A (permanent) | None (R2) | MEDIUM |
| **Vector Embeddings** | - | - | Vectorize | R2 + pipeline | None | NONE |
| **Case Metadata** | Neon | KV (1h) | - | Neon (authoritative) | 1h (KV) | MEDIUM |
| **Evidence Chain of Custody** | Neon | - | - | N/A (immutable) | None | HIGH |
| **Evidence Access Logs** | Neon | - | - | N/A (immutable) | None | HIGH |
| **Trust Scores** | Neon | KV (1h) | - | Neon | 1h (KV) | MEDIUM |
| **ChittyIDs** | Neon | KV (24h) | - | ChittyID service | 24h (KV) | MEDIUM |
| **Session State** | R2 (archive) | KV (24h) | - | R2 archive | 24h (KV) | LOW |
| **Project Context** | R2 (archive) | KV (24h) | - | R2 archive | 24h (KV) | LOW |
| **Cross-Platform Sync Events** | R2 (archive) | KV (24h) | - | R2 archive | 24h (KV) | LOW |
| **Rate Limits** | - | KV (1h) | - | Deterministic | 1h | NONE |
| **API Response Cache** | - | KV (30m) | - | Origin API | 30m | NONE |
| **Subscription Data** | D1 | KV (1h) | - | D1 | 1h (KV) | MEDIUM |
| **Usage Quotas** | D1 | KV (1h) | - | D1 | 1h (KV) | MEDIUM |
| **Agent Execution State (temp)** | R2 (final) | KV (temp) | - | R2 transcript | 1h (KV) | LOW |
| **Analytics Events (real-time)** | R2 (archive) | Analytics Engine | - | R2 raw events | Archive | LOW |
| **Performance Metrics** | R2 (archive) | Analytics Engine | - | R2 raw events | Archive | NONE |
| **Security Audit Events** | Neon + R2 | Analytics Engine | - | Neon + R2 | Archive | HIGH |
| **Vector Index Registry** | D1 | - | - | R2 config | None | MEDIUM |
| **Pipeline State** | Neon | KV (1h) | - | Neon pipeline table | 1h (KV) | MEDIUM |
| **Worker Bindings Config** | Wrangler.toml | - | - | Git repository | None | HIGH |
| **IAM Policies** | Cloudflare Account | - | - | Config repository | None | HIGH |

---

## Storage Primitive Definitions

### R2 (Object Storage)
**Authority:** Source of truth for all artifacts and evidence
**Characteristics:**
- Immutable (where required by policy)
- Global edge caching
- Lifecycle rules for non-evidence data
- Custom metadata for provenance

**Use When:**
- Data must be legally defensible
- Data cannot be lost under any circumstance
- Data needs global availability
- Data has significant size (>1KB)

**Never Use For:**
- Operational configuration (use Git)
- Real-time coordination (use KV)
- Transactional metadata (use Neon/D1)

### Vectorize (Semantic Index)
**Authority:** Semantic search capability ONLY
**Characteristics:**
- Contains embeddings (vectors), not source documents
- Metadata references R2 object keys
- Rebuildable from R2 at any time
- No legal significance

**Use When:**
- Semantic search required
- Document similarity needed
- Embedding-based retrieval

**Never Use For:**
- Source document storage
- Full-text search (use Neon full-text indexes)
- Metadata storage beyond R2 references

### Neon PostgreSQL
**Authority:** Queryable metadata and relationships
**Characteristics:**
- Transactional consistency
- Complex queries (joins, aggregations)
- Foreign key relationships
- Full-text search capability

**Use When:**
- Relational data required
- Complex queries needed
- Transactional guarantees required
- Audit trails (chain of custody, access logs)

**Never Use For:**
- Large binary objects (use R2)
- High-frequency writes (use KV for cache)
- Ephemeral state (use KV)

### D1 (Serverless SQL)
**Authority:** Operational metadata local to workers
**Characteristics:**
- Worker-local database
- SQLite compatibility
- Fast local queries
- Limited size (100MB per DB)

**Use When:**
- Worker needs SQL queries
- Data is worker-scoped
- Small operational datasets
- Subscription/quota tracking

**Never Use For:**
- Evidence storage (use R2)
- Global coordination (use Neon)
- Large datasets (use Neon)

### Workers KV (Key-Value)
**Authority:** NONE - Ephemeral cache only
**Characteristics:**
- Global edge caching
- Eventually consistent
- TTL required
- Reconstructible from authoritative source

**Use When:**
- Caching expensive lookups
- Session state (short-term)
- Rate limiting
- Temporary coordination

**Never Use For:**
- Authoritative data
- Evidence artifacts
- Permanent records
- Audit trails

### Analytics Engine
**Authority:** NONE - Metrics collection only
**Characteristics:**
- Real-time write, async query
- Time-series data
- Aggregate queries
- Auto-archive to R2

**Use When:**
- Event tracking
- Performance metrics
- Usage analytics
- Security monitoring

**Never Use For:**
- Authoritative records
- Transactional data
- Evidence storage

---

## Storage Decision Matrix

### Evidence & Legal Data
```
Evidence Type        → R2 (immutable) + Neon (metadata) + Vectorize (index)
Chain of Custody     → Neon (immutable table)
Access Logs          → Neon (immutable) + Analytics Engine
```

### Operational Data
```
Subscriptions        → D1 (authoritative) + KV (cache)
Quotas               → D1 (authoritative) + KV (cache)
User Preferences     → Neon (authoritative) + KV (cache)
```

### Ephemeral Data
```
Rate Limits          → KV only (deterministic)
Session Tokens       → KV (short TTL) + R2 (archive)
API Cache            → KV only (reconstructible)
```

### Analytics Data
```
Events (real-time)   → Analytics Engine → R2 (archive)
Metrics              → Analytics Engine → R2 (archive)
Audit Events         → Neon + Analytics Engine
```

---

## Enforcement Rules

### Rule 1: Legal Significance → R2
Any data with legal significance MUST have authoritative copy in R2.
- ✅ Evidence documents
- ✅ Signed contracts
- ✅ Communications
- ❌ Session tokens (not legally significant)

### Rule 2: Queryable → Neon or D1
Any data requiring SQL queries MUST be in Neon (global) or D1 (local).
- ✅ Case metadata
- ✅ Relationships
- ❌ Raw documents (use Vectorize for semantic search)

### Rule 3: Ephemeral → KV with TTL
Any data that is cache or temporary MUST have TTL in KV.
- ✅ Session cache (24h TTL)
- ✅ Rate limits (1h TTL)
- ❌ Permanent records (use Neon or R2)

### Rule 4: Semantic Search → Vectorize
Any data requiring semantic similarity MUST use Vectorize with R2 reference.
- ✅ Document embeddings
- ✅ Legal brief similarity
- ❌ Exact keyword search (use Neon full-text)

### Rule 5: Transformations → Pipelines
Any data transformation MUST flow through auditable Pipelines.
- ✅ Evidence ingestion
- ✅ Vectorization
- ❌ Direct worker writes to R2

---

## Reconstruction Examples

### Scenario: Rebuild Vectorize Index
```
1. Query R2 for all objects in evidence bucket
2. For each object:
   a. Fetch from R2
   b. Chunk document
   c. Generate embeddings
   d. Upsert to Vectorize with R2 key reference
3. Verify against D1 vector_indexes registry
```

**Time:** ~2 hours for 10,000 documents (parallelized)
**Data Loss:** 0 (R2 is source of truth)

### Scenario: Rebuild KV Cache
```
1. Identify KV namespace (e.g., SESSION_CACHE)
2. Determine reconstruction source (R2 session archive)
3. For each session:
   a. Fetch from R2 archive
   b. Validate JWT
   c. Write to KV with TTL
```

**Time:** ~5 minutes for 1,000 sessions
**Data Loss:** 0 (R2 archive is source)

### Scenario: Rebuild Neon Metadata
```
1. Restore Neon from automated backup (Neon service)
2. Identify missing transactions (compare timestamps)
3. For each missing evidence item:
   a. Fetch R2 object metadata
   b. INSERT INTO evidence table
4. Rebuild chain of custody from ChittyChain
```

**Time:** <30 minutes (Neon automated restore)
**Data Loss:** <5 minutes (R2 metadata provides ground truth)

---

## Prohibited Patterns

### ❌ NEVER: Evidence in KV
```typescript
// FORBIDDEN
await env.KV.put(`evidence:${id}`, pdfContent);
```
**Why:** KV is not authoritative, not immutable, not legally defensible

### ❌ NEVER: Direct Worker → R2 for Evidence
```typescript
// FORBIDDEN
await env.EVIDENCE_BUCKET.put(key, file);
```
**Why:** Bypasses audit trail, no chain of custody, no pipeline validation

### ❌ NEVER: Full Content in Vectorize
```typescript
// FORBIDDEN
await env.VECTORIZE.upsert({
  id,
  values: embedding,
  metadata: { full_text: document } // NEVER
});
```
**Why:** Vectorize is index only, not storage

### ❌ NEVER: KV without TTL for Non-Permanent Data
```typescript
// FORBIDDEN
await env.KV.put('cache:data', value); // No TTL!
```
**Why:** KV is ephemeral by design, TTL enforces this

---

## Approved Patterns

### ✅ Evidence Ingestion
```typescript
// CORRECT: Queue pipeline, let pipeline write to R2
await env.UPLOAD_QUEUE.send({
  file: evidenceFile,
  metadata: { case_id, uploaded_by }
});
```

### ✅ Semantic Search
```typescript
// CORRECT: Query Vectorize, fetch from R2
const results = await env.VECTORIZE.query(embedding, { topK: 10 });
for (const result of results) {
  const doc = await env.R2.get(result.metadata.r2_key);
  // Use doc...
}
```

### ✅ Metadata Cache
```typescript
// CORRECT: Cache Neon query in KV with TTL
const cached = await env.KV.get(`case:${id}`);
if (!cached) {
  const data = await neonQuery('SELECT * FROM cases WHERE id = $1', [id]);
  await env.KV.put(`case:${id}`, JSON.stringify(data), { expirationTtl: 3600 });
  return data;
}
```

---

## Authority Delegation

| Scenario | Primary Authority | Can Delegate To | Cannot Delegate To |
|----------|------------------|----------------|-------------------|
| Evidence Storage | R2 | None | KV, Vectorize, Neon |
| Evidence Metadata | Neon | KV (cache only) | R2, Vectorize |
| Semantic Index | Vectorize | None | R2, KV, Neon |
| Session State | R2 (archive) | KV (active sessions) | Neon, D1 |
| Rate Limits | None (stateless) | KV | Neon, R2 |
| Analytics | Analytics Engine | R2 (archive) | Neon, KV |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2025-12-15 | Initial canonical authority matrix | ChittyOS Core Team |

---

## References

- **Architecture:** `/operators/chitty-cloud-repo-operator/ARCHITECTURE.md`
- **KV Policy:** `/operators/chitty-cloud-repo-operator/KV_NAMESPACE_POLICY.md`
- **Enforcement:** `/operators/chitty-cloud-repo-operator/middleware/storage-guard.ts`

---

**Status:** Canonical
**Authority:** Non-Negotiable
**Distribution:** All ChittyOS Developers
