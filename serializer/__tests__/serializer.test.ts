import { Node, Edge } from 'reactflow';
import { Serializer } from '../index';
import { SerializedWorkflow } from '../types';

describe('Serializer', () => {
  let serializer: Serializer;

  beforeEach(() => {
    serializer = new Serializer();
  });

  describe('serializeWorkflow', () => {
    it('should serialize a workflow with agent and http blocks', () => {
      const blocks: Node[] = [
        {
          id: 'agent-1',
          type: 'custom',
          position: { x: 100, y: 100 },
          data: {
            tool: 'openai.chat',
            params: {
              model: 'gpt-4o',
              systemPrompt: 'You are helpful',
              temperature: 0.7
            },
            interface: {
              inputs: {
                prompt: 'string'
              },
              outputs: {
                response: 'string',
                tokens: 'number'
              }
            },
            title: 'GPT-4o Agent',
            description: 'Language model block',
            category: 'AI',
            icon: 'brain',
            color: '#7F2FFF'
          }
        },
        {
          id: 'http-1',
          type: 'custom',
          position: { x: 400, y: 100 },
          data: {
            tool: 'http.request',
            params: {
              url: 'https://api.example.com',
              method: 'GET'
            },
            interface: {
              inputs: {
                body: 'object'
              },
              outputs: {
                data: 'object',
                status: 'number'
              }
            },
            title: 'API Call',
            description: 'HTTP request block',
            category: 'Web',
            icon: 'globe',
            color: '#00FF00'
          }
        }
      ];

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
      expect(agentBlock?.metadata).toEqual({
        title: 'GPT-4o Agent',
        description: 'Language model block',
        category: 'AI',
        icon: 'brain',
        color: '#7F2FFF'
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
      const blocks: Node[] = [{
        id: 'minimal-1',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          tool: 'openai.chat',
          params: {
            model: 'gpt-4o'
          },
          interface: {
            inputs: {},
            outputs: {}
          }
        }
      }];

      const serialized = serializer.serializeWorkflow(blocks, []);
      const block = serialized.blocks[0];
      
      expect(block.id).toBe('minimal-1');
      expect(block.config.tool).toBe('openai.chat');
      expect(block.config.params).toEqual({ model: 'gpt-4o' });
      expect(block.metadata).toBeUndefined();
    });

    it('should handle complex workflow with multiple interconnected blocks', () => {
      const blocks: Node[] = [
        {
          id: 'input-1',
          type: 'custom',
          position: { x: 100, y: 100 },
          data: {
            tool: 'http.request',
            params: {
              url: 'https://api.data.com',
              method: 'GET'
            },
            interface: {
              inputs: {},
              outputs: {
                data: 'object'
              }
            }
          }
        },
        {
          id: 'process-1',
          type: 'custom',
          position: { x: 300, y: 100 },
          data: {
            tool: 'openai.chat',
            params: {
              model: 'gpt-4o',
              systemPrompt: 'Process this data'
            },
            interface: {
              inputs: {
                data: 'object',
                config: 'object'
              },
              outputs: {
                result: 'string'
              }
            }
          }
        },
        {
          id: 'output-1',
          type: 'custom',
          position: { x: 500, y: 100 },
          data: {
            tool: 'http.request',
            params: {
              url: 'https://api.output.com',
              method: 'POST'
            },
            interface: {
              inputs: {
                body: 'string'
              },
              outputs: {
                status: 'number'
              }
            }
          }
        }
      ];

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

      // Verify interface matching
      const process = serialized.blocks.find(b => b.id === 'process-1');
      expect(process?.config.interface.inputs).toHaveProperty('data');
      expect(process?.config.interface.outputs).toHaveProperty('result');
    });

    it('should preserve tool-specific parameters', () => {
      const blocks: Node[] = [{
        id: 'agent-1',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          tool: 'openai.chat',
          params: {
            model: 'gpt-4o',
            temperature: 0.7,
            maxTokens: 1000,
            topP: 0.9,
            frequencyPenalty: 0.1,
            presencePenalty: 0.1
          },
          interface: {
            inputs: { prompt: 'string' },
            outputs: { response: 'string' }
          }
        }
      }];

      const serialized = serializer.serializeWorkflow(blocks, []);
      const block = serialized.blocks[0];

      expect(block.config.params).toEqual({
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 1000,
        topP: 0.9,
        frequencyPenalty: 0.1,
        presencePenalty: 0.1
      });
    });
  });

  describe('deserializeWorkflow', () => {
    it('should deserialize a workflow back to ReactFlow format', () => {
      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [
          {
            id: 'agent-1',
            position: { x: 100, y: 100 },
            config: {
              tool: 'openai.chat',
              params: {
                model: 'gpt-4o',
                systemPrompt: 'You are helpful'
              },
              interface: {
                inputs: { prompt: 'string' },
                outputs: { response: 'string' }
              }
            },
            metadata: {
              title: 'GPT-4o Agent',
              category: 'AI'
            }
          }
        ],
        connections: []
      };

      const { blocks, connections } = serializer.deserializeWorkflow(workflow);

      expect(blocks).toHaveLength(1);
      const block = blocks[0];
      expect(block.id).toBe('agent-1');
      expect(block.type).toBe('custom');
      expect(block.data.tool).toBe('openai.chat');
      expect(block.data.params.model).toBe('gpt-4o');
      expect(block.data.title).toBe('GPT-4o Agent');
    });
  });
});