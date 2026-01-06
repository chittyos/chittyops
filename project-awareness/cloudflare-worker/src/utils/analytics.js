/**
 * Analytics Utility
 * Tracks usage analytics using Cloudflare Analytics Engine
 */

export class Analytics {
  /**
   * Track an analytics event
   */
  static async track(env, event, data = {}, timestamp = null) {
    try {
      if (!env.USAGE_ANALYTICS) {
        console.warn('Analytics Engine not configured');
        return false;
      }

      const analyticsData = {
        timestamp: timestamp || Date.now(),
        event: event,
        ...data
      };

      // Write to Analytics Engine
      env.USAGE_ANALYTICS.writeDataPoint(analyticsData);
      
      return true;
    } catch (error) {
      console.error('Analytics tracking error:', error);
      return false;
    }
  }

  /**
   * Track API request
   */
  static async trackApiRequest(env, request, response, duration) {
    const url = new URL(request.url);
    const data = {
      method: request.method,
      endpoint: url.pathname,
      platform: request.headers.get('X-Platform') || 'unknown',
      status_code: response.status,
      duration_ms: duration,
      user_agent: request.headers.get('User-Agent') || 'unknown',
      country: request.cf?.country || 'unknown',
      colo: request.cf?.colo || 'unknown'
    };

    return Analytics.track(env, 'api_request', data);
  }

  /**
   * Track WebSocket connection
   */
  static async trackWebSocketConnection(env, platform, sessionId, action = 'connect') {
    const data = {
      platform: platform,
      session_id: sessionId,
      action: action
    };

    return Analytics.track(env, 'websocket_connection', data);
  }

  /**
   * Track project switch
   */
  static async trackProjectSwitch(env, platform, fromProject, toProject, sessionId) {
    const data = {
      platform: platform,
      from_project: fromProject,
      to_project: toProject,
      session_id: sessionId
    };

    return Analytics.track(env, 'project_switch', data);
  }

  /**
   * Track cross-platform sync
   */
  static async trackCrossPlatformSync(env, sourcePlatform, targetPlatforms, syncType) {
    const data = {
      source_platform: sourcePlatform,
      target_platforms: targetPlatforms,
      sync_type: syncType,
      target_count: targetPlatforms.length
    };

    return Analytics.track(env, 'cross_platform_sync', data);
  }

  /**
   * Track session consolidation
   */
  static async trackSessionConsolidation(env, platform, sessionId, projectId, duration) {
    const data = {
      platform: platform,
      session_id: sessionId,
      project_id: projectId,
      session_duration: duration
    };

    return Analytics.track(env, 'session_consolidation', data);
  }

  /**
   * Track error occurrence
   */
  static async trackError(env, errorType, errorMessage, context, platform) {
    const data = {
      error_type: errorType,
      error_message: errorMessage,
      context: context,
      platform: platform || 'unknown'
    };

    return Analytics.track(env, 'error', data);
  }

  /**
   * Track authentication event
   */
  static async trackAuth(env, platform, action, success = true) {
    const data = {
      platform: platform,
      action: action, // 'login', 'logout', 'refresh'
      success: success
    };

    return Analytics.track(env, 'authentication', data);
  }

  /**
   * Track feature usage
   */
  static async trackFeatureUsage(env, feature, platform, sessionId, metadata = {}) {
    const data = {
      feature: feature,
      platform: platform,
      session_id: sessionId,
      ...metadata
    };

    return Analytics.track(env, 'feature_usage', data);
  }

  /**
   * Track performance metrics
   */
  static async trackPerformance(env, operation, duration, platform, success = true) {
    const data = {
      operation: operation,
      duration_ms: duration,
      platform: platform,
      success: success
    };

    return Analytics.track(env, 'performance', data);
  }

  /**
   * Batch track multiple events
   */
  static async trackBatch(env, events) {
    try {
      const results = [];
      
      for (const event of events) {
        const result = await Analytics.track(env, event.name, event.data, event.timestamp);
        results.push(result);
      }

      return results;
    } catch (error) {
      console.error('Batch analytics tracking error:', error);
      return [];
    }
  }

  /**
   * Create analytics dashboard data
   */
  static async getDashboardData(env, timeframe = '24h') {
    // This would query the Analytics Engine for dashboard data
    // For now, return mock structure
    return {
      timeframe: timeframe,
      total_requests: 0,
      unique_platforms: 0,
      project_switches: 0,
      sync_events: 0,
      error_rate: 0,
      top_platforms: [],
      top_projects: [],
      performance_metrics: {
        avg_response_time: 0,
        p95_response_time: 0,
        success_rate: 0
      }
    };
  }

  /**
   * Get platform usage statistics
   */
  static async getPlatformStats(env, platform, timeframe = '24h') {
    // This would query specific platform usage
    return {
      platform: platform,
      timeframe: timeframe,
      total_requests: 0,
      unique_sessions: 0,
      project_switches: 0,
      avg_session_duration: 0,
      error_count: 0
    };
  }

  /**
   * Get project activity statistics  
   */
  static async getProjectStats(env, projectId, timeframe = '24h') {
    return {
      project_id: projectId,
      timeframe: timeframe,
      total_switches: 0,
      unique_platforms: 0,
      session_count: 0,
      avg_session_duration: 0
    };
  }

  /**
   * Get real-time metrics
   */
  static async getRealTimeMetrics(env) {
    return {
      current_connections: 0, // Would get from Durable Objects
      requests_per_minute: 0,
      active_platforms: [],
      active_projects: [],
      sync_events_last_hour: 0
    };
  }

  /**
   * Export analytics data for external analysis
   */
  static async exportData(env, startDate, endDate, format = 'json') {
    // This would export data from Analytics Engine
    return {
      start_date: startDate,
      end_date: endDate,
      format: format,
      export_url: null, // Would generate R2 URL for large exports
      record_count: 0
    };
  }
}