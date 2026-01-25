# Chitty Cloud Repo Operator (CCRO)

The Chitty Cloud Repo Operator is the central governance gateway for the ChittyOS ecosystem. It manages trust event ingestion, ChittyScore retrieval, and execution of the Justice Protocol.

## Overview

The CCRO serves as the orchestration layer between ChittyOS applications and the core infrastructure:

```text
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│              (Blue Pill / Red Pill UI Modes)                │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│    ChittyFinance │ ChittyCounsel │ ChittyPark │ ChittyTax   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│               Chitty Cloud Repo Operator                     │
│     • Bias Fingerprinting  • Trust Event Processing         │
│     • Justice Protocol     • Merkle Proof Generation        │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Core Services                              │
│        ChittyTrust │ ChittyChain │ ChittyID                 │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### Dual-Mode Transparency

The CCRO supports two view modes controlled via the `X-Chitty-View-Mode` header:

- **Blue Pill (Default)**: Simplified responses for general UI consumption
- **Red Pill**: Full audit data including Bias Fingerprints and Merkle Proofs

### Bias Fingerprinting

Every data point ingested by the CCRO is tagged with a Bias Fingerprint that captures:

- Provenance and source integrity
- Known biases and mitigation strategies
- Algorithmic context (if AI/ML processed)
- Justice alignment score

### Antifragile Justice Loop

Human overrides of automated decisions are treated as training signals:

1. Human reviews decision in Red Pill mode
2. Submits structured override with justification
3. CCRO commits precedent to ChittyChain
4. ChittyTrust model scheduled for retraining

## Directory Structure

```text
operators/chitty-cloud-repo-operator/
├── api/
│   └── openapi.yaml          # OpenAPI 3.1 specification
├── schemas/
│   └── v1/
│       ├── bias-fingerprint.json    # Provenance metadata envelope
│       ├── chitty-score.json        # Multi-dimensional trust score
│       ├── justice-override.json    # Human override event
│       ├── merkle-proof.json        # Cryptographic integrity proof
│       └── audit-event.json         # OCSF-compliant audit log
├── config-manifest.json      # Operator configuration
└── README.md                 # This file
```

## Schemas

### Bias Fingerprint (`bias-fingerprint.json`)

Mandatory metadata envelope attached to all Red Pill responses:

```json
{
  "provenance_id": "uuid",
  "timestamp": "ISO 8601",
  "source_integrity": {
    "origin_type": "GOVERNMENT_RECORD | FINANCIAL_INSTITUTION | ...",
    "source_authority_score": 0.0-1.0,
    "channel_noise_rating": 0.0-1.0
  },
  "known_biases": [...],
  "algorithmic_context": {...},
  "justice_alignment": {
    "score": 0-100,
    "precedent_ref": "chittychain://..."
  }
}
```

### ChittyScore (`chitty-score.json`)

Multi-dimensional trust metric with four pillars:

| Dimension | Source |
|-----------|--------|
| Personal | Peer-to-peer interactions (reviews, transactions) |
| Legal | Contract adherence via ChittyCounsel |
| State | Identity verification via ChittyID |
| Ethics | Dispute resolution and fair play history |

### Justice Override (`justice-override.json`)

Structured record of human intervention:

- **Categories**: `CONTEXT_MISSING`, `HISTORICAL_BIAS_CORRECTION`, `COMPASSIONATE_EXCEPTION`, `DATA_ERROR`, `POLICY_MISAPPLICATION`, `EMERGENT_CIRCUMSTANCE`, `PRECEDENT_REVISION`
- **Required Roles**: `COMMUNITY_JUROR`, `CHITTY_STEWARD`, `LEGAL_ARBITER`, `FOUNDATION_TRUSTEE`, `EMERGENCY_ADMIN`

### Merkle Proof (`merkle-proof.json`)

Cryptographic proof for data integrity verification:

```json
{
  "root_hash": "0x...",
  "leaf_hash": "0x...",
  "siblings": [
    { "position": "left", "hash": "0x..." },
    { "position": "right", "hash": "0x..." }
  ],
  "anchor_timestamp": "ISO 8601"
}
```

### Audit Event (`audit-event.json`)

OCSF-compliant audit logging with ChittyOS extensions:

| OCSF Class | Chitty Operation |
|------------|------------------|
| 1001 (System Activity) | Trust Score Update |
| 3002 (Authentication) | Identity Verification |
| 5001 (Compliance) | Justice Override |
| 6004 (Datastore Activity) | Ledger Commit |

## API Endpoints

See `api/openapi.yaml` for complete specification.

### Trust Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/trust/score/{entityId}` | Retrieve ChittyScore |
| POST | `/trust/event` | Ingest trust event |
| GET | `/trust/event/{eventId}` | Check event status |

### Justice Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/justice/override` | Execute justice override |
| GET | `/justice/precedents` | List historical precedents |

### Verification Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/verify/notary` | Verify document/claim |

### Ledger Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ledger/proof/{dataHash}` | Get Merkle proof |
| GET | `/ledger/audit` | Get OCSF audit log |

## Security

### Authentication

- **mTLS**: Required for service-to-service communication
- **OAuth2/OIDC**: User authentication via ChittyID
- **API Keys**: For automated integrations (rate-limited)

### Scopes

| Scope | Permission |
|-------|------------|
| `trust.read` | Read trust scores |
| `trust.write` | Submit trust events |
| `justice.override` | Execute overrides (high privilege) |
| `ledger.audit` | Access full audit history |

## Configuration

The operator is configured via `config-manifest.json`:

```json
{
  "operator": "chitty-cloud-repo-operator",
  "version": 2,
  "schemas": {
    "base_url": "https://api.chitty.os/schemas/v1",
    "definitions": [...]
  },
  "api": {
    "spec": "api/openapi.yaml",
    "version": "1.2.0"
  }
}
```

## Development

### Validating Schemas

```bash
# Install ajv-cli for JSON Schema validation
npm install -g ajv-cli

# Validate schemas
ajv validate -s schemas/v1/bias-fingerprint.json -d test-data.json
```

### Generating API Clients

```bash
# Generate TypeScript client
npx @openapitools/openapi-generator-cli generate \
  -i api/openapi.yaml \
  -g typescript-fetch \
  -o ./generated/client
```

## Related Documentation

- [ChittyOS Architecture](../../CHARTER.md)
- [Secrets Provisioning](../../SECRETS_PROVISIONING.md)
- [CI/CD SOPs](../../ChittyOS-CICD-SOPs.md)
