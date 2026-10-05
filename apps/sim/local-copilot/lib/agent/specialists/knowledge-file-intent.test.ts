/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { classifyLocalCopilotIntent } from '@/local-copilot/lib/agent/specialists/classify'
import { resolveHybridParentTools } from '@/local-copilot/lib/agent/specialists/domains'
import { getParentSpecialistToolDefinitions } from '@/local-copilot/lib/agent/specialists/specialist-tools'
import type { LocalCopilotToolDefinition } from '@/local-copilot/lib/types'

describe('local copilot routes via full catalog + tool calling', () => {
  it('does not classify messages with domain heuristics', () => {
    const intent = classifyLocalCopilotIntent(
      'Create a knowledgebase that has some document like biriyani recipes'
    )
    expect(intent).toEqual({
      primary: 'general',
      secondary: [],
      useFullCatalog: true,
    })
  })

  it('exposes create_file, workspace_file, edit_content, and knowledge_base', () => {
    const intent = classifyLocalCopilotIntent('Create a 12-slide investor pitch deck')
    const allTools: LocalCopilotToolDefinition[] = [
      'create_file',
      'workspace_file',
      'edit_content',
      'knowledge_base',
      'search_online',
    ].map((name) => ({
      name,
      description: name,
      parameters: { type: 'object', properties: {} },
    }))
    const hybrid = resolveHybridParentTools({
      allTools,
      intent,
      specialistTools: getParentSpecialistToolDefinitions(),
    })
    expect(hybrid.usedFullCatalog).toBe(true)
    const names = new Set(hybrid.tools.map((tool) => tool.name))
    expect(names.has('create_file')).toBe(true)
    expect(names.has('workspace_file')).toBe(true)
    expect(names.has('edit_content')).toBe(true)
    expect(names.has('knowledge_base')).toBe(true)
  })
})
