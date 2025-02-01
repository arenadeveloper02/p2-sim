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
          },
          enabled: true
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
          },
          enabled: true
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
          },
          enabled: true
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
          },
          enabled: true
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
          },
          enabled: true
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
          },
          enabled: true
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
        'test-tool-1',
        'Test Tool 1',
        { result: 'test data', data: { status: 200 } }
      );
      const mockTool2 = createMockTool(
        'test-tool-2',
        'Test Tool 2',
        { result: 'processed data', data: { status: 201 } }
      );
      (tools as any)['test-tool-1'] = mockTool1;
      (tools as any)['test-tool-2'] = mockTool2;

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [
          {
            id: 'block1',
            position: { x: 0, y: 0 },
            config: {
              tool: 'test-tool-1',
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
            },
            enabled: true
          },
          {
            id: 'block2',
            position: { x: 200, y: 0 },
            config: {
              tool: 'test-tool-2',
              params: { input: 'test data' }
            },
            inputs: { input: 'string' },
            outputs: {
              output: {
                response: {
                  text: 'string',
                  status: 'number'
                } as ValueType
              } as BlockOutput
            },
            enabled: true
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
            },
            enabled: true
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
            },
            enabled: true
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

    it('should execute a chain of API tools', async () => {
      // Mock the HTTP request tools
      const httpTool1: Tool = {
        id: 'http.request1',
        name: 'HTTP Request 1',
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
            url: 'https://api.example.com/data',
            method: 'GET'
          }
        }),
        transformError: () => 'HTTP request error'
      };

      const httpTool2: Tool = {
        id: 'http.request2',
        name: 'HTTP Request 2',
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

      (tools as any)['http.request1'] = httpTool1;
      (tools as any)['http.request2'] = httpTool2;

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [
          {
            id: 'api1',
            position: { x: 0, y: 0 },
            config: {
              tool: 'http.request1',
              params: {
                url: 'https://api.example.com',
                method: 'GET'
              }
            },
            inputs: {
              url: 'string',
              method: 'string'
            },
            outputs: {
              output: {
                response: {
                  url: 'string',
                  method: 'string'
                } as ValueType
              } as BlockOutput
            },
            enabled: true
          },
          {
            id: 'api2',
            position: { x: 400, y: 0 },
            config: {
              tool: 'http.request2',
              params: {
                url: 'https://api.example.com/data',
                method: 'GET'
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
            },
            enabled: true
          }
        ],
        connections: [
          {
            source: 'api1',
            target: 'api2',
            sourceHandle: 'output.response.url',
            targetHandle: 'url'
          }
        ]
      };

      // Mock fetch responses with sequential data flow
      global.fetch = jest.fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              output: {
                url: 'https://api.example.com/data',
                method: 'GET'
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
      expect(fetchCalls).toHaveLength(2);
    });
  }) 

  describe('Connection Tests', () => {
    it('should execute a chain of API tools', async () => {
      // Mock the HTTP request tools
      const httpTool1: Tool = {
        id: 'http.request1',
        name: 'HTTP Request 1',
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
            url: 'https://api.example.com/data',
            method: 'GET'
          }
        }),
        transformError: () => 'HTTP request error'
      };

      const httpTool2: Tool = {
        id: 'http.request2',
        name: 'HTTP Request 2',
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

      (tools as any)['http.request1'] = httpTool1;
      (tools as any)['http.request2'] = httpTool2;

      const workflow: SerializedWorkflow = {
        version: '1.0',
        blocks: [
          {
            id: 'api1',
            position: { x: 0, y: 0 },
            config: {
              tool: 'http.request1',
              params: {
                url: 'https://api.example.com',
                method: 'GET'
              }
            },
            inputs: {
              url: 'string',
              method: 'string'
            },
            outputs: {
              output: {
                response: {
                  url: 'string',
                  method: 'string'
                } as ValueType
              } as BlockOutput
            },
            enabled: true
          },
          {
            id: 'api2',
            position: { x: 400, y: 0 },
            config: {
              tool: 'http.request2',
              params: {
                url: 'https://api.example.com/data',
                method: 'GET'
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
            },
            enabled: true
          }
        ],
        connections: [
          {
            source: 'api1',
            target: 'api2',
            sourceHandle: 'output.response.url',
            targetHandle: 'url'
          }
        ]
      };

      // Mock fetch responses with sequential data flow
      global.fetch = jest.fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              output: {
                url: 'https://api.example.com/data',
                method: 'GET'
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
      expect(fetchCalls).toHaveLength(2);
    });
  });
}) 
