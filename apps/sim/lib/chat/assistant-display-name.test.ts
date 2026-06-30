/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { resolveAssistantDisplayLabel } from '@/lib/chat/assistant-display-name'

describe('resolveAssistantDisplayLabel', () => {
  it('maps mothership and legacy copilot labels to Arena AI', () => {
    expect(resolveAssistantDisplayLabel('mothership')).toBe('Arena AI')
    expect(resolveAssistantDisplayLabel('Sim AI Copilot')).toBe('Arena AI')
    expect(resolveAssistantDisplayLabel('Arena AI Copilot')).toBe('Arena AI')
  })

  it('passes through subagent labels unchanged', () => {
    expect(resolveAssistantDisplayLabel('Workflow Agent')).toBe('Workflow Agent')
    expect(resolveAssistantDisplayLabel('Research Agent')).toBe('Research Agent')
  })

  it('defaults empty labels to Arena AI', () => {
    expect(resolveAssistantDisplayLabel('')).toBe('Arena AI')
    expect(resolveAssistantDisplayLabel(undefined)).toBe('Arena AI')
  })
})
