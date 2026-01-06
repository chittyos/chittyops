/**
 * Security Hardening for ChittyOS Project Awareness
 * Implements WAF rules, rate limiting, and AI-specific threat protection
 */

export class SecurityHardening {
  constructor(env) {
    this.env = env;
    this.rateLimiter = new AISpecificRateLimiter(env);
    this.securityAnalytics = env.SECURITY_ANALYTICS;
  }

  /**
   * AI-specific WAF rules configuration
   */
  static getWAFRules() {
    return {
      // AI Platform Verification Rule
      ai_platform_verification: {
        name: 'AI Platform Verification',
        priority: 1,
        action: 'challenge',
        conditions: {
          and: [
            { path: { starts_with: '/api/' } },
            { not: { user_agent: { contains_any: ['Claude', 'ChatGPT', 'OpenAI', 'Anthropic'] } } },
            { rate_limit: { requests_per_minute: { gt: 100 } } }
          ]
        },
        mitigation_timeout: 300
      },

      // Session Hijacking Prevention
      session_integrity_protection: {
        name: 'Session Integrity Protection',
        priority: 2,
        action: 'block',
        conditions: {
          and: [
            { path: { contains: '/sessions/' } },
            { or: [
              { header: { authorization: { empty: true } } },
              { ip_reputation: { in: ['malicious', 'suspicious'] } },
              { country: { in: ['CN', 'RU', 'KP'] } } // Adjust based on business requirements
            ]}
          ]
        },
        log_matched_requests: true
      },

      // API Abuse Prevention  
      api_abuse_protection: {
        name: 'API Abuse Protection',
        priority: 3,
        action: 'rate_limit',
        rate_limit: {
          requests_per_minute: 1000,
          burst_size: 50,
          mitigation_timeout: 600,
          action_on_exceed: 'challenge'
        },
        conditions: {
          path: { starts_with: '/api/' }
        }
      },

      // Cross-Platform Sync Security
      sync_security_validation: {
        name: 'Sync Security Validation',
        priority: 4,
        action: 'js_challenge',
        conditions: {
          and: [
            { path: { exact: '/api/projects/sync' } },
            { method: 'POST' },
            { not: { origin: { in: [
              'https://claude.ai',
              'https://chat.openai.com', 
              'https://chatgpt.com',
              'chrome-extension://*',
              'moz-extension://*'
            ]}}}
          ]
        }
      },

      // WebSocket Security
      websocket_security: {
        name: 'WebSocket Security',
        priority: 5,
        action: 'allow',
        conditions: {
          and: [
            { path: { exact: '/ws' } },
            { header: { upgrade: { exact: 'websocket' } } },
            { header: { origin: { in: [
              'https://claude.ai',
              'https://chat.openai.com',
              'https://chatgpt.com'
            ]}}}
          ]
        },
        rate_limit: {
          connections_per_minute: 25,
          max_concurrent_per_ip: 10
        }
      },

      // SQL Injection Protection (for any query operations)
      sql_injection_protection: {
        name: 'SQL Injection Protection',
        priority: 6,
        action: 'block',
        conditions: {
          or: [
            { query_string: { contains_any: [
              'union select',
              'drop table',
              'delete from',
              'insert into',
              'update set',
              '--',
              ';--',
              'xp_',
              'sp_'
            ]}},
            { body: { contains_any: [
              'union select',
              'drop table', 
              'delete from'
            ]}}
          ]
        },
        log_matched_requests: true
      },

      // XSS Protection
      xss_protection: {
        name: 'XSS Protection',
        priority: 7,
        action: 'block', 
        conditions: {
          or: [
            { query_string: { contains_any: [
              '<script',
              'javascript:',
              'onerror=',
              'onload=',
              'alert(',
              'eval(',
              'document.cookie'
            ]}},
            { body: { contains_any: [
              '<script',
              'javascript:',
              'onerror=',
              'onload='
            ]}}
          ]
        },
        log_matched_requests: true
      },

      // JSON/XML Bomb Protection
      payload_size_protection: {
        name: 'Payload Size Protection',
        priority: 8,
        action: 'block',
        conditions: {
          or: [
            { content_length: { gt: 10485760 } }, // 10MB
            { body: { contains_any: [
              'x'.repeat(1000),  // Detect repetitive patterns
              '{'.repeat(100),   // Nested JSON
              '['.repeat(100)    // Nested arrays
            ]}}
          ]
        }
      }
    };
  }

