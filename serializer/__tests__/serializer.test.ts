import { Node, Edge } from 'reactflow';
import { Serializer } from '../index';
import { SerializedWorkflow } from '../types';

describe('Serializer', () => {
  let serializer: Serializer;

  beforeEach(() => {
    serializer = new Serializer();
  });

  describe('serializeWorkflow', () => {
    it('should serialize a workflow with model and http blocks', () => {
      const blocks: Node[] = [
        {
          id: 'model-1',
          type: 'custom',
          position: { x: 100, y: 100 },
          data: {
            tool: 'model',
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
            tool: 'http',
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
          source: 'model-1',
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

      // Test model block serialization
      const modelBlock = serialized.blocks.find(b => b.id === 'model-1');
      expect(modelBlock).toBeDefined();
      expect(modelBlock?.config.tool).toBe('model');
      expect(modelBlock?.config.params).toEqual({
        model: 'gpt-4o',
        systemPrompt: 'You are helpful',
        temperature: 0.7
      });
      expect(modelBlock?.metadata).toEqual({
        title: 'GPT-4o Agent',
        description: 'Language model block',
        category: 'AI',
        icon: 'brain',
        color: '#7F2FFF'
      });

      // Test http block serialization
      const httpBlock = serialized.blocks.find(b => b.id === 'http-1');
      expect(httpBlock).toBeDefined();
      expect(httpBlock?.config.tool).toBe('http');
      expect(httpBlock?.config.params).toEqual({
        url: 'https://api.example.com',
        method: 'GET'
      });

      // Test connection serialization
      const connection = serialized.connections[0];
      expect(connection).toEqual({
        source: 'model-1',
        target: 'http-1',
        sourceHandle: 'response',
        targetHandle: 'body'
      });
    });

    it('should handle blocks with minimal required configuration', () => {
      const blocks: Node[] = [{
        id: 'minimal-1',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          tool: 'model',
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
      expect(block.config.tool).toBe('model');
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
            tool: 'http',
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
            tool: 'model',
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
            tool: 'http',
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
        id: 'model-1',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          tool: 'model',
          params: {
            model: 'gpt-4o',
            temperature: 0.7,
            maxTokens: 1000,
            topP: 0.9,
            frequencyPenalty: 0.5,
            presencePenalty: 0.5,
            stop: ['###']
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
        frequencyPenalty: 0.5,
        presencePenalty: 0.5,
        stop: ['###']
      });
    });
  });

  describe('deserializeWorkflow', () => {
    it('should deserialize a workflow back to ReactFlow format', () => {
      const serialized: SerializedWorkflow = {
        version: '1.0',
        blocks: [
          {
            id: 'model-1',
            position: { x: 100, y: 100 },
            config: {
              tool: 'model',
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
        connections: [
          {
            source: 'model-1',
            target: 'http-1',
            sourceHandle: 'response',
            targetHandle: 'body'
          }
        ]
      };

      const deserialized = serializer.deserializeWorkflow(serialized);

      // Test blocks deserialization
      expect(deserialized.blocks).toHaveLength(1);
      const block = deserialized.blocks[0];
      expect(block.id).toBe('model-1');
      expect(block.type).toBe('custom');
      expect(block.position).toEqual({ x: 100, y: 100 });
      expect(block.data).toEqual({
        tool: 'model',
        params: {
          model: 'gpt-4o',
          systemPrompt: 'You are helpful'
        },
        interface: {
          inputs: { prompt: 'string' },
          outputs: { response: 'string' }
        },
        title: 'GPT-4o Agent',
        category: 'AI'
      });

      // Test connections deserialization
      expect(deserialized.connections).toHaveLength(1);
      const connection = deserialized.connections[0];
      expect(connection).toEqual({
        id: 'model-1-http-1',
        source: 'model-1',
        target: 'http-1',
        sourceHandle: 'response',
        targetHandle: 'body'
      });
    });

    it('should handle empty workflow', () => {
      const serialized: SerializedWorkflow = {
        version: '1.0',
        blocks: [],
        connections: []
      };

      const deserialized = serializer.deserializeWorkflow(serialized);
      expect(deserialized.blocks).toHaveLength(0);
      expect(deserialized.connections).toHaveLength(0);
    });

    it('should handle blocks with complex interface types', () => {
      const serialized: SerializedWorkflow = {
        version: '1.0',
        blocks: [{
          id: 'complex-1',
          position: { x: 0, y: 0 },
          config: {
            tool: 'model',
            params: {
              model: 'gpt-4o'
            },
            interface: {
              inputs: {
                context: 'object',
                options: 'array',
                metadata: 'Record<string, any>',
                callback: 'function'
              },
              outputs: {
                result: 'object',
                errors: 'array',
                logs: 'string[]'
              }
            }
          }
        }],
        connections: []
      };

      const deserialized = serializer.deserializeWorkflow(serialized);
      const block = deserialized.blocks[0];
      
      expect(block.data.interface.inputs).toEqual({
        context: 'object',
        options: 'array',
        metadata: 'Record<string, any>',
        callback: 'function'
      });
      expect(block.data.interface.outputs).toEqual({
        result: 'object',
        errors: 'array',
        logs: 'string[]'
      });
    });

    it('should handle circular connections', () => {
      const serialized: SerializedWorkflow = {
        version: '1.0',
        blocks: [
          {
            id: 'loop-1',
            position: { x: 0, y: 0 },
            config: {
              tool: 'model',
              params: {},
              interface: {
                inputs: { input: 'string' },
                outputs: { output: 'string' }
              }
            }
          },
          {
            id: 'loop-2',
            position: { x: 200, y: 0 },
            config: {
              tool: 'model',
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
            source: 'loop-1',
            target: 'loop-2',
            sourceHandle: 'output',
            targetHandle: 'input'
          },
          {
            source: 'loop-2',
            target: 'loop-1',
            sourceHandle: 'output',
            targetHandle: 'input'
          }
        ]
      };

      const deserialized = serializer.deserializeWorkflow(serialized);
      
      expect(deserialized.connections).toHaveLength(2);
      expect(deserialized.connections[0].source).toBe('loop-1');
      expect(deserialized.connections[0].target).toBe('loop-2');
      expect(deserialized.connections[1].source).toBe('loop-2');
      expect(deserialized.connections[1].target).toBe('loop-1');
    });
  });
});