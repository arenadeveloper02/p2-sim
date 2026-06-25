/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveMyCredential } from '@/executor/handlers/credential/get-my-credential'
import type { ExecutionContext } from '@/executor/types'

const {
  mockGetWorkspaceOAuthCredentialsForUserProvider,
  mockSyncWorkspaceOAuthCredentialsForUser,
} = vi.hoisted(() => ({
  mockGetWorkspaceOAuthCredentialsForUserProvider: vi.fn(),
  mockSyncWorkspaceOAuthCredentialsForUser: vi.fn(),
}))

vi.mock('@/lib/credentials/oauth', () => ({
  getWorkspaceOAuthCredentialsForUserProvider: mockGetWorkspaceOAuthCredentialsForUserProvider,
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
    mockGetWorkspaceOAuthCredentialsForUserProvider.mockResolvedValue([
      {
        id: 'cred-mine',
        providerId: 'google-docs',
        displayName: 'My Google Docs',
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

  it('prefers sessionUserId over ctx.userId for chat and client executions', async () => {
    mockGetWorkspaceOAuthCredentialsForUserProvider.mockResolvedValue([
      {
        id: 'cred-visitor',
        providerId: 'google-drive',
        displayName: 'Visitor Drive',
        updatedAt: new Date('2026-06-18T10:48:28.520Z'),
      },
    ])

    await resolveMyCredential(
      createContext({
        userId: 'workspace-owner',
        metadata: { duration: 0, sessionUserId: 'logged-in-user' },
      }),
      { myProviderId: 'google-drive' }
    )

    expect(mockGetWorkspaceOAuthCredentialsForUserProvider).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      userId: 'logged-in-user',
      providerId: 'google-drive',
    })
  })

  it('prefers the most recently updated credential owned by the current user', async () => {
    mockGetWorkspaceOAuthCredentialsForUserProvider.mockResolvedValue([
      {
        id: 'cred-older',
        providerId: 'google-drive',
        displayName: 'My Drive (older)',
        updatedAt: new Date('2026-06-01T10:00:00.000Z'),
      },
      {
        id: 'cred-newer',
        providerId: 'google-drive',
        displayName: 'My Drive (newer)',
        updatedAt: new Date('2026-06-18T10:48:28.520Z'),
      },
    ])

    const output = await resolveMyCredential(createContext(), {
      myProviderId: 'google-drive',
    })

    expect(output).toEqual({
      myCredentialId: 'cred-newer',
      myDisplayName: 'My Drive (newer)',
      myProviderId: 'google-drive',
    })
  })

  it('throws when no credential exists for the provider', async () => {
    mockGetWorkspaceOAuthCredentialsForUserProvider.mockResolvedValue([])

    await expect(
      resolveMyCredential(createContext(), { myProviderId: 'google-docs' })
    ).rejects.toThrow('No connected Google Docs credential found for the current user')
  })
})
