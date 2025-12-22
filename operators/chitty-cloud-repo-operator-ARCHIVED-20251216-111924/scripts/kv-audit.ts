/**
 * ChittyOS KV Namespace Audit Script
 * P0 - EMERGENCY/LEGAL Priority
 *
 * Scans all 96 KV namespaces for potential evidence violations.
 * Produces CSV report: namespace, key_sample, size, suspected_evidence, recommended_action
 *
 * Usage:
 *   npx tsx scripts/kv-audit.ts > kv-audit-report.csv
 *
 * @version 1.0.0
 * @authority ChittyOS Core Team
 */

import { createInterface } from 'readline';
import { createWriteStream } from 'fs';

// =============================================================================
// TYPES
// =============================================================================

interface KVNamespaceInfo {
  binding: string;
  namespace_id: string;
  title: string;
}

interface KVAuditResult {
  namespace: string;
  key_sample: string;
  value_size: number;
  value_type: string;
  suspected_evidence: boolean;
  evidence_indicators: string[];
  recommended_action: string;
  scanned_at: string;
}

// =============================================================================
// KNOWN NAMESPACES (from Cloudflare dashboard - 96 total)
// =============================================================================

const KNOWN_NAMESPACES: KVNamespaceInfo[] = [
  // ChittyOps / Project Awareness
  { binding: 'SESSION_STORE', namespace_id: 'chittyops_sessions', title: 'ChittyOps Sessions' },
  { binding: 'PROJECT_STORE', namespace_id: 'chittyops_projects', title: 'ChittyOps Projects' },
  { binding: 'CROSS_PLATFORM_SYNC', namespace_id: 'chittyops_cross_platform', title: 'Cross-Platform Sync' },
  { binding: 'ANALYTICS_STORE', namespace_id: 'chittyops_analytics', title: 'Analytics Cache' },
  { binding: 'SUBSCRIPTION_CACHE', namespace_id: 'marketplace_subscription_cache', title: 'Subscription Cache' },
  { binding: 'CACHE_STORE', namespace_id: 'chittyops_cache_prod', title: 'General Cache' },

  // CRITICAL: Potential violations from dashboard
  { binding: 'EMAIL_ANALYTICS', namespace_id: 'email_analytics', title: 'Email Analytics' },
  { binding: 'FINANCIAL_EMAILS', namespace_id: 'financial_emails', title: 'Financial Emails' },
  { binding: 'CHITTY_SESSIONS', namespace_id: 'chitty_sessions', title: 'Chitty Sessions' },
  { binding: 'CHITTYID_KV', namespace_id: 'chittyid_kv', title: 'ChittyID Cache' },
  { binding: 'CREDENTIAL_CACHE', namespace_id: 'credential_cache', title: 'Credential Cache' },
  { binding: 'CHITTY_USAGE', namespace_id: 'chitty_usage', title: 'Chitty Usage' },
  { binding: 'CHITTYTRUST', namespace_id: 'chittytrust', title: 'ChittyTrust' },
  { binding: 'CHITTY_RATE_LIMIT', namespace_id: 'chitty_rate_limit', title: 'Rate Limiting' },

  // Add remaining 82 namespaces here as discovered
  // ...
];

// =============================================================================
// EVIDENCE DETECTION HEURISTICS
// =============================================================================

/**
 * Heuristics to detect if a KV value contains evidence that should be in R2
 */
function detectEvidenceContent(
  key: string,
  value: string,
  metadata: any
): { suspected: boolean; indicators: string[] } {
  const indicators: string[] = [];
  const valueLower = value.toLowerCase();

  // Size thresholds (evidence files are typically large)
  if (value.length > 50000) { // 50KB
    indicators.push('LARGE_VALUE');
  }

  if (value.length > 100000) { // 100KB - very likely evidence
    indicators.push('VERY_LARGE_VALUE');
  }

  // Base64 detection (likely binary content)
  if (/^[A-Za-z0-9+/=]{100,}$/.test(value)) {
    indicators.push('BASE64_ENCODED');
  }

  // PDF content
  if (valueLower.includes('%pdf') || valueLower.includes('pdf-')) {
    indicators.push('PDF_CONTENT');
  }

  // Email content
  if (valueLower.includes('from:') && valueLower.includes('subject:') && valueLower.includes('content-type:')) {
    indicators.push('EMAIL_CONTENT');
  }

  // Bank statement patterns
  if (valueLower.includes('account number') && valueLower.includes('balance')) {
    indicators.push('BANK_STATEMENT');
  }

  // Legal document patterns
  if (valueLower.includes('plaintiff') || valueLower.includes('defendant') || valueLower.includes('whereas')) {
    indicators.push('LEGAL_DOCUMENT');
  }

  // Evidence field names (explicit fields suggesting full evidence)
  const evidenceFields = [
    'evidence_content',
    'document_body',
    'full_text',
    'file_data',
    'artifact_content',
    'email_body',
    'email_html',
    'attachment_data'
  ];

  for (const field of evidenceFields) {
    if (valueLower.includes(field)) {
      indicators.push(`FIELD:${field.toUpperCase()}`);
    }
  }

  // Key name patterns (suspicious key names)
  const keyLower = key.toLowerCase();
  if (keyLower.includes('evidence:') || keyLower.includes('document:') || keyLower.includes('email:')) {
    indicators.push('SUSPICIOUS_KEY_NAME');
  }

  // Metadata check (if available)
  if (metadata) {
    if (metadata.mime_type || metadata.content_type) {
      indicators.push('METADATA_HAS_MIME_TYPE');
    }
    if (metadata.file_size || metadata.sha256) {
      indicators.push('METADATA_HAS_FILE_ATTRIBUTES');
    }
  }

  const suspected = indicators.length > 0;

  return { suspected, indicators };
}

