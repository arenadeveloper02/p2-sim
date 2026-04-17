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
  mockGenerateShortId,
  mockUploadFile,
  mockS3Config,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockMkdir: vi.fn(),
  mockWriteFile: vi.fn(),
  mockUnlink: vi.fn(),
  mockJoin: vi.fn((...parts: string[]) => parts.join('/')),
  mockGetBaseUrl: vi.fn(),
  mockGenerateShortId: vi.fn(),
  mockUploadFile: vi.fn(),
  mockS3Config: {
    USE_S3_STORAGE: false,
    bucket: '',
    region: '',
  },
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

vi.mock('@/lib/core/utils/uuid', () => ({
  generateShortId: mockGenerateShortId,
}))

vi.mock('@/lib/uploads/config', () => ({
  get USE_S3_STORAGE() {
    return mockS3Config.USE_S3_STORAGE
  },
  get S3_AGENT_GENERATED_IMAGES_CONFIG() {
    return {
      bucket: mockS3Config.bucket,
      region: mockS3Config.region,
    }
  },
}))

vi.mock('@/lib/uploads/core/storage-service', () => ({
  uploadFile: mockUploadFile,
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
    mockGenerateShortId.mockReturnValueOnce('id1').mockReturnValueOnce('id2')
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    mockS3Config.USE_S3_STORAGE = false
    mockS3Config.bucket = ''
    mockS3Config.region = ''
  })

  it('creates unique file paths when multiple images save in the same millisecond (local)', async () => {
    const base64Image = Buffer.from('image-bytes').toString('base64')

    const first = await saveGeneratedImage(base64Image, 'workflow-1', 'user-1')
    const second = await saveGeneratedImage(base64Image, 'workflow-1', 'user-1')

    expect(first.url).toBe(
      'http://localhost:3000/api/files/serve/agent-generated-images/workflow-1/user-1/1700000000000-id1.png'
    )
    expect(second.url).toBe(
      'http://localhost:3000/api/files/serve/agent-generated-images/workflow-1/user-1/1700000000000-id2.png'
    )
    expect(mockWriteFile).toHaveBeenCalledTimes(2)
    expect(mockWriteFile.mock.calls[0]?.[0]).not.toBe(mockWriteFile.mock.calls[1]?.[0])
  })

  it('uses generateShortId() in the S3 key when cloud storage is enabled', async () => {
    mockS3Config.USE_S3_STORAGE = true
    mockUploadFile.mockResolvedValue({
      path: '/api/files/serve/s3-key',
      key: 'agent-generated-images/workflow-1/user-1/1700000000000-id1.png',
      s3UploadFailed: false,
    })

    const base64Image = Buffer.from('image-bytes').toString('base64')
    const result = await saveGeneratedImage(base64Image, 'workflow-1', 'user-1')

    expect(mockUploadFile).toHaveBeenCalledTimes(1)
    expect(mockWriteFile).not.toHaveBeenCalled()
    const uploadArgs = mockUploadFile.mock.calls[0]?.[0]
    expect(uploadArgs?.fileName).toBe(
      'agent-generated-images/workflow-1/user-1/1700000000000-id1.png'
    )
    expect(uploadArgs?.preserveKey).toBe(true)
    expect(result.url).toBe('http://localhost:3000/api/files/serve/s3-key')
  })
})
