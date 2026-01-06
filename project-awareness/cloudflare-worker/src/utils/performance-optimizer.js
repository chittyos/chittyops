/**
 * Performance Optimizer for ChittyOS Project Awareness
 * Implements intelligent caching, compression, and edge optimization
 */

export class PerformanceOptimizer {
  constructor(env) {
    this.env = env;
    this.cacheStore = env.CACHE_STORE;
    this.analytics = env.PERFORMANCE_ANALYTICS;
  }

  /**
   * Intelligent caching strategy for AI workloads
   */
  static getCacheConfig() {
    return {
      // Static assets - long cache
      '/static/*': {
        browserTTL: 31536000,        // 1 year
        edgeTTL: 31536000,
        cacheLevel: 'cache_everything',
        cacheKey: 'url'
      },

      // API responses - intelligent caching based on content type
      '/api/projects/suggestions': {
        browserTTL: 300,             // 5 minutes
        edgeTTL: 900,               // 15 minutes
        cacheKey: 'working_directory,platform,git_branch',
        varyHeaders: ['User-Agent', 'Authorization'],
        conditions: {
          method: 'GET',
          hasAuth: true
        }
      },

      '/api/projects/context': {
        browserTTL: 180,             // 3 minutes
        edgeTTL: 600,               // 10 minutes  
        cacheKey: 'platform,working_directory,user_id',
        conditions: {
          method: 'GET'
        }
      },

      // Session data - short cache with smart invalidation
      '/api/sessions/statistics': {
        browserTTL: 60,             // 1 minute
        edgeTTL: 300,              // 5 minutes
        cacheKey: 'project_name,time_range,user_id',
        bypassOnCookie: 'session_updated'
      },

      '/api/sessions/register': {
        cacheLevel: 'bypass'        // Never cache registration
      },

      '/api/sessions/consolidate': {
        cacheLevel: 'bypass'        // Never cache consolidation
      },

      // WebSocket - no cache
      '/ws': {
        cacheLevel: 'bypass'
      },

      // Authentication - no cache
      '/api/auth/*': {
        cacheLevel: 'bypass'
      },

      // Health check - short cache
      '/health': {
        browserTTL: 60,
        edgeTTL: 60,
        cacheLevel: 'cache_everything'
      }
    };
  }

  /**
   * Apply intelligent caching based on request
   */
  async applyCaching(request, response) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const config = this.getCacheConfigForPath(pathname);

    if (!config || config.cacheLevel === 'bypass') {
      return response;
    }

    // Build cache key
    const cacheKey = await this.buildCacheKey(request, config);
    
    // Check if we should bypass cache
    if (await this.shouldBypassCache(request, config)) {
      return response;
    }

    // Apply cache headers
    const cacheHeaders = new Headers(response.headers);
    
    if (config.browserTTL) {
      cacheHeaders.set('Cache-Control', 
        `public, max-age=${config.browserTTL}, s-maxage=${config.edgeTTL || config.browserTTL}`
      );
    }

    if (config.varyHeaders) {
      cacheHeaders.set('Vary', config.varyHeaders.join(', '));
    }

