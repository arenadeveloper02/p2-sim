export interface HttpRequestConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  auth?: {
    type: 'basic' | 'bearer';
    token?: string;
    username?: string;
    password?: string;
  };
}

export interface HttpResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
  statusText: string;
}

export interface HttpError extends Error {
  status?: number;
  statusText?: string;
  data?: any;
} 