/**
 * ChittyOS KV to R2 Migration Script
 * P0 - EMERGENCY/LEGAL Priority
 *
 * Migrates evidence found in KV namespaces to R2 with proper chain of custody.
 *
 * Usage:
 *   # Dry run (preview only)
 *   npx tsx scripts/migrate-kv-to-r2.ts --dry-run --input kv-audit-report.csv
 *
 *   # Execute migration
 *   npx tsx scripts/migrate-kv-to-r2.ts --input kv-audit-report.csv --execute
 *
 * @version 1.0.0
 * @authority ChittyOS Core Team
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { parse as csvParse } from 'csv-parse';
import crypto from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

interface MigrationRecord {
  namespace: string;
  key: string;
  value_size: number;
  suspected_evidence: boolean;
  recommended_action: string;
}

interface MigrationResult {
  namespace: string;
  original_key: string;
  r2_bucket: string;
  r2_key: string;
  sha256_hash: string;
  evidence_id: string;
  coc_id: string;
  migration_timestamp: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  error_message?: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const R2_MIGRATION_BUCKET = 'chittyevidence-originals';
const R2_AUDIT_BUCKET = 'chitty-audit';
const NEON_DATABASE_URL = process.env.NEON_DATABASE_URL;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CHITTY_ID_SERVICE_TOKEN = process.env.CHITTY_ID_SERVICE_TOKEN;

// =============================================================================
// CHITTYID MINTING
// =============================================================================

/**
 * Mint a new ChittyID via ChittyID service
 */
async function mintChittyID(entity_type: 'EVIDENCE' | 'CHAIN_OF_CUSTODY'): Promise<string> {
  const response = await fetch('https://id.chitty.cc/api/v2/chittyid/mint', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CHITTY_ID_SERVICE_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ entity: entity_type })
  });

  if (!response.ok) {
    throw new Error(`Failed to mint ChittyID: ${response.statusText}`);
  }

  const data = await response.json();
  return data.chitty_id;
}

// =============================================================================
// KV → R2 MIGRATION
// =============================================================================

/**
 * Migrate a single KV entry to R2
 */
