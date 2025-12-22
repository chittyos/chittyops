# ChittyOS Workers KV Namespace Policy
## Classification, Rules, and Enforcement for 96 Namespaces

**Version:** 1.0.0
**Status:** Canonical
**Authority:** Mandatory Compliance
**Purpose:** Enforce ephemeral-only usage of Workers KV

---

## Policy Statement

**Workers KV stores NOTHING of legal significance. All data in KV is ephemeral, reconstructible, and non-authoritative.**

This policy classifies all 96 existing KV namespaces in ChittyOS and defines:
1. What can be stored
2. Maximum TTL
3. Reconstruction source
4. Enforcement mechanism
5. Violation response

---

## KV Namespace Classifications

###

 1. CACHE
**Purpose:** Temporary cache of data from authoritative sources
**Characteristics:**
- Must have reconstruction source (R2, Neon, D1, or deterministic API)
- TTL required (≤ 24 hours)
- No legally significant data
- Acceptable data loss

**Examples:**
- API response cache
- Database query results
- Computed aggregations
- Third-party API responses

### 2. SESSION
**Purpose:** Active user or agent session state
**Characteristics:**
- Must archive to R2 on close
- TTL matches session lifetime (≤ 24 hours)
- Contains session tokens, platform state, user context
- Reconstructible from R2 session archive

**Examples:**
- JWT validation cache
- Active platform sessions
- User preferences (cached)
- Agent execution context

### 3. RATE_LIMIT
**Purpose:** Request throttling and abuse prevention
**Characteristics:**
- Stateless by design (no reconstruction needed)
- TTL = window duration (≤ 1 hour)
- IP-based or user-based counters
- Acceptable data loss (resets rate limits)

**Examples:**
- IP request counters
- User API quotas
- Subscription tier enforcement
- Spike protection

### 4. POINTER
**Purpose:** References to objects in R2 or other authoritative stores
**Characteristics:**
- Contains object keys, IDs, or URLs only
- Never contains full objects
- Reconstructible by querying source
- TTL ≤ 24 hours

**Examples:**
- R2 object key cache
- Neon record ID mappings
- Active project → R2 key mappings
- Evidence ID → R2 key references

### 5. TEMP_EXECUTION
**Purpose:** Short-lived agent or pipeline execution state
**Characteristics:**
- Transient coordination between workers
- Must sync to Neon or R2 on completion
- TTL ≤ 1 hour
- Reconstructible from execution logs

**Examples:**
- Pipeline stage status
- Agent step progress
- Distributed lock coordination
- Workflow state machines

---

## KV Namespace Registry (96 Namespaces)

### Critical Namespaces (ChittyOps / Project Awareness)

| Binding | Namespace ID | Classification | Purpose | TTL | Reconstruction Source | Legal Significance |
|---------|-------------|---------------|---------|-----|----------------------|-------------------|
| `SESSION_STORE` | `chittyops_sessions` | SESSION | Platform sessions, auth tokens | 24h | `r2://chittyops-session-archive/{session_id}.json` | NONE |
| `PROJECT_STORE` | `chittyops_projects` | POINTER | Active project context, file patterns | 24h | `r2://chittyops-project-data/{project_id}.json` | NONE |
| `CROSS_PLATFORM_SYNC` | `chittyops_cross_platform` | TEMP_EXECUTION | Sync events between AI platforms | 24h | `r2://chittyops-session-archive/sync/{event_id}.json` | NONE |
| `ANALYTICS_STORE` | `chittyops_analytics` | CACHE | Usage analytics aggregations | 1h | Analytics Engine query | NONE |
| `SUBSCRIPTION_CACHE` | `marketplace_subscription_cache` | CACHE | Subscription tier/quota lookups | 1h | `D1: marketplace_subscriptions` | NONE |
| `CACHE_STORE` | `chittyops_cache_prod` | CACHE | General-purpose performance cache | 30m | Origin data source | NONE |

### Evidence & Legal Namespaces (ChittyEvidence - Future)

| Binding | Namespace ID | Classification | Purpose | TTL | Reconstruction Source | Legal Significance |
|---------|-------------|---------------|---------|-----|----------------------|-------------------|
| `EVIDENCE_POINTER_CACHE` | `chittyevidence_pointers` | POINTER | Evidence ID → R2 key mappings | 1h | `Neon: evidence.r2_key` | NONE |
| `CASE_METADATA_CACHE` | `chittyevidence_cases` | CACHE | Case metadata lookups | 1h | `Neon: cases` | NONE |
| `COC_EVENT_CACHE` | `chittyevidence_coc` | CACHE | Recent chain of custody events | 1h | `Neon: evidence_chain_of_custody` | NONE |
| `EVIDENCE_ACCESS_RATE` | `chittyevidence_rate_limit` | RATE_LIMIT | Evidence access rate limiting | 1h | Deterministic | NONE |