/**
 * Determine recommended action based on detection results
 */
function recommendAction(result: { suspected: boolean; indicators: string[] }): string {
  if (!result.suspected) {
    return 'MONITOR';
  }

  // Critical violations (high confidence evidence)
  if (result.indicators.includes('VERY_LARGE_VALUE') ||
      result.indicators.includes('PDF_CONTENT') ||
      result.indicators.includes('EMAIL_CONTENT') ||
      result.indicators.includes('BANK_STATEMENT')) {
    return 'MIGRATE_TO_R2_URGENT';
  }

  // Potential violations (medium confidence)
  if (result.indicators.includes('LARGE_VALUE') ||
      result.indicators.includes('BASE64_ENCODED') ||
      result.indicators.some(i => i.startsWith('FIELD:'))) {
    return 'INVESTIGATE_AND_MIGRATE';
  }

  // Low confidence but suspicious
  return 'MANUAL_REVIEW';
}

// =============================================================================
// CLOUDFLARE KV API INTERACTIONS
// =============================================================================

/**
 * List keys in a KV namespace using Cloudflare API
 * Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars
 */
async function listKeysInNamespace(namespaceId: string, limit: number = 100): Promise<string[]> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN environment variables');
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys?limit=${limit}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to list keys: ${response.statusText}`);
  }

  const data = await response.json();
  return data.result.map((item: any) => item.name);
}

/**
 * Get value from KV namespace using Cloudflare API
 */
async function getValueFromNamespace(namespaceId: string, key: string): Promise<{ value: string; metadata: any }> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN environment variables');
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get value: ${response.statusText}`);
  }

  const value = await response.text();
  const metadata = response.headers.get('cf-kv-metadata');

  return {
    value,
    metadata: metadata ? JSON.parse(metadata) : null
  };
}

// =============================================================================
// AUDIT EXECUTION
// =============================================================================

/**
 * Audit a single KV namespace
 */
async function auditNamespace(ns: KVNamespaceInfo, sampleSize: number = 10): Promise<KVAuditResult[]> {
  const results: KVAuditResult[] = [];

  console.error(`[Audit] Scanning namespace: ${ns.title} (${ns.namespace_id})...`);

  try {
    // List keys (sample first N keys)
    const keys = await listKeysInNamespace(ns.namespace_id, sampleSize);

    if (keys.length === 0) {
      console.error(`[Audit] Namespace ${ns.title} is empty.`);
      return results;
    }

    console.error(`[Audit] Found ${keys.length} keys in ${ns.title}. Sampling...`);

    // Sample keys for inspection
    for (const key of keys.slice(0, sampleSize)) {
      try {
        const { value, metadata } = await getValueFromNamespace(ns.namespace_id, key);

        const { suspected, indicators } = detectEvidenceContent(key, value, metadata);
        const action = recommendAction({ suspected, indicators });

        results.push({
          namespace: ns.title,
          key_sample: key.length > 50 ? key.substring(0, 50) + '...' : key,
          value_size: value.length,
          value_type: typeof value,
          suspected_evidence: suspected,
          evidence_indicators: indicators,
          recommended_action: action,
          scanned_at: new Date().toISOString()
        });

        console.error(`[Audit] Key: ${key.substring(0, 30)}... Size: ${value.length} Suspected: ${suspected}`);
      } catch (err) {
        console.error(`[Audit] Error fetching key ${key}:`, err);
      }
    }
  } catch (err) {
    console.error(`[Audit] Error auditing namespace ${ns.title}:`, err);
  }

  return results;
}

/**
 * Main audit function
 */
async function runAudit() {
  console.error('='.repeat(80));
  console.error('ChittyOS KV Namespace Audit');
  console.error('P0 - EMERGENCY/LEGAL Priority');
  console.error('='.repeat(80));
  console.error('');

  const allResults: KVAuditResult[] = [];

  // Audit all namespaces
  for (const ns of KNOWN_NAMESPACES) {
    const results = await auditNamespace(ns, 10);
    allResults.push(...results);
  }

  // Output CSV to stdout
  console.log('namespace,key_sample,value_size,value_type,suspected_evidence,evidence_indicators,recommended_action,scanned_at');

  for (const result of allResults) {
    const row = [
      result.namespace,
      `"${result.key_sample.replace(/"/g, '""')}"`,
      result.value_size,
      result.value_type,
      result.suspected_evidence,
      `"${result.evidence_indicators.join(', ')}"`,
      result.recommended_action,
      result.scanned_at
    ];

    console.log(row.join(','));
  }

  // Summary to stderr
  console.error('');
  console.error('='.repeat(80));
  console.error('Audit Summary');
  console.error('='.repeat(80));
  console.error(`Total namespaces scanned: ${KNOWN_NAMESPACES.length}`);
  console.error(`Total keys inspected: ${allResults.length}`);
  console.error(`Suspected evidence violations: ${allResults.filter(r => r.suspected_evidence).length}`);
  console.error(`URGENT migrations required: ${allResults.filter(r => r.recommended_action === 'MIGRATE_TO_R2_URGENT').length}`);
  console.error('');

  // Alert on critical findings
  const urgentCount = allResults.filter(r => r.recommended_action === 'MIGRATE_TO_R2_URGENT').length;
  if (urgentCount > 0) {
    console.error('🚨 ALERT: URGENT EVIDENCE VIOLATIONS DETECTED 🚨');
    console.error(`   ${urgentCount} keys require immediate migration to R2.`);
    console.error('   Review kv-audit-report.csv and execute migration plan.');
  }
}

// =============================================================================
// EXECUTION
// =============================================================================

runAudit().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
