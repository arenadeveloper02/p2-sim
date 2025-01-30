import { Edge } from 'reactflow' 
import { Serializer } from '../index' 
import { SerializedWorkflow } from '../types' 
import { BlockState } from '@/stores/workflow/types' 
import { BlockOutput, ValueType } from '@/blocks/types' 
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
            outputs: {
              response: {
                response: {
                  text: 'string',
                  model: 'string',
                  tokens: 'number'
                }
              } satisfies BlockOutput
            },
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
            outputs: {
              response: {
                response: {
                  body: 'any',
                  status: 'number',
                  headers: 'json'
                }
              } satisfies BlockOutput
            },
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
          outputs: {
            response: {
              response: {
                text: 'string',
                model: 'string',
                tokens: 'number'
              }
            } satisfies BlockOutput
          },
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
    it('should serialize a workflow with one tool', async () => {
      const blocks: Record<string, BlockState> = {
        'block-1': {
          id: 'block-1',
          type: 'agent',
          name: 'Test Agent',
          position: { x: 0, y: 0 },
          enabled: true,
          subBlocks: {
            'model': {
              id: 'model',
              type: 'dropdown',
              value: 'gpt-4o'
            },
            'systemPrompt': {
              id: 'systemPrompt',
              type: 'long-input',
              value: 'test'
            }
          },
          outputs: {
            response: {
              response: {
                text: 'string',
                status: 'number'
              }
            } satisfies BlockOutput
          }
        }
      }

      const workflow = serializer.serializeWorkflow(blocks, [])
      const block = workflow.blocks[0]

      expect(block.config.tool).toBe('openai.chat')
      expect(block.config.params).toEqual({
        model: 'gpt-4o',
        systemPrompt: 'test'
      })
      expect(block.inputs).toEqual({
        systemPrompt: 'string',
        context: 'string',
        apiKey: 'string'
      })
      expect(block.outputs).toEqual({
        response: {
          response: {
            text: 'string',
            status: 'number'
          }
        } satisfies BlockOutput
      })
    }) 

    it('should handle blocks with minimal configuration', () => {
      const blocks: Record<string, BlockState> = {
        'minimal-1': {
          id: 'minimal-1',
          type: 'agent',
          name: 'Minimal Agent',
          position: { x: 0, y: 0 },
          enabled: true,
          subBlocks: {
            'model': {
              id: 'model',
              type: 'dropdown',
              value: 'gpt-4o'
            }
          },
          outputs: {
            response: {
              response: {
                text: 'string'
              }
            } satisfies BlockOutput
          }
        }
      }

      const workflow = serializer.serializeWorkflow(blocks, [])
      const block = workflow.blocks[0]

      expect(block.config.tool).toBe('openai.chat')
      expect(block.config.params).toEqual({ model: 'gpt-4o' })
      expect(block.inputs).toEqual({
        systemPrompt: 'string',
        context: 'string',
        apiKey: 'string'
      })
      expect(block.outputs).toEqual({
        response: {
          response: {
            text: 'string'
          }
        } satisfies BlockOutput
      })
    }) 

    it('should handle complex workflow with multiple blocks', () => {
      const blocks: Record<string, BlockState> = {
        'input-1': {
          id: 'input-1',
          type: 'api',
          name: 'Data Input',
          position: { x: 100, y: 100 },
          enabled: true,
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
            response: {
              response: {
                body: 'json',
                status: 'number',
                headers: 'json'
              }
            } satisfies BlockOutput
          }
        },
        'process-1': {
          id: 'process-1',
          type: 'agent',
          name: 'Data Processor',
          position: { x: 300, y: 100 },
          enabled: true,
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
          outputs: {
            response: {
              response: {
                text: 'string',
                model: 'string',
                tokens: 'number'
              }
            } satisfies BlockOutput
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

      const workflow = serializer.serializeWorkflow(blocks, connections)

      // Verify workflow structure
      expect(workflow.blocks).toHaveLength(2)
      expect(workflow.connections).toHaveLength(1)

      // Verify data flow chain
      const conn = workflow.connections[0]
      expect(conn.source).toBe('input-1')
      expect(conn.target).toBe('process-1')
      expect(conn.sourceHandle).toBe('response')
      expect(conn.targetHandle).toBe('context')

      // Verify block outputs
      const inputBlock = workflow.blocks.find(b => b.id === 'input-1')
      const processBlock = workflow.blocks.find(b => b.id === 'process-1')

      expect(inputBlock?.outputs).toEqual({
        response: {
          response: {
            body: 'json',
            status: 'number',
            headers: 'json'
          }
        } satisfies BlockOutput
      })
      expect(processBlock?.outputs).toEqual({
        response: {
          response: {
            text: 'string',
            model: 'string',
            tokens: 'number'
          }
        } satisfies BlockOutput
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
                systemPrompt: 'You are helpful'
              }
            },
            inputs: {
              systemPrompt: 'string',
              context: 'string',
              apiKey: 'string'
            },
            outputs: {
              response: {
                response: {
                  text: 'string',
                  model: 'string',
                  tokens: 'number'
                }
              } satisfies BlockOutput
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
      expect(block.enabled).toBe(true)
      expect(block.subBlocks.model.value).toBe('gpt-4o')
      expect(block.subBlocks.systemPrompt.value).toBe('You are helpful')
      expect(block.outputs).toEqual({
        response: {
          response: {
            text: 'string',
            model: 'string',
            tokens: 'number'
          }
        } satisfies BlockOutput
      })
    }) 
  }) 
}) 