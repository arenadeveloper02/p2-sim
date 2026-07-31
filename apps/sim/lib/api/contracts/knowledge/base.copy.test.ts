/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { copyKnowledgeBaseBodySchema } from '@/lib/api/contracts/knowledge/base'

describe('copyKnowledgeBaseBodySchema', () => {
  it('requires targetWorkspaceId', () => {
    const result = copyKnowledgeBaseBodySchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('accepts targetWorkspaceId alone', () => {
    const result = copyKnowledgeBaseBodySchema.safeParse({
      targetWorkspaceId: 'ws-target',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.targetWorkspaceId).toBe('ws-target')
      expect(result.data.name).toBeUndefined()
    }
  })

  it('accepts an optional name', () => {
    const result = copyKnowledgeBaseBodySchema.safeParse({
      targetWorkspaceId: 'ws-target',
      name: 'My Copy',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('My Copy')
    }
  })

  it('rejects an empty name when provided', () => {
    const result = copyKnowledgeBaseBodySchema.safeParse({
      targetWorkspaceId: 'ws-target',
      name: '',
    })
    expect(result.success).toBe(false)
  })
})
