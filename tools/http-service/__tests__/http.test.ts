import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { HttpService } from '../index';
import { HttpRequestConfig } from '../types/http';

// Setup fetch mock
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('HttpService', () => {
  let service: HttpService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = HttpService.getInstance();
  });

  test('should make successful GET request', async () => {
    const mockResponse = { message: 'Success' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve(mockResponse)
    } as Response);

    const response = await service.get('https://api.example.com/data');
    expect(response.data).toEqual(mockResponse);
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({
        method: 'GET'
      })
    );
  });

  test('should make successful POST request with JSON body', async () => {
    const requestBody = { key: 'value' };
    const mockResponse = { id: 1 };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      statusText: 'Created',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve(mockResponse)
    } as Response);

    const response = await service.post('https://api.example.com/data', requestBody);
    expect(response.data).toEqual(mockResponse);
    expect(response.status).toBe(201);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(requestBody)
      })
    );
  });

  test('should handle request with authentication', async () => {
    const mockResponse = { message: 'Authenticated' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve(mockResponse)
    } as Response);

    const config: Omit<HttpRequestConfig, 'url' | 'method'> = {
      auth: {
        type: 'bearer',
        token: 'test-token'
      }
    };

    const response = await service.get('https://api.example.com/protected', config);
    expect(response.data).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/protected',
      expect.objectContaining({
        headers: expect.any(Headers)
      })
    );

    const headers = mockFetch.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-token');
  });

  test('should handle request timeout', async () => {
    mockFetch.mockImplementationOnce(() => 
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('The operation was aborted')), 50);
      })
    );

    await expect(
      service.get('https://api.example.com/data', { timeout: 10 })
    ).rejects.toThrow('The operation was aborted');
  });

  test('should handle API errors', async () => {
    const errorResponse = { error: 'Not Found' };
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve(errorResponse)
    } as Response);

    const promise = service.get('https://api.example.com/nonexistent');
    await expect(promise).rejects.toThrow('Not Found');
    await expect(promise).rejects.toMatchObject({
      status: 404,
      data: errorResponse
    });
  });
}); 