# ChittyOS Evidence Architecture - Scripts & Tools

**Purpose:** Emergency audit and migration tools for ChittyOS evidence-centric architecture compliance

---

## Scripts Overview

| Script | Priority | Purpose | Output |
|--------|----------|---------|--------|
| `kv-audit.ts` | **P0 - URGENT** | Scan 96 KV namespaces for evidence violations | CSV report |
| `migrate-kv-to-r2.ts` | **P0 - URGENT** | Migrate evidence from KV to R2 with COC tracking | CSV results |

---

## Prerequisites

### Environment Variables

```bash
# Required for all scripts
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_API_TOKEN="your-api-token"

# Required for migration (live mode only)
export CHITTY_ID_SERVICE_TOKEN="your-chittyid-token"

# Optional (for Neon integration)
export NEON_DATABASE_URL="postgresql://..."
```

### Dependencies

```bash
# Install TypeScript and dependencies
npm install -g tsx
npm install csv-parse
```

---

## KV Audit Script

### Purpose
Scans all Workers KV namespaces to detect if any contain raw evidence that should be in R2.

### Usage

```bash
# Run audit and save report
npx tsx scripts/kv-audit.ts > kv-audit-report.csv 2> audit.log

# View summary in logs
cat audit.log
```

### Output Format (CSV)

```csv
namespace,key_sample,value_size,value_type,suspected_evidence,evidence_indicators,recommended_action,scanned_at
EMAIL_ANALYTICS,"email:2024-123",125000,string,true,"LARGE_VALUE, EMAIL_CONTENT",MIGRATE_TO_R2_URGENT,2025-12-15T18:30:00Z
```

### Evidence Detection Heuristics

The script uses the following indicators to detect evidence:

- **VERY_LARGE_VALUE**: Value > 100KB (high confidence evidence)
- **LARGE_VALUE**: Value > 50KB (potential evidence)
- **BASE64_ENCODED**: Large base64 strings (likely binary content)
- **PDF_CONTENT**: PDF file indicators
- **EMAIL_CONTENT**: Email headers and body
- **BANK_STATEMENT**: Bank account patterns
- **LEGAL_DOCUMENT**: Legal terminology (plaintiff, defendant, whereas)
- **FIELD:*****: Suspicious field names (evidence_content, document_body, etc.)
- **SUSPICIOUS_KEY_NAME**: Key names like `evidence:*`, `document:*`, `email:*`
- **METADATA_HAS_MIME_TYPE**: Metadata indicates file attachment
- **METADATA_HAS_FILE_ATTRIBUTES**: Metadata includes file_size or sha256

### Recommended Actions

- **MIGRATE_TO_R2_URGENT**: High-confidence evidence violation - migrate immediately
- **INVESTIGATE_AND_MIGRATE**: Medium-confidence violation - manual review then migrate
- **MANUAL_REVIEW**: Low confidence but suspicious - investigate
- **MONITOR**: No violations detected - continue monitoring

### Example Workflow

```bash
# 1. Run audit
npx tsx scripts/kv-audit.ts > kv-audit-report.csv 2> audit.log

# 2. Review results
grep "MIGRATE_TO_R2_URGENT" kv-audit-report.csv | wc -l

# 3. If violations found, escalate to legal and prepare migration
```

---

## KV to R2 Migration Script

### Purpose
Migrates evidence from KV namespaces to R2 with proper chain of custody tracking.

### Usage

```bash
# DRY RUN (preview only, no changes made)
npx tsx scripts/migrate-kv-to-r2.ts \
  --input kv-audit-report.csv \
  --dry-run \
  > migration-dry-run.csv 2> migration-dry-run.log

# EXECUTE (live migration)
npx tsx scripts/migrate-kv-to-r2.ts \
  --input kv-audit-report.csv \
  --execute \
  > migration-results.csv 2> migration.log
```

### Migration Process (Per Key)

1. **Fetch** value from KV namespace
2. **Compute** SHA-256 hash for integrity
3. **Mint** ChittyIDs (evidence_id + coc_id) via ChittyID service
4. **Generate** R2 key: `evidence/kv-migration/{namespace}/{hash}/{original_key}`
5. **Upload** to R2 with metadata:
   - `evidence_id`, `sha256_hash`, `coc_chitty_id`
   - `source: KV_MIGRATION`
   - `original_namespace`, `original_key`
6. **Write** chain of custody event to `r2://chitty-audit/migrations/...`
7. **Insert** evidence registry row (Neon - if available)
8. **Replace** KV entry with R2 pointer

### Output Format (CSV)

```csv
namespace,original_key,r2_bucket,r2_key,sha256_hash,evidence_id,coc_id,migration_timestamp,status,error_message
EMAIL_ANALYTICS,"email:2024-123",chittyevidence-originals,"evidence/kv-migration/...",a1b2c3...,01-C-ACT-...,01-C-ACT-...,2025-12-15T18:45:00Z,SUCCESS,
```

