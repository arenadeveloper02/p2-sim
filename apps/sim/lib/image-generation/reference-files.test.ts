/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { CONVERSATION_IMAGE_REF_SOURCE } from '@/lib/image-generation/reference-files'
import {
  buildReferenceFileValue,
  flattenReferenceFileInputs,
  isConversationImageRef,
  normalizeReferenceFileParams,
  parseReferenceFileValue,
} from '@/lib/image-generation/reference-files'
import { START_FILES_REF } from '@/executor/constants'

describe('reference-files', () => {
  it('parses legacy start.files-only value', () => {
    expect(parseReferenceFileValue(START_FILES_REF)).toEqual({
      includeStartFiles: true,
      workspaceFiles: [],
      conversationImages: [],
    })
  })

  it('parses mixed workspace, conversation, and start files', () => {
    const conversationImage = {
      source: CONVERSATION_IMAGE_REF_SOURCE,
      id: 'img-1',
      messageId: 'msg-1',
      name: 'Generated image',
      url: 'https://example.com/a.png',
      type: 'image/png',
    }

    const parsed = parseReferenceFileValue([
      START_FILES_REF,
      { name: 'logo.png', path: '/api/files/serve/ws/logo.png', size: 10, type: 'image/png' },
      conversationImage,
    ])

    expect(parsed.includeStartFiles).toBe(true)
    expect(parsed.workspaceFiles).toHaveLength(1)
    expect(parsed.conversationImages).toEqual([conversationImage])
    expect(isConversationImageRef(conversationImage)).toBe(true)
  })

  it('builds legacy string value when only start files are selected', () => {
    expect(
      buildReferenceFileValue({
        includeStartFiles: true,
        workspaceFiles: [],
        conversationImages: [],
      })
    ).toBe(START_FILES_REF)
  })

  it('flattens nested arrays from resolved start.files output', () => {
    const fileA = { id: 'a', name: 'a.png', url: '/a', size: 1, type: 'image/png', key: 'k1' }
    const fileB = { id: 'b', name: 'b.png', url: '/b', size: 2, type: 'image/png', key: 'k2' }
    const workspaceFile = { name: 'c.png', path: '/c', size: 3, type: 'image/png' }

    expect(flattenReferenceFileInputs([[fileA, fileB], workspaceFile])).toEqual([
      fileA,
      fileB,
      workspaceFile,
    ])
  })

  it('normalizes mixed reference file params for agent blocks', () => {
    const conversationFile = {
      source: CONVERSATION_IMAGE_REF_SOURCE,
      id: 'att-1',
      messageId: 'msg-1',
      name: 'notes.pdf',
      url: '/api/files/serve/workspace%2Fws-1%2Fnotes.pdf',
      type: 'application/pdf',
    }

    expect(normalizeReferenceFileParams([START_FILES_REF, conversationFile])).toEqual([
      START_FILES_REF,
      conversationFile,
    ])
  })
})
