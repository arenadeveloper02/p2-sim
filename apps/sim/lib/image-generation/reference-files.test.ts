/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  applyAgentChatFilesToImageGeneratorTools,
  buildReferenceFileValue,
  CONVERSATION_IMAGE_REF_SOURCE,
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

  it('injects chat image files into unset image generator agent tools', () => {
    const imageFile = {
      id: 'file-1',
      name: 'ref.png',
      url: '/api/files/serve/workspace/ref.png',
      size: 12,
      type: 'image/png',
      key: 'workspace/ref.png',
    }
    const pdfFile = {
      id: 'file-2',
      name: 'notes.pdf',
      url: '/api/files/serve/workspace/notes.pdf',
      size: 20,
      type: 'application/pdf',
      key: 'workspace/notes.pdf',
    }
    const tools = [
      { type: 'image_generator_v2', params: { prompt: 'edit this' } },
      { type: 'function', params: {} },
    ]

    applyAgentChatFilesToImageGeneratorTools(tools, [imageFile, pdfFile])

    expect(tools[0]?.params).toEqual({
      prompt: 'edit this',
      inputImage: [imageFile],
    })
    expect(tools[1]?.params).toEqual({})
  })

  it('replaces unresolved start.files refs with resolved chat images', () => {
    const imageFile = {
      id: 'file-1',
      name: 'ref.png',
      url: '/api/files/serve/workspace/ref.png',
      size: 12,
      type: 'image/png',
      key: 'workspace/ref.png',
    }
    const tools = [{ type: 'image_generator_v2', params: { inputImage: START_FILES_REF } }]

    applyAgentChatFilesToImageGeneratorTools(tools, [imageFile])

    expect(tools[0]?.params?.inputImage).toEqual([imageFile])
  })

  it('does not overwrite configured image generator references', () => {
    const chatFile = {
      id: 'file-1',
      name: 'chat.png',
      url: '/api/files/serve/workspace/chat.png',
      size: 12,
      type: 'image/png',
      key: 'workspace/chat.png',
    }
    const configuredFile = {
      id: 'file-2',
      name: 'logo.png',
      url: '/api/files/serve/workspace/logo.png',
      size: 8,
      type: 'image/png',
      key: 'workspace/logo.png',
    }
    const tools = [
      {
        type: 'image_generator_v2',
        params: { inputImage: [configuredFile] },
      },
    ]

    applyAgentChatFilesToImageGeneratorTools(tools, [chatFile])

    expect(tools[0]?.params?.inputImage).toEqual([configuredFile])
  })
})
