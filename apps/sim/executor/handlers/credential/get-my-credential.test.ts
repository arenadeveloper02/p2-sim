/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveMyCredential } from '@/executor/handlers/credential/get-my-credential'
import type { ExecutionContext } from '@/executor/types'

const { mockGetAccessibleOAuthCredentials, mockSyncWorkspaceOAuthCredentialsForUser } = vi.hoisted(
  () => ({
    mockGetAccessibleOAuthCredentials: vi.fn(),
    mockSyncWorkspaceOAuthCredentialsForUser: vi.fn(),
  })
)

vi.mock('@/lib/credentials/environment', () => ({
  getAccessibleOAuthCredentials: mockGetAccessibleOAuthCredentials,
}))

vi.mock('@/lib/credentials/oauth', () => ({
  syncWorkspaceOAuthCredentialsForUser: mockSyncWorkspaceOAuthCredentialsForUser,
}))

function createContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    workflowId: 'workflow-1',
    workspaceId: 'workspace-1',
    userId: 'user-1',
    blockStates: new Map(),
    blockLogs: [],
    metadata: { duration: 0 },
    environmentVariables: {},
    decisions: { router: new Map(), condition: new Map() },
    loopExecutions: new Map(),
    executedBlocks: new Set(),
    activeExecutionPath: new Set(),
    completedLoops: new Set(),
    ...overrides,
  }
}

describe('resolveMyCredential', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSyncWorkspaceOAuthCredentialsForUser.mockResolvedValue({ updatedMemberships: 0 })
  })

  it('returns the current user credential for the selected provider', async () => {
    mockGetAccessibleOAuthCredentials.mockResolvedValue([
      {
        id: 'cred-mine',
        providerId: 'google-docs',
        displayName: 'My Google Docs',
        role: 'admin',
        updatedAt: new Date('2026-06-18T10:48:28.520Z'),
      },
    ])

    const output = await resolveMyCredential(createContext(), {
      myProviderId: 'google-docs',
    })

    expect(output).toEqual({
      myCredentialId: 'cred-mine',
      myDisplayName: 'My Google Docs',
      myProviderId: 'google-docs',
    })
  })

  it('throws when no credential exists for the provider', async () => {
    mockGetAccessibleOAuthCredentials.mockResolvedValue([])

    await expect(
      resolveMyCredential(createContext(), { myProviderId: 'google-docs' })
    ).rejects.toThrow('No connected Google Docs credential found for the current user')
  })
})