### Safety Features

- **Dry Run Mode**: Test migration without making changes
- **SHA-256 Verification**: Integrity check on every file
- **Chain of Custody**: Immutable audit trail for each migration
- **KV Pointer Replacement**: KV entry becomes R2 reference (not deleted)
- **Audit Logging**: All actions logged to `r2://chitty-audit/migrations/`
- **Rate Limiting**: 1 second delay between operations

### Example Workflow

```bash
# 1. Review audit report first
cat kv-audit-report.csv | grep "MIGRATE_TO_R2_URGENT"

# 2. Dry run migration (no changes)
npx tsx scripts/migrate-kv-to-r2.ts \
  --input kv-audit-report.csv \
  --dry-run \
  > migration-dry-run.csv

# 3. Review dry run results
cat migration-dry-run.log

# 4. Get legal approval for migration plan

# 5. Execute live migration
npx tsx scripts/migrate-kv-to-r2.ts \
  --input kv-audit-report.csv \
  --execute \
  > migration-results.csv

# 6. Verify all migrations successful
grep "FAILED" migration-results.csv
```

---

## Post-Migration Verification

### 1. Check R2 Objects

```bash
# Verify evidence exists in R2
wrangler r2 object list chittyevidence-originals --prefix evidence/kv-migration/

# Check object metadata
wrangler r2 object get chittyevidence-originals <r2_key> --metadata
```

### 2. Verify Chain of Custody

```bash
# Check audit logs
wrangler r2 object list chitty-audit --prefix migrations/kv-to-r2/

# Retrieve COC event
wrangler r2 object get chitty-audit migrations/kv-to-r2/<evidence_id>/coc-<coc_id>.json
```

### 3. Verify KV Pointers

```bash
# Check KV entry is now a pointer
wrangler kv:key get --namespace-id=<namespace_id> "<key>"

# Expected output:
# {
#   "type": "R2_POINTER",
#   "r2_bucket": "chittyevidence-originals",
#   "r2_key": "evidence/kv-migration/...",
#   "evidence_id": "01-C-ACT-...",
#   "sha256_hash": "a1b2c3...",
#   "migrated_at": "2025-12-15T18:45:00Z"
# }
```

### 4. Verify Neon Registry (if configured)

```sql
-- Check evidence was registered
SELECT * FROM evidence WHERE chitty_id = '01-C-ACT-...';

-- Check chain of custody event
SELECT * FROM evidence_chain_of_custody WHERE coc_chitty_id = '01-C-ACT-...';
```

---

## Troubleshooting

### Error: Missing environment variables

```
Error: Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN
```

**Solution:** Set required environment variables (see Prerequisites)

### Error: Failed to mint ChittyID

```
Error: Failed to mint ChittyID: Unauthorized
```

**Solution:** Verify `CHITTY_ID_SERVICE_TOKEN` is set and valid

### Error: Failed to upload to R2

```
Error: Failed to upload to R2: 403 Forbidden
```

**Solution:** Check Cloudflare API token has R2 write permissions

### Migration shows SKIPPED for all items

**Reason:** Running in `--dry-run` mode (expected behavior)

**Solution:** Use `--execute` flag for live migration

---

## Security Considerations

### API Token Permissions

The Cloudflare API token requires:
- ✅ Workers KV: Read
- ✅ R2: Read + Write
- ❌ Workers KV: Write (not required - only replaces values)

### Data Sensitivity

- All KV values are fetched and processed in memory
- SHA-256 hashes are computed before upload
- Original KV values are NOT deleted (replaced with pointers)
- All migrations are logged to audit bucket

### Legal Compliance

- Chain of custody tracked for every migration
- Original namespace + key preserved in metadata
- Migration timestamp recorded (ISO 8601)
- Audit trail immutable in R2

---

## Next Steps After Migration

1. **Update Application Code**
   - Replace KV reads with R2 pointer resolution
   - Example: If KV returns `{type: "R2_POINTER", r2_key: "..."}`, fetch from R2

2. **Deploy Pipeline**
   - New evidence ingestion must flow through pipeline
   - No direct KV writes for evidence

3. **Enforce KV Policy**
   - Deploy `storage-guard.ts` middleware
   - Block evidence writes to KV at runtime

4. **Monitor Compliance**
   - Set up alerts for policy violations
   - Regular KV audits (monthly)

---

## Support & Escalation

- **Technical Issues:** ChittyOS Core Team
- **Legal Review:** Legal Counsel (evidence migration)
- **Security Incidents:** Security Team (immediate escalation)

---

**Version:** 1.0.0
**Last Updated:** 2025-12-15
**Owner:** ChittyOS Core Team
