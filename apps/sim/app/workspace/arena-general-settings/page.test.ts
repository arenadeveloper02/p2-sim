/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDehydrate, mockGetQueryClient, mockPrefetchGeneralSettings } = vi.hoisted(() => ({
  mockDehydrate: vi.fn(() => ({})),
  mockGetQueryClient: vi.fn(() => ({})),
  mockPrefetchGeneralSettings: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  dehydrate: mockDehydrate,
  HydrationBoundary: ({ children }: { children: unknown }) => children,
}))

vi.mock('@/app/_shell/providers/get-query-client', () => ({
  getQueryClient: mockGetQueryClient,
}))

vi.mock('@/app/workspace/[workspaceId]/settings/[section]/prefetch', () => ({
  prefetchGeneralSettings: mockPrefetchGeneralSettings,
}))

vi.mock('@/app/workspace/[workspaceId]/settings/components/general/general', () => ({
  General: () => null,
}))

import ArenaGeneralSettingsPage from '@/app/workspace/arena-general-settings/page'

describe('ArenaGeneralSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrefetchGeneralSettings.mockResolvedValue(undefined)
  })

  it('prefetches general settings without a workspace id', async () => {
    await ArenaGeneralSettingsPage()

    expect(mockPrefetchGeneralSettings).toHaveBeenCalledTimes(1)
    expect(mockPrefetchGeneralSettings.mock.calls[0]).toHaveLength(1)
  })
})
