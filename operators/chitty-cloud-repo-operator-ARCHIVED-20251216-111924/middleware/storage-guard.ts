/**
 * ChittyOS Storage Guard Middleware
 *
 * Runtime enforcement of architectural invariants for storage operations.
 *
 * This middleware provides defensive checks to prevent violations of the
 * evidence-centric architecture, even if code attempts to bypass design patterns.
 *
 * ENFORCEMENT LAYERS:
 * 1. Compile-time: TypeScript type guards
 * 2. Configuration-time: Wrangler binding restrictions
 * 3. Runtime: This middleware (last line of defense)
 * 4. Audit: Comprehensive logging of all violations
 *
 * USAGE:
 * Import this middleware in all workers to add runtime validation.
 *
 * @version 1.0.0
 * @authority ChittyOS Core Team
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Storage operation type
 */
type StorageOperation =
  | 'R2_READ'
  | 'R2_WRITE'
  | 'R2_DELETE'
  | 'KV_READ'
  | 'KV_WRITE'
  | 'KV_DELETE'
  | 'VECTORIZE_QUERY'
  | 'VECTORIZE_UPSERT'
  | 'VECTORIZE_DELETE'
  | 'QUEUE_SEND';

/**
 * Worker role (determines allowed operations)
 */
type WorkerRole =
  | 'QUERY_WORKER'      // Read-only queries (AutoRAG)
  | 'UPLOAD_WORKER'     // Upload to queue only
  | 'PIPELINE_WORKER'   // Pipeline processing (write to R2)
  | 'ADMIN_WORKER';     // Admin operations

/**
 * Storage policy violation
 */
interface PolicyViolation {
  operation: StorageOperation;
  worker_role: WorkerRole;
  reason: string;
  allowed: boolean;
  resource?: string;
  timestamp: string;
}

// =============================================================================
// POLICY MATRIX
// =============================================================================

/**
 * Storage Access Control Matrix
 *
 * Defines which worker roles can perform which operations.
 */
const STORAGE_POLICY_MATRIX: Record<WorkerRole, Record<StorageOperation, boolean>> = {
  // Query workers: Read-only access
  QUERY_WORKER: {
    R2_READ: true,
    R2_WRITE: false,
    R2_DELETE: false,
    KV_READ: true,
    KV_WRITE: false,
    KV_DELETE: false,
    VECTORIZE_QUERY: true,
    VECTORIZE_UPSERT: false,
    VECTORIZE_DELETE: false,
    QUEUE_SEND: false
  },

  // Upload workers: Queue-only
  UPLOAD_WORKER: {
    R2_READ: false,
    R2_WRITE: false,
    R2_DELETE: false,
    KV_READ: true,      // For rate limiting
    KV_WRITE: true,     // For rate limiting
    KV_DELETE: false,
    VECTORIZE_QUERY: false,
    VECTORIZE_UPSERT: false,
    VECTORIZE_DELETE: false,
    QUEUE_SEND: true    // Upload to queue
  },

  // Pipeline workers: Write to R2 + Vectorize
  PIPELINE_WORKER: {
    R2_READ: true,
    R2_WRITE: true,     // ONLY pipelines can write to R2
    R2_DELETE: false,   // No deletes (append-only)
    KV_READ: true,
    KV_WRITE: true,
    KV_DELETE: false,
    VECTORIZE_QUERY: false,
    VECTORIZE_UPSERT: true,  // ONLY pipelines can write to Vectorize
    VECTORIZE_DELETE: false,
    QUEUE_SEND: true
  },

  // Admin workers: Full access (use sparingly)
  ADMIN_WORKER: {
    R2_READ: true,
    R2_WRITE: true,
    R2_DELETE: true,
    KV_READ: true,
    KV_WRITE: true,
    KV_DELETE: true,
    VECTORIZE_QUERY: true,
    VECTORIZE_UPSERT: true,
    VECTORIZE_DELETE: true,
    QUEUE_SEND: true
  }
};

