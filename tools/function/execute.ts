import { ToolConfig, ToolResponse } from '../types'

export interface CodeExecutionInput {
  code: Array<{content: string, id: string}> | string
  input?: Record<string, any>  
}

export interface CodeExecutionOutput extends ToolResponse {
  output: {
    result: any
    stdout: string
  }
}

export const functionExecuteTool: ToolConfig<CodeExecutionInput, CodeExecutionOutput> = {
  id: 'function.execute',
  name: 'Function Execute',
  description: 'Execute code in a sandboxed environment',
  version: '1.0.0',
  
  params: {
    code: {
      type: 'string',
      required: true,
      description: 'The code to execute',
    }
  },

  request: {
    url: 'https://emkc.org/api/v2/piston/execute',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }),
    body: (params) => {
      const codeContent = Array.isArray(params.code)
        ? params.code.map(c => c.content).join('\n')
        : params.code 

      return {
        language: 'js',
        version: '*',
        files: [{
          name: 'code.js',
          content: codeContent
        }],
        stdin: '',
        args: [],
        compile_timeout: 10000,
        run_timeout: 3000,
        compile_memory_limit: -1,
        run_memory_limit: -1
      } 
    },
  },

  transformResponse: async (response) => {
    const result = await response.json() 
    
    if (!response.ok) {
      throw new Error(result.message || 'Execution failed') 
    }

    if (result.run?.stderr) {
      throw new Error(result.run.stderr) 
    }

    const stdout = result.run?.stdout || '' 
    
    try {
      // Try parsing the output as JSON
      const parsed = JSON.parse(stdout) 
      return { 
        success: true,
        output: {
          result: parsed,
          stdout
        }
      } 
    } catch {
      // If not JSON, return as string
      return { 
        success: true,
        output: {
          result: stdout,
          stdout
        }
      } 
    }
  },

  transformError: (error: any) => {
    return error.message || 'Code execution failed' 
  },
} 