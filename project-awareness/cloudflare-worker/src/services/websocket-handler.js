/**
 * WebSocket Handler for Real-Time Cross-Platform Synchronization
 * Handles WebSocket connections and real-time updates
 */

export class WebSocketHandler {
  constructor(durableObjectState, env) {
    this.state = durableObjectState;
    this.env = env;
    this.sessions = new Map();
    this.platformConnections = new Map();
  }

  /**
   * Handle WebSocket connection
   */
  async handleWebSocket(request) {
    try {
      // Parse connection parameters
      const url = new URL(request.url);
      const platform = url.searchParams.get('platform');
      const sessionId = url.searchParams.get('session_id');
      const token = url.searchParams.get('token');

      if (!platform || !sessionId || !token) {
        return new Response('Missing required parameters', { status: 400 });
      }

      // Validate session token
      const isValid = await this.validateSessionToken(token, sessionId);
      if (!isValid) {
        return new Response('Invalid session token', { status: 401 });
      }

      // Create WebSocket pair
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      // Accept the WebSocket connection
      server.accept();

      // Handle WebSocket events
      await this.setupWebSocketHandlers(server, platform, sessionId);

      // Register connection
      await this.registerConnection(server, platform, sessionId);

      // Send initial state
      await this.sendInitialState(server, platform, sessionId);

      return new Response(null, {
        status: 101,
        webSocket: client
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      return new Response('WebSocket connection failed', { status: 500 });
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  async setupWebSocketHandlers(webSocket, platform, sessionId) {
    const connectionId = `${platform}:${sessionId}:${Date.now()}`;

    webSocket.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data);
        await this.handleWebSocketMessage(webSocket, platform, sessionId, message);
      } catch (error) {
        console.error('WebSocket message error:', error);
        webSocket.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    webSocket.addEventListener('close', async (event) => {
      await this.handleWebSocketClose(webSocket, platform, sessionId, event);
    });

    webSocket.addEventListener('error', async (event) => {
      await this.handleWebSocketError(webSocket, platform, sessionId, event);
    });

    // Store connection info
    this.sessions.set(connectionId, {
      webSocket,
      platform,
      sessionId,
      connectedAt: new Date().toISOString()
    });

    // Track platform connections
    if (!this.platformConnections.has(platform)) {
      this.platformConnections.set(platform, new Set());
    }
    this.platformConnections.get(platform).add(connectionId);
  }

  /**
   * Handle incoming WebSocket messages
   */
  async handleWebSocketMessage(webSocket, platform, sessionId, message) {
    switch (message.type) {
      case 'ping':
        webSocket.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString()
        }));
        break;

      case 'project_switch':
        await this.handleProjectSwitchMessage(webSocket, platform, sessionId, message);
        break;

      case 'sync_request':
        await this.handleSyncRequest(webSocket, platform, sessionId, message);
        break;

      case 'session_update':
        await this.handleSessionUpdate(webSocket, platform, sessionId, message);
        break;

      case 'subscribe':
        await this.handleSubscription(webSocket, platform, sessionId, message);
        break;

      default:
        webSocket.send(JSON.stringify({
          type: 'error',
          message: `Unknown message type: ${message.type}`
        }));
    }
  }

  /**
   * Handle project switch message
   */
  async handleProjectSwitchMessage(webSocket, platform, sessionId, message) {
    try {
      const { project_name, context } = message.data;

      // Broadcast to other platforms
      await this.broadcastToOtherPlatforms(platform, {
        type: 'project_switched',
        source_platform: platform,
        session_id: sessionId,
        project_name: project_name,
        context: context,
        timestamp: new Date().toISOString()
      });

      // Store in sync state
      await this.updateSyncState('project_switch', {
        platform,
        sessionId,
        project_name,
        context
      });

      // Confirm to sender
      webSocket.send(JSON.stringify({
        type: 'project_switch_confirmed',
        project_name: project_name,
        synced_to_platforms: await this.getConnectedPlatforms(platform)
      }));

    } catch (error) {
      console.error('Error handling project switch message:', error);
      webSocket.send(JSON.stringify({
        type: 'error',
        message: 'Failed to process project switch'
      }));
    }
  }

  /**
   * Handle sync request
   */
  async handleSyncRequest(webSocket, platform, sessionId, message) {
    try {
      const { sync_type, data } = message;

      // Get current state for platform
      const currentState = await this.getCurrentPlatformState(platform, sessionId);

      // Send current state back
      webSocket.send(JSON.stringify({
        type: 'sync_response',
        sync_type: sync_type,
        state: currentState,
        timestamp: new Date().toISOString()
      }));

    } catch (error) {
      console.error('Error handling sync request:', error);
      webSocket.send(JSON.stringify({
        type: 'error',
        message: 'Failed to process sync request'
      }));
    }
  }

