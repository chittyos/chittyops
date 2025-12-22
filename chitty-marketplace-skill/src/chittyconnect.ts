export type FetchLike = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

export interface ChittyConnectOptions {
  baseUrl?: string;
  apiToken: string;
  fetch?: FetchLike;
}

export class ChittyConnectClient {
  private baseUrl: string;
  private token: string;
  private doFetch: FetchLike;

  constructor(opts: ChittyConnectOptions) {
    this.baseUrl = (opts.baseUrl || 'https://connect.chitty.cc').replace(/\/$/, '');
    this.token = opts.apiToken;
    this.doFetch = opts.fetch || fetch.bind(globalThis);
  }

  private async request<T>(method: string, path: string, body?: any, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
    };
    const hasBody = body !== undefined && body !== null;
    if (hasBody) headers['Content-Type'] = 'application/json';

    const res = await this.doFetch(url, {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
      ...init,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ChittyConnect ${method} ${url} failed: ${res.status} ${res.statusText} ${text}`);
    }
    try {
      return await res.json() as T;
    } catch {
      return null as unknown as T;
    }
  }

  async health(): Promise<any> {
    return this.request('GET', '/api/health');
  }

  async createCase(data: any): Promise<any> {
    return this.request('POST', '/api/cases', data);
  }

  async getCase(caseId: string): Promise<any> {
    return this.request('GET', `/api/cases/${encodeURIComponent(caseId)}`);
  }

  async createCaseReports(caseId: string, data: { types: string[]; format?: string }): Promise<any> {
    return this.request('POST', `/api/cases/${encodeURIComponent(caseId)}/reports`, data);
  }

  async get<T = any>(path: string): Promise<T> { return this.request('GET', path); }
  async post<T = any>(path: string, body?: any): Promise<T> { return this.request('POST', path, body); }
  async put<T = any>(path: string, body?: any): Promise<T> { return this.request('PUT', path, body); }
  async del<T = any>(path: string): Promise<T> { return this.request('DELETE', path); }
}

