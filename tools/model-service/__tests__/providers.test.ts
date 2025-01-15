import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { OpenAIProvider } from '../providers/openai';
import { AnthropicProvider } from '../providers/anthropic';
import { GoogleProvider } from '../providers/google';
import { XAIProvider } from '../providers/xai';
import { AgentConfig } from '../types/agent';
import { ModelRequestOptions } from '../types/model';

// Setup fetch mock
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('Model Providers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('OpenAI Provider', () => {
    const provider = new OpenAIProvider();

    test('should call OpenAI API successfully', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Test response' } }],
        usage: { total_tokens: 10 }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response);

      const config: AgentConfig = {
        model: 'gpt-4o',
        systemPrompt: 'Test prompt',
        temperature: 0.7,
        apiKey: 'test-key'
      };

      const result = await provider.callModel(config, { maxTokens: 100 });
      expect(result.response).toBe('Test response');
      expect(result.tokens).toBe(10);
      expect(result.model).toBe('gpt-4o');
    });

    test('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'API Error' } })
      } as Response);

      const config: AgentConfig = {
        model: 'gpt-4o',
        systemPrompt: 'Test prompt',
        temperature: 0.7,
        apiKey: 'invalid-key'
      };

      await expect(provider.callModel(config, {})).rejects.toThrow('API Error');
    });
  });

  describe('Anthropic Provider', () => {
    const provider = new AnthropicProvider();

    test('should call Anthropic API successfully', async () => {
      const mockResponse = {
        content: [{ text: 'Test response' }],
        usage: { input_tokens: 5, output_tokens: 5 }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response);

      const config: AgentConfig = {
        model: 'claude-3.5-sonnet',
        systemPrompt: 'Test prompt',
        temperature: 0.7,
        apiKey: 'test-key'
      };

      const result = await provider.callModel(config, { maxTokens: 100 });
      expect(result.response).toBe('Test response');
      expect(result.tokens).toBe(10);
      expect(result.model).toBe('claude-3.5-sonnet');
    });

    test('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'API Error' } })
      } as Response);

      const config: AgentConfig = {
        model: 'claude-3.5-sonnet',
        systemPrompt: 'Test prompt',
        temperature: 0.7,
        apiKey: 'invalid-key'
      };

      await expect(provider.callModel(config, {})).rejects.toThrow('API Error');
    });
  });

  describe('Google Provider', () => {
    const provider = new GoogleProvider();

    test('should call Google API successfully', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Test response' }]
          }
        }],
        usage: { totalTokens: 10 }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response);

      const config: AgentConfig = {
        model: 'gemini-2-flash',
        systemPrompt: 'Test prompt',
        temperature: 0.7,
        apiKey: 'test-key'
      };

      const result = await provider.callModel(config, { maxTokens: 100 });
      expect(result.response).toBe('Test response');
      expect(result.tokens).toBe(10);
      expect(result.model).toBe('gemini-2-flash');
    });

    test('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'API Error' } })
      } as Response);

      const config: AgentConfig = {
        model: 'gemini-2-flash',
        systemPrompt: 'Test prompt',
        temperature: 0.7,
        apiKey: 'invalid-key'
      };

      await expect(provider.callModel(config, {})).rejects.toThrow('API Error');
    });
  });

  describe('XAI Provider', () => {
    const provider = new XAIProvider();

    test('should call XAI API successfully', async () => {
      const mockResponse = {
        choices: [{ 
          message: { 
            content: 'Test response' 
          } 
        }],
        usage: { total_tokens: 10 }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response);

      const config: AgentConfig = {
        model: 'grok-2-latest',
        systemPrompt: 'Test prompt',
        temperature: 0.7,
        apiKey: 'test-key'
      };

      const result = await provider.callModel(config, { maxTokens: 100 });
      expect(result.response).toBe('Test response');
      expect(result.tokens).toBe(10);
      expect(result.model).toBe('grok-2-latest');
    });

    test('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'API Error' } })
      } as Response);

      const config: AgentConfig = {
        model: 'grok-2-latest',
        systemPrompt: 'Test prompt',
        temperature: 0.7,
        apiKey: 'invalid-key'
      };

      await expect(provider.callModel(config, {})).rejects.toThrow('API Error');
    });
  });
}); 