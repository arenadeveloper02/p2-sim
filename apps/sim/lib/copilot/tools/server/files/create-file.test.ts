/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockWriteWorkspaceFileByPath, mockEnsureWorkspaceAccess } = vi.hoisted(() => ({
  mockWriteWorkspaceFileByPath: vi.fn(),
  mockEnsureWorkspaceAccess: vi.fn(),
}))

vi.mock('@/lib/copilot/tools/handlers/access', () => ({
  ensureWorkspaceAccess: mockEnsureWorkspaceAccess,
}))

vi.mock('@/lib/copilot/vfs/resource-writer', () => ({
  writeWorkspaceFileByPath: mockWriteWorkspaceFileByPath,
}))

import { createFileServerTool } from '@/lib/copilot/tools/server/files/create-file'

describe('createFileServerTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureWorkspaceAccess.mockResolvedValue(undefined)
    mockWriteWorkspaceFileByPath.mockResolvedValue({
      id: 'file-1',
      name: 'notes.md',
      vfsPath: 'files/notes.md',
      backingVfsPath: 'files/notes.md',
    })
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
    expect(mockWriteWorkspaceFileByPath).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: Buffer.from('# Hello\n\nBody text', 'utf-8'),
      })
    )
  })

  it('creates an empty shell when content is omitted', async () => {
    const result = await createFileServerTool.execute(
      { outputs: { files: [{ path: 'files/notes.md', mode: 'create' }] } },
      { userId: 'user-1', workspaceId: 'ws-1' }
    )

    expect(result.success).toBe(true)
    expect(result.data?.size).toBe(0)
    expect(result.message).toContain('Empty file shell')
    expect(mockWriteWorkspaceFileByPath).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: Buffer.from('', 'utf-8'),
      })
    )
  })
})