    // Add performance headers
    cacheHeaders.set('X-Cache-Key', cacheKey);
    cacheHeaders.set('X-Cache-Config', JSON.stringify(config));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: cacheHeaders
    });
  }

  /**
   * Get cache configuration for specific path
   */
  getCacheConfigForPath(pathname) {
    const configs = PerformanceOptimizer.getCacheConfig();
    
    // Find matching pattern
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
   * Build intelligent cache key
   */
  async buildCacheKey(request, config) {
    const url = new URL(request.url);
    const keyParts = [];

    // Base URL
    keyParts.push(url.pathname);

    // Add configured key components
    if (config.cacheKey) {
      const keyComponents = config.cacheKey.split(',');
      
      for (const component of keyComponents) {
        switch (component.trim()) {
          case 'url':
            keyParts.push(url.href);
            break;
          case 'working_directory':
            keyParts.push(url.searchParams.get('working_directory') || '');
            break;
          case 'platform':
            keyParts.push(url.searchParams.get('platform') || '');
            break;
          case 'git_branch':
            keyParts.push(url.searchParams.get('git_branch') || '');
            break;
          case 'project_name':
            keyParts.push(url.searchParams.get('project_name') || '');
            break;
          case 'time_range':
            keyParts.push(url.searchParams.get('time_range') || '');
            break;
          case 'user_id':
            // Extract user ID from authorization header
            const auth = request.headers.get('Authorization');
            const userId = await this.extractUserIdFromAuth(auth);
            keyParts.push(userId || 'anonymous');
            break;
        }
      }
    }

    // Add method
    keyParts.push(request.method);

    // Create hash of key parts
    const keyString = keyParts.join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(keyString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Check if we should bypass cache
   */
  async shouldBypassCache(request, config) {
    // Check bypass conditions
    if (config.conditions) {
      if (config.conditions.method && request.method !== config.conditions.method) {
        return true;
      }

      if (config.conditions.hasAuth && !request.headers.get('Authorization')) {
        return true;
      }
    }

    // Check bypass cookie
    if (config.bypassOnCookie) {
      const cookies = request.headers.get('Cookie') || '';
      if (cookies.includes(config.bypassOnCookie)) {
        return true;
      }
    }

    // Check cache-control header
    const cacheControl = request.headers.get('Cache-Control');
    if (cacheControl && cacheControl.includes('no-cache')) {
      return true;
    }

    return false;
  }

  /**
   * Extract user ID from authorization header
   */
  async extractUserIdFromAuth(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    try {
      const token = authHeader.substring(7);
      // Simple JWT decode (production should validate signature)
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.sub || payload.user_id || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Apply compression based on content type and size
   */
  static applyCompression(response) {
    const contentType = response.headers.get('Content-Type') || '';
    const contentLength = parseInt(response.headers.get('Content-Length') || '0');

    // Only compress text-based content over 1KB
    if (contentLength < 1024) {
      return response;
    }

    const compressibleTypes = [
      'application/json',
      'application/javascript', 
      'text/html',
      'text/css',
      'text/plain',
      'text/xml',
      'application/xml'
    ];

    const shouldCompress = compressibleTypes.some(type => 
      contentType.includes(type)
    );

    if (shouldCompress) {
      const headers = new Headers(response.headers);
      headers.set('Content-Encoding', 'gzip');
      headers.set('Vary', 'Accept-Encoding');
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    return response;
  }

  /**
   * Track performance metrics
   */
  async trackPerformance(request, startTime, response) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    const url = new URL(request.url);

    // Track to Analytics Engine
    if (this.analytics) {
      await this.analytics.writeDataPoint({
        blobs: [
          url.pathname,                    // endpoint
          request.method,                  // method
          response.status.toString(),      // status
          request.headers.get('User-Agent') || 'unknown', // platform
        ],
        doubles: [
          duration,                        // response_time_ms
          parseInt(response.headers.get('Content-Length') || '0') // response_size_bytes
        ],
        indexes: [
          response.status < 400 ? 1 : 0   // success (1) or error (0)
        ]
      });
    }

    // Store in KV for real-time monitoring
    if (this.cacheStore) {
      const perfKey = `perf:${url.pathname}:${Date.now()}`;
      await this.cacheStore.put(perfKey, JSON.stringify({
        endpoint: url.pathname,
        method: request.method,
        status: response.status,
        duration,
        timestamp: endTime,
        user_agent: request.headers.get('User-Agent'),
        content_length: response.headers.get('Content-Length')
      }), {
        expirationTtl: 3600 // Keep performance data for 1 hour
      });
    }

    // Add performance headers to response
    const perfHeaders = new Headers(response.headers);
    perfHeaders.set('X-Response-Time', `${duration}ms`);
    perfHeaders.set('X-Performance-Threshold', this.env.PERFORMANCE_THRESHOLD_MS || '100');
    
    if (duration > parseInt(this.env.PERFORMANCE_THRESHOLD_MS || '100')) {
      perfHeaders.set('X-Performance-Warning', 'Response time exceeded threshold');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: perfHeaders
    });
  }

  /**
   * Get performance statistics
   */
  async getPerformanceStats(timeRange = '1h') {
    if (!this.cacheStore) {
      return null;
    }

    const stats = {
      timeRange,
      totalRequests: 0,
      averageResponseTime: 0,
      successRate: 0,
      errorRate: 0,
      endpointStats: {},
      timestamp: new Date().toISOString()
    };

    try {
      // Get performance data from KV (simplified - production would use Analytics Engine)
      const perfList = await this.cacheStore.list({ prefix: 'perf:' });
      const perfData = [];

      for (const key of perfList.keys) {
        try {
          const data = await this.cacheStore.get(key.name);
          if (data) {
            perfData.push(JSON.parse(data));
          }
        } catch (error) {
          // Skip invalid data
        }
      }

      if (perfData.length === 0) {
        return stats;
      }

      // Calculate statistics
      stats.totalRequests = perfData.length;
      stats.averageResponseTime = perfData.reduce((sum, d) => sum + d.duration, 0) / perfData.length;
      
      const successCount = perfData.filter(d => d.status < 400).length;
      stats.successRate = (successCount / perfData.length) * 100;
      stats.errorRate = ((perfData.length - successCount) / perfData.length) * 100;

      // Endpoint-specific stats
      const endpointGroups = {};
      perfData.forEach(d => {
        if (!endpointGroups[d.endpoint]) {
          endpointGroups[d.endpoint] = [];
        }
        endpointGroups[d.endpoint].push(d);
      });

      for (const [endpoint, data] of Object.entries(endpointGroups)) {
        stats.endpointStats[endpoint] = {
          requests: data.length,
          averageResponseTime: data.reduce((sum, d) => sum + d.duration, 0) / data.length,
          successRate: (data.filter(d => d.status < 400).length / data.length) * 100,
          p95ResponseTime: this.calculatePercentile(data.map(d => d.duration), 95)
        };
      }

      return stats;
      
    } catch (error) {
      console.error('Error calculating performance stats:', error);
      return stats;
    }
  }

  /**
   * Calculate percentile from array of numbers
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  /**
   * Middleware to wrap request with performance optimization
   */
  static middleware(env) {
    const optimizer = new PerformanceOptimizer(env);
    
    return async (request, next) => {
      const startTime = Date.now();
      
      try {
        // Process request
        let response = await next(request);
        
        // Apply caching
        response = await optimizer.applyCaching(request, response);
        
        // Apply compression
        response = PerformanceOptimizer.applyCompression(response);
        
        // Track performance
        response = await optimizer.trackPerformance(request, startTime, response);
        
        return response;
        
      } catch (error) {
        // Track error performance
        const errorResponse = new Response(JSON.stringify({ error: 'Internal Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
        
        await optimizer.trackPerformance(request, startTime, errorResponse);
        return errorResponse;
      }
    };
  }
}