  /**
   * Apply WAF rules to request
   */
  async applyWAFRules(request) {
    const rules = SecurityHardening.getWAFRules();
    const url = new URL(request.url);
    const clientIP = request.headers.get('CF-Connecting-IP');
    const userAgent = request.headers.get('User-Agent') || '';
    const origin = request.headers.get('Origin') || '';
    
    for (const [ruleId, rule] of Object.entries(rules)) {
      try {
        const matched = await this.evaluateRule(request, rule, {
          url,
          clientIP,
          userAgent,
          origin
        });

        if (matched) {
          // Log security event
          await this.logSecurityEvent(ruleId, rule, request, clientIP);

          // Apply rule action
          return this.applyRuleAction(rule, request);
        }
      } catch (error) {
        console.error(`Error evaluating WAF rule ${ruleId}:`, error);
        // Continue processing other rules
      }
    }

    return null; // No rules matched, continue processing
  }

  /**
   * Evaluate if request matches WAF rule conditions
   */
  async evaluateRule(request, rule, context) {
    if (!rule.conditions) return false;

    return this.evaluateConditions(rule.conditions, request, context);
  }

  /**
   * Recursively evaluate rule conditions
   */
  async evaluateConditions(conditions, request, context) {
    if (conditions.and) {
      return Promise.all(
        conditions.and.map(cond => this.evaluateConditions(cond, request, context))
      ).then(results => results.every(r => r));
    }

    if (conditions.or) {
      const results = await Promise.all(
        conditions.or.map(cond => this.evaluateConditions(cond, request, context))
      );
      return results.some(r => r);
    }

    if (conditions.not) {
      return !(await this.evaluateConditions(conditions.not, request, context));
    }

    // Single condition evaluation
    return this.evaluateSingleCondition(conditions, request, context);
  }

  /**
   * Evaluate single condition
   */
  async evaluateSingleCondition(condition, request, context) {
    const { url, clientIP, userAgent, origin } = context;

    // Path conditions
    if (condition.path) {
      if (condition.path.starts_with) {
        return url.pathname.startsWith(condition.path.starts_with);
      }
      if (condition.path.exact) {
        return url.pathname === condition.path.exact;
      }
      if (condition.path.contains) {
        return url.pathname.includes(condition.path.contains);
      }
    }

    // Method conditions
    if (condition.method) {
      return request.method === condition.method;
    }

    // User agent conditions
    if (condition.user_agent) {
      if (condition.user_agent.contains_any) {
        return condition.user_agent.contains_any.some(ua => 
          userAgent.toLowerCase().includes(ua.toLowerCase())
        );
      }
    }

    // Header conditions
    if (condition.header) {
      for (const [headerName, headerCondition] of Object.entries(condition.header)) {
        const headerValue = request.headers.get(headerName) || '';
        
        if (headerCondition.empty) {
          return headerValue === '';
        }
        if (headerCondition.exact) {
          return headerValue === headerCondition.exact;
        }
        if (headerCondition.contains_any) {
          return headerCondition.contains_any.some(val => headerValue.includes(val));
        }
      }
    }

    // Origin conditions
    if (condition.origin) {
      if (condition.origin.in) {
        return condition.origin.in.some(allowedOrigin => {
          if (allowedOrigin.endsWith('*')) {
            return origin.startsWith(allowedOrigin.slice(0, -1));
          }
          return origin === allowedOrigin;
        });
      }
    }

    // Query string conditions
    if (condition.query_string) {
      const queryString = url.search.toLowerCase();
      if (condition.query_string.contains_any) {
        return condition.query_string.contains_any.some(term => 
          queryString.includes(term.toLowerCase())
        );
      }
    }

    // Body conditions
    if (condition.body && request.method === 'POST') {
      try {
        const body = await request.text();
        const bodyLower = body.toLowerCase();
        
        if (condition.body.contains_any) {
          return condition.body.contains_any.some(term => 
            bodyLower.includes(term.toLowerCase())
          );
        }
      } catch (error) {
        // If we can't read body, skip this condition
        return false;
      }
    }

    // Content length conditions
    if (condition.content_length) {
      const contentLength = parseInt(request.headers.get('Content-Length') || '0');
      if (condition.content_length.gt) {
        return contentLength > condition.content_length.gt;
      }
    }

    // Rate limiting conditions (simplified - production would use Durable Objects)
    if (condition.rate_limit) {
      return this.rateLimiter.checkRateLimit(clientIP, condition.rate_limit);
    }

    // IP reputation conditions (would integrate with threat intelligence)
    if (condition.ip_reputation) {
      // This would integrate with Cloudflare's IP reputation or external service
      return false; // Simplified for now
    }

    // Country conditions
    if (condition.country) {
      const country = request.cf?.country || '';
      if (condition.country.in) {
        return condition.country.in.includes(country);
      }
    }

    return false;
  }

