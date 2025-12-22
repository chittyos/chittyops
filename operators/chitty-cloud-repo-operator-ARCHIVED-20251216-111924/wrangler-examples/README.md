# Wrangler Configuration Examples

This directory contains reference Wrangler configurations demonstrating **correct binding patterns** for different worker roles in the ChittyOS evidence-centric architecture.

## Configuration Files

| File | Worker Role | Access Pattern | Use Case |
|------|-------------|----------------|----------|
| `autorag.toml` | `QUERY_WORKER` | Read-only | AutoRAG semantic search, evidence retrieval |
| `upload.toml` | `UPLOAD_WORKER` | Queue-only write | Evidence upload (no direct R2/Vectorize access) |

---

## Worker Role Classification

### QUERY_WORKER (Read-Only)

**Purpose:** Query evidence and vector indexes without mutation.

**Allowed Bindings:**
- ✅ R2 (read-only: `get()` only)
- ✅ Vectorize (query-only: `query()` only)
- ✅ D1/KV (read-only queries)
- ✅ Analytics Engine (write for audit logging)

**Forbidden Bindings:**
- ❌ R2 write methods (`put()`, `delete()`)
- ❌ Vectorize write methods (`upsert()`, `deleteByIds()`)
- ❌ Queue producers (cannot trigger pipelines)

**Example Configuration:** `autorag.toml`

**Example Workers:**
- `workers/autorag-query.ts`
- AutoRAG semantic search
- Evidence retrieval API

---

### UPLOAD_WORKER (Queue-Only Write)

**Purpose:** Accept evidence uploads and queue to pipeline for processing.

**Allowed Bindings:**
- ✅ Queue producers (upload to `evidence-upload-queue`)
- ✅ KV (rate limiting only, ephemeral state)
- ✅ D1 (read-only: validate case permissions)
- ✅ Workers AI (virus scanning)
- ✅ Analytics Engine (upload logging)

**Forbidden Bindings:**
- ❌ R2 buckets (NO direct evidence writes)
- ❌ Vectorize indexes (NO direct vector writes)
- ❌ KV for evidence storage (evidence MUST be in R2)

**Example Configuration:** `upload.toml`

**Example Workers:**
- `workers/evidence-upload.ts`
- Email router upload endpoint
- Web upload API

---

### PIPELINE_WORKER (Full Write Access)

**Purpose:** Process evidence through pipelines and write to R2/Vectorize.

**Allowed Bindings:**
- ✅ R2 (write access: `put()`, `get()`)
- ✅ Vectorize (write access: `upsert()`, `query()`)
- ✅ Queue consumers (process pipeline queues)
- ✅ D1 (write: update registry)
- ✅ Workers AI (embedding generation)

**Forbidden Bindings:**
- ❌ R2 `delete()` (append-only enforcement)

**Example Configuration:** Not needed (Cloudflare Pipelines manages workers)

**Example Pipelines:**
- `pipelines/evidence-ingestion.yaml`
- `pipelines/vectorization.yaml`

---

### ADMIN_WORKER (Administrative Operations)

**Purpose:** Maintenance, migrations, debugging (use sparingly).

**Allowed Bindings:**
- ✅ Full R2 access (including `delete()`)
- ✅ Full Vectorize access
- ✅ Full KV access
- ✅ Full D1 access

**Example Configuration:** Custom (requires special approval)

**Example Workers:**
- KV migration scripts
- Index rebuild scripts
- Emergency recovery operations

---

## Binding Pattern Reference

### R2 Bucket Bindings

#### Read-Only Pattern (QUERY_WORKER)

```toml
[[r2_buckets]]
binding = "EVIDENCE_BUCKET"
bucket_name = "chittyevidence-originals"
jurisdiction = "US"

# TypeScript: Wrap with read-only type guard
# type ReadOnlyR2 = Omit<R2Bucket, 'put' | 'delete'>;
```

#### No R2 Binding (UPLOAD_WORKER)

```toml
# NO R2 bindings for upload workers
# Evidence written by pipeline only
```

#### Write Access (PIPELINE_WORKER)

