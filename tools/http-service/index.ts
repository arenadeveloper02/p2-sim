import { HttpRequestConfig, HttpResponse, HttpError } from './types/http';

export class HttpService {
  private static instance: HttpService;

  constructor() {}

  public static getInstance(): HttpService {
    if (!HttpService.instance) {
      HttpService.instance = new HttpService();
    }
    return HttpService.instance;
  }

  private getHeaders(config: HttpRequestConfig): Headers {
    const headers = new Headers(config.headers);

    if (!headers.has('Content-Type') && config.body) {
      headers.set('Content-Type', 'application/json');
    }

    if (config.auth) {
      switch (config.auth.type) {
        case 'bearer':
          headers.set('Authorization', `Bearer ${config.auth.token}`);
          break;
        case 'basic':
          const credentials = btoa(`${config.auth.username}:${config.auth.password}`);
          headers.set('Authorization', `Basic ${credentials}`);
          break;
      }
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<HttpResponse<T>> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    if (!response.ok) {
      const error = new Error(response.statusText) as HttpError;
      error.status = response.status;
      error.statusText = response.statusText;
      try {
        error.data = await response.json();
      } catch {
        error.data = await response.text();
      }
      throw error;
    }

    let data: T;
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text() as T;
    }

    return {
      data,
      status: response.status,
      statusText: response.statusText,
      headers
    };
  }

  public async request<T = any>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeoutId = config.timeout ? setTimeout(() => controller.abort(), config.timeout) : null;

    try {
      const response = await fetch(config.url, {
        method: config.method,
        headers: this.getHeaders(config),
        body: config.body ? JSON.stringify(config.body) : undefined,
        signal: controller.signal
      });

      return await this.handleResponse<T>(response);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  public async get<T = any>(url: string, config: Omit<HttpRequestConfig, 'url' | 'method'> = {}): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: 'GET' });
  }

  public async post<T = any>(url: string, data?: any, config: Omit<HttpRequestConfig, 'url' | 'method' | 'body'> = {}): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: 'POST', body: data });
  }

  public async put<T = any>(url: string, data?: any, config: Omit<HttpRequestConfig, 'url' | 'method' | 'body'> = {}): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: 'PUT', body: data });
  }

  public async delete<T = any>(url: string, config: Omit<HttpRequestConfig, 'url' | 'method'> = {}): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: 'DELETE' });
  }

  public async patch<T = any>(url: string, data?: any, config: Omit<HttpRequestConfig, 'url' | 'method' | 'body'> = {}): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: 'PATCH', body: data });
  }
} 