  /**
   * Apply rule action
   */
  applyRuleAction(rule, request) {
    switch (rule.action) {
      case 'block':
        return new Response('Access Denied', { 
          status: 403,
          headers: {
            'Content-Type': 'text/plain',
            'X-Security-Rule': rule.name,
            'X-Security-Action': 'blocked'
          }
        });

      case 'challenge':
        return new Response(JSON.stringify({
          error: 'Security challenge required',
          challenge_type: 'captcha',
          rule: rule.name
        }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'X-Security-Rule': rule.name,
            'X-Security-Action': 'challenge'
          }
        });

      case 'js_challenge':
        return new Response(JSON.stringify({
          error: 'JavaScript challenge required',
          challenge_type: 'javascript',
          rule: rule.name
        }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'X-Security-Rule': rule.name,
            'X-Security-Action': 'js_challenge'
          }
        });

      case 'rate_limit':
        return new Response(JSON.stringify({
          error: 'Rate limit exceeded',
          retry_after: rule.rate_limit?.mitigation_timeout || 600,
          rule: rule.name
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': (rule.rate_limit?.mitigation_timeout || 600).toString(),
            'X-Security-Rule': rule.name,
            'X-Security-Action': 'rate_limited'
          }
        });

      default:
        return null; // Allow request to continue
    }
  }

  /**
   * Log security events
   */
  async logSecurityEvent(ruleId, rule, request, clientIP) {
    const event = {
      rule_id: ruleId,
      rule_name: rule.name,
      action: rule.action,
      client_ip: clientIP,
      user_agent: request.headers.get('User-Agent'),
      url: request.url,
      method: request.method,
      origin: request.headers.get('Origin'),
      timestamp: new Date().toISOString(),
      cf_ray: request.headers.get('CF-Ray'),
      country: request.cf?.country || 'unknown'
    };

    // Log to Analytics Engine
    if (this.securityAnalytics) {
      await this.securityAnalytics.writeDataPoint({
        blobs: [
          ruleId,
          rule.name,
          rule.action,
          clientIP,
          request.url,
          request.method
        ],
        doubles: [
          Date.now() // timestamp
        ],
        indexes: [
          1 // security_event flag
        ]
      });
    }

    // Log to console for debugging
    console.log('Security event:', JSON.stringify(event));
  }

  /**
   * Security middleware wrapper
   */
  static middleware(env) {
    const security = new SecurityHardening(env);
    
    return async (request, next) => {
      // Apply WAF rules
      const wafResponse = await security.applyWAFRules(request);
      if (wafResponse) {
        return wafResponse;
      }

      // Apply rate limiting
      const rateLimitResponse = await security.rateLimiter.checkRequest(request);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      // Process request
      const response = await next(request);

      // Add security headers
      return security.addSecurityHeaders(response);
    };
  }

  /**
   * Add security headers to response
   */
  addSecurityHeaders(response) {
    const headers = new Headers(response.headers);

    // HSTS
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

    // Content Security Policy
    headers.set('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://claude.ai https://chat.openai.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' wss: https:",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; '));

    // X-Frame-Options
    headers.set('X-Frame-Options', 'DENY');

    // X-Content-Type-Options
    headers.set('X-Content-Type-Options', 'nosniff');

    // X-XSS-Protection
    headers.set('X-XSS-Protection', '1; mode=block');

    // Referrer Policy
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions Policy
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
}

/**
 * AI-specific rate limiter with intelligent patterns
 */
class AISpecificRateLimiter {
  constructor(env) {
    this.env = env;
    this.rateLimitStore = env.CACHE_STORE;
  }

  /**
   * Rate limiting configuration for different endpoints
   */
  static getRateLimitConfig() {
    return {
      '/api/auth/*': {
        requests_per_minute: 60,
        burst_size: 10,
        window_size: 60,
        bypass_on_cookie: 'verified_session'
      },
      '/api/projects/suggestions': {
        requests_per_minute: 300,
        burst_size: 50,
        window_size: 60,
        ai_platform_bonus: 2.0  // Allow 2x rate for verified AI platforms
      },
      '/api/sessions/*': {
        requests_per_minute: 500,
        burst_size: 25,
        window_size: 60
      },
      '/api/projects/sync': {
        requests_per_minute: 200,
        burst_size: 20,
        window_size: 60
      },
      '/ws': {
        connections_per_minute: 25,
        max_concurrent_per_ip: 10,
        window_size: 60
      }
    };
  }

  /**
   * Check rate limit for request
   */
  async checkRequest(request) {
    const url = new URL(request.url);
    const config = this.getRateLimitConfigForPath(url.pathname);
    
    if (!config) {
      return null; // No rate limiting for this path
    }

    const clientIP = request.headers.get('CF-Connecting-IP');
    const key = `rate_limit:${clientIP}:${url.pathname}`;
    
    // Check if rate limit exceeded
    const isExceeded = await this.checkRateLimit(clientIP, config, url.pathname);
    
    if (isExceeded) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        retry_after: config.window_size,
        limit: config.requests_per_minute,
        window: config.window_size
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': config.window_size.toString(),
          'X-RateLimit-Limit': config.requests_per_minute.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': (Date.now() + config.window_size * 1000).toString()
        }
      });
    }

    return null; // Rate limit not exceeded
  }

  /**
   * Get rate limit config for path
   */
  getRateLimitConfigForPath(pathname) {
    const configs = AISpecificRateLimiter.getRateLimitConfig();
    
    for (const [pattern, config] of Object.entries(configs)) {
      if (this.pathMatches(pathname, pattern)) {
        return config;
      }
    }
    
    return null;
  }

  /**
   * Check if path matches pattern
   */
  pathMatches(pathname, pattern) {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return pathname.startsWith(prefix);
    }
    return pathname === pattern;
  }

  /**
   * Check rate limit using sliding window
   */
  async checkRateLimit(clientIP, config, pathname) {
    if (!this.rateLimitStore) {
      return false; // No rate limiting if store unavailable
    }

    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - config.window_size;
    const key = `rate_limit:${clientIP}:${pathname}`;

    try {
      // Get current request count
      const currentData = await this.rateLimitStore.get(key);
      let requestTimes = currentData ? JSON.parse(currentData) : [];

      // Remove old requests outside window
      requestTimes = requestTimes.filter(time => time > windowStart);

      // Check if rate limit would be exceeded
      if (requestTimes.length >= config.requests_per_minute) {
        return true; // Rate limit exceeded
      }

      // Add current request
      requestTimes.push(now);

      // Store updated request times
      await this.rateLimitStore.put(key, JSON.stringify(requestTimes), {
        expirationTtl: config.window_size * 2 // Keep data longer than window
      });

      return false; // Rate limit not exceeded
    } catch (error) {
      console.error('Error checking rate limit:', error);
      return false; // Allow request on error
    }
  }
}