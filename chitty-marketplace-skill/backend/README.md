# ChittyOS Marketplace Skill - Backend

Webhook backend server for handling ChittyOS Marketplace Skill lifecycle events, user provisioning, subscription management, and usage tracking.

## Features

- **User Provisioning**: Automatic ChittyID generation when users install the skill
- **Subscription Management**: Handle upgrades, downgrades, and cancellations
- **Usage Tracking**: Enforce quotas based on subscription tier
- **Billing Integration**: Stripe webhook handlers for payment events
- **Caching**: KV namespace for fast subscription lookups

## Architecture

Built on Cloudflare Workers with:
- **Hono** framework for routing
- **Neon PostgreSQL** for subscription data
- **KV** for caching active subscriptions
- **JWT** authentication for API calls

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
# Server runs on http://localhost:8787
```

## Configuration

### Required Secrets

Set these via `wrangler secret put`:

```bash
wrangler secret put NEON_DATABASE_URL
wrangler secret put JWT_SECRET
wrangler secret put CHITTY_ID_SERVICE_TOKEN
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
```

### Database Setup

Run the migration to create required tables:

```bash
psql $NEON_DATABASE_URL < migration.sql
```

This creates:
- `marketplace_subscriptions` - User subscription records
- `marketplace_usage_events` - Usage tracking (optional analytics)

## API Endpoints

### Webhooks (Called by Claude Marketplace)

#### POST `/webhooks/install`
Called when user installs the skill.

**Request:**
```json
{
  "claude_user_id": "user_abc123",
  "skill_id": "chittyos_legal_intelligence",
  "tier": "basic"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": "01-C-ACT-1234-P-2411-5-0",
    "claude_user_id": "user_abc123",
    "tier": "basic",
    "status": "active",
    "limits": {
      "cases_per_month": 5,
      "evidence_items": 50,
      "trust_scores": 10
    }
  }
}
```

#### POST `/webhooks/subscription/change`
Called when user upgrades or downgrades.

**Request:**
```json
{
  "claude_user_id": "user_abc123",
  "new_tier": "professional"
}
```

#### POST `/webhooks/subscription/cancel`
Called when user cancels subscription.

**Request:**
```json
{
  "claude_user_id": "user_abc123"
}
```

#### POST `/webhooks/stripe`
Stripe webhook handler for payment events.

Handles:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

### API Endpoints (Called by Skill Tools)

#### POST `/api/usage/track`
Track resource usage against quotas.

**Request:**
```json
{
  "resource_type": "case",
  "amount": 1
}
```

**Response (success):**
```json
{
  "success": true,
  "quota": {
    "limit": 5,
    "used": 3,
    "remaining": 2
  }
}
```

**Response (quota exceeded):**
```json
{
  "success": false,
  "error": "Quota exceeded",
  "quota": {
    "limit": 5,
    "used": 5,
    "remaining": 0
  }
}
```

#### GET `/api/subscription/:claude_user_id`
Get subscription status and usage.

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": "01-C-ACT-1234-P-2411-5-0",
    "claude_user_id": "user_abc123",
    "tier": "professional",
    "status": "active",
    "cases_used": 12,
    "evidence_items_used": 234,
    "trust_scores_used": 45,
    "period_start": "2024-11-01T00:00:00Z",
    "period_end": "2024-12-01T00:00:00Z"
  },
  "cached": true
}
```

## Subscription Tiers

| Tier | Price | Cases/Month | Evidence Items | Trust Scores |
|------|-------|-------------|----------------|--------------|
| Basic | Free | 5 | 50 | 10 |
| Professional | $49/mo | 50 | 1,000 | 100 |
| Enterprise | Custom | Unlimited | Unlimited | Unlimited |

## Deployment

### Staging
```bash
npm run deploy:staging
```

### Production
```bash
npm run deploy:production
```

## Monitoring

Stream live logs:
```bash
npm run tail
```

## Usage Tracking Flow

1. User invokes skill tool (e.g., "analyze this case")
2. Skill calls `/api/usage/track` with resource type
3. Backend checks subscription tier and current usage
4. If under quota: increment usage, allow action
5. If over quota: return 429 error, block action

## Caching Strategy

Subscriptions are cached in KV for 1 hour:
- Key: `sub:{claude_user_id}`
- Value: JSON with user_id, tier, status
- Invalidated on tier change or cancellation

## Monthly Reset

Usage counters reset automatically when billing period ends. Run manually:

```sql
SELECT reset_monthly_usage();
```

Or set up cron trigger in Cloudflare Workers:

```toml
[triggers.crons]
- cron = "0 0 1 * *"  # First day of each month at midnight
```

## Testing

```bash
npm test
```

## Security

- All webhook requests should be authenticated via signature verification
- API calls require JWT bearer token
- Stripe webhooks verified via signature
- Rate limiting on public endpoints
- CORS restricted to Claude domains

## Error Handling

Standard error response:
```json
{
  "success": false,
  "error": "Error message"
}
```

HTTP status codes:
- `400` - Bad request (missing parameters)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (no active subscription)
- `404` - Not found (subscription doesn't exist)
- `429` - Too many requests (quota exceeded)
- `500` - Internal server error

## License

MIT