```toml
[[r2_buckets]]
binding = "EVIDENCE_BUCKET"
bucket_name = "chittyevidence-originals"
jurisdiction = "US"

# Full access via pipeline workers only
# Append-only semantics enforced in pipeline logic
```

---

### Vectorize Index Bindings

#### Query-Only Pattern (QUERY_WORKER)

```toml
[[vectorize]]
binding = "VECTORIZE"
index_name = "intel-embeddings"

# TypeScript: Wrap with query-only type guard
# type QueryOnlyVectorize = Omit<VectorizeIndex, 'upsert' | 'deleteByIds'>;
```

#### No Vectorize Binding (UPLOAD_WORKER)

```toml
# NO Vectorize bindings for upload workers
# Vectors written by pipeline only
```

#### Upsert Access (PIPELINE_WORKER)

```toml
[[vectorize]]
binding = "VECTORIZE"
index_name = "intel-embeddings"

# Full upsert access via pipeline workers only
```

---

### Queue Bindings

#### Queue Producer (UPLOAD_WORKER)

```toml
[[queues.producers]]
binding = "UPLOAD_QUEUE"
queue = "evidence-upload-queue"
delivery_delay = 0
```

#### Queue Consumer (PIPELINE_WORKER)

```toml
# Managed by Cloudflare Pipelines
# See: pipelines/evidence-ingestion.yaml
```

---

### KV Namespace Bindings

#### Rate Limiting (UPLOAD_WORKER)

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "upload_rate_limit_namespace_id"

# ONLY for ephemeral rate limiting state
# TTL required on all writes
```

#### Read-Only Cache (QUERY_WORKER)

```toml
[[kv_namespaces]]
binding = "METADATA_CACHE"
id = "evidence_metadata_cache_id"

# Read-only: Reconstructible from R2/Neon
```

#### Forbidden: Evidence Storage

```toml
# ❌ FORBIDDEN
# [[kv_namespaces]]
# binding = "EVIDENCE_STORE"
# id = "..."
#
# Reason: Evidence MUST be in R2, not KV
# Violation: Deployment fails CI/CD checks
```

---

### D1 Database Bindings

#### Read-Only Queries (QUERY_WORKER, UPLOAD_WORKER)

```toml
[[d1_databases]]
binding = "DB"
database_name = "chittyevidence-registry"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Use for:
# - Case permission validation
# - Evidence metadata queries
# - Vector index registry lookups
```

#### Write Access (PIPELINE_WORKER)

```toml
[[d1_databases]]
binding = "DB"
database_name = "chittyevidence-registry"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Pipeline writes to:
# - vector_indexes table
# - evidence registry
```

---

### Analytics Engine Bindings

All workers should have Analytics Engine for audit logging:

```toml
[[analytics_engine_datasets]]
binding = "ANALYTICS"
dataset = "EVIDENCE_ACCESS"  # or EVIDENCE_UPLOAD, etc.

# Usage:
# env.ANALYTICS.writeDataPoint({
#   indexes: ['evidence_access'],
#   blobs: [user_id, evidence_id, operation],
#   doubles: [success ? 1 : 0]
# });
```

---

### Workers AI Bindings

```toml
[ai]
binding = "AI"

