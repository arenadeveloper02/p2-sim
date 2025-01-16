import { Executor } from '../index';
import { SerializedWorkflow } from '@/serializer/types';
import { Tool } from '../types';
import { toolRegistry } from '@/tools/registry';

// Mock tools
class MockTool implements Tool {
  constructor(
    public name: string,
    private mockExecute: (params: Record<string, any>) => Promise<Record<string, any>>,
    private mockValidate: (params: Record<string, any>) => boolean | string = () => true
  ) {}

  async execute(params: Record<string, any>): Promise<Record<string, any>> {
    return this.mockExecute(params);
  }

  validateParams(params: Record<string, any>): boolean | string {
    return this.mockValidate(params);
  }
}

describe('Executor', () => {
  beforeEach(() => {
    // Reset toolRegistry mock
    (toolRegistry as any) = {};
  });

  describe('Tool Execution', () => {
    it('should execute a simple workflow with one tool', async () => {
      const mockTool = new MockTool(
        'test-tool',
        async (params) => ({ result: params.input + ' processed' })
      );
      (toolRegistry as any)['test-tool'] = mockTool;

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [{
          id: 'block-1',
          position: { x: 0, y: 0 },
          config: {
            tool: 'test-tool',
            params: {},
            interface: {
              inputs: { input: 'string' },
              outputs: { result: 'string' }
            }
          }
        }],
        connections: []
      };

      const executor = new Executor(workflow);
      const result = await executor.execute('workflow-1', { input: 'test' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'test processed' });
    });

    it('should validate tool parameters', async () => {
      const mockTool = new MockTool(
        'test-tool',
        async () => ({}),
        (params) => params.required ? true : 'Missing required parameter'
      );
      (toolRegistry as any)['test-tool'] = mockTool;

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [{
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
        }],
        connections: []
      };

      const executor = new Executor(workflow);
      const result = await executor.execute('workflow-1', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required parameter');
    });
  });

  describe('Interface Validation', () => {
    it('should validate input types', async () => {
      const mockTool = new MockTool(
        'test-tool',
        async (params) => ({ result: params.input })
      );
      (toolRegistry as any)['test-tool'] = mockTool;

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [{
          id: 'block-1',
          position: { x: 0, y: 0 },
          config: {
            tool: 'test-tool',
            params: {},
            interface: {
              inputs: { input: 'number' },
              outputs: { result: 'number' }
            }
          }
        }],
        connections: []
      };

      const executor = new Executor(workflow);
      const result = await executor.execute('workflow-1', { input: 'not a number' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid type for input');
    });

    it('should validate tool output against interface', async () => {
      const mockTool = new MockTool(
        'test-tool',
        async () => ({ wrongField: 'wrong type' })
      );
      (toolRegistry as any)['test-tool'] = mockTool;

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [{
          id: 'block-1',
          position: { x: 0, y: 0 },
          config: {
            tool: 'test-tool',
            params: {},
            interface: {
              inputs: {},
              outputs: { result: 'string' }
            }
          }
        }],
        connections: []
      };

      const executor = new Executor(workflow);
      const result = await executor.execute('workflow-1', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool output missing required field');
    });
  });

  describe('Complex Workflows', () => {
    it('should execute a workflow with multiple connected blocks', async () => {
      const processorTool = new MockTool(
        'processor',
        async (params) => ({ processed: params.input.toUpperCase() })
      );
      const formatterTool = new MockTool(
        'formatter',
        async (params) => ({ result: `<${params.processed}>` })
      );
      (toolRegistry as any)['processor'] = processorTool;
      (toolRegistry as any)['formatter'] = formatterTool;

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [
          {
            id: 'process',
            position: { x: 0, y: 0 },
            config: {
              tool: 'processor',
              params: {},
              interface: {
                inputs: { input: 'string' },
                outputs: { processed: 'string' }
              }
            }
          },
          {
            id: 'format',
            position: { x: 100, y: 0 },
            config: {
              tool: 'formatter',
              params: {},
              interface: {
                inputs: { processed: 'string' },
                outputs: { result: 'string' }
              }
            }
          }
        ],
        connections: [{
          source: 'process',
          target: 'format',
          sourceHandle: 'processed',
          targetHandle: 'processed'
        }]
      };

      const executor = new Executor(workflow);
      const result = await executor.execute('workflow-1', { input: 'test' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: '<TEST>' });
    });

    it('should handle circular dependencies', async () => {
      const mockTool = new MockTool(
        'test-tool',
        async () => ({ output: 'test' })
      );
      (toolRegistry as any)['test-tool'] = mockTool;

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
                inputs: { input: 'string' },
                outputs: { output: 'string' }
              }
            }
          },
          {
            id: 'block-2',
            position: { x: 100, y: 0 },
            config: {
              tool: 'test-tool',
              params: {},
              interface: {
                inputs: { input: 'string' },
                outputs: { output: 'string' }
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
      const result = await executor.execute('workflow-1', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Workflow contains cycles');
    });
  });
});