// =============================================================================
// KV NAMESPACE POLICY
// =============================================================================

/**
 * KV namespace classification
 */
type KVNamespaceClass = 'CACHE' | 'SESSION' | 'RATE_LIMIT' | 'POINTER' | 'TEMP_EXECUTION' | 'PROHIBITED';

/**
 * Check if data type is allowed in KV namespace
 */
function isAllowedInKV(namespace: string, value: any): { allowed: boolean; reason: string } {
  const valueStr = typeof value === 'string' ? value : JSON.stringify(value);

  // PROHIBITED: Evidence content in KV
  const prohibitedPatterns = [
    { pattern: /evidence_content/i, reason: 'Evidence content must be in R2' },
    { pattern: /document_body/i, reason: 'Document body must be in R2' },
    { pattern: /full_text/i, reason: 'Full text must be in R2' },
    { pattern: /file_data/i, reason: 'File data must be in R2' },
    { pattern: /email_body/i, reason: 'Email body must be in R2' },
    { pattern: /attachment_data/i, reason: 'Attachment data must be in R2' },
    { pattern: /%PDF-/i, reason: 'PDF content must be in R2' },
  ];

  for (const { pattern, reason } of prohibitedPatterns) {
    if (pattern.test(valueStr)) {
      return { allowed: false, reason };
    }
  }

  // PROHIBITED: Large values (>50KB likely evidence)
  if (valueStr.length > 50000) {
    return {
      allowed: false,
      reason: `Value too large (${valueStr.length} bytes) - evidence must be in R2`
    };
  }

  // ALLOWED: Small, ephemeral data
  return { allowed: true, reason: 'Valid KV usage' };
}

// =============================================================================
// STORAGE GUARD CLASS
// =============================================================================

export class StorageGuard {
  constructor(
    private worker_role: WorkerRole,
    private worker_name: string,
    private analytics?: AnalyticsEngineDataset
  ) {}

  /**
   * Validate storage operation before execution
   */
  async validateOperation(
    operation: StorageOperation,
    resource?: string,
    value?: any
  ): Promise<{ allowed: boolean; violation?: PolicyViolation }> {
    const allowed = STORAGE_POLICY_MATRIX[this.worker_role][operation];

    const violation: PolicyViolation = {
      operation,
      worker_role: this.worker_role,
      reason: allowed ? 'Operation allowed by policy' : 'Operation forbidden by policy',
      allowed,
      resource,
      timestamp: new Date().toISOString()
    };

    // KV-specific validation
    if (operation === 'KV_WRITE' && !allowed) {
      violation.reason = 'KV writes forbidden for this worker role';
    }

    if (operation === 'KV_WRITE' && value) {
      const kvCheck = isAllowedInKV(resource || '', value);
      if (!kvCheck.allowed) {
        violation.allowed = false;
        violation.reason = `KV policy violation: ${kvCheck.reason}`;
      }
    }

    // R2 write validation (only pipelines)
    if (operation === 'R2_WRITE' && this.worker_role !== 'PIPELINE_WORKER') {
      violation.reason = 'R2 writes ONLY allowed in pipelines - use QUEUE_SEND instead';
    }

    // Vectorize upsert validation (only pipelines)
    if (operation === 'VECTORIZE_UPSERT' && this.worker_role !== 'PIPELINE_WORKER') {
      violation.reason = 'Vectorize writes ONLY allowed in pipelines';
    }

    // Log violation
    if (!allowed) {
      await this.logViolation(violation);
    }

    return { allowed, violation: allowed ? undefined : violation };
  }

  /**
   * Log policy violation to analytics
   */
  private async logViolation(violation: PolicyViolation) {
    console.error('🚨 STORAGE POLICY VIOLATION:', violation);

    if (this.analytics) {
      this.analytics.writeDataPoint({
        indexes: ['storage_violations'],
        blobs: [
          this.worker_name,
          violation.worker_role,
          violation.operation,
          violation.reason
        ],
        doubles: [0], // 0 = violation
      });
    }
  }

