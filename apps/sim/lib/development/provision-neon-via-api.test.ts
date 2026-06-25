/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { provisionNeonDatabaseViaApi } from '@/lib/development/provision-neon-via-api'

describe('provisionNeonDatabaseViaApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('creates a Neon project and sets DATABASE_URL on Vercel', async () => {
    const mockFetch = vi.mocked(fetch)

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            organizations: [{ id: 'org-test-1', name: 'Test Org' }],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            project: { id: 'neon-proj-1' },
            connection_uris: [
              {
                connection_uri:
                  'postgresql://user:pass@ep-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require',
              },
            ],
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ created: true }), { status: 201 }))

    const result = await provisionNeonDatabaseViaApi({
      neonApiKey: 'neon_test',
      vercelToken: 'vercel_test',
      vercelProjectId: 'prj_123',
      storeName: 'demo-db',
    })

    expect(result.success).toBe(true)
    expect(result.neonProjectId).toBe('neon-proj-1')
    expect(result.databaseUrl).toContain('postgresql://')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://console.neon.tech/api/v2/users/me/organizations',
      expect.objectContaining({ method: 'GET' })
    )
    expect(mockFetch).toHaveBeenCalledWith(
      'https://console.neon.tech/api/v2/projects',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('org-test-1'),
      })
    )
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v10/projects/prj_123/env?upsert=true'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('creates a project with an organization-scoped API key without org_id', async () => {
    const mockFetch = vi.mocked(fetch)

    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ organizations: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ projects: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            project: { id: 'neon-proj-2' },
            connection_uris: [
              {
                connection_uri:
                  'postgresql://user:pass@ep-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require',
              },
            ],
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ created: true }), { status: 201 }))

    const result = await provisionNeonDatabaseViaApi({
      neonApiKey: 'neon_org_scoped',
      vercelToken: 'vercel_test',
      vercelProjectId: 'prj_123',
      storeName: 'demo-db',
    })

    expect(result.success).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://console.neon.tech/api/v2/projects',
      expect.objectContaining({
        method: 'POST',
        body: expect.not.stringContaining('org_id'),
      })
    )
  })

  it('returns a clear error when org_id cannot be resolved', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ organizations: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'org_id is required' }), { status: 400 })
      )

    const result = await provisionNeonDatabaseViaApi({
      neonApiKey: 'neon_test',
      vercelToken: 'vercel_test',
      vercelProjectId: 'prj_123',
      storeName: 'demo-db',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('DEVELOPMENT_NEON_ORG_ID')
  })
})
