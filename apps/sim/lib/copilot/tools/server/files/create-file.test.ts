/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExecuteCopilotFileUseCase } = vi.hoisted(() => ({
  mockExecuteCopilotFileUseCase: vi.fn(),
}))

vi.mock('@/lib/copilot/application/execute-file-use-case', () => ({
  executeCopilotFileUseCase: mockExecuteCopilotFileUseCase,
}))

vi.mock('@/lib/uploads/contexts/workspace/workspace-file-secret-provenance', () => ({
  EXACT_EMPTY_WORKSPACE_FILE_SECRET_PROVENANCE: { status: 'exact', entries: [] },
  createWorkspaceFileSecretProvenanceFromRegistry: vi.fn(async () => ({
    safe: true,
    provenance: { status: 'exact', entries: [] },
  })),
}))

import { createFileServerTool } from '@/lib/copilot/tools/server/files/create-file'

describe('createFileServerTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes markdown content when content is provided', async () => {
    mockExecuteCopilotFileUseCase.mockResolvedValue({
      id: 'file-1',
      name: 'notes.md',
      vfsPath: 'files/notes.md',
      size: Buffer.byteLength('# Hello\n\nBody text', 'utf-8'),
    })

    const result = await createFileServerTool.execute(
      {
        fileName: 'files/notes.md',
        content: '# Hello\n\nBody text',
      },
      { userId: 'user-1', workspaceId: 'ws-1' }
    )

    expect(result.success).toBe(true)
    expect(result.data?.size).toBeGreaterThan(0)
    expect(mockExecuteCopilotFileUseCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        content: '# Hello\n\nBody text',
      })
    )
  })

  it('creates an empty shell when content is omitted', async () => {
    mockExecuteCopilotFileUseCase.mockResolvedValue({
      id: 'file-1',
      name: 'notes.md',
      vfsPath: 'files/notes.md',
      size: 0,
    })

    const result = await createFileServerTool.execute(
      { outputs: { files: [{ path: 'files/notes.md', mode: 'create' }] } },
      { userId: 'user-1', workspaceId: 'ws-1' }
    )

    expect(result.success).toBe(true)
    expect(result.data?.size).toBe(0)
    expect(result.message).toContain('Empty file shell')
    expect(mockExecuteCopilotFileUseCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        content: '',
      })
    )
  })
})
