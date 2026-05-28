import { describe, expect, it } from 'vitest'
import { inferContextFromKey, parseInternalFileUrl } from '@/lib/uploads/utils/file-utils'

describe('file-utils storage context inference', () => {
  it('recognizes agent-generated image storage keys', () => {
    expect(
      inferContextFromKey('agent-generated-images/workflow-id/user-id/generated-image.jpeg')
    ).toBe('agent-generated-images')
  })

  it('parses agent-generated image serve URLs', () => {
    expect(
      parseInternalFileUrl(
        '/api/files/serve/agent-generated-images%2Fworkflow-id%2Fuser-id%2Fgenerated-image.jpeg'
      )
    ).toEqual({
      key: 'agent-generated-images/workflow-id/user-id/generated-image.jpeg',
      context: 'agent-generated-images',
    })
  })
})
