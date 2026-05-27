import { createEnvMock } from '@sim/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  filterOAuthItemsForWorkspace,
  getAdminWorkspaceContext,
  getAdminWorkspaceIds,
  isAdminWorkspace,
  isAdminWorkspaceOnlyOAuthProvider,
  parseAdminWorkspaceIds,
} from './is-admin-workspace'

vi.mock('@/lib/core/config/env', () =>
  createEnvMock({
    ADMIN_WORKSPACE_IDS: '["ws-admin-1","ws-admin-2"]',
  })
)

afterEach(() => {
  vi.clearAllMocks()
})

describe('parseAdminWorkspaceIds', () => {
  it('parses env array values', () => {
    expect(parseAdminWorkspaceIds(['ws-1', ' ws-2 '])).toEqual(['ws-1', 'ws-2'])
  })

  it('parses JSON array string values', () => {
    expect(parseAdminWorkspaceIds('["ws-json-1","ws-json-2"]')).toEqual(['ws-json-1', 'ws-json-2'])
  })

  it('parses comma-separated string values', () => {
    expect(parseAdminWorkspaceIds('ws-csv-1, ws-csv-2')).toEqual(['ws-csv-1', 'ws-csv-2'])
  })

  it('returns empty array for missing or empty input', () => {
    expect(parseAdminWorkspaceIds(undefined)).toEqual([])
    expect(parseAdminWorkspaceIds('')).toEqual([])
    expect(parseAdminWorkspaceIds('   ')).toEqual([])
  })
})

describe('getAdminWorkspaceIds', () => {
  it('returns workspace IDs from env JSON array string', () => {
    expect(getAdminWorkspaceIds()).toEqual(['ws-admin-1', 'ws-admin-2'])
  })
})

describe('isAdminWorkspace', () => {
  it('returns true when workspace id is in ADMIN_WORKSPACE_IDS', () => {
    expect(isAdminWorkspace('ws-admin-1')).toBe(true)
    expect(isAdminWorkspace(' ws-admin-2 ')).toBe(true)
  })

  it('returns false when workspace id is not in ADMIN_WORKSPACE_IDS', () => {
    expect(isAdminWorkspace('ws-other')).toBe(false)
  })

  it('returns false for missing or invalid workspace id', () => {
    expect(isAdminWorkspace('')).toBe(false)
    expect(isAdminWorkspace('   ')).toBe(false)
    expect(isAdminWorkspace(null)).toBe(false)
    expect(isAdminWorkspace(undefined)).toBe(false)
  })
})

describe('isAdminWorkspaceOnlyOAuthProvider', () => {
  it('identifies zoom-admin as admin-only', () => {
    expect(isAdminWorkspaceOnlyOAuthProvider('zoom-admin')).toBe(true)
    expect(isAdminWorkspaceOnlyOAuthProvider('zoom')).toBe(false)
  })
})

describe('filterOAuthItemsForWorkspace', () => {
  const items = [
    { providerId: 'zoom', name: 'Zoom' },
    { providerId: 'zoom-admin', name: 'Zoom (Admin)' },
  ]

  it('returns all items for admin workspaces', () => {
    expect(filterOAuthItemsForWorkspace(items, 'ws-admin-1')).toEqual(items)
  })

  it('removes admin-only providers for non-admin workspaces', () => {
    expect(filterOAuthItemsForWorkspace(items, 'ws-other')).toEqual([items[0]])
  })
})

describe('getAdminWorkspaceContext', () => {
  it('returns isAdminWorkspace and normalized workspaceId for API payloads', () => {
    expect(getAdminWorkspaceContext(' ws-admin-1 ')).toEqual({
      isAdminWorkspace: true,
      workspaceId: 'ws-admin-1',
    })
  })

  it('returns false when workspace is not configured as admin', () => {
    expect(getAdminWorkspaceContext('ws-other')).toEqual({
      isAdminWorkspace: false,
      workspaceId: 'ws-other',
    })
  })
})
