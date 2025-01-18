import { SerializedWorkflow, SerializedBlock, BlockConfig } from '@/serializer/types';
import { ExecutionContext, ExecutionResult, Tool } from './types';
import { tools } from '@/tools/registry';

export class Executor {
  private workflow: SerializedWorkflow;
  
  constructor(workflow: SerializedWorkflow) {
    this.workflow = workflow;
  }

  private async executeBlock(
    block: SerializedBlock,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<Record<string, any>> {
    const config = block.config as BlockConfig;
    const toolId = config.tool;

    if (!toolId) {
      throw new Error(`Block ${block.id} does not specify a tool`);
    }

    const tool = tools[toolId];
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`);
    }

    // Validate interface compatibility
    this.validateInterface(block, inputs);

    // Merge block parameters with runtime inputs
    const params = {
      ...config.params,
      ...inputs
    };

    // Validate tool parameters
    this.validateToolParams(tool, params);

    try {
      // Make the HTTP request
      const url = typeof tool.request.url === 'function' 
        ? tool.request.url(params)
        : tool.request.url;

      const response = await fetch(url, {
        method: tool.request.method,
        headers: tool.request.headers(params),
        body: tool.request.body ? JSON.stringify(tool.request.body(params)) : undefined
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(tool.transformError(error));
      }

      const data = await response.json();
      const result = tool.transformResponse(data);

      // Validate the output matches the interface
      this.validateToolOutput(block, result);
      return result;
    } catch (error) {
      throw new Error(`Tool ${toolId} execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private validateToolParams(tool: Tool, params: Record<string, any>): void {
    // Check required parameters
    for (const [paramName, paramConfig] of Object.entries(tool.params)) {
      if (paramConfig.required && !(paramName in params)) {
        throw new Error(`Missing required parameter '${paramName}' for tool ${tool.id}`);
      }
    }
  }

  private validateInterface(block: SerializedBlock, inputs: Record<string, any>): void {
    const { interface: blockInterface } = block.config;
    
    // Check if all required inputs are provided
    for (const [inputName, inputType] of Object.entries(blockInterface.inputs)) {
      if (!(inputName in inputs)) {
        throw new Error(`Missing required input '${inputName}' of type '${inputType}' for block ${block.id}`);
      }
      // Basic type validation (can be enhanced for more complex types)
      if (!this.validateType(inputs[inputName], inputType)) {
        throw new Error(`Invalid type for input '${inputName}' in block ${block.id}. Expected ${inputType}`);
      }
    }
  }

  private validateToolOutput(block: SerializedBlock, output: Record<string, any>): void {
    const { interface: blockInterface } = block.config;
    
    // Check if all promised outputs are present
    for (const [outputName, outputType] of Object.entries(blockInterface.outputs)) {
      if (!(outputName in output)) {
        throw new Error(`Tool output missing required field '${outputName}' of type '${outputType}' for block ${block.id}`);
      }
      // Basic type validation (can be enhanced for more complex types)
      if (!this.validateType(output[outputName], outputType)) {
        throw new Error(`Invalid type for output '${outputName}' in block ${block.id}. Expected ${outputType}`);
      }
    }
  }

  private validateType(value: any, expectedType: string): boolean {
    switch (expectedType.toLowerCase()) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null;
      case 'array':
        return Array.isArray(value);
      case 'function':
        return typeof value === 'function';
      default:
        // For complex types like 'Record<string, any>', 'string[]', etc.
        // We just do basic object/array validation
        return true;
    }
  }

  private determineExecutionOrder(): string[] {
    const { blocks, connections } = this.workflow;
    const order: string[] = [];
    const visited = new Set<string>();
    const inDegree = new Map<string, number>();
    
    blocks.forEach(block => inDegree.set(block.id, 0));
    connections.forEach(conn => {
      const target = conn.target;
      inDegree.set(target, (inDegree.get(target) || 0) + 1);
    });
    
    const queue = blocks
      .filter(block => (inDegree.get(block.id) || 0) === 0)
      .map(block => block.id);
    
    while (queue.length > 0) {
      const blockId = queue.shift()!;
      if (visited.has(blockId)) continue;
      
      visited.add(blockId);
      order.push(blockId);
      
      connections
        .filter(conn => conn.source === blockId)
        .forEach(conn => {
          const targetId = conn.target;
          inDegree.set(targetId, (inDegree.get(targetId) || 0) - 1);
          
          if (inDegree.get(targetId) === 0) {
            queue.push(targetId);
          }
        });
    }
    
    if (order.length !== blocks.length) {
      throw new Error('Workflow contains cycles');
    }
    
    return order;
  }

  private resolveInputs(
    block: SerializedBlock, 
    context: ExecutionContext
  ): Record<string, any> {
    const inputs: Record<string, any> = {};
    
    // Get all incoming connections for this block
    const incomingConnections = this.workflow.connections.filter(
      conn => conn.target === block.id
    );
    
    // Map outputs from previous blocks to inputs for this block
    incomingConnections.forEach(conn => {
      const sourceOutput = context.blockStates.get(conn.source);
      if (sourceOutput && conn.sourceHandle && conn.targetHandle) {
        inputs[conn.targetHandle] = sourceOutput[conn.sourceHandle];
      }
    });
    
    // If this is a start block, pass through workflow inputs
    if (Object.keys(inputs).length === 0 && context.input) {
      return context.input;
    }
    
    return inputs;
  }

  async execute(workflowId: string, input: Record<string, any>): Promise<ExecutionResult> {
    const startTime = new Date();
    const context: ExecutionContext = {
      workflowId,
      blockStates: new Map(),
      input,
      metadata: {
        startTime: startTime.toISOString()
      }
    };

    try {
      const executionOrder = this.determineExecutionOrder();
      
      for (const blockId of executionOrder) {
        const block = this.workflow.blocks.find(b => b.id === blockId);
        if (!block) {
          throw new Error(`Block ${blockId} not found in workflow`);
        }
        
        const blockInputs = this.resolveInputs(block, context);
        const result = await this.executeBlock(block, blockInputs, context);
        context.blockStates.set(blockId, result);
      }

      const lastBlockId = executionOrder[executionOrder.length - 1];
      const finalOutput = context.blockStates.get(lastBlockId);

      const endTime = new Date();
      return {
        success: true,
        data: finalOutput,
        metadata: {
          duration: endTime.getTime() - startTime.getTime(),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        }
      };
    } catch (error) {
      const endTime = new Date();
      return {
        success: false,
        data: {},
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          duration: endTime.getTime() - startTime.getTime(),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        }
      };
    }
  }
}
