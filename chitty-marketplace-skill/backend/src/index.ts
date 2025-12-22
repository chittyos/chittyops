/**
 * ChittyOS Marketplace Skill - Webhook Backend
 *
 * Handles:
 * - User provisioning when skill is installed
 * - Subscription lifecycle (upgrade, downgrade, cancel)
 * - Usage tracking and quota enforcement
 * - Billing integration
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';
import { ChittyConnectClient, createChittyConnectFromEnv } from './chittyconnect';

type Bindings = {
  NEON_DATABASE_URL: string;
  JWT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  CHITTY_ID_SERVICE_TOKEN: string;
  SUBSCRIPTION_CACHE: KVNamespace;
  CHITTYCONNECT_URL?: string;
  CHITTYCONNECT_API_TOKEN: string;
};

type SubscriptionTier = 'basic' | 'professional' | 'enterprise';

interface UserSubscription {
  user_id: string;
  claude_user_id: string;
  tier: SubscriptionTier;
  status: 'active' | 'suspended' | 'cancelled';
  cases_used: number;
  evidence_items_used: number;
  trust_scores_used: number;
  period_start: string;
  period_end: string;
  created_at: string;
  updated_at: string;
}

const app = new Hono<{ Bindings: Bindings }>();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: ['https://claude.ai', 'https://marketplace.claude.ai'],
  credentials: true,
}));

/**
 * Health check
 */
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'chittyos-marketplace-skill',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Skill Installation Webhook
 * Called by Claude Marketplace when user installs the skill
 */
app.post('/webhooks/install', async (c) => {
  try {
    const body = await c.req.json();
    const { claude_user_id, skill_id, tier = 'basic' } = body;

    if (!claude_user_id) {
      return c.json({
        success: false,
        error: 'claude_user_id is required',
      }, 400);
    }

    // Generate ChittyID for new user
    const chittyIdResponse = await fetch('https://id.chitty.cc/api/v2/chittyid/mint', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.CHITTY_ID_SERVICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entity: 'PERSON' }),
    });

    if (!chittyIdResponse.ok) {
      throw new Error('Failed to generate ChittyID');
    }

    const chittyIdResult = await chittyIdResponse.json() as any;
    const chittyId = chittyIdResult.data.chitty_id;

    // Create subscription record
    const sql = neon(c.env.NEON_DATABASE_URL);
    const now = new Date().toISOString();
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    await sql`
      INSERT INTO marketplace_subscriptions (
        user_id, claude_user_id, tier, status,
        cases_used, evidence_items_used, trust_scores_used,
        period_start, period_end, created_at, updated_at
      ) VALUES (
        ${chittyId}, ${claude_user_id}, ${tier}, 'active',
        0, 0, 0,
        ${now}, ${periodEnd}, ${now}, ${now}
      )
    `;

    // Cache subscription for fast lookup
  await c.env.SUBSCRIPTION_CACHE.put(
      `sub:${claude_user_id}`,
      JSON.stringify({ chittyId, tier, status: 'active' }),
      { expirationTtl: 3600 } // 1 hour cache
    );
    // Best-effort: notify ChittyConnect about installation
    try {
      const connect = createChittyConnectFromEnv(c.env);
      await connect.post('/api/marketplace/installations', {
        user_id: chittyId,
        claude_user_id,
        tier,
        installed_at: now,
        service: 'chittyos-marketplace-skill',
      });
    } catch (e) {
      console.log('ChittyConnect installation notify failed (ignored):', e);
    }

    return c.json({
      success: true,
      data: {
        user_id: chittyId,
        claude_user_id: claude_user_id,
        tier: tier,
        status: 'active',
        limits: getTierLimits(tier as SubscriptionTier),
      },
    });
  } catch (error) {
    console.error('Installation error:', error);
    return c.json({
      success: false,
      error: 'Failed to provision user',
    }, 500);
  }
});

/**
 * Subscription Upgrade/Downgrade Webhook
 */
app.post('/webhooks/subscription/change', async (c) => {
  try {
    const body = await c.req.json();
    const { claude_user_id, new_tier } = body;

    if (!claude_user_id || !new_tier) {
      return c.json({
        success: false,
        error: 'claude_user_id and new_tier are required',
      }, 400);
    }

    const sql = neon(c.env.NEON_DATABASE_URL);
    const now = new Date().toISOString();

    // Update subscription tier
    await sql`
      UPDATE marketplace_subscriptions
      SET tier = ${new_tier},
          updated_at = ${now}
      WHERE claude_user_id = ${claude_user_id}
    `;

  // Invalidate cache
  await c.env.SUBSCRIPTION_CACHE.delete(`sub:${claude_user_id}`);

    // Best-effort: notify ChittyConnect about subscription change
    try {
      const connect = createChittyConnectFromEnv(c.env);
      await connect.post('/api/marketplace/subscriptions/change', {
        claude_user_id,
        new_tier,
        changed_at: now,
      });
    } catch (e) {
      console.log('ChittyConnect subscription change notify failed (ignored):', e);
    }

    return c.json({
      success: true,
      data: {
        claude_user_id: claude_user_id,
        new_tier: new_tier,
        limits: getTierLimits(new_tier as SubscriptionTier),
      },
    });
  } catch (error) {
    console.error('Subscription change error:', error);
    return c.json({
      success: false,
      error: 'Failed to update subscription',
    }, 500);
  }
});

