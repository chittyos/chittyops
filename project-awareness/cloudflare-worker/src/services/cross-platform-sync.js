/**
 * Cross-Platform Synchronization Service
 * Handles real-time sync between different AI platforms
 */

export class CrossPlatformSync {
  constructor(env, durableObjectState = null) {
    this.env = env;
    this.state = durableObjectState;
    this.connectedPlatforms = new Map();
    this.syncQueue = [];
  }

  /**
   * Handle sync request from platform
   */
  async handleSync({ source_platform, sync_type, data }) {
    try {
      switch (sync_type) {
        case 'project_switch':
          return await this.syncProjectSwitch(source_platform, data.project_name, data);
        
        case 'session_start':
          return await this.syncSessionStart(source_platform, data);
        
        case 'session_end':
          return await this.syncSessionEnd(source_platform, data);
        
        case 'memory_update':
          return await this.syncMemoryUpdate(source_platform, data);
        
        default:
          throw new Error(`Unknown sync type: ${sync_type}`);
      }
    } catch (error) {
      console.error('Cross-platform sync error:', error);
      throw error;
    }
  }

  /**
   * Sync project switch across platforms
   */
  async syncProjectSwitch(sourcePlatform, projectName, data) {
    try {
      const syncEvent = {
        type: 'project_switch',
        source_platform: sourcePlatform,
        project_name: projectName,
        data: data,
        timestamp: new Date().toISOString(),
        sync_id: this.generateSyncId()
      };

      // Store in cross-platform sync KV
      await this.env.CROSS_PLATFORM_SYNC.put(
        `sync_event:${syncEvent.sync_id}`,
        JSON.stringify(syncEvent),
        {
          expirationTtl: 86400 // 24 hours
        }
      );

      // Update project context across all platforms
      const platforms = await this.getConnectedPlatforms();
      const syncResults = [];

      for (const platform of platforms) {
        if (platform === sourcePlatform) continue; // Skip source

        const result = await this.notifyPlatformProjectSwitch(platform, syncEvent);
        syncResults.push({
          platform: platform,
          notified: result,
          timestamp: new Date().toISOString()
        });
      }

      // Store sync results
      await this.storeSyncResults(syncEvent.sync_id, syncResults);

      // Broadcast via WebSocket if available
      await this.broadcastWebSocketUpdate(syncEvent);

      return {
        sync_id: syncEvent.sync_id,
        platforms_notified: syncResults.length,
        results: syncResults
      };

    } catch (error) {
      console.error('Error syncing project switch:', error);
      throw error;
    }
  }

  /**
   * Sync session start across platforms
   */
  async syncSessionStart(sourcePlatform, data) {
    try {
      const syncEvent = {
        type: 'session_start',
        source_platform: sourcePlatform,
        session_id: data.session_id,
        user_id: data.user_id,
        context: data.context,
        timestamp: new Date().toISOString(),
        sync_id: this.generateSyncId()
      };

      // Notify other platforms about new session
      const platforms = await this.getConnectedPlatforms();
      const notifications = [];

      for (const platform of platforms) {
        if (platform === sourcePlatform) continue;

        const result = await this.notifyPlatformSessionStart(platform, syncEvent);
        notifications.push({
          platform: platform,
          notified: result
        });
      }

      // Update session registry
      await this.updateSessionRegistry(syncEvent);

      return {
        sync_id: syncEvent.sync_id,
        session_registered: true,
        platforms_notified: notifications.length
      };

    } catch (error) {
      console.error('Error syncing session start:', error);
      throw error;
    }
  }

  /**
   * Sync session end across platforms
   */
  async syncSessionEnd(sourcePlatform, data) {
    try {
      const syncEvent = {
        type: 'session_end',
        source_platform: sourcePlatform,
        session_id: data.session_id,
        consolidation_data: data.consolidation_data,
        timestamp: new Date().toISOString(),
        sync_id: this.generateSyncId()
      };

      // Consolidate session across all platforms
      const platforms = await this.getConnectedPlatforms();
      const consolidationResults = [];

      for (const platform of platforms) {
        const result = await this.consolidateSessionOnPlatform(platform, syncEvent);
        consolidationResults.push({
          platform: platform,
          consolidated: result
        });
      }

      // Send to long-term storage
      await this.archiveSessionData(syncEvent);

      return {
        sync_id: syncEvent.sync_id,
        session_archived: true,
        consolidation_results: consolidationResults
      };

    } catch (error) {
      console.error('Error syncing session end:', error);
      throw error;
    }
  }

