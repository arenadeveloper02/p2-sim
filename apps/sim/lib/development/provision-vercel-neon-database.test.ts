/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { provisionNeonDatabase } from '@/lib/development/provision-vercel-neon-database'

describe('provisionNeonDatabase via Vercel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('creates a Neon store and connects it to the Vercel project', async () => {
    const mockFetch = vi.mocked(fetch)

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 'icfg_neon',
              status: 'ready',
              installationType: 'marketplace',
              integration: { slug: 'neon' },
            },
          ]),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            products: [{ id: 'iap_neon_postgres', slug: 'neon-postgres', primaryProtocol: 'storage' }],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            store: {
              id: 'store_1',
              externalResourceId: 'neon-proj-1',
              status: 'available',
            },
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ envs: [{ key: 'DATABASE_URL' }] }), { status: 200 })
      )

    const result = await provisionNeonDatabase({
      vercelToken: 'vercel_test',
      vercelProjectId: 'prj_123',
      storeName: 'demo-db',
    })

    expect(result.success).toBe(true)
    expect(result.storeResourceId).toBe('store_1')
    expect(result.neonProjectId).toBe('neon-proj-1')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/storage/stores/integration/direct'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/resources/store_1/connections'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/env?target=production'),
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('returns a helpful error when Neon is not installed on Vercel', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ configurations: [] }), { status: 200 }))

    const result = await provisionNeonDatabase({
      vercelToken: 'vercel_test',
      vercelProjectId: 'prj_123',
      storeName: 'demo-db',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Neon is not installed on your Vercel account')
  })

  it('uses Neon API key path without querying Vercel marketplace', async () => {
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
            project: { id: 'neon-proj-api' },
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

    const result = await provisionNeonDatabase({
      vercelToken: 'vercel_test',
      vercelProjectId: 'prj_123',
      storeName: 'demo-db',
      neonApiKey: 'neon_test',
    })

    expect(result.success).toBe(true)
    expect(result.neonProjectId).toBe('neon-proj-api')
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/integrations/configurations'),
      expect.anything()
    )
  })

  it('falls back to Vercel marketplace when Neon org is Vercel-managed', async () => {
    const mockFetch = vi.mocked(fetch)

    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ organizations: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ projects: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ message: 'action restricted; reason:"organization is managed by Vercel"' }),
          { status: 403 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 'icfg_neon',
              status: 'ready',
              installationType: 'marketplace',
              integration: { slug: 'neon' },
            },
          ]),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            products: [{ id: 'iap_neon_postgres', slug: 'neon-postgres', primaryProtocol: 'storage' }],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            store: {
              id: 'store_1',
              externalResourceId: 'neon-proj-1',
              status: 'available',
            },
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ envs: [{ key: 'DATABASE_URL', target: 'production' }] }), {
          status: 200,
        })
      )

    const result = await provisionNeonDatabase({
      vercelToken: 'vercel_test',
      vercelProjectId: 'prj_123',
      storeName: 'demo-db',
      neonApiKey: 'neon_test',
    })

    expect(result.success).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/storage/stores/integration/direct'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('uses DEVELOPMENT_VERCEL_NEON_INTEGRATION_CONFIG_ID when provided', async () => {
    const mockFetch = vi.mocked(fetch)

    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'icfg_override' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            products: [{ id: 'iap_neon_postgres', slug: 'neon-postgres', primaryProtocol: 'storage' }],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            store: {
              id: 'store_1',
              externalResourceId: 'neon-proj-1',
              status: 'available',
            },
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ envs: [{ key: 'DATABASE_URL', target: 'production' }] }), {
          status: 200,
        })
      )

    const result = await provisionNeonDatabase({
      vercelToken: 'vercel_test',
      vercelProjectId: 'prj_123',
      storeName: 'demo-db',
      integrationConfigurationId: 'icfg_override',
    })

    expect(result.success).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/integrations/configuration/icfg_override'),
      expect.objectContaining({ method: 'GET' })
    )
  })
})