  /**
   * Validate R2 operation
   */
  async validateR2Operation(
    operation: 'READ' | 'WRITE' | 'DELETE',
    bucket: string,
    key: string
  ): Promise<void> {
    const storageOp: StorageOperation = `R2_${operation}` as StorageOperation;
    const result = await this.validateOperation(storageOp, `${bucket}/${key}`);

    if (!result.allowed) {
      throw new StorageGuardError(
        result.violation!.reason,
        storageOp,
        this.worker_role
      );
    }
  }

  /**
   * Validate KV operation
   */
  async validateKVOperation(
    operation: 'READ' | 'WRITE' | 'DELETE',
    namespace: string,
    key: string,
    value?: any
  ): Promise<void> {
    const storageOp: StorageOperation = `KV_${operation}` as StorageOperation;
    const result = await this.validateOperation(storageOp, `${namespace}:${key}`, value);

    if (!result.allowed) {
      throw new StorageGuardError(
        result.violation!.reason,
        storageOp,
        this.worker_role
      );
    }
  }

  /**
   * Validate Vectorize operation
   */
  async validateVectorizeOperation(
    operation: 'QUERY' | 'UPSERT' | 'DELETE',
    index: string
  ): Promise<void> {
    const storageOp: StorageOperation = `VECTORIZE_${operation}` as StorageOperation;
    const result = await this.validateOperation(storageOp, index);

    if (!result.allowed) {
      throw new StorageGuardError(
        result.violation!.reason,
        storageOp,
        this.worker_role
      );
    }
  }

  /**
   * Validate queue operation
   */
  async validateQueueOperation(queue: string): Promise<void> {
    const result = await this.validateOperation('QUEUE_SEND', queue);

    if (!result.allowed) {
      throw new StorageGuardError(
        result.violation!.reason,
        'QUEUE_SEND',
        this.worker_role
      );
    }
  }
}

// =============================================================================
// CUSTOM ERROR
// =============================================================================

export class StorageGuardError extends Error {
  constructor(
    message: string,
    public operation: StorageOperation,
    public worker_role: WorkerRole
  ) {
    super(`Storage Guard Violation: ${message}`);
    this.name = 'StorageGuardError';
  }
}

// =============================================================================
// WRAPPER FUNCTIONS (Defensive Programming)
// =============================================================================

/**
 * Wrap R2 bucket with guard checks
 */
export function guardedR2Bucket(
  bucket: R2Bucket,
  guard: StorageGuard,
  bucketName: string
): R2Bucket {
  return new Proxy(bucket, {
    get(target, prop) {
      const original = target[prop as keyof R2Bucket];

      // Intercept write operations
      if (prop === 'put') {
        return async (key: string, value: any, options?: any) => {
          await guard.validateR2Operation('WRITE', bucketName, key);
          return (original as any).call(target, key, value, options);
        };
      }

      if (prop === 'delete') {
        return async (key: string) => {
          await guard.validateR2Operation('DELETE', bucketName, key);
          return (original as any).call(target, key);
        };
      }

      if (prop === 'get') {
        return async (key: string, options?: any) => {
          await guard.validateR2Operation('READ', bucketName, key);
          return (original as any).call(target, key, options);
        };
      }

      return original;
    }
  });
}

/**
 * Wrap KV namespace with guard checks
 */
export function guardedKVNamespace(
  kv: KVNamespace,
  guard: StorageGuard,
  namespaceName: string
): KVNamespace {
  return new Proxy(kv, {
    get(target, prop) {
      const original = target[prop as keyof KVNamespace];

      if (prop === 'put') {
        return async (key: string, value: any, options?: any) => {
          await guard.validateKVOperation('WRITE', namespaceName, key, value);
          return (original as any).call(target, key, value, options);
        };
      }

      if (prop === 'delete') {
        return async (key: string) => {
          await guard.validateKVOperation('DELETE', namespaceName, key);
          return (original as any).call(target, key);
        };
      }

      if (prop === 'get') {
        return async (key: string, options?: any) => {
          await guard.validateKVOperation('READ', namespaceName, key);
          return (original as any).call(target, key, options);
        };
      }

      return original;
    }
  });
}