  /**
   * Sync memory updates across platforms
   */
  async syncMemoryUpdate(sourcePlatform, data) {
    try {
      const syncEvent = {
        type: 'memory_update',
        source_platform: sourcePlatform,
        project_id: data.project_id,
        memory_data: data.memory_data,
        timestamp: new Date().toISOString(),
        sync_id: this.generateSyncId()
      };

      // Update project memory across platforms
      const platforms = await this.getConnectedPlatforms();
      const updateResults = [];

      for (const platform of platforms) {
        if (platform === sourcePlatform) continue;

        const result = await this.updatePlatformMemory(platform, syncEvent);
        updateResults.push({
          platform: platform,
          updated: result
        });
      }

      // Update central memory store
      await this.updateCentralMemory(syncEvent);

      return {
        sync_id: syncEvent.sync_id,
        central_memory_updated: true,
        platform_updates: updateResults
      };

    } catch (error) {
      console.error('Error syncing memory update:', error);
      throw error;
    }
  }

  /**
   * Get list of connected platforms
   */
  async getConnectedPlatforms() {
    try {
      // Get active sessions from all platforms
      const platforms = ['claude-code', 'claude-desktop', 'claude-web', 'openai-customgpt', 'chatgpt'];
      const connectedPlatforms = [];

      for (const platform of platforms) {
        const sessions = await this.env.SESSION_STORE.get(`platform:${platform}:sessions`, 'json') || [];
        
        // Check for recent activity (last 5 minutes)
        const recentSessions = sessions.filter(session => {
          const connectedAt = new Date(session.connected_at);
          const fiveMinutesAgo = new Date(Date.now() - 300000);
          return connectedAt > fiveMinutesAgo;
        });

        if (recentSessions.length > 0) {
          connectedPlatforms.push(platform);
        }
      }

      return connectedPlatforms;
    } catch (error) {
      console.error('Error getting connected platforms:', error);
      return [];
    }
  }

  /**
   * Notify platform of project switch
   */
  async notifyPlatformProjectSwitch(platform, syncEvent) {
    try {
      // Store notification for platform to pick up
      const notificationKey = `notification:${platform}:project_switch:${syncEvent.sync_id}`;
      
      await this.env.CROSS_PLATFORM_SYNC.put(
        notificationKey,
        JSON.stringify({
          type: 'project_switch',
          project_name: syncEvent.project_name,
          source_platform: syncEvent.source_platform,
          data: syncEvent.data,
          timestamp: syncEvent.timestamp
        }),
        {
          expirationTtl: 3600 // 1 hour
        }
      );

      return true;
    } catch (error) {
      console.error('Error notifying platform project switch:', error);
      return false;
    }
  }

  /**
   * Notify platform of session start
   */
  async notifyPlatformSessionStart(platform, syncEvent) {
    try {
      const notificationKey = `notification:${platform}:session_start:${syncEvent.sync_id}`;
      
      await this.env.CROSS_PLATFORM_SYNC.put(
        notificationKey,
        JSON.stringify({
          type: 'session_start',
          session_id: syncEvent.session_id,
          user_id: syncEvent.user_id,
          source_platform: syncEvent.source_platform,
          context: syncEvent.context,
          timestamp: syncEvent.timestamp
        }),
        {
          expirationTtl: 3600
        }
      );

      return true;
    } catch (error) {
      console.error('Error notifying platform session start:', error);
      return false;
    }
  }

  /**
   * Consolidate session on platform
   */
  async consolidateSessionOnPlatform(platform, syncEvent) {
    try {
      // Create consolidation task for platform
      const consolidationKey = `consolidation:${platform}:${syncEvent.session_id}`;
      
      await this.env.CROSS_PLATFORM_SYNC.put(
        consolidationKey,
        JSON.stringify({
          type: 'session_consolidation',
          session_id: syncEvent.session_id,
          consolidation_data: syncEvent.consolidation_data,
          source_platform: syncEvent.source_platform,
          timestamp: syncEvent.timestamp
        }),
        {
          expirationTtl: 86400 // 24 hours
        }
      );

      return true;
    } catch (error) {
      console.error('Error consolidating session on platform:', error);
      return false;
    }
  }

  /**
   * Update platform memory
   */
  async updatePlatformMemory(platform, syncEvent) {
    try {
      const memoryKey = `memory_update:${platform}:${syncEvent.project_id}:${syncEvent.sync_id}`;
      
      await this.env.CROSS_PLATFORM_SYNC.put(
        memoryKey,
        JSON.stringify({
          type: 'memory_update',
          project_id: syncEvent.project_id,
          memory_data: syncEvent.memory_data,
          source_platform: syncEvent.source_platform,
          timestamp: syncEvent.timestamp
        }),
        {
          expirationTtl: 86400
        }
      );

      return true;
    } catch (error) {
      console.error('Error updating platform memory:', error);
      return false;
    }
  }