# Use for:
# - Embedding generation (query workers, pipelines)
# - Virus scanning (upload workers)
# - Malware detection (pipelines)
```

---

## Deployment Checklist

Before deploying a new worker, verify:

### 1. Worker Role Classification

- [ ] Worker role identified: `QUERY_WORKER`, `UPLOAD_WORKER`, `PIPELINE_WORKER`, or `ADMIN_WORKER`
- [ ] Role documented in worker code comments
- [ ] StorageGuard initialized with correct role

### 2. Binding Compliance

- [ ] All bindings match worker role permissions
- [ ] NO forbidden bindings present (e.g., R2 for upload workers)
- [ ] Read-only bindings wrapped with type guards
- [ ] Queue bindings only for allowed roles

### 3. Type Guards

- [ ] TypeScript type guards applied for read-only bindings
- [ ] StorageGuard middleware integrated
- [ ] Compile-time errors for forbidden operations

### 4. Secrets Configuration

- [ ] `JWT_SECRET` configured (authentication)
- [ ] `NEON_DATABASE_URL` configured (audit logging)
- [ ] Service tokens configured (inter-service calls)

### 5. Audit Logging

- [ ] Analytics Engine binding present
- [ ] All storage operations logged
- [ ] Violations logged to audit trail

### 6. IAM Policies

- [ ] Cloudflare IAM policies applied
- [ ] Deny rules for forbidden operations
- [ ] Allow rules for required operations

### 7. CI/CD Checks

- [ ] Wrangler config validated (schema)
- [ ] Binding pattern verified (no violations)
- [ ] Type guards checked (TypeScript compilation)
- [ ] Integration tests pass (staging deployment)

---

## Common Mistakes

### ❌ MISTAKE 1: R2 Binding on Upload Worker

```toml
# WRONG: Upload worker with R2 binding
[[r2_buckets]]
binding = "EVIDENCE_BUCKET"
bucket_name = "chittyevidence-originals"
```

**Why wrong:** Upload workers MUST queue to pipelines, not write directly to R2.

**Fix:** Remove R2 binding, use queue binding only.

---

### ❌ MISTAKE 2: Evidence in KV Namespace

```toml
# WRONG: KV namespace for evidence storage
[[kv_namespaces]]
binding = "EVIDENCE_CACHE"
id = "..."
```

**Why wrong:** Evidence MUST be in R2 (authoritative), not KV (ephemeral).

**Fix:** Use R2 for evidence, KV only for rate limiting/sessions.

---

### ❌ MISTAKE 3: Missing Type Guards on Read-Only Workers

```typescript
// WRONG: Direct R2 access without type guard
const object = await env.EVIDENCE_BUCKET.get(key);
await env.EVIDENCE_BUCKET.put(key, value);  // Accidentally allowed!
```

**Why wrong:** No compile-time prevention of write operations.

**Fix:** Wrap with `ReadOnlyR2Bucket` type guard or use StorageGuard middleware.

---

### ❌ MISTAKE 4: No Analytics Binding for Audit Trail

```toml
# WRONG: No Analytics Engine binding
# (missing audit logging)
```

**Why wrong:** All evidence access MUST be logged for legal defensibility.

**Fix:** Add `[[analytics_engine_datasets]]` binding to ALL workers.

---

## Testing Configurations

### Test Read-Only Enforcement

```bash
# Deploy query worker
wrangler deploy --config wrangler-examples/autorag.toml --env staging

# Test that writes fail
curl -X POST https://autorag-staging.chitty.cc/test-write
# Expected: 403 Forbidden or TypeScript compilation error
```

### Test Queue-Only Enforcement

```bash
# Deploy upload worker
wrangler deploy --config wrangler-examples/upload.toml --env staging

# Test that upload queues (not writes to R2)
curl -X POST https://upload-staging.chitty.cc/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@test.pdf" \
  -F "case_id=test-case"

# Expected: 202 Accepted (queued to pipeline)

# Verify queue has message
wrangler queues consumer http evidence-upload-queue --tail
```

---

## Monitoring Binding Violations

Check Analytics Engine for storage violations:

```sql
SELECT
  blob1 AS worker_name,
  blob2 AS worker_role,
  blob3 AS operation,
  blob4 AS reason,
  COUNT(*) AS violation_count
FROM EVIDENCE_ACCESS
WHERE double1 = 0  -- 0 = violation
GROUP BY blob1, blob2, blob3, blob4
ORDER BY violation_count DESC;
```

Alert on violations:
- **Critical:** R2/Vectorize write attempts by query/upload workers
- **Warning:** Missing audit logs for evidence access

---

## References

- **Architecture:** `../ARCHITECTURE.md`
- **Storage Authority:** `../STORAGE_AUTHORITY.md`
- **Worker Examples:** `../workers/`
- **Pipeline Examples:** `../pipelines/`
- **Middleware:** `../middleware/storage-guard.ts`

---

**Version:** 1.0.0
**Last Updated:** 2025-12-16
**Owner:** ChittyOS Core Team
