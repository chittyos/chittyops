/**
 * Session Manager for Cross-Platform Project Awareness
 * Handles session lifecycle, memory consolidation, and alignment
 */

export class SessionManager {
  constructor(env) {
    this.env = env;
  }

  /**
   * Register a new platform session
   */
  async registerPlatformSession({ platform, session_id, user_id, context = {} }) {
    const sessionData = {
      platform,
      session_id,
      user_id,
      context,
      registered_at: new Date().toISOString(),
      active_project: null,
      tools_used: [],
      files_accessed: [],
      decisions: [],
      sync_state: {
        last_sync: new Date().toISOString(),
        sync_version: 1
      }
    };

    // Store session in KV
    const key = `platform_session:${platform}:${session_id}`;
    await this.env.SESSION_STORE.put(
      key,
      JSON.stringify(sessionData),
      {
        expirationTtl: 86400 // 24 hours
      }
    );

    // Add to active sessions index
    await this.addToActiveSessions(platform, session_id, user_id);

    // Initialize project context if available
    if (context.project_hint) {
      await this.updateSessionProject(session_id, context.project_hint);
    }

    return sessionData;
  }

  /**
   * Update session project context
   */
  async updateSessionProject(authToken, projectName) {
    try {
      // Extract session ID from auth token (JWT or session ID)
      const sessionId = await this.extractSessionId(authToken);
      if (!sessionId) return false;

      // Update all platform sessions for this user
      const sessions = await this.getUserSessions(sessionId);
      
      for (const session of sessions) {
        session.active_project = projectName;
        session.project_switched_at = new Date().toISOString();
        
        const key = `platform_session:${session.platform}:${session.session_id}`;
        await this.env.SESSION_STORE.put(
          key,
          JSON.stringify(session),
          {
            expirationTtl: 86400
          }
        );
      }

      // Store in project store for quick lookup
      await this.env.PROJECT_STORE.put(
        `active_project:${sessionId}`,
        projectName,
        {
          expirationTtl: 86400
        }
      );

      return true;
    } catch (error) {
      console.error('Error updating session project:', error);
      return false;
    }
  }

  /**
   * Consolidate session memory
   */
  async consolidateSessionMemory({ session_id, project_id, platform, session_data }) {
    try {
      // Get current session data
      const key = `platform_session:${platform}:${session_id}`;
      const currentSession = await this.env.SESSION_STORE.get(key, 'json');
      
      if (!currentSession) {
        throw new Error('Session not found');
      }

      // Merge session data
      const consolidatedData = {
        ...currentSession,
        ...session_data,
        consolidated_at: new Date().toISOString(),
        project_context: project_id || currentSession.active_project
      };

      // Store consolidated session
      const consolidatedKey = `consolidated:${platform}:${session_id}`;
      await this.env.SESSION_STORE.put(
        consolidatedKey,
        JSON.stringify(consolidatedData),
        {
          expirationTtl: 604800 // 7 days
        }
      );

      // Update project memory
      if (consolidatedData.project_context) {
        await this.updateProjectMemory(consolidatedData.project_context, consolidatedData);
      }

      // Send to ChittyChat for integration
      await this.sendToChittyChat(consolidatedData);

      // Store in R2 for long-term persistence
      await this.storeInR2(session_id, platform, consolidatedData);

      return {
        consolidated_session_id: consolidatedKey,
        memory_updated: true,
        chittychat_integrated: true,
        persistent_storage: true
      };

    } catch (error) {
      console.error('Error consolidating session memory:', error);
      throw error;
    }
  }