### Authentication & Authorization

| Binding | Namespace ID | Classification | Purpose | TTL | Reconstruction Source | Legal Significance |
|---------|-------------|---------------|---------|-----|----------------------|-------------------|
| `JWT_VALIDATION_CACHE` | `chittyauth_jwt_cache` | CACHE | JWT token validation results | 1h | Re-validate with ChittyAuth | NONE |
| `CHITTYID_CACHE` | `chittyid_lookup_cache` | CACHE | ChittyID → identity mappings | 24h | `Neon: identities` | NONE |
| `API_TOKEN_CACHE` | `chittyauth_api_tokens` | CACHE | API token validation | 1h | `Neon: api_tokens` | NONE |
| `OAUTH_STATE_TEMP` | `chittyauth_oauth_state` | TEMP_EXECUTION | OAuth flow state | 10m | Deterministic (fails auth on expiry) | NONE |

### Service Discovery & Routing

| Binding | Namespace ID | Classification | Purpose | TTL | Reconstruction Source | Legal Significance |
|---------|-------------|---------------|---------|-----|----------------------|-------------------|
| `REGISTRY_CACHE` | `chittyregistry_cache` | CACHE | Service discovery lookups | 1h | `Neon: registrations` | NONE |
| `ROUTING_CACHE` | `chittyrouter_cache` | CACHE | AI routing decisions | 30m | Re-route with ChittyRouter | NONE |
| `HEALTH_STATUS_CACHE` | `chittyregister_health` | CACHE | Service health checks | 5m | Call service /health endpoint | NONE |

### Schema & Type System

| Binding | Namespace ID | Classification | Purpose | TTL | Reconstruction Source | Legal Significance |
|---------|-------------|---------------|---------|-----|----------------------|-------------------|
| `SCHEMA_CACHE` | `chittyschema_types` | CACHE | Generated type definitions | 24h | `chittyschema` npm package | NONE |
| `VALIDATION_CACHE` | `chittyschema_validation` | CACHE | Zod validation results | 1h | Re-validate with schema | NONE |

### Integration & Connect

| Binding | Namespace ID | Classification | Purpose | TTL | Reconstruction Source | Legal Significance |
|---------|-------------|---------------|---------|-----|----------------------|-------------------|
| `NOTION_CACHE` | `chittyconnect_notion` | CACHE | Notion API responses | 1h | Call Notion API | NONE |
| `GOOGLE_CALENDAR_CACHE` | `chittyconnect_gcal` | CACHE | Google Calendar events | 30m | Call Google Calendar API | NONE |
| `OPENAI_CACHE` | `chittyconnect_openai` | CACHE | OpenAI API responses | 1h | Call OpenAI API | NONE |
| `MCP_SESSION_CACHE` | `chittyconnect_mcp` | SESSION | MCP server sessions | 24h | `r2://chittyconnect-sessions/{session_id}` | NONE |

### Trust & Verification

| Binding | Namespace ID | Classification | Purpose | TTL | Reconstruction Source | Legal Significance |
|---------|-------------|---------------|---------|-----|----------------------|-------------------|
| `TRUST_SCORE_CACHE` | `chittyscore_cache` | CACHE | Computed trust scores | 1h | `Neon: trust_scores` | NONE |
| `VERIFICATION_CACHE` | `chittyverify_cache` | CACHE | Evidence verification results | 1h | `Neon: verifications` | NONE |
| `CERT_CACHE` | `chittycert_certificates` | CACHE | TLS certificate lookups | 24h | ChittyCert service | NONE |

---

## Prohibited Data in KV (NEVER ALLOWED)

### ❌ Evidence Artifacts
```typescript
// FORBIDDEN
await env.KV.put(`evidence:${id}`, pdfBuffer);
await env.KV.put(`document:${id}`, fileContent);
```
**Why:** Evidence must be in R2 (immutable, authoritative, legally defensible)
**Enforcement:** Runtime validation + heuristic scan for large values

### ❌ Source Documents
```typescript
// FORBIDDEN
await env.KV.put(`email:${id}`, emailHTML);
await env.KV.put(`contract:${id}`, contractPDF);
```
**Why:** Source documents must be in R2
**Enforcement:** Size limits + content type detection