/**
 * Wrap Vectorize index with guard checks
 */
export function guardedVectorizeIndex(
  index: VectorizeIndex,
  guard: StorageGuard,
  indexName: string
): VectorizeIndex {
  return new Proxy(index, {
    get(target, prop) {
      const original = target[prop as keyof VectorizeIndex];

      if (prop === 'upsert') {
        return async (vectors: any) => {
          await guard.validateVectorizeOperation('UPSERT', indexName);
          return (original as any).call(target, vectors);
        };
      }

      if (prop === 'deleteByIds') {
        return async (ids: string[]) => {
          await guard.validateVectorizeOperation('DELETE', indexName);
          return (original as any).call(target, ids);
        };
      }

      if (prop === 'query') {
        return async (vector: number[], options?: any) => {
          await guard.validateVectorizeOperation('QUERY', indexName);
          return (original as any).call(target, vector, options);
        };
      }

      return original;
    }
  });
}

// =============================================================================
// USAGE EXAMPLES
// =============================================================================

/**
 * Example 1: AutoRAG Query Worker (Read-Only)
 *
 * ```typescript
 * import { StorageGuard, guardedR2Bucket, guardedVectorizeIndex } from './middleware/storage-guard';
 *
 * export default {
 *   async fetch(request: Request, env: Env): Promise<Response> {
 *     // Initialize guard
 *     const guard = new StorageGuard('QUERY_WORKER', 'autorag-query', env.ANALYTICS);
 *
 *     // Wrap bindings with guards
 *     const safeBucket = guardedR2Bucket(env.EVIDENCE_BUCKET, guard, 'chittyevidence-originals');
 *     const safeVectorize = guardedVectorizeIndex(env.VECTORIZE, guard, 'intel-embeddings');
 *
 *     // Query operations succeed
 *     const results = await safeVectorize.query(embedding);  // ✅ Allowed
 *
 *     // Write operations fail
 *     await safeVectorize.upsert(vectors);  // ❌ Throws StorageGuardError
 *   }
 * };
 * ```
 */

/**
 * Example 2: Upload Worker (Queue-Only)
 *
 * ```typescript
 * export default {
 *   async fetch(request: Request, env: Env): Promise<Response> {
 *     const guard = new StorageGuard('UPLOAD_WORKER', 'evidence-upload', env.ANALYTICS);
 *
 *     // Queue operation succeeds
 *     await guard.validateQueueOperation('evidence-upload-queue');
 *     await env.UPLOAD_QUEUE.send(message);  // ✅ Allowed
 *
 *     // R2 write fails
 *     await guard.validateR2Operation('WRITE', 'chittyevidence-originals', 'key');
 *     // ❌ Throws: "R2 writes ONLY allowed in pipelines - use QUEUE_SEND instead"
 *   }
 * };
 * ```
 */

/**
 * Example 3: Pipeline Worker (Full Write Access)
 *
 * ```typescript
 * export default {
 *   async fetch(request: Request, env: Env): Promise<Response> {
 *     const guard = new StorageGuard('PIPELINE_WORKER', 'evidence-ingestion-pipeline', env.ANALYTICS);
 *
 *     // R2 write succeeds (only for pipelines)
 *     await guard.validateR2Operation('WRITE', 'chittyevidence-originals', r2_key);
 *     await env.EVIDENCE_BUCKET.put(r2_key, evidence);  // ✅ Allowed
 *
 *     // Vectorize upsert succeeds (only for pipelines)
 *     await guard.validateVectorizeOperation('UPSERT', 'intel-embeddings');
 *     await env.VECTORIZE.upsert(vectors);  // ✅ Allowed
 *   }
 * };
 * ```
 */