/**
 * Subscription Cancellation Webhook
 */
app.post('/webhooks/subscription/cancel', async (c) => {
  try {
    const body = await c.req.json();
    const { claude_user_id } = body;

    if (!claude_user_id) {
      return c.json({
        success: false,
        error: 'claude_user_id is required',
      }, 400);
    }

    const sql = neon(c.env.NEON_DATABASE_URL);
    const now = new Date().toISOString();

    // Mark subscription as cancelled
    await sql`
      UPDATE marketplace_subscriptions
      SET status = 'cancelled',
          updated_at = ${now}
      WHERE claude_user_id = ${claude_user_id}
    `;

  // Invalidate cache
  await c.env.SUBSCRIPTION_CACHE.delete(`sub:${claude_user_id}`);

    // Best-effort: notify ChittyConnect about cancellation
    try {
      const connect = createChittyConnectFromEnv(c.env);
      await connect.post('/api/marketplace/subscriptions/cancel', {
        claude_user_id,
        cancelled_at: now,
      });
    } catch (e) {
      console.log('ChittyConnect cancellation notify failed (ignored):', e);
    }

    return c.json({
      success: true,
      data: {
        claude_user_id: claude_user_id,
        status: 'cancelled',
      },
    });
  } catch (error) {
    console.error('Cancellation error:', error);
    return c.json({
      success: false,
      error: 'Failed to cancel subscription',
    }, 500);
  }
});

/**
 * Usage Tracking Endpoint
 * Called by skill tools to track usage against quotas
 */
app.post('/api/usage/track', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, c.env.JWT_SECRET) as any;
    const claude_user_id = decoded.claude_user_id;

    const body = await c.req.json();
    const { resource_type, amount = 1 } = body;

    // Check cache first
    let subscription: any = null;
    const cached = await c.env.SUBSCRIPTION_CACHE.get(`sub:${claude_user_id}`);

    if (cached) {
      subscription = JSON.parse(cached);
    } else {
      // Load from database
      const sql = neon(c.env.NEON_DATABASE_URL);
      const rows = await sql`
        SELECT * FROM marketplace_subscriptions
        WHERE claude_user_id = ${claude_user_id}
        AND status = 'active'
      `;

      if (rows.length === 0) {
        return c.json({
          success: false,
          error: 'No active subscription found',
        }, 403);
      }

      subscription = rows[0];
    }

    // Check quota limits
    const limits = getTierLimits(subscription.tier);
    const fieldMap: Record<string, keyof typeof limits> = {
      'case': 'cases_per_month',
      'evidence': 'evidence_items',
      'trust_score': 'trust_scores',
    };

    const limitField = fieldMap[resource_type];
    if (!limitField) {
      return c.json({
        success: false,
        error: 'Invalid resource_type',
      }, 400);
    }

    const currentUsage = subscription[`${resource_type}s_used`] || 0;
    const limit = limits[limitField];

    if (limit !== 'unlimited' && currentUsage + amount > limit) {
      return c.json({
        success: false,
        error: 'Quota exceeded',
        quota: {
          limit: limit,
          used: currentUsage,
          remaining: Math.max(0, limit - currentUsage),
        },
      }, 429);
    }

    // Increment usage
    const sql = neon(c.env.NEON_DATABASE_URL);
    await sql`
      UPDATE marketplace_subscriptions
      SET ${sql(`${resource_type}s_used`)} = ${sql(`${resource_type}s_used`)} + ${amount},
          updated_at = ${new Date().toISOString()}
      WHERE claude_user_id = ${claude_user_id}
    `;

    return c.json({
      success: true,
      quota: {
        limit: limit,
        used: currentUsage + amount,
        remaining: limit === 'unlimited' ? 'unlimited' : Math.max(0, limit - (currentUsage + amount)),
      },
    });
  } catch (error) {
    console.error('Usage tracking error:', error);
    return c.json({
      success: false,
      error: 'Failed to track usage',
    }, 500);
  }
});

/**
 * Get Subscription Status
 */