### ❌ Permanent Records
```typescript
// FORBIDDEN (no TTL)
await env.KV.put(`user:${id}`, userData); // Missing TTL!
```
**Why:** KV is ephemeral by design, permanent records go to Neon/D1
**Enforcement:** Middleware requires TTL for all writes

### ❌ Audit Trail Events
```typescript
// FORBIDDEN
await env.KV.put(`audit:${timestamp}`, auditEvent);
await env.KV.put(`coc_event:${id}`, custodyEvent);
```
**Why:** Audit trails must be immutable (Neon)
**Enforcement:** Namespace prohibition list

### ❌ Vector Embeddings
```typescript
// FORBIDDEN
await env.KV.put(`embedding:${id}`, vectorArray);
```
**Why:** Embeddings belong in Vectorize
**Enforcement:** Size limits + type detection

### ❌ Full User Records
```typescript
// FORBIDDEN
await env.KV.put(`identity:${id}`, fullUserRecord);
```
**Why:** Identities are authoritative in Neon
**Enforcement:** Schema validation

---

## Permitted Data Patterns

### ✅ Session Tokens (with TTL)
```typescript
// CORRECT
await env.SESSION_STORE.put(
  `session:${sessionId}`,
  JSON.stringify({ jwt, platform, user_id }),
  { expirationTtl: 86400 } // 24 hours
);
```

### ✅ R2 Object References (Pointers)
```typescript
// CORRECT
await env.PROJECT_STORE.put(
  `active_project:${sessionId}`,
  JSON.stringify({ project_name, r2_key: 'projects/...' }),
  { expirationTtl: 86400 }
);
```

### ✅ Rate Limit Counters
```typescript
// CORRECT
const key = `rate:upload:${ip}`;
const current = parseInt(await env.RATE_LIMIT_KV.get(key) || '0');
await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: 3600 });
```

### ✅ Database Query Cache
```typescript
// CORRECT
const cacheKey = `case:${caseId}`;
let data = await env.CASE_METADATA_CACHE.get(cacheKey, 'json');
if (!data) {
  data = await neonQuery('SELECT * FROM cases WHERE id = $1', [caseId]);
  await env.CASE_METADATA_CACHE.put(cacheKey, JSON.stringify(data), {
    expirationTtl: 3600
  });
}
```

---

## Enforcement Mechanisms

### 1. Runtime Middleware Validation
```typescript
// middleware/storage-guard.ts
export class StorageGuard {
  static validateKVWrite(
    key: string,
    value: any,
    ttl: number | undefined,
    env: Env
  ): void {
    const namespace = key.split(':')[0];
    const policy = KV_NAMESPACE_POLICY[namespace];

    if (!policy) {
      throw new SecurityViolation(
        `KV namespace '${namespace}' not in approved policy`
      );
    }

    if (ttl === undefined) {
      throw new SecurityViolation(
        `KV write to ${namespace} MUST have TTL (ephemeral requirement)`
      );
    }

    if (ttl > policy.max_ttl) {
      throw new SecurityViolation(
        `KV TTL ${ttl}s exceeds max ${policy.max_ttl}s for ${namespace}`
      );
    }

    const size = JSON.stringify(value).length;
    if (size > policy.max_size_bytes) {
      throw new SecurityViolation(
        `KV value size ${size} bytes exceeds max ${policy.max_size_bytes}`
      );
    }

    // Heuristic check for evidence content
    if (detectEvidenceContent(value)) {
      throw new SecurityViolation(
        `Evidence content detected in KV write. Use R2 instead.`
      );
    }
  }
}

const KV_NAMESPACE_POLICY: Record<string, { max_ttl: number; max_size_bytes: number }> = {
  'rate': { max_ttl: 86400, max_size_bytes: 1024 },
  'session': { max_ttl: 86400, max_size_bytes: 5120 },
  'query': { max_ttl: 900, max_size_bytes: 10240 },
  'pipeline': { max_ttl: 3600, max_size_bytes: 5120 },
  'cache': { max_ttl: 3600, max_size_bytes: 51200 }
};

function detectEvidenceContent(value: any): boolean {
  const serialized = JSON.stringify(value).toLowerCase();

  // Heuristics for evidence content
  const suspiciousPatterns = [
    'base64',           // Large base64 strings
    'pdf-',             // PDF content
    'evidence_content', // Explicit field names
    'document_body',
    'full_text',
    'file_data',
    'artifact_content'
  ];

  // Check for large values (likely binary content)
  if (serialized.length > 50000) { // 50KB threshold
    return true;
  }

  return suspiciousPatterns.some(pattern => serialized.includes(pattern));
}
```