  /**
   * Force session alignment across platforms
   */
  async forceSessionAlignment({ platform, reason }) {
    try {
      // Get all active sessions for the platform
      const activeSessions = await this.getActivePlatformSessions(platform);
      
      const alignmentResults = [];
      
      for (const session of activeSessions) {
        // Force sync with ChittyChat
        const chittyChatState = await this.getChittyChatState(session.session_id);
        
        // Update session with latest state
        session.alignment_forced_at = new Date().toISOString();
        session.alignment_reason = reason;
        session.sync_state = chittyChatState;
        
        // Store updated session
        const key = `platform_session:${session.platform}:${session.session_id}`;
        await this.env.SESSION_STORE.put(
          key,
          JSON.stringify(session),
          {
            expirationTtl: 86400
          }
        );
        
        alignmentResults.push({
          session_id: session.session_id,
          aligned: true,
          state_updated: true
        });
      }

      return {
        platform,
        sessions_aligned: alignmentResults.length,
        alignment_timestamp: new Date().toISOString(),
        results: alignmentResults
      };

    } catch (error) {
      console.error('Error forcing session alignment:', error);
      throw error;
    }
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(sessionId) {
    try {
      // This is a simplified approach - in production you'd want a more efficient index
      const platforms = ['claude-code', 'claude-desktop', 'claude-web', 'openai-customgpt', 'chatgpt'];
      const sessions = [];
      
      for (const platform of platforms) {
        const platformSessions = await this.env.SESSION_STORE.get(`platform:${platform}:sessions`, 'json') || [];
        
        for (const sessionInfo of platformSessions) {
          if (sessionInfo.session_id === sessionId) {
            const sessionData = await this.env.SESSION_STORE.get(
              `platform_session:${platform}:${sessionInfo.session_id}`,
              'json'
            );
            if (sessionData) {
              sessions.push(sessionData);
            }
          }
        }
      }
      
      return sessions;
    } catch (error) {
      console.error('Error getting user sessions:', error);
      return [];
    }
  }

  /**
   * Get active platform sessions
   */
  async getActivePlatformSessions(platform) {
    try {
      const sessionsKey = `platform:${platform}:sessions`;
      const sessionList = await this.env.SESSION_STORE.get(sessionsKey, 'json') || [];
      
      const sessions = [];
      for (const sessionInfo of sessionList) {
        const sessionData = await this.env.SESSION_STORE.get(
          `platform_session:${platform}:${sessionInfo.session_id}`,
          'json'
        );
        if (sessionData) {
          sessions.push(sessionData);
        }
      }
      
      return sessions;
    } catch (error) {
      console.error('Error getting active platform sessions:', error);
      return [];
    }
  }

  /**
   * Extract session ID from auth token
   */
  async extractSessionId(authToken) {
    try {
      if (authToken.startsWith('Bearer ')) {
        // JWT token - decode to get session ID
        const token = authToken.substring(7);
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.session_id;
      } else {
        // Direct session ID
        return authToken;
      }
    } catch (error) {
      console.error('Error extracting session ID:', error);
      return null;
    }
  }

  /**
   * Add session to active sessions index
   */
  async addToActiveSessions(platform, sessionId, userId) {
    try {
      const key = `platform:${platform}:sessions`;
      const sessions = await this.env.SESSION_STORE.get(key, 'json') || [];
      
      sessions.push({
        session_id: sessionId,
        user_id: userId,
        connected_at: new Date().toISOString()
      });

      // Keep only recent sessions
      const recentSessions = sessions.slice(-100);

      await this.env.SESSION_STORE.put(
        key,
        JSON.stringify(recentSessions),
        {
          expirationTtl: 86400
        }
      );
    } catch (error) {
      console.error('Error adding to active sessions:', error);
    }
  }

  /**
   * Update project memory with session insights
   */
  async updateProjectMemory(projectId, sessionData) {
    try {
      const projectMemoryKey = `project_memory:${projectId}`;
      let projectMemory = await this.env.PROJECT_STORE.get(projectMemoryKey, 'json') || {
        project_id: projectId,
        sessions: [],
        patterns: {},
        insights: []
      };

      // Add session summary to project memory
      projectMemory.sessions.push({
        session_id: sessionData.session_id,
        platform: sessionData.platform,
        consolidated_at: sessionData.consolidated_at,
        tools_used: sessionData.tools_used?.length || 0,
        files_accessed: sessionData.files_accessed?.length || 0,
        duration: this.calculateSessionDuration(sessionData)
      });

      // Extract patterns
      this.extractSessionPatterns(sessionData, projectMemory.patterns);

      // Keep only recent sessions
      projectMemory.sessions = projectMemory.sessions.slice(-50);
      projectMemory.last_updated = new Date().toISOString();

      await this.env.PROJECT_STORE.put(
        projectMemoryKey,
        JSON.stringify(projectMemory),
        {
          expirationTtl: 2592000 // 30 days
        }
      );

    } catch (error) {
      console.error('Error updating project memory:', error);
    }
  }

  /**
   * Get ChittyChat state for session alignment
   */
  async getChittyChatState(sessionId) {
    try {
      const response = await fetch(`${this.env.CHITTYCHAT_API_URL}/api/sessions/${sessionId}/state`, {
        headers: {
          'Authorization': `Bearer ${this.env.CHITTYCHAT_API_KEY}`
        }
      });

      if (response.ok) {
        return await response.json();
      }

      return null;
    } catch (error) {
      console.error('Error getting ChittyChat state:', error);
      return null;
    }
  }

  /**
   * Send consolidated data to ChittyChat
   */
  async sendToChittyChat(consolidatedData) {
    try {
      const response = await fetch(`${this.env.CHITTYCHAT_API_URL}/api/sessions/consolidate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.env.CHITTYCHAT_API_KEY}`
        },
        body: JSON.stringify({
          session_id: consolidatedData.session_id,
          platform: consolidatedData.platform,
          project_context: consolidatedData.project_context,
          consolidated_data: consolidatedData
        })
      });

      return response.ok;
    } catch (error) {
      console.error('Error sending to ChittyChat:', error);
      return false;
    }
  }

  /**
   * Store consolidated session in R2 for long-term persistence
   */
  async storeInR2(sessionId, platform, consolidatedData) {
    try {
      const key = `sessions/${platform}/${sessionId}/${new Date().toISOString()}.json`;
      
      await this.env.PROJECT_DATA_BUCKET.put(
        key,
        JSON.stringify(consolidatedData, null, 2),
        {
          httpMetadata: {
            contentType: 'application/json'
          }
        }
      );

      return true;
    } catch (error) {
      console.error('Error storing in R2:', error);
      return false;
    }
  }

  /**
   * Calculate session duration
   */
  calculateSessionDuration(sessionData) {
    if (sessionData.registered_at && sessionData.consolidated_at) {
      const start = new Date(sessionData.registered_at);
      const end = new Date(sessionData.consolidated_at);
      return end.getTime() - start.getTime();
    }
    return 0;
  }

  /**
   * Extract patterns from session data
   */
  extractSessionPatterns(sessionData, patterns) {
    // Extract tool usage patterns
    if (sessionData.tools_used?.length > 0) {
      patterns.tool_usage = patterns.tool_usage || {};
      sessionData.tools_used.forEach(tool => {
        patterns.tool_usage[tool.tool] = (patterns.tool_usage[tool.tool] || 0) + 1;
      });
    }

    // Extract file access patterns
    if (sessionData.files_accessed?.length > 0) {
      patterns.file_patterns = patterns.file_patterns || {};
      sessionData.files_accessed.forEach(file => {
        const extension = file.path?.split('.').pop();
        if (extension) {
          patterns.file_patterns[extension] = (patterns.file_patterns[extension] || 0) + 1;
        }
      });
    }

    // Extract workflow patterns
    patterns.workflow_types = patterns.workflow_types || {};
    const workflowType = this.detectWorkflowType(sessionData);
    patterns.workflow_types[workflowType] = (patterns.workflow_types[workflowType] || 0) + 1;
  }

  /**
   * Detect workflow type from session data
   */
  detectWorkflowType(sessionData) {
    const tools = sessionData.tools_used || [];
    const fileOps = tools.filter(t => ['Read', 'Write', 'Edit'].includes(t.tool)).length;
    const searches = tools.filter(t => ['Grep', 'Glob'].includes(t.tool)).length;
    const executions = tools.filter(t => t.tool === 'Bash').length;

    if (searches > fileOps) return 'research';
    if (fileOps > executions) return 'development';
    if (executions > 0) return 'deployment';
    return 'analysis';
  }

  /**
   * Get session statistics
   */
  async getSessionStatistics() {
    try {
      const platforms = ['claude-code', 'claude-desktop', 'claude-web', 'openai-customgpt', 'chatgpt'];
      const stats = {
        total_sessions: 0,
        active_sessions: 0,
        consolidated_sessions: 0,
        platform_breakdown: {}
      };

      for (const platform of platforms) {
        const sessions = await this.getActivePlatformSessions(platform);
        stats.platform_breakdown[platform] = {
          active: sessions.length,
          total: sessions.length // Simplified - would need to count all sessions
        };
        stats.active_sessions += sessions.length;
      }

      return stats;
    } catch (error) {
      console.error('Error getting session statistics:', error);
      return {};
    }
  }
}