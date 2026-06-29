/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { getMothershipChatPath } from '@/app/workspace/[workspaceId]/home/mothership-chat-path'

describe('getMothershipChatPath', () => {
  it('returns the standard chat route by default', () => {
    expect(getMothershipChatPath('ws-1', 'chat-1')).toBe('/workspace/ws-1/chat/chat-1')
  })

  it('returns the task embed route when embed is true', () => {
    expect(getMothershipChatPath('ws-1', 'chat-1', { embed: true })).toBe(
      '/workspace/ws-1/task/chat-1/embed'
    )
  })

  it('preserves query strings', () => {
    expect(getMothershipChatPath('ws-1', 'chat-1', { embed: true, search: '?role=exec' })).toBe(
      '/workspace/ws-1/task/chat-1/embed?role=exec'
    )
    expect(getMothershipChatPath('ws-1', 'chat-1', { search: 'resource=wf-1' })).toBe(
      '/workspace/ws-1/chat/chat-1?resource=wf-1'
    )
  })
})