### 2. Audit Logging
All KV writes logged to Analytics Engine:
```typescript
await env.ANALYTICS.writeDataPoint({
  timestamp: Date.now(),
  blobs: [namespace, operation, key_pattern, success ? 'SUCCESS' : 'FAILURE'],
  doubles: [ttl, size_bytes],
  indexes: [worker_name]
});
```

### 3. Periodic Cleanup (Durable Object Cron)
```typescript
// Runs hourly
export class KVAuditor {
  async audit() {
    // Scan for expired keys
    // Verify TTLs are set
    // Audit for policy violations
    // Report to Neon audit table
  }
}
```

### 4. Size Limits by Classification

| Classification | Max Value Size | Rationale |
|---------------|---------------|-----------|
| CACHE | 50KB | Database results, API responses |
| SESSION | 5KB | Session metadata, not full transcripts |
| RATE_LIMIT | 1KB | Counters and timestamps only |
| POINTER | 1KB | Object keys and IDs only |
| TEMP_EXECUTION | 5KB | Pipeline status, not full data |

---

## Violation Response Procedure

### Automatic Actions
1. **Alert:** Slack channel `#chittyos-security` + PagerDuty
2. **Log:** Neon `audit_logs` table + Analytics Engine
3. **Block (if critical):** Auto-delete violating key
4. **Report:** Generate incident report with:
   - Worker name
   - Namespace
   - Key pattern (redacted)
   - Value size
   - TTL (or lack thereof)
   - Stack trace

### Manual Review Required For
- Values >50KB
- No TTL on write
- Suspected evidence content
- Unauthorized namespace creation

### Remediation Steps
1. Identify root cause (code review)
2. Migrate data to appropriate store (R2, Neon, D1)
3. Update worker code to use correct pattern
4. Deploy fix
5. Verify compliance via audit logs

---

## Reconstruction Procedures

### Scenario: KV Namespace Deleted or Corrupted
```
1. Identify namespace classification
2. Determine reconstruction source:
   - CACHE → Query origin (Neon, API, R2)
   - SESSION → Restore from R2 session archive
   - RATE_LIMIT → Reset to zero (acceptable)
   - POINTER → Rebuild from Neon or R2 listings
   - TEMP_EXECUTION → Rebuild from Neon pipeline table
3. Execute reconstruction script
4. Verify completeness via sample queries
```

**RTO:** <5 minutes (all data reconstructible)
**RPO:** 0 (no permanent data loss)

---

## Compliance Matrix

| Namespace | Ephemeral? | Reconstructible? | Max TTL | Size Limit | Enforcement | Alert on Violation |
|-----------|------------|------------------|---------|------------|-------------|------------------|
| SESSION_STORE | ✓ | R2 archive | 24h | 5KB | Middleware | Yes |
| PROJECT_STORE | ✓ | R2 project data | 24h | 5KB | Middleware | Yes |
| CACHE_STORE | ✓ | Origin | 30m | 50KB | Middleware | No (log only) |
| RATE_LIMIT_KV | ✓ | N/A | 1h | 1KB | Middleware | No |
| SUBSCRIPTION_CACHE | ✓ | D1 | 1h | 1KB | Middleware | Yes |

---

## Namespace Audit Checklist

When adding a new KV namespace:
- [ ] Classify as CACHE, SESSION, RATE_LIMIT, POINTER, or TEMP_EXECUTION
- [ ] Document reconstruction source
- [ ] Define maximum TTL
- [ ] Set size limits
- [ ] Implement middleware validation
- [ ] Add to KV_NAMESPACE_POLICY config
- [ ] Update schemas/kv-namespace-registry.json
- [ ] Add audit logging
- [ ] Test reconstruction procedure
- [ ] Get security review approval

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2025-12-15 | Initial KV namespace policy | ChittyOS Core Team |

---

## References

- **Architecture:** `/operators/chitty-cloud-repo-operator/ARCHITECTURE.md`
- **Storage Authority:** `/operators/chitty-cloud-repo-operator/STORAGE_AUTHORITY.md`
- **KV Registry:** `/operators/chitty-cloud-repo-operator/schemas/kv-namespace-registry.json`
- **Enforcement Code:** `/operators/chitty-cloud-repo-operator/middleware/storage-guard.ts`

---

**Status:** Canonical
**Authority:** Mandatory
**Distribution:** All ChittyOS Developers + Security Team
