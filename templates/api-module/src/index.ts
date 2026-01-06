/**
 * API Routes for {Service}
 *
 * These routes are aggregated by ChittyAPI (api.chitty.cc)
 * and exposed at api.chitty.cc/{service}
 */

export interface APIRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  description: string
  handler: (request: Request) => Promise<Response>
}

/**
 * Define your API routes here
 */
export const routes: APIRoute[] = [
  {
    method: 'GET',
    path: '/status',
    description: 'Get {Service} status',
    handler: async (request) => {
      return Response.json({
        service: '{service}',
        status: 'ok',
        timestamp: new Date().toISOString()
      })
    }
  },
  {
    method: 'POST',
    path: '/action',
    description: 'Perform {Service} action',
    handler: async (request) => {
      const body = await request.json()
      // Implement your action logic here
      return Response.json({
        success: true,
        data: body
      })
    }
  }
]

/**
 * Export route definitions for ChittyAPI aggregation
 */
export function getRouteDefinitions() {
  return routes.map(r => ({
    method: r.method,
    path: r.path,
    description: r.description
  }))
}

/**
 * Handle incoming request
 */
export async function handleRequest(request: Request, path: string): Promise<Response> {
  const method = request.method as APIRoute['method']
  const route = routes.find(r => r.method === method && r.path === path)

  if (!route) {
    return Response.json({ error: 'Route not found' }, { status: 404 })
  }

  return route.handler(request)
}
