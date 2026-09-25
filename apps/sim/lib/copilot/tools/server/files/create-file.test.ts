/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExecuteFileUseCase } = vi.hoisted(() => ({
  mockExecuteFileUseCase: vi.fn(),
}))

vi.mock('@/lib/copilot/application/execute-file-use-case', () => ({
  executeCopilotFileUseCase: mockExecuteFileUseCase,
}))

vi.mock('@/lib/workspace-files/application/write-workspace-file-by-path', () => ({
  createWorkspaceFileByPath: vi.fn(),
  updateWorkspaceFileContentByPath: vi.fn(),
}))

import { createFileServerTool } from '@/lib/copilot/tools/server/files/create-file'

describe('createFileServerTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecuteFileUseCase.mockImplementation(
      async (_ctx: unknown, _useCase: unknown, input: { path: string; content: string }) => ({
        id: 'file-1',
        name: input.path.split('/').pop() ?? input.path,
        vfsPath: input.path,
        size: Buffer.byteLength(input.content, 'utf-8'),
      })
    )
  })

  it('writes markdown content when content is provided', async () => {
    const result = await createFileServerTool.execute(
      {
        fileName: 'files/notes.md',
        content: '# Hello\n\nBody text',
      },
      { userId: 'user-1', workspaceId: 'ws-1' }
    )

    expect(result.success).toBe(true)
    expect(result.data?.size).toBeGreaterThan(0)
    expect(mockExecuteFileUseCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        path: 'files/notes.md',
        content: '# Hello\n\nBody text',
      })
    )
  })

  it('rejects empty text/json create without content', async () => {
    const result = await createFileServerTool.execute(
      { outputs: { files: [{ path: 'files/notes.md', mode: 'create' }] } },
      { userId: 'user-1', workspaceId: 'ws-1' }
    )

    expect(result.success).toBe(false)
    expect(result.message).toContain('requires non-empty')
    expect(mockExecuteFileUseCase).not.toHaveBeenCalled()
  })

  it('creates an empty office shell when content is omitted', async () => {
    const result = await createFileServerTool.execute(
      { outputs: { files: [{ path: 'files/Deck.pptx', mode: 'create' }] } },
      { userId: 'user-1', workspaceId: 'ws-1' }
    )

    expect(result.success).toBe(true)
    expect(result.data?.size).toBe(0)
    expect(result.message).toContain('Empty file shell')
    expect(mockExecuteFileUseCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        path: 'files/Deck.pptx',
        content: '',
      })
    )
  })

  it('stringifies object content for json files', async () => {
    const result = await createFileServerTool.execute(
      {
        fileName: 'files/samples.json',
        content: { samples: [{ id: 1 }] },
      },
      { userId: 'user-1', workspaceId: 'ws-1' }
    )

    expect(result.success).toBe(true)
    expect(mockExecuteFileUseCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        path: 'files/samples.json',
        content: JSON.stringify({ samples: [{ id: 1 }] }, null, 2),
      })
    )
  })
})