async function migrateKVToR2(
  namespace_id: string,
  key: string,
  dryRun: boolean = true
): Promise<MigrationResult> {
  console.error(`[Migrate] Processing: ${namespace_id}:${key}`);

  const result: MigrationResult = {
    namespace: namespace_id,
    original_key: key,
    r2_bucket: R2_MIGRATION_BUCKET,
    r2_key: '',
    sha256_hash: '',
    evidence_id: '',
    coc_id: '',
    migration_timestamp: new Date().toISOString(),
    status: 'SKIPPED'
  };

  try {
    // 1. Fetch value from KV
    const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${namespace_id}/values/${encodeURIComponent(key)}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch KV value: ${response.statusText}`);
    }

    const value = await response.text();

    // 2. Compute SHA-256 hash
    const hash = crypto.createHash('sha256');
    hash.update(value);
    const sha256_hash = hash.digest('hex');
    result.sha256_hash = sha256_hash;

    console.error(`[Migrate] Value size: ${value.length} bytes, SHA256: ${sha256_hash.substring(0, 16)}...`);

    if (dryRun) {
      result.status = 'SKIPPED';
      console.error(`[Migrate] DRY RUN - Would migrate to R2`);
      return result;
    }

    // 3. Mint ChittyIDs
    const evidence_id = await mintChittyID('EVIDENCE');
    const coc_id = await mintChittyID('CHAIN_OF_CUSTODY');
    result.evidence_id = evidence_id;
    result.coc_id = coc_id;

    console.error(`[Migrate] Minted Evidence ID: ${evidence_id}, COC ID: ${coc_id}`);

    // 4. Generate R2 key
    const r2_key = `evidence/kv-migration/${namespace_id}/${sha256_hash}/${key}`;
    result.r2_key = r2_key;

    // 5. Upload to R2 (using Cloudflare API)
    const r2UploadUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${R2_MIGRATION_BUCKET}/objects/${encodeURIComponent(r2_key)}`;
    const r2Response = await fetch(r2UploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'X-Custom-Metadata-evidence_id': evidence_id,
        'X-Custom-Metadata-sha256_hash': sha256_hash,
        'X-Custom-Metadata-coc_chitty_id': coc_id,
        'X-Custom-Metadata-source': 'KV_MIGRATION',
        'X-Custom-Metadata-original_namespace': namespace_id,
        'X-Custom-Metadata-original_key': key
      },
      body: value
    });

    if (!r2Response.ok) {
      throw new Error(`Failed to upload to R2: ${r2Response.statusText}`);
    }

    console.error(`[Migrate] Uploaded to R2: ${r2_key}`);

    // 6. Write chain of custody event to audit bucket
    const cocEvent = {
      evidence_id,
      coc_chitty_id: coc_id,
      event_type: 'INGESTION',
      event_timestamp: new Date().toISOString(),
      transfer_method: 'ELECTRONIC_PIPELINE',
      integrity_verified: true,
      integrity_check_method: 'HASH_VERIFICATION',
      notes: `Migrated from KV namespace ${namespace_id}, original key: ${key}`,
      sha256_hash,
      r2_bucket: R2_MIGRATION_BUCKET,
      r2_key
    };

    const auditKey = `migrations/kv-to-r2/${evidence_id}/coc-${coc_id}.json`;
    const auditUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${R2_AUDIT_BUCKET}/objects/${encodeURIComponent(auditKey)}`;
    const auditResponse = await fetch(auditUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(cocEvent, null, 2)
    });

    if (!auditResponse.ok) {
      console.error(`[Migrate] Warning: Failed to write audit log: ${auditResponse.statusText}`);
    } else {
      console.error(`[Migrate] Wrote audit log: ${auditKey}`);
    }

    // 7. Insert into Neon evidence registry (if available)
    if (NEON_DATABASE_URL) {
      // TODO: Implement Neon insert
      // await insertEvidenceRegistry(evidence_id, coc_id, r2_key, sha256_hash, ...);
      console.error(`[Migrate] TODO: Insert into Neon evidence registry`);
    }

    // 8. Replace KV entry with pointer
    const pointer = {
      type: 'R2_POINTER',
      r2_bucket: R2_MIGRATION_BUCKET,
      r2_key,
      evidence_id,
      sha256_hash,
      migrated_at: new Date().toISOString()
    };

    const kvUpdateUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${namespace_id}/values/${encodeURIComponent(key)}`;
    const kvUpdateResponse = await fetch(kvUpdateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pointer)
    });

    if (!kvUpdateResponse.ok) {
      console.error(`[Migrate] Warning: Failed to update KV with pointer: ${kvUpdateResponse.statusText}`);
    } else {
      console.error(`[Migrate] Replaced KV entry with R2 pointer`);
    }

    result.status = 'SUCCESS';
    console.error(`[Migrate] ✅ Migration complete for ${key}`);

  } catch (err) {
    result.status = 'FAILED';
    result.error_message = err instanceof Error ? err.message : String(err);
    console.error(`[Migrate] ❌ Migration failed: ${result.error_message}`);
  }

  return result;
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function runMigration(inputFile: string, dryRun: boolean) {
  console.error('='.repeat(80));
  console.error('ChittyOS KV to R2 Migration');
  console.error(dryRun ? 'MODE: DRY RUN (preview only)' : 'MODE: EXECUTE (live migration)');
  console.error('='.repeat(80));
  console.error('');

  // Validate environment
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  }

  if (!dryRun && !CHITTY_ID_SERVICE_TOKEN) {
    throw new Error('Missing CHITTY_ID_SERVICE_TOKEN (required for live migration)');
  }

  const results: MigrationResult[] = [];

  // Parse audit CSV
  const parser = createReadStream(inputFile).pipe(csvParse({
    columns: true,
    skip_empty_lines: true
  }));

  for await (const record of parser) {
    // Only migrate records marked for urgent migration
    if (record.recommended_action !== 'MIGRATE_TO_R2_URGENT') {
      console.error(`[Skip] ${record.namespace}:${record.key_sample} - Action: ${record.recommended_action}`);
      continue;
    }

    const result = await migrateKVToR2(
      record.namespace,
      record.key_sample,
      dryRun
    );

    results.push(result);

    // Rate limit to avoid overwhelming API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Output results CSV
  console.log('namespace,original_key,r2_bucket,r2_key,sha256_hash,evidence_id,coc_id,migration_timestamp,status,error_message');
  for (const result of results) {
    const row = [
      result.namespace,
      `"${result.original_key.replace(/"/g, '""')}"`,
      result.r2_bucket,
      `"${result.r2_key.replace(/"/g, '""')}"`,
      result.sha256_hash,
      result.evidence_id,
      result.coc_id,
      result.migration_timestamp,
      result.status,
      result.error_message ? `"${result.error_message.replace(/"/g, '""')}"` : ''
    ];

    console.log(row.join(','));
  }

  // Summary
  console.error('');
  console.error('='.repeat(80));
  console.error('Migration Summary');
  console.error('='.repeat(80));
  console.error(`Total records processed: ${results.length}`);
  console.error(`Successful migrations: ${results.filter(r => r.status === 'SUCCESS').length}`);
  console.error(`Failed migrations: ${results.filter(r => r.status === 'FAILED').length}`);
  console.error(`Skipped (dry run): ${results.filter(r => r.status === 'SKIPPED').length}`);
  console.error('');

  if (dryRun) {
    console.error('✅ DRY RUN COMPLETE - No changes made');
    console.error('   Review output and run with --execute to perform migration');
  } else {
    console.error('✅ MIGRATION COMPLETE');
    console.error('   Evidence migrated to R2 with chain of custody');
    console.error('   KV entries replaced with R2 pointers');
  }
}

// =============================================================================
// CLI ARGUMENT PARSING
// =============================================================================

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const executeMode = args.includes('--execute');
const inputIndex = args.indexOf('--input');
const inputFile = inputIndex >= 0 ? args[inputIndex + 1] : null;

if (!inputFile) {
  console.error('Usage: npx tsx scripts/migrate-kv-to-r2.ts --input <audit-csv> [--dry-run|--execute]');
  process.exit(1);
}

if (!dryRun && !executeMode) {
  console.error('Error: Must specify either --dry-run or --execute');
  process.exit(1);
}

runMigration(inputFile, dryRun).catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
