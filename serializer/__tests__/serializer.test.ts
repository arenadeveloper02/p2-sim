import { describe, expect, test } from '@jest/globals';
import { Serializer } from '../index';
import { BlockConfig, BlockType } from '@/blocks/types/block';
import { Node } from 'reactflow';
import { SerializedWorkflow } from '../types';

jest.mock('@/components/icons', () => ({
  AgentIcon: jest.fn(),
  ApiIcon: jest.fn(),
  ConditionalIcon: jest.fn()
}));

import { AgentIcon, ApiIcon, ConditionalIcon } from '@/components/icons';

describe('Serializer', () => {
  const serializer = new Serializer();

  test('should serialize an agent block correctly', () => {
    const mockAgentBlock: Node<BlockConfig> = {
      id: 'agent-1',
      type: 'custom',
      position: { x: 100, y: 200 },
      data: {
        type: 'agent',
        toolbar: {
          title: 'Agent',
          description: 'Use any LLM',
          bgColor: '#7F2FFF',
          icon: AgentIcon,
          category: 'basic',
        },
        workflow: {
          inputs: {
            prompt: 'string',
            context: 'string'
          },
          outputs: {
            response: 'string',
            tokens: 'number'
          },
          subBlocks: [
            {
              title: 'System Prompt',
              type: 'long-input',
              layout: 'full',
              placeholder: 'Enter prompt'
            },
            {
              title: 'Model',
              type: 'dropdown',
              layout: 'half',
              options: ['GPT-4o', 'Gemini 2.0']
            }
          ]
        }
      }
    };

    const serialized = serializer.serializeWorkflow([mockAgentBlock], []);
    
    // Check basic structure
    expect(serialized.version).toBe('1.0');
    expect(serialized.blocks).toHaveLength(1);
    
    const serializedBlock = serialized.blocks[0];
    
    // Check block properties
    expect(serializedBlock.id).toBe('agent-1');
    expect(serializedBlock.type).toBe('agent');
    expect(serializedBlock.position).toEqual({ x: 100, y: 200 });
    
    // Check config
    expect(serializedBlock.config.inputs).toEqual({
      prompt: 'string',
      context: 'string'
    });
    expect(serializedBlock.config.outputs).toEqual({
      response: 'string',
      tokens: 'number'
    });
    
    // Check extracted values from subBlocks
    expect(serializedBlock.config.system_prompt).toBe('');
    expect(serializedBlock.config.model).toBe('GPT-4o');
  });

  test('should serialize an HTTP block correctly', () => {
    const mockHttpBlock: Node<BlockConfig> = {
      id: 'http-1',
      type: 'custom',
      position: { x: 150, y: 250 },
      data: {
        type: 'api' as BlockType,
        toolbar: {
          title: 'HTTP',
          description: 'Make HTTP requests',
          bgColor: '#FF4D4D',
          icon: ApiIcon,
          category: 'basic',
        },
        workflow: {
          inputs: {
            headers: 'object',
            body: 'object'
          },
          outputs: {
            response: 'object',
            status: 'number'
          },
          subBlocks: [
            {
              title: 'URL',
              type: 'short-input',
              layout: 'full',
              placeholder: 'Enter URL'
            },
            {
              title: 'Method',
              type: 'dropdown',
              layout: 'half',
              options: ['GET', 'POST', 'PUT', 'DELETE']
            },
            {
              title: 'Headers',
              type: 'code',
              layout: 'full'
            },
            {
              title: 'Body',
              type: 'code',
              layout: 'full'
            }
          ]
        }
      }
    };

    const serialized = serializer.serializeWorkflow([mockHttpBlock], []);
    const serializedBlock = serialized.blocks[0];
    
    // Check block properties
    expect(serializedBlock.id).toBe('http-1');
    expect(serializedBlock.type).toBe('api');
    expect(serializedBlock.position).toEqual({ x: 150, y: 250 });
    
    // Check config
    expect(serializedBlock.config.inputs).toEqual({
      headers: 'object',
      body: 'object'
    });
    expect(serializedBlock.config.outputs).toEqual({
      response: 'object',
      status: 'number'
    });
    
    // Check extracted values from subBlocks
    expect(serializedBlock.config.url).toBe('');
    expect(serializedBlock.config.method).toBe('GET');
    expect(serializedBlock.config.headers).toBe('');
    expect(serializedBlock.config.body).toBe('');
  });

  test('should serialize a conditional block correctly', () => {
    const mockConditionBlock: Node<BlockConfig> = {
      id: 'condition-1',
      type: 'custom',
      position: { x: 200, y: 300 },
      data: {
        type: 'conditional' as BlockType,
        toolbar: {
          title: 'Condition',
          description: 'Branch based on condition',
          bgColor: '#00B8D9',
          icon: ConditionalIcon,
          category: 'basic',
        },
        workflow: {
          inputs: {
            value: 'any'
          },
          outputs: {
            result: 'boolean'
          },
          subBlocks: [
            {
              title: 'Condition',
              type: 'code',
              layout: 'full',
              placeholder: 'Enter condition'
            },
            {
              title: 'Operator',
              type: 'dropdown',
              layout: 'half',
              options: ['equals', 'contains', 'greater than', 'less than']
            },
            {
              title: 'Value',
              type: 'short-input',
              layout: 'half',
              placeholder: 'Compare value'
            }
          ]
        }
      }
    };

    const serialized = serializer.serializeWorkflow([mockConditionBlock], []);
    const serializedBlock = serialized.blocks[0];
    
    // Check block properties
    expect(serializedBlock.id).toBe('condition-1');
    expect(serializedBlock.type).toBe('conditional');
    expect(serializedBlock.position).toEqual({ x: 200, y: 300 });
    
    // Check config
    expect(serializedBlock.config.inputs).toEqual({
      value: 'any'
    });
    expect(serializedBlock.config.outputs).toEqual({
      result: 'boolean'
    });
    
    // Check extracted values from subBlocks
    expect(serializedBlock.config.condition).toBe('');
    expect(serializedBlock.config.operator).toBe('equals');
    expect(serializedBlock.config.value).toBe('');
  });

  test('should serialize connections correctly', () => {
    const mockConnections = [
      {
        id: 'conn-1',
        source: 'agent-1',
        target: 'agent-2',
        sourceHandle: 'output',
        targetHandle: 'input'
      }
    ];

    const serialized = serializer.serializeWorkflow([], mockConnections);
    
    expect(serialized.connections).toHaveLength(1);
    const conn = serialized.connections[0];
    expect(conn.source).toBe('agent-1');
    expect(conn.target).toBe('agent-2');
    expect(conn.sourceHandle).toBe('output');
    expect(conn.targetHandle).toBe('input');
  });

  test('should deserialize back to ReactFlow format', () => {
    const mockWorkflow = {
      version: '1.0',
      blocks: [{
        id: 'agent-1',
        type: 'agent',
        position: { x: 100, y: 200 },
        config: {
          system_prompt: 'You are a helpful assistant',
          model: 'GPT-4o',
          inputs: { prompt: 'string' },
          outputs: { response: 'string' }
        }
      }],
      connections: [{
        source: 'agent-1',
        target: 'agent-2',
        sourceHandle: 'output',
        targetHandle: 'input'
      }]
    };

    const deserialized = serializer.deserializeWorkflow(mockWorkflow);
    
    // Check blocks
    expect(deserialized.blocks).toHaveLength(1);
    const block = deserialized.blocks[0];
    expect(block.id).toBe('agent-1');
    expect(block.position).toEqual({ x: 100, y: 200 });
    expect(block.data.type).toBe('agent');
    
    // Check connections
    expect(deserialized.connections).toHaveLength(1);
    const conn = deserialized.connections[0];
    expect(conn.source).toBe('agent-1');
    expect(conn.target).toBe('agent-2');
    expect(conn.sourceHandle).toBe('output');
    expect(conn.targetHandle).toBe('input');
  });

  test('should handle empty workflow', () => {
    const serialized = serializer.serializeWorkflow([], []);
    expect(serialized.blocks).toHaveLength(0);
    expect(serialized.connections).toHaveLength(0);
    
    const deserialized = serializer.deserializeWorkflow(serialized);
    expect(deserialized.blocks).toHaveLength(0);
    expect(deserialized.connections).toHaveLength(0);
  });

  test('should handle a complex workflow with multiple block types', () => {
    const mockWorkflow: SerializedWorkflow = {
      version: '1.0',
      blocks: [
        {
          id: 'agent-1',
          type: 'agent',
          position: { x: 100, y: 100 },
          config: {
            system_prompt: 'Analyze this',
            model: 'GPT-4o',
            inputs: { prompt: 'string' },
            outputs: { response: 'string' }
          }
        },
        {
          id: 'http-1',
          type: 'api',
          position: { x: 300, y: 100 },
          config: {
            url: 'https://api.example.com',
            method: 'GET',
            inputs: { headers: 'string', body: 'string' },
            outputs: { response: 'string', status: 'string' }
          }
        },
        {
          id: 'condition-1',
          type: 'conditional',
          position: { x: 200, y: 300 },
          config: {
            condition: 'value > 0',
            operator: 'greater than',
            value: '',
            inputs: { value: 'string' },
            outputs: { result: 'string' }
          }
        }
      ],
      connections: [
        {
          source: 'agent-1',
          target: 'http-1',
          sourceHandle: 'response',
          targetHandle: 'headers'
        },
        {
          source: 'http-1',
          target: 'condition-1',
          sourceHandle: 'response',
          targetHandle: 'value'
        }
      ]
    };

    const deserialized = serializer.deserializeWorkflow(mockWorkflow);
    
    // Check blocks
    expect(deserialized.blocks).toHaveLength(3);
    expect(deserialized.blocks.map(b => b.data.type)).toEqual(['agent', 'api', 'conditional']);
    
    // Check connections maintain workflow logic
    expect(deserialized.connections).toHaveLength(2);
    expect(deserialized.connections[0].source).toBe('agent-1');
    expect(deserialized.connections[0].target).toBe('http-1');
    expect(deserialized.connections[1].source).toBe('http-1');
    expect(deserialized.connections[1].target).toBe('condition-1');
  });
}); 