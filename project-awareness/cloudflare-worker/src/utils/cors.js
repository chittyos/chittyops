/**
 * CORS Handler Utility
 * Handles cross-origin requests for multiple AI platforms
 */

export class CorsHandler {
  static handle(request, env) {
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CorsHandler.getCorsHeaders(env)
      });
    }

    // For other requests, CORS headers are added in the response
    return;
  }

  static getCorsHeaders(env) {
    const allowedOrigins = [
      'https://claude.ai',
      'https://console.anthropic.com',
      'https://chat.openai.com',
      'https://chatgpt.com',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5000',
      'http://localhost:8080'
    ];

    return {
      'Access-Control-Allow-Origin': env?.CORS_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Platform, X-Session-ID',
      'Access-Control-Expose-Headers': 'X-Rate-Limit-Remaining, X-Rate-Limit-Reset',
      'Access-Control-Max-Age': '86400', // 24 hours
      'Vary': 'Origin'
    };
  }

  static addCorsHeaders(response, env) {
    const headers = CorsHandler.getCorsHeaders(env);
    
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }

    return response;
  }

  static createCorsResponse(data, status = 200, env = null) {
    const response = new Response(
      typeof data === 'string' ? data : JSON.stringify(data),
      {
        status: status,
        headers: {
          'Content-Type': 'application/json',
          ...CorsHandler.getCorsHeaders(env)
        }
      }
    );

    return response;
  }
}