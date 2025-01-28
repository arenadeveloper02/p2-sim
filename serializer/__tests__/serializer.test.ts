import { Edge } from 'reactflow' 
import { Serializer } from '../index' 
import { SerializedWorkflow } from '../types' 
import { BlockState } from '@/stores/workflow/types' 
import { OutputType } from '@/blocks/types' 
import { getBlock } from '@/blocks'

// Mock icons
jest.mock('@/components/icons', () => ({
  AgentIcon: () => 'AgentIcon',
  ApiIcon: () => 'ApiIcon',
  CodeIcon: () => 'CodeIcon',
})) 

// Mock blocks
jest.mock('@/blocks', () => ({
  getBlock: jest.fn(),
  getBlockTypeForTool: jest.fn((toolId: string) => {
    switch (toolId) {
      case 'openai.chat':
        return 'agent'
      case 'http.request':
        return 'api'
      case 'test-tool':
        return 'agent'
      default:
        return undefined
    }
  })
})) 

describe('Serializer', () => {
  let serializer: Serializer 

  beforeEach(() => {
    serializer = new Serializer() 
    ;(getBlock as jest.Mock).mockReset()
    ;(getBlock as jest.Mock).mockImplementation((type: string) => {
      if (type === 'agent') {
        return {
          tools: {
            access: ['openai.chat'],
            config: null
          },
          workflow: {
            inputs: {
              systemPrompt: { type: 'string', required: false },
              context: { type: 'string', required: false },
              apiKey: { type: 'string', required: false }
            },
            outputs: { response: 'string' as OutputType },
            subBlocks: [
              { id: 'model', type: 'dropdown' },
              { id: 'systemPrompt', type: 'long-input' },
              { id: 'temperature', type: 'slider' },
              { id: 'responseFormat', type: 'code' }
            ]
          },
          toolbar: {
            title: 'Agent Block',
            description: 'Use any LLM',
            category: 'basic',
            bgColor: '#7F2FFF'
          }
        }
      } else if (type === 'api') {
        return {
          tools: {
            access: ['http.request'],
            config: null
          },
          workflow: {
            inputs: {
              url: { type: 'string', required: true },
              method: { type: 'string', required: true }
            },
            outputs: { response: 'any' as OutputType },
            subBlocks: [
              { id: 'url', type: 'short-input' },
              { id: 'method', type: 'dropdown' }
            ]
          },
          toolbar: {
            title: 'API Block',
            description: 'Make HTTP requests',
            category: 'basic',
            bgColor: '#00FF00'
          }
        }
      }
      return {
        tools: {
          access: ['test-tool'],
          config: null
        },
        workflow: {
          inputs: {},
          outputs: { response: 'string' as OutputType },
          subBlocks: []
        },
        toolbar: {
          title: 'Test Block',
          description: 'A test block',
          category: 'test',
          bgColor: '#000000'
        }
      }
    })
  }) 

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
            },
            'responseFormat': {
              id: 'responseFormat',
              type: 'code',
              value: null
            }
          },
          outputs: {
            response: 'string'
          }
        },
        'http-1': {
          id: 'http-1',
          type: 'api',
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
          outputs: {
            response: 'any'
          }
        }
      } 

      const connections: Edge[] = [
        {
          id: 'conn-1',
          source: 'agent-1',
          target: 'http-1',
          sourceHandle: 'response',
          targetHandle: 'body'
        }
      ] 

      const serialized = serializer.serializeWorkflow(blocks, connections) 

      // Test workflow structure
      expect(serialized.version).toBe('1.0') 
      expect(serialized.blocks).toHaveLength(2) 
      expect(serialized.connections).toHaveLength(1) 

      // Test agent block serialization
      const agentBlock = serialized.blocks.find(b => b.id === 'agent-1') 
      expect(agentBlock).toBeDefined() 
      expect(agentBlock?.config.tool).toBe('openai.chat') 
      expect(agentBlock?.config.params).toEqual({
        model: 'gpt-4o',
        systemPrompt: 'You are helpful',
        temperature: 0.7,
        responseFormat: null
      }) 
      expect(agentBlock?.config.interface.outputs).toEqual({
        response: 'string'
      })

      // Test http block serialization
      const httpBlock = serialized.blocks.find(b => b.id === 'http-1') 
      expect(httpBlock).toBeDefined() 
      expect(httpBlock?.config.tool).toBe('http.request') 
      expect(httpBlock?.config.params).toEqual({
        url: 'https://api.example.com',
        method: 'GET'
      }) 
      expect(httpBlock?.config.interface.outputs).toEqual({
        response: 'any'
      })
    }) 

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
          outputs: {
            response: 'string'
          }
        }
      } 

      const serialized = serializer.serializeWorkflow(blocks, []) 
      const block = serialized.blocks[0] 
      
      expect(block.id).toBe('minimal-1') 
      expect(block.config.tool).toBe('openai.chat') 
      expect(block.config.params).toEqual({ model: 'gpt-4o' }) 
      expect(block.config.interface.outputs).toEqual({
        response: 'string'
      })
    }) 

    it('should handle complex workflow with multiple interconnected blocks', () => {
      const blocks: Record<string, BlockState> = {
        'input-1': {
          id: 'input-1',
          type: 'api',
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
          outputs: {
            response: 'any'
          }
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
            },
            'responseFormat': {
              id: 'responseFormat',
              type: 'code',
              value: '{ "type": "json" }'
            }
          },
          outputs: {
            response: 'json'
          }
        }
      }

      const connections: Edge[] = [
        {
          id: 'conn-1',
          source: 'input-1',
          target: 'process-1',
          sourceHandle: 'response',
          targetHandle: 'context'
        }
      ]

      const serialized = serializer.serializeWorkflow(blocks, connections)

      // Verify workflow structure
      expect(serialized.blocks).toHaveLength(2)
      expect(serialized.connections).toHaveLength(1)

      // Verify data flow chain
      const conn = serialized.connections[0]
      expect(conn.source).toBe('input-1')
      expect(conn.target).toBe('process-1')
      expect(conn.sourceHandle).toBe('response')
      expect(conn.targetHandle).toBe('context')

      // Verify block outputs
      const inputBlock = serialized.blocks.find(b => b.id === 'input-1')
      const processBlock = serialized.blocks.find(b => b.id === 'process-1')

      expect(inputBlock?.config.interface.outputs).toEqual({
        response: 'any'
      })
      expect(processBlock?.config.interface.outputs).toEqual({
        response: 'json'
      })
    }) 

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
          outputs: {
            response: 'string'
          }
        }
      }

      const serialized = serializer.serializeWorkflow(blocks, [])
      const block = serialized.blocks[0]

      expect(block.config.tool).toBe('openai.chat')
      expect(block.config.params).toEqual({
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 1000
      })
      expect(block.config.interface.outputs).toEqual({
        response: 'string'
      })
    }) 

    it('should serialize a workflow with correct output types', () => {
      // Mock block config
      ;(getBlock as jest.Mock).mockReturnValue({
        tools: {
          access: ['test-tool'],
          config: null
        },
        workflow: {
          inputs: {
            input: { type: 'string', required: true }
          },
          outputs: {
            response: {
              type: 'string',
              dependsOn: {
                subBlockId: 'responseFormat',
                condition: {
                  whenEmpty: 'string',
                  whenFilled: 'json'
                }
              }
            }
          },
          subBlocks: [
            {
              id: 'input',
              type: 'short-input'
            },
            {
              id: 'responseFormat',
              type: 'code'
            }
          ]
        },
        toolbar: {
          title: 'Test Block',
          description: 'A test block',
          category: 'test',
          bgColor: '#000000'
        }
      })

      const blocks: Record<string, BlockState> = {
        'block-1': {
          id: 'block-1',
          type: 'agent',
          name: 'Agent 1',
          position: { x: 0, y: 0 },
          subBlocks: {
            input: {
              id: 'input',
              type: 'short-input',
              value: 'test input'
            },
            responseFormat: {
              id: 'responseFormat',
              type: 'code',
              value: null
            }
          },
          outputs: {
            response: 'string'
          }
        }
      }

      const edges: Edge[] = []

      const serialized = serializer.serializeWorkflow(blocks, edges)

      expect(serialized.blocks[0].config.interface.outputs).toEqual({
        response: 'string'
      })
    })

    it('should handle dynamic output types based on subBlock values', () => {
      // Mock block config with dynamic output type
      ;(getBlock as jest.Mock).mockReturnValue({
        tools: {
          access: ['test-tool'],
          config: null
        },
        workflow: {
          inputs: {
            input: { type: 'string', required: true }
          },
          outputs: {
            response: {
              type: 'string',
              dependsOn: {
                subBlockId: 'responseFormat',
                condition: {
                  whenEmpty: 'string',
                  whenFilled: 'json'
                }
              }
            }
          },
          subBlocks: [
            {
              id: 'input',
              type: 'short-input'
            },
            {
              id: 'responseFormat',
              type: 'code'
            }
          ]
        },
        toolbar: {
          title: 'Test Block',
          description: 'A test block',
          category: 'test',
          bgColor: '#000000'
        }
      })

      const blocks: Record<string, BlockState> = {
        'block-1': {
          id: 'block-1',
          type: 'agent',
          name: 'Agent 1',
          position: { x: 0, y: 0 },
          subBlocks: {
            input: {
              id: 'input',
              type: 'short-input',
              value: 'test input'
            },
            responseFormat: {
              id: 'responseFormat',
              type: 'code',
              value: '{ "format": "json" }'  // Non-empty responseFormat
            }
          },
          outputs: {
            response: 'json' as OutputType  // Should be json when responseFormat is filled
          }
        }
      }

      const edges: Edge[] = []

      const serialized = serializer.serializeWorkflow(blocks, edges)

      expect(serialized.blocks[0].config.interface.outputs).toEqual({
        response: 'json' as OutputType
      })
    })

    it('should preserve connection handles during serialization', () => {
      // Mock block config
      ;(getBlock as jest.Mock).mockReturnValue({
        tools: {
          access: ['test-tool'],
          config: null
        },
        workflow: {
          inputs: {},
          outputs: { response: 'string' as OutputType },
          subBlocks: []
        },
        toolbar: {
          title: 'Test Block',
          description: 'A test block',
          category: 'test',
          bgColor: '#000000'
        }
      })

      const blocks: Record<string, BlockState> = {
        'block-1': {
          id: 'block-1',
          type: 'agent',
          name: 'Agent 1',
          position: { x: 0, y: 0 },
          subBlocks: {},
          outputs: { response: 'string' }
        },
        'block-2': {
          id: 'block-2',
          type: 'api',
          name: 'API 1',
          position: { x: 200, y: 0 },
          subBlocks: {},
          outputs: { response: 'json' }
        }
      }

      const edges: Edge[] = [
        {
          id: 'edge-1',
          source: 'block-1',
          target: 'block-2',
          sourceHandle: 'response',
          targetHandle: 'input'
        }
      ]

      const serialized = serializer.serializeWorkflow(blocks, edges)

      expect(serialized.connections[0]).toEqual({
        source: 'block-1',
        target: 'block-2',
        sourceHandle: 'response',
        targetHandle: 'input'
      })
    })
  }) 

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
                systemPrompt: 'You are helpful',
                responseFormat: null
              },
              interface: {
                inputs: {
                  systemPrompt: 'string',
                  context: 'string',
                  apiKey: 'string'
                },
                outputs: {
                  response: 'string'
                }
              }
            },
            metadata: {
              title: 'Agent Block',
              description: 'Use any LLM',
              category: 'basic',
              color: '#7F2FFF'
            }
          }
        ],
        connections: []
      } 

      const { blocks } = serializer.deserializeWorkflow(workflow) 
      const block = blocks['agent-1'] 

      expect(block.type).toBe('agent') 
      expect(block.subBlocks.model.value).toBe('gpt-4o') 
      expect(block.subBlocks.systemPrompt.value).toBe('You are helpful') 
      expect(block.subBlocks.responseFormat.value).toBe(null) 
      expect(block.outputs).toEqual({
        response: 'string'
      }) 
    }) 

    it('should deserialize a workflow with correct output types', () => {
      // Mock block config
      ;(getBlock as jest.Mock).mockReturnValue({
        tools: {
          access: ['test-tool'],
          config: null
        },
        workflow: {
          inputs: {},
          outputs: { response: 'string' as OutputType },
          subBlocks: []
        },
        toolbar: {
          title: 'Test Block',
          description: 'A test block',
          category: 'test',
          bgColor: '#000000'
        }
      })

      const serializedWorkflow: SerializedWorkflow = {
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
                outputs: { response: 'string' as OutputType }
              }
            },
            metadata: {
              title: 'Test Block',
              description: 'A test block',
              category: 'test',
              color: '#000000'
            }
          }
        ],
        connections: []
      }

      const { blocks } = serializer.deserializeWorkflow(serializedWorkflow)

      expect(blocks['block-1'].outputs).toEqual({
        response: 'string'
      })
    })
  }) 
}) 