  /**
   * Handle session update
   */
  async handleSessionUpdate(webSocket, platform, sessionId, message) {
    try {
      const { update_type, data } = message;

      // Store session update
      await this.storeSessionUpdate(platform, sessionId, update_type, data);

      // Broadcast to interested platforms
      await this.broadcastSessionUpdate(platform, sessionId, {
        type: 'session_updated',
        update_type: update_type,
        data: data,
        timestamp: new Date().toISOString()
      });

      // Confirm to sender
      webSocket.send(JSON.stringify({
        type: 'session_update_confirmed',
        update_type: update_type
      }));

    } catch (error) {
      console.error('Error handling session update:', error);
      webSocket.send(JSON.stringify({
        type: 'error',
        message: 'Failed to process session update'
      }));
    }
  }

  /**
   * Handle subscription request
   */
  async handleSubscription(webSocket, platform, sessionId, message) {
    try {
      const { events, filters } = message;

      // Store subscription preferences
      await this.storeSubscription(platform, sessionId, events, filters);

      webSocket.send(JSON.stringify({
        type: 'subscription_confirmed',
        events: events,
        filters: filters
      }));

    } catch (error) {
      console.error('Error handling subscription:', error);
      webSocket.send(JSON.stringify({
        type: 'error',
        message: 'Failed to process subscription'
      }));
    }
  }

  /**
   * Handle WebSocket close
   */
  async handleWebSocketClose(webSocket, platform, sessionId, event) {
    const connectionId = this.findConnectionId(webSocket);
    if (connectionId) {
      this.sessions.delete(connectionId);
      
      if (this.platformConnections.has(platform)) {
        this.platformConnections.get(platform).delete(connectionId);
      }
    }

    // Notify other platforms of disconnection
    await this.broadcastToOtherPlatforms(platform, {
      type: 'platform_disconnected',
      platform: platform,
      session_id: sessionId,
      timestamp: new Date().toISOString()
    });

    console.log(`WebSocket closed for ${platform}:${sessionId}`);
  }

  /**
   * Handle WebSocket error
   */
  async handleWebSocketError(webSocket, platform, sessionId, event) {
    console.error(`WebSocket error for ${platform}:${sessionId}:`, event);
    
    // Clean up connection
    const connectionId = this.findConnectionId(webSocket);
    if (connectionId) {
      this.sessions.delete(connectionId);
    }
  }

  /**
   * Register WebSocket connection
   */
  async registerConnection(webSocket, platform, sessionId) {
    // Store connection in durable object state
    await this.state.storage.put(`connection:${platform}:${sessionId}`, {
      platform: platform,
      sessionId: sessionId,
      connectedAt: new Date().toISOString(),
      status: 'active'
    });

    // Update platform connection count
    const connectionCount = await this.getPlatformConnectionCount(platform);
    await this.state.storage.put(`platform:${platform}:count`, connectionCount + 1);
  }

  /**
   * Send initial state to new connection
   */
  async sendInitialState(webSocket, platform, sessionId) {
    try {
      // Get current project state
      const currentProject = await this.getCurrentProject(sessionId);
      
      // Get connected platforms
      const connectedPlatforms = await this.getConnectedPlatforms();
      
      // Get recent sync events
      const recentSyncs = await this.getRecentSyncEvents(platform, 10);

      webSocket.send(JSON.stringify({
        type: 'initial_state',
        data: {
          current_project: currentProject,
          connected_platforms: connectedPlatforms,
          recent_syncs: recentSyncs,
          connection_established: new Date().toISOString()
        }
      }));

    } catch (error) {
      console.error('Error sending initial state:', error);
    }
  }

  /**
   * Broadcast message to other platforms
   */
  async broadcastToOtherPlatforms(excludePlatform, message) {
    for (const [connectionId, session] of this.sessions.entries()) {
      if (session.platform !== excludePlatform) {
        try {
          session.webSocket.send(JSON.stringify(message));
        } catch (error) {
          console.error(`Failed to send to ${connectionId}:`, error);
          // Remove failed connection
          this.sessions.delete(connectionId);
        }
      }
    }
  }

  /**
   * Broadcast session update to interested platforms
   */
  async broadcastSessionUpdate(sourcePlatform, sessionId, message) {
    // For now, broadcast to all platforms
    // In production, you'd check subscriptions
    await this.broadcastToOtherPlatforms(sourcePlatform, message);
  }

