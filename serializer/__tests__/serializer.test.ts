import { Edge } from 'reactflow';
import { Serializer } from '../index';
import { SerializedWorkflow } from '../types';
import { BlockState } from '@/stores/workflow/types';
import { OutputType } from '@/blocks/types';

jest.mock('@/blocks', () => ({
  getBlock: (type: string) => {
    if (type === 'http') {
      return {
        type,
        workflow: {
          tools: {
            access: ['http.request'],
            config: {
              tool: () => 'http.request'
            }
          },
          inputs: {
            url: 'string',
            method: 'string'
          },
          outputType: 'json'
        }
      };
    }
    // Default agent block config
    return {
      type,
      workflow: {
        tools: {
          access: ['openai.chat'],
          config: {
            tool: () => 'openai.chat'
          }
        },
        inputs: {
          prompt: 'string'
        },
        outputType: 'string'
      }
    };
  }
}));

describe('Serializer', () => {
  let serializer: Serializer;

  beforeEach(() => {
    serializer = new Serializer();
  });

  describe('serializeWorkflow', () => {
    it('should serialize a workflow with agent and http blocks', () => {
      const blocks: Record<string, BlockState> = {
        'agent-1': {
          id: 'agent-1',
          type: 'agent',
          name: 'GPT-4o Agent',
          position: { x: 100, y: 100 },
          subBlocks: {
            'model': {
              id: 'model',
              type: 'dropdown',
              value: 'gpt-4o'
            },
            'systemPrompt': {
              id: 'systemPrompt',
              type: 'long-input',
              value: 'You are helpful'
            },
            'temperature': {
              id: 'temperature',
              type: 'slider',
              value: 0.7
            }
          },
          outputType: 'string'
        },
        'http-1': {
          id: 'http-1',
          type: 'http',
          name: 'API Call',
          position: { x: 400, y: 100 },
          subBlocks: {
            'url': {
              id: 'url',
              type: 'short-input',
              value: 'https://api.example.com'
            },
            'method': {
              id: 'method',
              type: 'dropdown',
              value: 'GET'
            }
          },
          outputType: 'json'
        }
      };

      const connections: Edge[] = [
        {
          id: 'conn-1',
          source: 'agent-1',
          target: 'http-1',
          sourceHandle: 'response',
          targetHandle: 'body'
        }
      ];

      const serialized = serializer.serializeWorkflow(blocks, connections);

      // Test workflow structure
      expect(serialized.version).toBe('1.0');
      expect(serialized.blocks).toHaveLength(2);
      expect(serialized.connections).toHaveLength(1);

      // Test agent block serialization
      const agentBlock = serialized.blocks.find(b => b.id === 'agent-1');
      expect(agentBlock).toBeDefined();
      expect(agentBlock?.config.tool).toBe('openai.chat');
      expect(agentBlock?.config.params).toEqual({
        model: 'gpt-4o',
        systemPrompt: 'You are helpful',
        temperature: 0.7
      });

      // Test http block serialization
      const httpBlock = serialized.blocks.find(b => b.id === 'http-1');
      expect(httpBlock).toBeDefined();
      expect(httpBlock?.config.tool).toBe('http.request');
      expect(httpBlock?.config.params).toEqual({
        url: 'https://api.example.com',
        method: 'GET'
      });
    });

    it('should handle blocks with minimal required configuration', () => {
      const blocks: Record<string, BlockState> = {
        'minimal-1': {
          id: 'minimal-1',
          type: 'agent',
          name: 'Minimal Agent',
          position: { x: 0, y: 0 },
          subBlocks: {
            'model': {
              id: 'model',
              type: 'dropdown',
              value: 'gpt-4o'
            }
          },
          outputType: 'string'
        }
      };

      const serialized = serializer.serializeWorkflow(blocks, []);
      const block = serialized.blocks[0];
      
      expect(block.id).toBe('minimal-1');
      expect(block.config.tool).toBe('openai.chat');
      expect(block.config.params).toEqual({ model: 'gpt-4o' });
    });

    it('should handle complex workflow with multiple interconnected blocks', () => {
      const blocks: Record<string, BlockState> = {
        'input-1': {
          id: 'input-1',
          type: 'http',
          name: 'Data Input',
          position: { x: 100, y: 100 },
          subBlocks: {
            'url': {
              id: 'url',
              type: 'short-input',
              value: 'https://api.data.com'
            },
            'method': {
              id: 'method',
              type: 'dropdown',
              value: 'GET'
            }
          },
          outputType: 'json'
        },
        'process-1': {
          id: 'process-1',
          type: 'agent',
          name: 'Data Processor',
          position: { x: 300, y: 100 },
          subBlocks: {
            'model': {
              id: 'model',
              type: 'dropdown',
              value: 'gpt-4o'
            },
            'systemPrompt': {
              id: 'systemPrompt',
              type: 'long-input',
              value: 'Process this data'
            }
          },
          outputType: 'string'
        },
        'output-1': {
          id: 'output-1',
          type: 'http',
          name: 'Data Output',
          position: { x: 500, y: 100 },
          subBlocks: {
            'url': {
              id: 'url',
              type: 'short-input',
              value: 'https://api.output.com'
            },
            'method': {
              id: 'method',
              type: 'dropdown',
              value: 'POST'
            }
          },
          outputType: 'json'
        }
      };

      const connections: Edge[] = [
        {
          id: 'conn-1',
          source: 'input-1',
          target: 'process-1',
          sourceHandle: 'data',
          targetHandle: 'data'
        },
        {
          id: 'conn-2',
          source: 'process-1',
          target: 'output-1',
          sourceHandle: 'result',
          targetHandle: 'body'
        }
      ];

      const serialized = serializer.serializeWorkflow(blocks, connections);

      // Verify workflow structure
      expect(serialized.blocks).toHaveLength(3);
      expect(serialized.connections).toHaveLength(2);

      // Verify data flow chain
      const conn1 = serialized.connections[0];
      const conn2 = serialized.connections[1];
      expect(conn1.source).toBe('input-1');
      expect(conn1.target).toBe('process-1');
      expect(conn2.source).toBe('process-1');
      expect(conn2.target).toBe('output-1');
    });

    it('should preserve tool-specific parameters', () => {
      const blocks: Record<string, BlockState> = {
        'agent-1': {
          id: 'agent-1',
          type: 'agent',
          name: 'Advanced Agent',
          position: { x: 0, y: 0 },
          subBlocks: {
            'model': {
              id: 'model',
              type: 'dropdown',
              value: 'gpt-4o'
            },
            'temperature': {
              id: 'temperature',
              type: 'slider',
              value: 0.7
            },
            'maxTokens': {
              id: 'maxTokens',
              type: 'slider',
              value: 1000
            }
          },
          outputType: 'string'
        }
      };

      const serialized = serializer.serializeWorkflow(blocks, []);
      const block = serialized.blocks[0];

      expect(block.config.tool).toBe('openai.chat');
      expect(block.config.params).toEqual({
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 1000
      });
    });
  });

  describe('deserializeWorkflow', () => {
    it('should deserialize a workflow back to blocks and connections', () => {
      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [
          {
            id: 'agent-1',
            position: { x: 0, y: 0 },
            config: {
              tool: 'openai.chat',
              params: {
                model: 'gpt-4o',
                systemPrompt: 'You are helpful'
              },
              interface: {
                inputs: { prompt: 'string' },
                outputs: { output: 'string' }
              }
            }
          }
        ],
        connections: []
      };

      const { blocks } = serializer.deserializeWorkflow(workflow);
      const block = blocks['agent-1'];

      expect(block.type).toBe('openai.chat');
      expect(block.subBlocks.model.value).toBe('gpt-4o');
      expect(block.subBlocks.systemPrompt.value).toBe('You are helpful');
      expect(block.outputType).toBe('string');
    });
  });
});