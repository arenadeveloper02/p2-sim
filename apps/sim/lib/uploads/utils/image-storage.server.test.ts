/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockExistsSync,
  mockMkdir,
  mockWriteFile,
  mockUnlink,
  mockJoin,
  mockGetBaseUrl,
  mockRandomUUID,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockMkdir: vi.fn(),
  mockWriteFile: vi.fn(),
  mockUnlink: vi.fn(),
  mockJoin: vi.fn((...parts: string[]) => parts.join('/')),
  mockGetBaseUrl: vi.fn(),
  mockRandomUUID: vi.fn(),
}))

vi.mock('crypto', () => ({
  randomUUID: mockRandomUUID,
}))

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  promises: {
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
    unlink: mockUnlink,
  },
}))

vi.mock('path', () => ({
  join: mockJoin,
}))

vi.mock('@/lib/core/utils/urls', () => ({
  getBaseUrl: mockGetBaseUrl,
}))

vi.mock('@/lib/uploads/config', () => ({
  USE_S3_STORAGE: false,
  S3_AGENT_GENERATED_IMAGES_CONFIG: {
    bucket: '',
    region: '',
  },
}))

vi.mock('@/lib/uploads/core/storage-service', () => ({
  uploadFile: vi.fn(),
}))

import { saveGeneratedImage } from '@/lib/uploads/utils/image-storage.server'

describe('saveGeneratedImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(true)
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    mockUnlink.mockResolvedValue(undefined)
    mockGetBaseUrl.mockReturnValue('http://localhost:3000')
    mockRandomUUID.mockReturnValueOnce('uuid-1').mockReturnValueOnce('uuid-2')
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
  })

  it('creates unique file paths when multiple images save in the same millisecond', async () => {
    const base64Image = Buffer.from('image-bytes').toString('base64')

    const first = await saveGeneratedImage(base64Image, 'workflow-1', 'user-1')
    const second = await saveGeneratedImage(base64Image, 'workflow-1', 'user-1')

    expect(first.url).toBe(
      'http://localhost:3000/api/files/serve/agent-generated-images/workflow-1/user-1/1700000000000-uuid-1.png'
    )
    expect(second.url).toBe(
      'http://localhost:3000/api/files/serve/agent-generated-images/workflow-1/user-1/1700000000000-uuid-2.png'
    )
    expect(mockWriteFile).toHaveBeenCalledTimes(2)
    expect(mockWriteFile.mock.calls[0]?.[0]).not.toBe(mockWriteFile.mock.calls[1]?.[0])
  })
})
