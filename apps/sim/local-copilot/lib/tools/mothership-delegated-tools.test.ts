/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildMothershipDelegatedToolDefinitions,
  isMothershipDelegatedTool,
  MOTHERSHIP_DELEGATED_TOOL_NAMES,
  resolveWorkflowIdForDelegatedTool,
} from '@/local-copilot/lib/tools/mothership-delegated-tools'
import { LOCAL_COPILOT_TOOLS } from '@/local-copilot/lib/tools/definitions'
import type { LocalCopilotStructuredContext } from '@/local-copilot/lib/types'
import type { ToolExecutionContext } from '@/local-copilot/lib/tools/executor'

describe('mothership-delegated-tools', () => {
  it('includes run and debug tools in LOCAL_COPILOT_TOOLS', () => {
    const names = LOCAL_COPILOT_TOOLS.map((tool) => tool.name)
    for (const toolName of MOTHERSHIP_DELEGATED_TOOL_NAMES) {
      expect(names).toContain(toolName)
    }
  })

  it('builds definitions with parameters from runtime schemas', () => {
    const defs = buildMothershipDelegatedToolDefinitions()
    const runWorkflow = defs.find((tool) => tool.name === 'run_workflow')
    expect(runWorkflow).toBeDefined()
    expect(runWorkflow?.parameters).toMatchObject({ type: 'object' })

    const functionExecute = defs.find((tool) => tool.name === 'function_execute')
    expect(functionExecute).toBeDefined()
    expect(functionExecute?.parameters).toMatchObject({ type: 'object' })

    const editContent = defs.find((tool) => tool.name === 'edit_content')
    expect(editContent).toBeDefined()

    const deployChat = defs.find((tool) => tool.name === 'deploy_chat')
    expect(deployChat).toBeDefined()
    expect(deployChat?.parameters).toMatchObject({ type: 'object' })

    const createFile = defs.find((tool) => tool.name === 'create_file')
    expect(createFile?.parameters).toMatchObject({
      type: 'object',
      properties: expect.objectContaining({
        content: expect.objectContaining({ type: 'string' }),
      }),
    })
  })

  it('identifies delegated tool names', () => {
    expect(isMothershipDelegatedTool('run_workflow')).toBe(true)
    expect(isMothershipDelegatedTool('deploy_chat')).toBe(true)
    expect(isMothershipDelegatedTool('edit_workflow')).toBe(false)
  })

  it('resolves workflow id by name or single-workflow fallback', () => {
    const structuredContext = {
      workspaceWorkflows: [
        { id: 'wf-1', name: 'Weekly Email Summary' },
        { id: 'wf-2', name: 'Bus Image (Quick)' },
      ],
    } as LocalCopilotStructuredContext

    const ctx = {
      userId: 'user-1',
      workspaceId: 'ws-1',
      structuredContext,
    } as ToolExecutionContext

    expect(
      resolveWorkflowIdForDelegatedTool({ workflowId: 'Weekly Email Summary' }, ctx)
    ).toBe('wf-1')

    expect(
      resolveWorkflowIdForDelegatedTool({ workflowId: 'Bus Image Quick' }, ctx)
    ).toBe('wf-2')

    expect(
      resolveWorkflowIdForDelegatedTool({ workflowId: 'bus image quick' }, ctx)
    ).toBe('wf-2')

    expect(
      resolveWorkflowIdForDelegatedTool(
        {},
        {
          ...ctx,
          structuredContext: {
            workspaceWorkflows: [{ id: 'wf-only', name: 'Only Workflow' }],
          } as LocalCopilotStructuredContext,
        }
      )
    ).toBe('wf-only')
  })
})