app.get('/api/subscription/:claude_user_id', async (c) => {
  try {
    const claude_user_id = c.req.param('claude_user_id');

    // Check cache
    const cached = await c.env.SUBSCRIPTION_CACHE.get(`sub:${claude_user_id}`);
    if (cached) {
      return c.json({
        success: true,
        data: JSON.parse(cached),
        cached: true,
      });
    }

    // Load from database
    const sql = neon(c.env.NEON_DATABASE_URL);
    const rows = await sql`
      SELECT * FROM marketplace_subscriptions
      WHERE claude_user_id = ${claude_user_id}
    `;

    if (rows.length === 0) {
      return c.json({
        success: false,
        error: 'Subscription not found',
      }, 404);
    }

    const subscription = rows[0];

    // Update cache
    await c.env.SUBSCRIPTION_CACHE.put(
      `sub:${claude_user_id}`,
      JSON.stringify(subscription),
      { expirationTtl: 3600 }
    );

    return c.json({
      success: true,
      data: subscription,
      cached: false,
    });
  } catch (error) {
    console.error('Subscription fetch error:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch subscription',
    }, 500);
  }
});

/**
 * Stripe Webhook Handler
 */
app.post('/webhooks/stripe', async (c) => {
  try {
    // Stripe sends 'Stripe-Signature' header; be tolerant to casing
    const signature = c.req.header('Stripe-Signature') || c.req.header('stripe-signature');
    if (!signature) {
      return c.json({ error: 'Missing signature' }, 400);
    }

    const body = await c.req.text();

    // Verify Stripe webhook signature (tolerates 5 minutes clock skew)
    const valid = await verifyStripeSignature(
      body,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET,
      300
    );

    if (!valid) {
      return c.json({ error: 'Invalid signature' }, 400);
    }

    const event = JSON.parse(body);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        // Handle subscription changes
        try {
          const connect = createChittyConnectFromEnv(c.env);
          await connect.post('/api/marketplace/stripe/events', {
            type: event.type,
            id: event.id,
            created: event.created,
            data: { object: event.data?.object?.id, status: event.data?.object?.status },
          });
        } catch (e) {
          console.log('ChittyConnect stripe notify failed (ignored):', e);
        }
        break;
      case 'customer.subscription.deleted':
        // Handle cancellations
        try {
          const connect = createChittyConnectFromEnv(c.env);
          await connect.post('/api/marketplace/stripe/events', {
            type: event.type,
            id: event.id,
            created: event.created,
            data: { object: event.data?.object?.id, status: 'deleted' },
          });
        } catch (e) {
          console.log('ChittyConnect stripe notify failed (ignored):', e);
        }
        break;
      case 'invoice.payment_succeeded':
        // Handle successful payments
        try {
          const connect = createChittyConnectFromEnv(c.env);
          await connect.post('/api/marketplace/stripe/events', {
            type: event.type,
            id: event.id,
            created: event.created,
            data: { invoice: event.data?.object?.id, paid: true },
          });
        } catch (e) {
          console.log('ChittyConnect stripe notify failed (ignored):', e);
        }
        break;
      case 'invoice.payment_failed':
        // Handle failed payments - suspend subscription
        try {
          const connect = createChittyConnectFromEnv(c.env);
          await connect.post('/api/marketplace/stripe/events', {
            type: event.type,
            id: event.id,
            created: event.created,
            data: { invoice: event.data?.object?.id, paid: false },
          });
        } catch (e) {
          console.log('ChittyConnect stripe notify failed (ignored):', e);
        }
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return c.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});

/**
 * Helper: Get tier limits
 */
function getTierLimits(tier: SubscriptionTier) {
  const limits = {
    basic: {
      cases_per_month: 5,
      evidence_items: 50,
      trust_scores: 10,
    },
    professional: {
      cases_per_month: 50,
      evidence_items: 1000,
      trust_scores: 100,
    },
    enterprise: {
      cases_per_month: 'unlimited' as const,
      evidence_items: 'unlimited' as const,
      trust_scores: 'unlimited' as const,
    },
  };

  return limits[tier] || limits.basic;
}

export default app;

/**
 * Verify Stripe webhook signature without stripe-node (Cloudflare Workers compatible)
 * Spec: https://stripe.com/docs/webhooks/signatures
 */
async function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds: number = 300
): Promise<boolean> {
  try {
    // Parse header: e.g. "t=1492774577, v1=5257..., v0=..."
    const parts = signatureHeader.split(',').map((p) => p.trim());
    const sig: Record<string, string[]> = {};
    for (const p of parts) {
      const [k, v] = p.split('=');
      if (!k || !v) continue;
      if (!sig[k]) sig[k] = [];
      sig[k].push(v);
    }

    const timestamps = sig['t'];
    const v1s = sig['v1'];
    if (!timestamps || !v1s) return false;

    const timestamp = parseInt(timestamps[0], 10);
    if (!Number.isFinite(timestamp)) return false;

    // Timestamp tolerance check
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const expected = await hmacSHA256Hex(secret, signedPayload);

    // Any v1 value that matches is accepted
    for (const candidate of v1s) {
      if (constantTimeEqual(candidate, expected)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function hmacSHA256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return bufferToHex(new Uint8Array(sig));
}

function bufferToHex(buf: Uint8Array): string {
  const hex: string[] = [];
  for (let i = 0; i < buf.length; i++) {
    const h = buf[i].toString(16).padStart(2, '0');
    hex.push(h);
  }
  return hex.join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
