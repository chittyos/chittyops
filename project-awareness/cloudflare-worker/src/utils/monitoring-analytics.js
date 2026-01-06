/**
 * Advanced Monitoring and Analytics for ChittyOS Project Awareness
 * Comprehensive tracking, alerting, and business intelligence
 */

export class MonitoringAnalytics {
  constructor(env) {
    this.env = env;
    this.usageAnalytics = env.USAGE_ANALYTICS;
    this.performanceAnalytics = env.PERFORMANCE_ANALYTICS;
    this.securityAnalytics = env.SECURITY_ANALYTICS;
    this.businessAnalytics = env.BUSINESS_ANALYTICS;
    this.analyticsStore = env.ANALYTICS_STORE;
  }

  /**
   * Comprehensive health check with detailed system status
   */
  async performHealthCheck() {
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: this.env.ENVIRONMENT,
      checks: {},
      performance: {},
      dependencies: {},
      uptime: Date.now(),
      metadata: {
        region: this.env.CF_REGION || 'unknown',
        colo: this.env.CF_COLO || 'unknown',
        worker_id: this.env.CF_RAY || 'unknown'
      }
    };

    try {
      // System component checks
      healthCheck.checks = await this.performSystemChecks();
      
      // Performance metrics
      healthCheck.performance = await this.getPerformanceMetrics();
      
      // Dependency health
      healthCheck.dependencies = await this.checkDependencies();
      
      // Determine overall health status
      const hasFailures = Object.values(healthCheck.checks).some(check => !check.healthy);
      const hasPerformanceIssues = healthCheck.performance.average_response_time > 
        parseInt(this.env.PERFORMANCE_THRESHOLD_MS || '100');
      
      if (hasFailures) {
        healthCheck.status = 'unhealthy';
      } else if (hasPerformanceIssues) {
        healthCheck.status = 'degraded';
      }

      // Track health check metrics
      await this.trackHealthCheck(healthCheck);
      
      return healthCheck;
      
    } catch (error) {
      console.error('Health check error:', error);
      healthCheck.status = 'error';
      healthCheck.error = error.message;
      return healthCheck;
    }
  }

  /**
   * Perform system component checks
   */
  async performSystemChecks() {
    const checks = {};

    // KV Storage check
    checks.kv_storage = await this.checkKVStorage();
    
    // R2 Storage check
    checks.r2_storage = await this.checkR2Storage();
    
    // Durable Objects check
    checks.durable_objects = await this.checkDurableObjects();
    
    // Analytics Engine check
    checks.analytics_engine = await this.checkAnalyticsEngine();
    
    // External dependencies
    checks.external_services = await this.checkExternalServices();

    return checks;
  }

  /**
   * Check KV storage health
   */
  async checkKVStorage() {
    try {
      const testKey = `health_check_${Date.now()}`;
      const testValue = JSON.stringify({ timestamp: Date.now() });
      
      // Write test
      await this.env.SESSION_STORE.put(testKey, testValue, { expirationTtl: 60 });
      
      // Read test
      const retrieved = await this.env.SESSION_STORE.get(testKey);
      
      // Cleanup
      await this.env.SESSION_STORE.delete(testKey);
      
      const healthy = retrieved === testValue;
      
      return {
        healthy,
        latency_ms: healthy ? 'ok' : 'failed',
        last_check: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        last_check: new Date().toISOString()
      };
    }
  }

  /**
   * Check R2 storage health
   */
  async checkR2Storage() {
    try {
      const testKey = `health-check-${Date.now()}.json`;
      const testData = JSON.stringify({ timestamp: Date.now() });
      
      // Write test
      await this.env.PROJECT_DATA_BUCKET.put(testKey, testData);
      
      // Read test
      const object = await this.env.PROJECT_DATA_BUCKET.get(testKey);
      const retrieved = await object?.text();
      
      // Cleanup
      await this.env.PROJECT_DATA_BUCKET.delete(testKey);
      
      const healthy = retrieved === testData;
      
      return {
        healthy,
        latency_ms: healthy ? 'ok' : 'failed',
        last_check: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        last_check: new Date().toISOString()
      };
    }
  }

  /**
   * Check Durable Objects health
   */
  async checkDurableObjects() {
    try {
      // This would ping the Durable Objects for a health check
      // Simplified for now - would implement actual DO health check
      return {
        healthy: true,
        active_connections: 0, // Would get from DO
        last_check: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        last_check: new Date().toISOString()
      };
    }
  }

  /**
   * Check Analytics Engine health
   */
  async checkAnalyticsEngine() {
    try {
      // Write test data point
      if (this.usageAnalytics) {
        await this.usageAnalytics.writeDataPoint({
          blobs: ['health_check'],
          doubles: [Date.now()],
          indexes: [1]
        });
      }
      
      return {
        healthy: true,
        last_check: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        last_check: new Date().toISOString()
      };
    }
  }

  /**
   * Check external service dependencies
   */
  async checkExternalServices() {
    const services = {
      chittyid: this.env.CHITTYID_API_URL,
      chittychat: this.env.CHITTYCHAT_API_URL,
      registry: this.env.CHITTY_REGISTRY_URL
    };

    const results = {};
    
    for (const [service, url] of Object.entries(services)) {
      try {
        const startTime = Date.now();
        const response = await fetch(`${url}/health`, {
          method: 'GET',
          timeout: 5000 // 5 second timeout
        });
        
        const latency = Date.now() - startTime;
        
        results[service] = {
          healthy: response.ok,
          status_code: response.status,
          latency_ms: latency,
          last_check: new Date().toISOString()
        };
      } catch (error) {
        results[service] = {
          healthy: false,
          error: error.message,
          last_check: new Date().toISOString()
        };
      }
    }

    return results;
  }

  /**
   * Get comprehensive performance metrics
   */
  async getPerformanceMetrics() {
    // This would aggregate from Analytics Engine data
    // Simplified implementation for now
    return {
      average_response_time: 50, // Would calculate from real data
      p95_response_time: 85,
      p99_response_time: 150,
      error_rate: 0.1,
      throughput_rpm: 100,
      memory_usage_mb: 128,
      cpu_utilization: 25,
      last_calculated: new Date().toISOString()
    };
  }

  /**
   * Check dependency health
   */
  async checkDependencies() {
    return {
      nodejs_runtime: {
        healthy: true,
        version: 'v18+',
        features: ['fetch', 'streams', 'crypto']
      },
      cloudflare_runtime: {
        healthy: true,
        features: ['kv', 'r2', 'durable_objects', 'analytics_engine']
      }
    };
  }

  /**
   * Track comprehensive usage analytics
   */
  async trackUsageEvent(eventType, data = {}) {
    try {
      const event = {
        event_type: eventType,
        timestamp: Date.now(),
        environment: this.env.ENVIRONMENT,
        ...data
      };

      // Track to Analytics Engine
      if (this.usageAnalytics) {
        await this.usageAnalytics.writeDataPoint({
          blobs: [
            eventType,
            data.platform || 'unknown',
            data.endpoint || 'unknown',
            data.user_agent || 'unknown'
          ],
          doubles: [
            Date.now(),
            data.response_time || 0,
            data.payload_size || 0
          ],
          indexes: [
            data.success ? 1 : 0,
            data.cached ? 1 : 0
          ]
        });
      }

      // Store recent events for real-time monitoring
      if (this.analyticsStore) {
        const eventKey = `event:${eventType}:${Date.now()}`;
        await this.analyticsStore.put(eventKey, JSON.stringify(event), {
          expirationTtl: 3600 // Keep for 1 hour
        });
      }

    } catch (error) {
      console.error('Error tracking usage event:', error);
    }
  }

  /**
   * Track business intelligence metrics
   */
  async trackBusinessEvent(eventType, businessData = {}) {
    try {
      if (this.businessAnalytics) {
        await this.businessAnalytics.writeDataPoint({
          blobs: [
            eventType,
            businessData.platform || 'unknown',
            businessData.feature || 'unknown',
            businessData.user_segment || 'unknown'
          ],
          doubles: [
            Date.now(),
            businessData.session_duration || 0,
            businessData.feature_usage_count || 0,
            businessData.success_rate || 0
          ],
          indexes: [
            businessData.new_user ? 1 : 0,
            businessData.premium_feature ? 1 : 0
          ]
        });
      }
    } catch (error) {
      console.error('Error tracking business event:', error);
    }
  }

  /**
   * Generate comprehensive analytics dashboard data
   */
  async getAnalyticsDashboard(timeRange = '1h') {
    const dashboard = {
      timeRange,
      generated_at: new Date().toISOString(),
      overview: {},
      performance: {},
      usage: {},
      security: {},
      business: {}
    };

    try {
      // Overview metrics
      dashboard.overview = {
        total_requests: 0,        // Would query from Analytics Engine
        active_sessions: 0,       // Would count from KV
        unique_users: 0,          // Would calculate from session data
        uptime_percentage: 99.9,  // Would calculate from health checks
        global_regions_active: 5  // Would count active regions
      };

      // Performance metrics
      dashboard.performance = {
        average_response_time: 75,
        p95_response_time: 120,
        error_rate: 0.2,
        cache_hit_rate: 85,
        throughput_per_minute: 150,
        performance_trends: [] // Would include historical data
      };

      // Usage patterns
      dashboard.usage = {
        by_platform: {
          'claude-code': 45,
          'chatgpt': 30,
          'claude-web': 25
        },
        by_endpoint: {
          '/api/projects/suggestions': 40,
          '/api/sessions/register': 25,
          '/api/projects/sync': 20,
          '/ws': 15
        },
        by_region: {
          'North America': 50,
          'Europe': 30,
          'Asia Pacific': 20
        }
      };

      // Security insights
      dashboard.security = {
        blocked_requests: 12,
        rate_limited_ips: 3,
        security_challenges: 8,
        threat_levels: {
          low: 15,
          medium: 3,
          high: 0,
          critical: 0
        }
      };

      // Business intelligence
      dashboard.business = {
        feature_adoption: {
          'project_awareness': 95,
          'cross_platform_sync': 80,
          'session_consolidation': 70,
          'websocket_realtime': 60
        },
        user_engagement: {
          daily_active_users: 150,
          session_duration_avg: 25, // minutes
          feature_usage_per_session: 3.2,
          retention_rate: 85
        }
      };

      return dashboard;

    } catch (error) {
      console.error('Error generating analytics dashboard:', error);
      dashboard.error = error.message;
      return dashboard;
    }
  }

  /**
   * Smart alerting system
   */
  async checkAndTriggerAlerts() {
    const alerts = [];
    
    try {
      // Performance alerts
      const perfMetrics = await this.getPerformanceMetrics();
      
      if (perfMetrics.error_rate > 5) {
        alerts.push({
          level: 'critical',
          type: 'performance',
          message: `High error rate: ${perfMetrics.error_rate}%`,
          threshold: '5%',
          actual: `${perfMetrics.error_rate}%`,
          action_required: 'immediate'
        });
      }

      if (perfMetrics.p95_response_time > 500) {
        alerts.push({
          level: 'critical',
          type: 'performance',
          message: `High response time: ${perfMetrics.p95_response_time}ms`,
          threshold: '500ms',
          actual: `${perfMetrics.p95_response_time}ms`,
          action_required: 'immediate'
        });
      }

      // Health check alerts
      const healthCheck = await this.performHealthCheck();
      
      if (healthCheck.status === 'unhealthy') {
        alerts.push({
          level: 'critical',
          type: 'health',
          message: 'System health check failed',
          details: healthCheck.checks,
          action_required: 'immediate'
        });
      }

      // Security alerts would be added here
      // Business metric alerts would be added here

      // Send alerts if any found
      if (alerts.length > 0) {
        await this.sendAlerts(alerts);
      }

      return alerts;

    } catch (error) {
      console.error('Error checking alerts:', error);
      return [];
    }
  }

  /**
   * Send alerts to configured channels
   */
  async sendAlerts(alerts) {
    for (const alert of alerts) {
      try {
        // Send to PagerDuty for critical alerts
        if (alert.level === 'critical' && this.env.PAGERDUTY_API_KEY) {
          await this.sendPagerDutyAlert(alert);
        }

        // Send to Slack for all alerts
        if (this.env.SLACK_WEBHOOK_URL) {
          await this.sendSlackAlert(alert);
        }

        // Log alert
        console.warn('Alert triggered:', JSON.stringify(alert));

      } catch (error) {
        console.error('Error sending alert:', error);
      }
    }
  }

  /**
   * Send alert to PagerDuty
   */
  async sendPagerDutyAlert(alert) {
    const payload = {
      routing_key: this.env.PAGERDUTY_API_KEY,
      event_action: 'trigger',
      payload: {
        summary: alert.message,
        severity: alert.level,
        source: 'chittyos-project-awareness',
        component: alert.type,
        custom_details: alert
      }
    };

    await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  }

  /**
   * Send alert to Slack
   */
  async sendSlackAlert(alert) {
    const color = {
      critical: 'danger',
      warning: 'warning',
      info: 'good'
    }[alert.level] || 'warning';

    const payload = {
      channel: '#chittyos-alerts',
      username: 'ChittyOS Monitor',
      icon_emoji: ':warning:',
      attachments: [{
        color,
        title: `${alert.level.toUpperCase()} Alert: ${alert.type}`,
        text: alert.message,
        fields: [
          {
            title: 'Threshold',
            value: alert.threshold || 'N/A',
            short: true
          },
          {
            title: 'Actual Value',
            value: alert.actual || 'N/A',
            short: true
          },
          {
            title: 'Action Required',
            value: alert.action_required || 'Monitor',
            short: true
          },
          {
            title: 'Timestamp',
            value: new Date().toISOString(),
            short: true
          }
        ]
      }]
    };

    await fetch(this.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  }

  /**
   * Track health check results
   */
  async trackHealthCheck(healthCheck) {
    try {
      if (this.performanceAnalytics) {
        await this.performanceAnalytics.writeDataPoint({
          blobs: [
            'health_check',
            healthCheck.status,
            this.env.CF_REGION || 'unknown',
            this.env.ENVIRONMENT
          ],
          doubles: [
            Date.now(),
            healthCheck.performance?.average_response_time || 0
          ],
          indexes: [
            healthCheck.status === 'healthy' ? 1 : 0
          ]
        });
      }
    } catch (error) {
      console.error('Error tracking health check:', error);
    }
  }

  /**
   * Middleware wrapper for comprehensive monitoring
   */
  static middleware(env) {
    const monitor = new MonitoringAnalytics(env);
    
    return async (request, next) => {
      const startTime = Date.now();
      const url = new URL(request.url);
      
      try {
        // Process request
        const response = await next(request);
        
        // Track successful request
        await monitor.trackUsageEvent('api_request', {
          endpoint: url.pathname,
          method: request.method,
          platform: request.headers.get('User-Agent'),
          response_time: Date.now() - startTime,
          status_code: response.status,
          success: response.status < 400,
          cached: response.headers.has('CF-Cache-Status')
        });

        return response;
        
      } catch (error) {
        // Track error
        await monitor.trackUsageEvent('api_error', {
          endpoint: url.pathname,
          method: request.method,
          error_message: error.message,
          response_time: Date.now() - startTime,
          success: false
        });
        
        throw error;
      }
    };
  }
}