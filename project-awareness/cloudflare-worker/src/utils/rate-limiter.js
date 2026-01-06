/**
 * Rate Limiter Utility
 * Implements rate limiting for API requests
 */

export class RateLimiter {
  static async handle(request, env, ctx) {
    try {
      const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateLimitRPM = parseInt(env.RATE_LIMIT_RPM) || 1000;
      const windowSize = 60; // 1 minute window
      
      const key = `rate_limit:${clientIP}`;
      const now = Math.floor(Date.now() / 1000);
      const windowStart = now - windowSize;

      // Get current request count for this IP
      const currentData = await env.SESSION_STORE.get(key, 'json') || {
        requests: [],
        count: 0
      };

      // Filter out old requests outside the window
      const validRequests = currentData.requests.filter(timestamp => timestamp > windowStart);
      
      // Check if rate limit exceeded
      if (validRequests.length >= rateLimitRPM) {
        const resetTime = Math.min(...validRequests) + windowSize;
        
        return new Response(JSON.stringify({
          error: 'Rate limit exceeded',
          limit: rateLimitRPM,
          window: `${windowSize} seconds`,
          reset_at: new Date(resetTime * 1000).toISOString()
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-Rate-Limit-Limit': rateLimitRPM.toString(),
            'X-Rate-Limit-Remaining': '0',
            'X-Rate-Limit-Reset': resetTime.toString(),
            'Retry-After': (resetTime - now).toString()
          }
        });
      }

      // Add current request
      validRequests.push(now);
      
      // Update rate limit data
      await env.SESSION_STORE.put(key, JSON.stringify({
        requests: validRequests,
        count: validRequests.length,
        last_request: now
      }), {
        expirationTtl: windowSize * 2 // Keep data for 2 windows
      });

      // Add rate limit headers to track usage
      request.rateLimitHeaders = {
        'X-Rate-Limit-Limit': rateLimitRPM.toString(),
        'X-Rate-Limit-Remaining': (rateLimitRPM - validRequests.length).toString(),
        'X-Rate-Limit-Reset': (windowStart + windowSize).toString()
      };

      return; // Continue to next middleware
      
    } catch (error) {
      console.error('Rate limiter error:', error);
      // Don't block requests if rate limiter fails
      return;
    }
  }

  /**
   * Check rate limit for specific key (e.g., API key or user ID)
   */
  static async checkCustomRateLimit(env, key, limit, windowSizeSeconds = 60) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const windowStart = now - windowSizeSeconds;
      const rateLimitKey = `custom_rate_limit:${key}`;

      const currentData = await env.SESSION_STORE.get(rateLimitKey, 'json') || {
        requests: [],
        count: 0
      };

      const validRequests = currentData.requests.filter(timestamp => timestamp > windowStart);
      
      if (validRequests.length >= limit) {
        return {
          allowed: false,
          remaining: 0,
          reset_at: Math.min(...validRequests) + windowSizeSeconds
        };
      }

      validRequests.push(now);
      
      await env.SESSION_STORE.put(rateLimitKey, JSON.stringify({
        requests: validRequests,
        count: validRequests.length,
        last_request: now
      }), {
        expirationTtl: windowSizeSeconds * 2
      });

      return {
        allowed: true,
        remaining: limit - validRequests.length,
        reset_at: windowStart + windowSizeSeconds
      };

    } catch (error) {
      console.error('Custom rate limit check error:', error);
      // Allow request if rate limiter fails
      return { allowed: true, remaining: limit, reset_at: 0 };
    }
  }

  /**
   * Rate limit for WebSocket connections
   */
  static async checkWebSocketRateLimit(env, clientIP, maxConnections = 10) {
    try {
      const key = `ws_connections:${clientIP}`;
      const connectionCount = await env.SESSION_STORE.get(key, 'json') || 0;
      
      if (connectionCount >= maxConnections) {
        return false;
      }

      // Increment connection count
      await env.SESSION_STORE.put(key, JSON.stringify(connectionCount + 1), {
        expirationTtl: 3600 // 1 hour
      });

      return true;
    } catch (error) {
      console.error('WebSocket rate limit error:', error);
      return true; // Allow connection if check fails
    }
  }

  /**
   * Release WebSocket connection slot
   */
  static async releaseWebSocketConnection(env, clientIP) {
    try {
      const key = `ws_connections:${clientIP}`;
      const connectionCount = await env.SESSION_STORE.get(key, 'json') || 0;
      
      if (connectionCount > 0) {
        await env.SESSION_STORE.put(key, JSON.stringify(connectionCount - 1), {
          expirationTtl: 3600
        });
      }
    } catch (error) {
      console.error('Error releasing WebSocket connection:', error);
    }
  }

  /**
   * Get rate limit statistics
   */
  static async getRateLimitStats(env, timeframe = 3600) {
    try {
      // This would require a more sophisticated tracking system
      // For now, return basic stats
      return {
        total_requests: 0, // Would need to aggregate from KV
        blocked_requests: 0,
        top_clients: [],
        timeframe_seconds: timeframe
      };
    } catch (error) {
      console.error('Error getting rate limit stats:', error);
      return null;
    }
  }
}