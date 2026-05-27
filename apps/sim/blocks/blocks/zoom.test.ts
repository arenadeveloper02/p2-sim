import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockIsAdminWorkspace, mockResolveWorkspaceIdForAdminCheck } = vi.hoisted(() => ({
  mockIsAdminWorkspace: vi.fn(() => false),
  mockResolveWorkspaceIdForAdminCheck: vi.fn(() => 'ws-normal'),
}))

vi.mock('@/lib/workspaces/is-admin-workspace', () => ({
  isAdminWorkspace: mockIsAdminWorkspace,
  resolveWorkspaceIdForAdminCheck: mockResolveWorkspaceIdForAdminCheck,
}))

import { ZoomBlock } from '@/blocks/blocks/zoom'

describe('ZoomBlock', () => {
  const paramsFunction = ZoomBlock.tools.config?.params
  const toolFunction = ZoomBlock.tools.config?.tool

  if (!paramsFunction || !toolFunction) {
    throw new Error('ZoomBlock.tools.config is missing')
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAdminWorkspace.mockReturnValue(false)
    mockResolveWorkspaceIdForAdminCheck.mockReturnValue('ws-normal')
  })

  it('shows a single Zoom credential input with personal and admin connect paths', () => {
    const credential = ZoomBlock.subBlocks.find((subBlock) => subBlock.id === 'credential')
    const manualCredential = ZoomBlock.subBlocks.find((subBlock) => subBlock.id === 'manualCredential')
    const adminCredential = ZoomBlock.subBlocks.find((subBlock) => subBlock.id === 'credentialAdmin')
    const adminManualCredential = ZoomBlock.subBlocks.find(
      (subBlock) => subBlock.id === 'manualCredentialAdmin'
    )

    expect(credential?.title).toBe('Zoom account')
    expect(credential?.required).toBe(true)
    expect(credential?.additionalConnectOptions).toEqual([
      {
        label: 'Connect Zoom admin account',
        serviceId: 'zoom-admin',
      },
    ])
    expect(credential?.placeholder).toBe('Select or connect Zoom account')

    expect(manualCredential?.title).toBe('Zoom account')
    expect(manualCredential?.required).toBe(true)
    expect(manualCredential?.placeholder).toBe('Zoom credential ID')

    expect(adminCredential).toBeUndefined()
    expect(adminManualCredential).toBeUndefined()
  })

  it('uses the selected credential for normal Zoom operations', () => {
    const result = paramsFunction({
      operation: 'zoom_list_meetings',
      oauthCredential: 'selected-cred',
      userId: 'me',
    })

    expect(result.credential).toBe('selected-cred')
  })

  it('hides account recording operations outside admin workspaces', () => {
    const operationSubBlock = ZoomBlock.subBlocks.find((subBlock) => subBlock.id === 'operation')
    const options =
      typeof operationSubBlock?.options === 'function'
        ? operationSubBlock.options()
        : operationSubBlock?.options

    const optionIds = options?.map((option) => option.id) ?? []
    expect(optionIds).not.toContain('zoom_list_account_recordings')
    expect(optionIds).not.toContain('zoom_get_account_recordings_with_transcript')
    expect(optionIds).toContain('zoom_list_recordings')
  })

  it('shows account recording operations in admin workspaces', () => {
    mockIsAdminWorkspace.mockReturnValue(true)

    const operationSubBlock = ZoomBlock.subBlocks.find((subBlock) => subBlock.id === 'operation')
    const options =
      typeof operationSubBlock?.options === 'function'
        ? operationSubBlock.options()
        : operationSubBlock?.options

    const optionIds = options?.map((option) => option.id) ?? []
    expect(optionIds).toContain('zoom_list_account_recordings')
    expect(optionIds).toContain('zoom_get_account_recordings_with_transcript')
  })

  it('rejects account recording operations outside admin workspaces at execution', () => {
    expect(() =>
      paramsFunction({
        operation: 'zoom_list_account_recordings',
        oauthCredential: 'selected-cred',
      })
    ).toThrow(/admin workspace/i)

    expect(() =>
      toolFunction({
        operation: 'zoom_get_account_recordings_with_transcript',
        oauthCredential: 'selected-cred',
      })
    ).toThrow(/admin workspace/i)
  })

  it('allows account recording operations in admin workspaces', () => {
    mockIsAdminWorkspace.mockReturnValue(true)

    const result = paramsFunction({
      operation: 'zoom_list_account_recordings',
      oauthCredential: 'selected-cred',
      fromDate: '2026-05-01',
      toDate: '2026-05-26',
    })

    expect(result.credential).toBe('selected-cred')
  })
})
