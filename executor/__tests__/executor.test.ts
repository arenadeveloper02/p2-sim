import { Executor } from '../index';
import { SerializedWorkflow } from '@/serializer/types';
import { Tool } from '../types';
import { tools } from '@/tools';

// Mock tools
const createMockTool = (
  id: string,
  name: string,
  mockResponse: any,
  mockError?: string
): Tool => ({
  id,
  name,
  description: 'Mock tool for testing',
  version: '1.0.0',
  params: {
    input: {
      type: 'string',
      required: true,
      description: 'Input to process'
    },
    apiKey: {
      type: 'string',
      required: false,
      description: 'API key for authentication'
    }
  },
  request: {
    url: 'https://api.test.com/endpoint',
    method: 'POST',
    headers: (params) => ({
      'Content-Type': 'application/json',
      'Authorization': params.apiKey || 'test-key'
    }),
    body: (params) => ({
      input: params.input
    })
  },
  transformResponse: () => mockResponse,
  transformError: () => mockError || 'Mock error'
});

jest.mock('@/tools', () => ({
  tools: {}
}));

describe('Executor', () => {
  beforeEach(() => {
    // Reset tools mock
    (tools as any) = {};
  });

  describe('Tool Execution', () => {
    it('should execute a simple workflow with one tool', async () => {
      const mockTool = createMockTool(
        'test-tool',
        'Test Tool',
        { result: 'test processed' }
      );
      (tools as any)['test-tool'] = mockTool;

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [{
          id: 'block-1',
          position: { x: 0, y: 0 },
          config: {
            tool: 'test-tool',
            params: { input: 'test' },
            interface: {
              inputs: { input: 'string' },
              outputs: { result: 'string' }
            }
          }
        }],
        connections: []
      };

      // Mock fetch
      global.fetch = jest.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ result: 'test processed' })
        })
      );

      const executor = new Executor(workflow);
      const result = await executor.execute('workflow-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'test processed' });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/endpoint',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'test-key'
          },
          body: JSON.stringify({ input: 'test' })
        })
      );
    });

    it('should validate required parameters', async () => {
      const mockTool = createMockTool(
        'test-tool',
        'Test Tool',
        { result: 'test processed' }
      );
      (tools as any)['test-tool'] = mockTool;

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [{
          id: 'block-1',
          position: { x: 0, y: 0 },
          config: {
            tool: 'test-tool',
            params: {}, // Missing required 'input' parameter
            interface: {
              inputs: {},
              outputs: { result: 'string' }
            }
          }
        }],
        connections: []
      };

      const executor = new Executor(workflow);
      const result = await executor.execute('workflow-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required parameter');
    });

    it('should handle tool execution errors', async () => {
      const mockTool = createMockTool(
        'test-tool',
        'Test Tool',
        {},
        'API Error'
      );
      (tools as any)['test-tool'] = mockTool;

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [{
          id: 'block-1',
          position: { x: 0, y: 0 },
          config: {
            tool: 'test-tool',
            params: { input: 'test' },
            interface: {
              inputs: { input: 'string' },
              outputs: { result: 'string' }
            }
          }
        }],
        connections: []
      };

      // Mock fetch to fail
      global.fetch = jest.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'API Error' })
        })
      );

      const executor = new Executor(workflow);
      const result = await executor.execute('workflow-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('API Error');
    });
  });

  describe('Interface Validation', () => {
    it('should validate input types', async () => {
      const mockTool = createMockTool(
        'test-tool',
        'Test Tool',
        { result: 123 }
      );
      (tools as any)['test-tool'] = mockTool;

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [{
          id: 'block-1',
          position: { x: 0, y: 0 },
          config: {
            tool: 'test-tool',
            params: { input: 42 }, // Wrong type for input
            interface: {
              inputs: { input: 'string' },
              outputs: { result: 'number' }
            }
          }
        }],
        connections: []
      };

      const executor = new Executor(workflow);
      const result = await executor.execute('workflow-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid type for input');
    });

    it('should validate tool output against interface', async () => {
      const mockTool = createMockTool(
        'test-tool',
        'Test Tool',
        { wrongField: 'wrong type' }
      );
      (tools as any)['test-tool'] = mockTool;

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [{
          id: 'block-1',
          position: { x: 0, y: 0 },
          config: {
            tool: 'test-tool',
            params: { input: 'test' },
            interface: {
              inputs: { input: 'string' },
              outputs: { result: 'string' }
            }
          }
        }],
        connections: []
      };

      // Mock fetch
      global.fetch = jest.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ wrongField: 'wrong type' })
        })
      );

      const executor = new Executor(workflow);
      const result = await executor.execute('workflow-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool output missing required field');
    });
  });

  describe('Complex Workflows', () => {
    it('should execute blocks in correct order and pass data between them', async () => {
      const mockTool1 = createMockTool(
        'tool-1',
        'Tool 1',
        { output: 'test data' }
      );
      const mockTool2 = createMockTool(
        'tool-2',
        'Tool 2',
        { result: 'processed data' }
      );
      (tools as any)['tool-1'] = mockTool1;
      (tools as any)['tool-2'] = mockTool2;

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [
          {
            id: 'block-1',
            position: { x: 0, y: 0 },
            config: {
              tool: 'tool-1',
              params: { input: 'initial' },
              interface: {
                inputs: {},
                outputs: { output: 'string' }
              }
            }
          },
          {
            id: 'block-2',
            position: { x: 200, y: 0 },
            config: {
              tool: 'tool-2',
              params: {},
              interface: {
                inputs: { input: 'string' },
                outputs: { result: 'string' }
              }
            }
          }
        ],
        connections: [
          {
            source: 'block-1',
            target: 'block-2',
            sourceHandle: 'output',
            targetHandle: 'input'
          }
        ]
      };

      // Mock fetch for both tools
      global.fetch = jest.fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ output: 'test data' })
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ result: 'processed data' })
          })
        );

      const executor = new Executor(workflow);
      const result = await executor.execute('workflow-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'processed data' });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle cycles in workflow', async () => {
      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [
          {
            id: 'block-1',
            position: { x: 0, y: 0 },
            config: {
              tool: 'test-tool',
              params: {},
              interface: {
                inputs: {},
                outputs: {}
              }
            }
          },
          {
            id: 'block-2',
            position: { x: 200, y: 0 },
            config: {
              tool: 'test-tool',
              params: {},
              interface: {
                inputs: {},
                outputs: {}
              }
            }
          }
        ],
        connections: [
          {
            source: 'block-1',
            target: 'block-2',
            sourceHandle: 'output',
            targetHandle: 'input'
          },
          {
            source: 'block-2',
            target: 'block-1',
            sourceHandle: 'output',
            targetHandle: 'input'
          }
        ]
      };

      const executor = new Executor(workflow);
      const result = await executor.execute('workflow-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Workflow contains cycles');
    });
  });
});
