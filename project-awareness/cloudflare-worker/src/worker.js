/**
 * ChittyOps Project Awareness Cloudflare Worker
 * Global deployment of MCP server functionality
 * Supports multiple AI platforms with real-time synchronization
 */

import { Router } from 'itty-router';
import { ProjectAwarenessService } from './services/project-awareness';
import { AuthService } from './services/auth';
import { SessionManager } from './services/session-manager';
import { WebSocketHandler } from './services/websocket-handler';
import { CrossPlatformSync } from './services/cross-platform-sync';
import { CorsHandler } from './utils/cors';
import { RateLimiter } from './utils/rate-limiter';
import { ErrorHandler } from './utils/error-handler';
import { Analytics } from './utils/analytics';

// Initialize router
const router = Router();

// Global middleware
router.all('*', CorsHandler.handle);
router.all('/api/*', RateLimiter.handle);
router.all('/api/*', AuthService.authenticate);

/**
 * Health check endpoint
 */
router.get('/health', async () => {
  return new Response(JSON.stringify({
    status: 'healthy',
    service: 'chittyops-project-awareness',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Date.now()
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

/**
 * API Information endpoint
 */
router.get('/api/info', async (request, env) => {
  return new Response(JSON.stringify({
    name: 'ChittyOps Project Awareness API',
    version: '1.0.0',
    description: 'Global MCP server for cross-platform project awareness',
    endpoints: {
      'GET /health': 'Health check',
      'GET /api/info': 'API information',
      'POST /api/auth/session': 'Create authenticated session',
      'GET /api/projects/suggestions': 'Get project suggestions',
      'POST /api/projects/active': 'Set active project',
      'GET /api/projects/context': 'Analyze current context',
      'POST /api/projects/sync': 'Cross-platform sync',
      'POST /api/sessions/register': 'Register platform session',
      'POST /api/sessions/consolidate': 'Consolidate session memory',
      'GET /api/sessions/statistics': 'Get project statistics',
      'POST /api/sessions/alignment': 'Force session alignment',
      'GET /ws': 'WebSocket real-time sync'
    },
    platforms_supported: [
      'claude-code',
      'claude-desktop', 
      'claude-web',
      'openai-customgpt',
      'chatgpt'
    ]
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

/**
 * Authentication endpoints
 */
router.post('/api/auth/session', async (request, env) => {
  try {
    const body = await request.json();
    const authService = new AuthService(env);
    
    const session = await authService.createSession({
      platform: body.platform,
      user_id: body.user_id,
      api_key: body.api_key,
      context: body.context || {}
    });
    
    return new Response(JSON.stringify({
      success: true,
      session_token: session.token,
      expires_at: session.expires_at,
      session_id: session.id
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return ErrorHandler.handle(error, 'AUTH_ERROR');
  }
});

/**
 * Project Suggestions endpoint - equivalent to MCP get_project_suggestions
 */
router.get('/api/projects/suggestions', async (request, env) => {
  try {
    const url = new URL(request.url);
    const context = {
      workingDirectory: url.searchParams.get('working_directory'),
      platform: url.searchParams.get('platform'),
      recentFiles: JSON.parse(url.searchParams.get('recent_files') || '[]'),
      gitBranch: url.searchParams.get('git_branch')
    };
    
    const projectAwareness = new ProjectAwarenessService(env);
    const suggestions = await projectAwareness.getProjectSuggestions(context);
    
    // Track usage analytics
    await Analytics.track(env, 'project_suggestions', {
      platform: context.platform,
      suggestions_count: suggestions.length
    });
    
    return new Response(JSON.stringify({
      suggestions,
      platform: context.platform,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return ErrorHandler.handle(error, 'SUGGESTIONS_ERROR');
  }
});

/**
 * Set Active Project endpoint - equivalent to MCP set_active_project
 */
router.post('/api/projects/active', async (request, env) => {
  try {
    const body = await request.json();
    const projectAwareness = new ProjectAwarenessService(env);
    const sessionManager = new SessionManager(env);
    
    // Set project in awareness service
    await projectAwareness.setActiveProject(body.project_name, body.context);
    
    // Update session context
    await sessionManager.updateSessionProject(
      request.headers.get('Authorization'),
      body.project_name
    );
    
    // Trigger cross-platform sync
    if (body.platform) {
      const crossPlatformSync = new CrossPlatformSync(env);
      await crossPlatformSync.syncProjectSwitch(
        body.platform,
        body.project_name,
        body.context
      );
    }
    
    await Analytics.track(env, 'project_switch', {
      platform: body.platform,
      project: body.project_name
    });
    
    return new Response(JSON.stringify({
      success: true,
      active_project: body.project_name,
      platform: body.platform,
      synced_at: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return ErrorHandler.handle(error, 'SET_PROJECT_ERROR');
  }
});

/**
 * Analyze Context endpoint - equivalent to MCP analyze_current_context
 */
router.get('/api/projects/context', async (request, env) => {
  try {
    const url = new URL(request.url);
    const platform = url.searchParams.get('platform');
    const workingDirectory = url.searchParams.get('working_directory');
    
    const projectAwareness = new ProjectAwarenessService(env);
    const context = await projectAwareness.analyzeCurrentContext({
      platform,
      workingDirectory
    });
    
    return new Response(JSON.stringify({
      context,
      platform,
      analyzed_at: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return ErrorHandler.handle(error, 'CONTEXT_ERROR');
  }
});

/**
 * Cross-Platform Sync endpoint - equivalent to MCP cross_platform_sync
 */
router.post('/api/projects/sync', async (request, env) => {
  try {
    const body = await request.json();
    const crossPlatformSync = new CrossPlatformSync(env);
    
    await crossPlatformSync.handleSync({
      source_platform: body.source_platform,
      sync_type: body.sync_type,
      data: body.data
    });
    
    const connectedPlatforms = await crossPlatformSync.getConnectedPlatforms();
    
    return new Response(JSON.stringify({
      success: true,
      sync_type: body.sync_type,
      source_platform: body.source_platform,
      synced_platforms: connectedPlatforms,
      synced_at: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return ErrorHandler.handle(error, 'SYNC_ERROR');
  }
});

/**
 * Register Platform Session endpoint - equivalent to MCP register_platform_session
 */
router.post('/api/sessions/register', async (request, env) => {
  try {
    const body = await request.json();
    const sessionManager = new SessionManager(env);
    const projectAwareness = new ProjectAwarenessService(env);
    
    // Register session
    const session = await sessionManager.registerPlatformSession({
      platform: body.platform,
      session_id: body.session_id,
      user_id: body.user_id,
      context: body.context || {}
    });
    
    // Get project suggestions for new session
    const suggestions = await projectAwareness.getProjectSuggestions(body.context);
    
    await Analytics.track(env, 'session_register', {
      platform: body.platform,
      session_id: body.session_id
    });
    
    return new Response(JSON.stringify({
      success: true,
      platform: body.platform,
      session_id: body.session_id,
      registered_at: new Date().toISOString(),
      project_suggestions: suggestions
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return ErrorHandler.handle(error, 'REGISTER_ERROR');
  }
});

/**
 * Consolidate Session Memory endpoint - equivalent to MCP consolidate_session_memory
 */
router.post('/api/sessions/consolidate', async (request, env) => {
  try {
    const body = await request.json();
    const sessionManager = new SessionManager(env);
    
    const result = await sessionManager.consolidateSessionMemory({
      session_id: body.session_id,
      project_id: body.project_id,
      platform: body.platform,
      session_data: body.session_data
    });
    
    return new Response(JSON.stringify({
      success: true,
      session_id: body.session_id,
      consolidation_result: result,
      consolidated_at: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return ErrorHandler.handle(error, 'CONSOLIDATE_ERROR');
  }
});

/**
 * Get Project Statistics endpoint - equivalent to MCP get_project_statistics  
 */
router.get('/api/sessions/statistics', async (request, env) => {
  try {
    const url = new URL(request.url);
    const projectName = url.searchParams.get('project_name');
    const timeRange = url.searchParams.get('time_range') || 'all';
    
    const projectAwareness = new ProjectAwarenessService(env);
    const stats = await projectAwareness.getProjectStatistics(projectName, timeRange);
    
    return new Response(JSON.stringify({
      statistics: stats,
      project_name: projectName,
      time_range: timeRange,
      generated_at: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return ErrorHandler.handle(error, 'STATS_ERROR');
  }
});

/**
 * Force Session Alignment endpoint - equivalent to MCP force_session_alignment
 */
router.post('/api/sessions/alignment', async (request, env) => {
  try {
    const body = await request.json();
    const sessionManager = new SessionManager(env);
    
    await sessionManager.forceSessionAlignment({
      platform: body.platform,
      reason: body.reason
    });
    
    return new Response(JSON.stringify({
      success: true,
      alignment_completed: true,
      platform: body.platform,
      reason: body.reason,
      aligned_at: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return ErrorHandler.handle(error, 'ALIGNMENT_ERROR');
  }
});

/**
 * WebSocket endpoint for real-time synchronization
 */
router.get('/ws', async (request, env) => {
  try {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }
    
    // Get Durable Object for WebSocket handling
    const durableObjectId = env.PROJECT_AWARENESS_DO.idFromName('websocket-handler');
    const durableObject = env.PROJECT_AWARENESS_DO.get(durableObjectId);
    
    return durableObject.fetch(request);
    
  } catch (error) {
    return ErrorHandler.handle(error, 'WEBSOCKET_ERROR');
  }
});

/**
 * Default route - 404 handler
 */
router.all('*', () => {
  return new Response('Not Found', { 
    status: 404,
    headers: { 'Content-Type': 'text/plain' }
  });
});

/**
 * Main Worker fetch handler
 */
export default {
  async fetch(request, env, ctx) {
    try {
      return await router.handle(request, env, ctx);
    } catch (error) {
      console.error('Worker error:', error);
      return ErrorHandler.handle(error, 'WORKER_ERROR');
    }
  }
};

/**
 * Durable Object for WebSocket connections and real-time sync
 */
export class ProjectAwarenessDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
  }
  
  async fetch(request) {
    const webSocketHandler = new WebSocketHandler(this.state, this.env);
    return webSocketHandler.handleWebSocket(request);
  }
}

/**
 * Durable Object for cross-session synchronization
 */
export class SessionSyncDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.crossPlatformSync = new CrossPlatformSync(env, state);
  }
  
  async fetch(request) {
    // Handle cross-session sync requests
    const url = new URL(request.url);
    
    if (url.pathname === '/sync') {
      return this.crossPlatformSync.handleSyncRequest(request);
    }
    
    return new Response('Not Found', { status: 404 });
  }
}