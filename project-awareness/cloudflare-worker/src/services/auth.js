/**
 * Authentication Service for Cross-Platform Access
 * Handles session management and API key validation
 */

import { SignJWT, jwtVerify } from 'jose';

export class AuthService {
  constructor(env) {
    this.env = env;
    this.jwtSecret = new TextEncoder().encode(env.JWT_SECRET);
    this.sessionTimeout = parseInt(env.SESSION_TIMEOUT) || 3600; // 1 hour default
  }

  /**
   * Authenticate middleware for API requests
   */
  static async authenticate(request, env) {
    // Skip authentication for public endpoints
    const url = new URL(request.url);
    const publicPaths = ['/health', '/api/info', '/api/auth/session'];
    
    if (publicPaths.some(path => url.pathname.startsWith(path))) {
      return;
    }

    const authService = new AuthService(env);
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: 'Missing Authorization header'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let token;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (authHeader.startsWith('Token ')) {
      token = authHeader.substring(6);
    } else {
      return new Response(JSON.stringify({
        error: 'Invalid Authorization header format'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const session = await authService.validateSession(token);
      if (!session) {
        return new Response(JSON.stringify({
          error: 'Invalid or expired session'
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Add session info to request for downstream use
      request.session = session;
      
    } catch (error) {
      console.error('Authentication error:', error);
      return new Response(JSON.stringify({
        error: 'Authentication failed'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Create authenticated session for platform
   */
  async createSession({ platform, user_id, api_key, context = {} }) {
    // Validate platform
    const validPlatforms = [
      'claude-code',
      'claude-desktop', 
      'claude-web',
      'openai-customgpt',
      'chatgpt'
    ];
    
    if (!validPlatforms.includes(platform)) {
      throw new Error(`Invalid platform: ${platform}`);
    }

    // Validate API key based on platform
    const isValidKey = await this.validatePlatformApiKey(platform, api_key);
    if (!isValidKey) {
      throw new Error('Invalid API key for platform');
    }

    // Generate session ID and JWT token
    const sessionId = this.generateSessionId();
    const expiresAt = new Date(Date.now() + (this.sessionTimeout * 1000));
    
    const token = await new SignJWT({
      session_id: sessionId,
      platform: platform,
      user_id: user_id,
      created_at: new Date().toISOString()
    })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresAt)
    .setIssuedAt()
    .sign(this.jwtSecret);

    // Store session in KV with metadata
    const sessionData = {
      id: sessionId,
      platform: platform,
      user_id: user_id,
      context: context,
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      last_activity: new Date().toISOString(),
      active_project: null,
      sync_state: {}
    };

    await this.env.SESSION_STORE.put(
      `session:${sessionId}`,
      JSON.stringify(sessionData),
      {
        expirationTtl: this.sessionTimeout
      }
    );

    // Track active sessions by platform
    await this.trackPlatformSession(platform, sessionId, user_id);

    return {
      id: sessionId,
      token: token,
      expires_at: expiresAt.toISOString(),
      platform: platform
    };
  }

  /**
   * Validate session token and return session data
   */
  async validateSession(token) {
    try {
      // Verify JWT token
      const { payload } = await jwtVerify(token, this.jwtSecret);
      const sessionId = payload.session_id;

      // Get session from KV store
      const sessionData = await this.env.SESSION_STORE.get(
        `session:${sessionId}`,
        'json'
      );

      if (!sessionData) {
        return null;
      }

      // Check if session has expired
      if (new Date(sessionData.expires_at) < new Date()) {
        await this.env.SESSION_STORE.delete(`session:${sessionId}`);
        return null;
      }

      // Update last activity
      sessionData.last_activity = new Date().toISOString();
      await this.env.SESSION_STORE.put(
        `session:${sessionId}`,
        JSON.stringify(sessionData),
        {
          expirationTtl: this.sessionTimeout
        }
      );

      return sessionData;

    } catch (error) {
      console.error('Session validation error:', error);
      return null;
    }
  }

  /**
   * Validate platform-specific API keys
   */
  async validatePlatformApiKey(platform, apiKey) {
    if (!apiKey) return false;

    switch (platform) {
      case 'claude-code':
      case 'claude-desktop':
      case 'claude-web':
        return await this.validateClaudeApiKey(apiKey);
      
      case 'openai-customgpt':
      case 'chatgpt':
        return await this.validateOpenAIApiKey(apiKey);
      
      default:
        return false;
    }
  }

  /**
   * Validate Claude API key
   */
  async validateClaudeApiKey(apiKey) {
    // For Claude, we'll validate against ChittyID service
    try {
      const response = await fetch(`${this.env.CHITTYID_API_URL}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.env.CHITTYID_API_KEY}`
        },
        body: JSON.stringify({
          api_key: apiKey,
          service: 'claude-api'
        })
      });

      return response.ok;
    } catch (error) {
      console.error('Claude API key validation error:', error);
      return false;
    }
  }

  /**
   * Validate OpenAI API key
   */
  async validateOpenAIApiKey(apiKey) {
    try {
      // Test API key with a simple request to OpenAI
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      return response.ok;
    } catch (error) {
      console.error('OpenAI API key validation error:', error);
      return false;
    }
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `sess_${timestamp}_${random}`;
  }

  /**
   * Track active sessions by platform
   */
  async trackPlatformSession(platform, sessionId, userId) {
    const key = `platform:${platform}:sessions`;
    
    try {
      // Get existing sessions for platform
      const existingSessions = await this.env.SESSION_STORE.get(key, 'json') || [];
      
      // Add new session
      existingSessions.push({
        session_id: sessionId,
        user_id: userId,
        connected_at: new Date().toISOString()
      });

      // Keep only recent sessions (last 100)
      const recentSessions = existingSessions.slice(-100);

      await this.env.SESSION_STORE.put(
        key,
        JSON.stringify(recentSessions),
        {
          expirationTtl: 86400 // 24 hours
        }
      );

    } catch (error) {
      console.error('Error tracking platform session:', error);
    }
  }

  /**
   * Get active sessions for platform
   */
  async getPlatformSessions(platform) {
    try {
      const key = `platform:${platform}:sessions`;
      const sessions = await this.env.SESSION_STORE.get(key, 'json') || [];
      
      return sessions.filter(session => {
        // Check if session is still active (within last hour)
        const connectedAt = new Date(session.connected_at);
        const oneHourAgo = new Date(Date.now() - 3600000);
        return connectedAt > oneHourAgo;
      });
      
    } catch (error) {
      console.error('Error getting platform sessions:', error);
      return [];
    }
  }

  /**
   * Revoke session
   */
  async revokeSession(sessionId) {
    try {
      await this.env.SESSION_STORE.delete(`session:${sessionId}`);
      return true;
    } catch (error) {
      console.error('Error revoking session:', error);
      return false;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions() {
    // This would typically be called by a scheduled worker
    // For now, we rely on KV TTL for cleanup
    console.log('Session cleanup would run here');
  }

  /**
   * Get session statistics
   */
  async getSessionStats() {
    try {
      const platforms = [
        'claude-code',
        'claude-desktop', 
        'claude-web',
        'openai-customgpt',
        'chatgpt'
      ];

      const stats = {};
      
      for (const platform of platforms) {
        const sessions = await this.getPlatformSessions(platform);
        stats[platform] = {
          active_sessions: sessions.length,
          total_users: new Set(sessions.map(s => s.user_id)).size
        };
      }

      return stats;
      
    } catch (error) {
      console.error('Error getting session stats:', error);
      return {};
    }
  }
}