/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  MODEL_WAIT_STATUS_MESSAGES,
  buildToolHeartbeatStatus,
  buildToolStartStatus,
  truncateStatusMessage,
} from '@/local-copilot/lib/agent/status-messages'

describe('status-messages', () => {
  it('has model-wait copy', () => {
    expect(MODEL_WAIT_STATUS_MESSAGES[0]).toBe('Planning next step…')
    expect(MODEL_WAIT_STATUS_MESSAGES.length).toBeGreaterThan(1)
  })

  it('labels file tools with filename', () => {
    expect(buildToolStartStatus('edit_content', { fileName: 'Deck.pptx' })).toContain('Deck.pptx')
    expect(buildToolStartStatus('workspace_file', { name: 'notes.md' })).toMatch(
      /Creating|Writing|Updating/
    )
  })

  it('labels workflow and app tools', () => {
    expect(buildToolStartStatus('run_workflow', { workflowName: 'Onboard' })).toMatch(/workflow/i)
    expect(buildToolStartStatus('development_generate_app', {})).toMatch(/app/i)
  })

  it('falls back to humanized tool name', () => {
    expect(buildToolStartStatus('some_unknown_tool', {})).toMatch(/Running/)
  })

  it('heartbeat softens the last message', () => {
    const start = buildToolStartStatus('edit_content', { fileName: 'Deck.pptx' })
    expect(buildToolHeartbeatStatus(start, 'edit_content', { fileName: 'Deck.pptx' })).toMatch(
      /Still|working/i
    )
  })

  it('truncates long messages', () => {
    expect(truncateStatusMessage('a'.repeat(100)).length).toBeLessThanOrEqual(80)
  })
})