  /**
   * Validate session token
   */
  async validateSessionToken(token, sessionId) {
    try {
      // Check if session exists in KV store
      const session = await this.env.SESSION_STORE.get(`session:${sessionId}`, 'json');
      
      if (!session) return false;

      // Check if session is expired
      if (new Date(session.expires_at) < new Date()) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error validating session token:', error);
      return false;
    }
  }

  /**
   * Get connected platforms (excluding specified platform)
   */
  async getConnectedPlatforms(excludePlatform = null) {
    const platforms = [];
    
    for (const [platform, connections] of this.platformConnections.entries()) {
      if (platform !== excludePlatform && connections.size > 0) {
        platforms.push({
          platform: platform,
          connections: connections.size,
          last_seen: new Date().toISOString()
        });
      }
    }
    
    return platforms;
  }

  /**
   * Get current platform state
   */
  async getCurrentPlatformState(platform, sessionId) {
    try {
      // Get current project
      const currentProject = await this.getCurrentProject(sessionId);
      
      // Get platform-specific state
      const platformState = await this.state.storage.get(`state:${platform}:${sessionId}`);
      
      return {
        current_project: currentProject,
        platform_state: platformState,
        last_updated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting current platform state:', error);
      return null;
    }
  }

  /**
   * Get current project for session
   */
  async getCurrentProject(sessionId) {
    try {
      return await this.env.PROJECT_STORE.get(`current_project:${sessionId}`);
    } catch (error) {
      console.error('Error getting current project:', error);
      return null;
    }
  }

  /**
   * Update sync state
   */
  async updateSyncState(syncType, data) {
    try {
      const syncEvent = {
        type: syncType,
        data: data,
        timestamp: new Date().toISOString(),
        id: this.generateSyncId()
      };

      await this.state.storage.put(`sync:${syncEvent.id}`, syncEvent);
      
      // Keep only recent sync events (last 100)
      const allSyncs = await this.state.storage.list({ prefix: 'sync:' });
      if (allSyncs.size > 100) {
        const oldestKeys = Array.from(allSyncs.keys()).slice(0, allSyncs.size - 100);
        await this.state.storage.delete(oldestKeys);
      }

    } catch (error) {
      console.error('Error updating sync state:', error);
    }
  }

  /**
   * Store session update
   */
  async storeSessionUpdate(platform, sessionId, updateType, data) {
    try {
      const update = {
        platform: platform,
        session_id: sessionId,
        update_type: updateType,
        data: data,
        timestamp: new Date().toISOString()
      };

      await this.state.storage.put(`update:${platform}:${sessionId}:${Date.now()}`, update);
    } catch (error) {
      console.error('Error storing session update:', error);
    }
  }

  /**
   * Store subscription preferences
   */
  async storeSubscription(platform, sessionId, events, filters) {
    try {
      const subscription = {
        platform: platform,
        session_id: sessionId,
        events: events,
        filters: filters,
        created_at: new Date().toISOString()
      };

      await this.state.storage.put(`subscription:${platform}:${sessionId}`, subscription);
    } catch (error) {
      console.error('Error storing subscription:', error);
    }
  }

  /**
   * Get recent sync events
   */
  async getRecentSyncEvents(platform, limit = 10) {
    try {
      const syncs = await this.state.storage.list({ prefix: 'sync:' });
      const syncArray = Array.from(syncs.values())
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);

      return syncArray;
    } catch (error) {
      console.error('Error getting recent sync events:', error);
      return [];
    }
  }

  /**
   * Get platform connection count
   */
  async getPlatformConnectionCount(platform) {
    try {
      const count = await this.state.storage.get(`platform:${platform}:count`);
      return count || 0;
    } catch (error) {
      console.error('Error getting platform connection count:', error);
      return 0;
    }
  }

  /**
   * Find connection ID by WebSocket
   */
  findConnectionId(webSocket) {
    for (const [connectionId, session] of this.sessions.entries()) {
      if (session.webSocket === webSocket) {
        return connectionId;
      }
    }
    return null;
  }

  /**
   * Generate sync ID
   */
  generateSyncId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `ws_${timestamp}_${random}`;
  }

  /**
   * Get WebSocket statistics
   */
  async getWebSocketStatistics() {
    const stats = {
      total_connections: this.sessions.size,
      platform_breakdown: {},
      active_syncs: 0
    };

    for (const [platform, connections] of this.platformConnections.entries()) {
      stats.platform_breakdown[platform] = connections.size;
    }

    return stats;
  }
}