  /**
   * Update central memory store
   */
  async updateCentralMemory(syncEvent) {
    try {
      const memoryKey = `central_memory:${syncEvent.project_id}`;
      let centralMemory = await this.env.PROJECT_STORE.get(memoryKey, 'json') || {
        project_id: syncEvent.project_id,
        memory_updates: [],
        last_updated: null
      };

      centralMemory.memory_updates.push({
        sync_id: syncEvent.sync_id,
        source_platform: syncEvent.source_platform,
        memory_data: syncEvent.memory_data,
        timestamp: syncEvent.timestamp
      });

      // Keep only recent updates (last 100)
      centralMemory.memory_updates = centralMemory.memory_updates.slice(-100);
      centralMemory.last_updated = new Date().toISOString();

      await this.env.PROJECT_STORE.put(
        memoryKey,
        JSON.stringify(centralMemory),
        {
          expirationTtl: 2592000 // 30 days
        }
      );

      return true;
    } catch (error) {
      console.error('Error updating central memory:', error);
      return false;
    }
  }

  /**
   * Update session registry
   */
  async updateSessionRegistry(syncEvent) {
    try {
      const registryKey = `session_registry:${syncEvent.user_id}`;
      let registry = await this.env.SESSION_STORE.get(registryKey, 'json') || {
        user_id: syncEvent.user_id,
        sessions: []
      };

      registry.sessions.push({
        session_id: syncEvent.session_id,
        platform: syncEvent.source_platform,
        started_at: syncEvent.timestamp,
        context: syncEvent.context
      });

      // Keep only recent sessions
      registry.sessions = registry.sessions.slice(-50);

      await this.env.SESSION_STORE.put(
        registryKey,
        JSON.stringify(registry),
        {
          expirationTtl: 604800 // 7 days
        }
      );

      return true;
    } catch (error) {
      console.error('Error updating session registry:', error);
      return false;
    }
  }

  /**
   * Archive session data for long-term storage
   */
  async archiveSessionData(syncEvent) {
    try {
      const archiveKey = `archive/sessions/${syncEvent.source_platform}/${syncEvent.session_id}.json`;
      
      await this.env.PROJECT_DATA_BUCKET.put(
        archiveKey,
        JSON.stringify({
          session_id: syncEvent.session_id,
          platform: syncEvent.source_platform,
          consolidation_data: syncEvent.consolidation_data,
          archived_at: new Date().toISOString(),
          sync_id: syncEvent.sync_id
        }, null, 2),
        {
          httpMetadata: {
            contentType: 'application/json'
          }
        }
      );

      return true;
    } catch (error) {
      console.error('Error archiving session data:', error);
      return false;
    }
  }

  /**
   * Store sync results
   */
  async storeSyncResults(syncId, results) {
    try {
      await this.env.CROSS_PLATFORM_SYNC.put(
        `sync_results:${syncId}`,
        JSON.stringify({
          sync_id: syncId,
          results: results,
          completed_at: new Date().toISOString()
        }),
        {
          expirationTtl: 86400
        }
      );
    } catch (error) {
      console.error('Error storing sync results:', error);
    }
  }

  /**
   * Broadcast WebSocket update
   */
  async broadcastWebSocketUpdate(syncEvent) {
    try {
      // This would send updates to connected WebSocket clients
      // Implementation depends on WebSocket handler setup
      console.log('Broadcasting WebSocket update:', syncEvent.type);
      return true;
    } catch (error) {
      console.error('Error broadcasting WebSocket update:', error);
      return false;
    }
  }

  /**
   * Generate unique sync ID
   */
  generateSyncId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `sync_${timestamp}_${random}`;
  }

  /**
   * Get sync statistics
   */
  async getSyncStatistics() {
    try {
      // This would aggregate sync statistics from KV stores
      return {
        total_syncs: 0, // Would query actual data
        sync_types: {
          project_switch: 0,
          session_start: 0,
          session_end: 0,
          memory_update: 0
        },
        platform_activity: {},
        last_24h_syncs: 0
      };
    } catch (error) {
      console.error('Error getting sync statistics:', error);
      return {};
    }
  }

  /**
   * Handle sync request for Durable Object
   */
  async handleSyncRequest(request) {
    try {
      const body = await request.json();
      const result = await this.handleSync(body);
      
      return new Response(JSON.stringify({
        success: true,
        result: result
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}