/**
 * Runtime endpoint checker for compliance auditing
 * Probes health endpoints, registry, and router APIs
 */

class RuntimeChecker {
  constructor(options = {}) {
    this.timeout = options.timeout || 5000;
  }

  /**
   * Check a health endpoint
   */
  async checkHealth(domain) {
    if (!domain) return { status: 'not_applicable', reason: 'no domain' };

    const url = `https://${domain}/health`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) {
        return { status: 'fail', reason: `HTTP ${response.status}`, url };
      }

      const body = await response.json();
      if (body.status === 'ok') {
        return { status: 'pass', service: body.service, url };
      }
      return { status: 'fail', reason: `status=${body.status}`, body, url };
    } catch (err) {
      return { status: 'fail', reason: err.message, url };
    }
  }

  /**
   * Check if a service is registered in ChittyRegistry
   */
  async checkRegistry(serviceName) {
    if (!serviceName) return { status: 'not_applicable' };

    const url = `https://registry.chitty.cc/api/services/${serviceName}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (response.ok) {
        return { status: 'pass', url };
      }
      return { status: 'fail', reason: `HTTP ${response.status}`, url };
    } catch (err) {
      return { status: 'fail', reason: err.message, url };
    }
  }

  /**
   * Check if a route is registered in ChittyRouter
   */
  async checkRouter(domain) {
    if (!domain) return { status: 'not_applicable', reason: 'no domain' };

    const url = `https://router.chitty.cc/api/routes/${domain}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (response.ok) {
        return { status: 'pass', url };
      }
      return { status: 'fail', reason: `HTTP ${response.status}`, url };
    } catch (err) {
      return { status: 'fail', reason: err.message, url };
    }
  }
}

module.exports = { RuntimeChecker };
