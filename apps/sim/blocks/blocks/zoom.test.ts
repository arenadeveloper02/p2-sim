import { describe, expect, it } from 'vitest'
import { ZoomBlock } from '@/blocks/blocks/zoom'

describe('ZoomBlock', () => {
  const paramsFunction = ZoomBlock.tools.config?.params

  if (!paramsFunction) {
    throw new Error('ZoomBlock.tools.config.params function is missing')
  }

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

  it('uses the same selected credential for account recording operations', () => {
    const result = paramsFunction({
      operation: 'zoom_list_account_recordings',
      oauthCredential: 'selected-cred',
      from: '2026-05-01',
      to: '2026-05-26',
    })

    expect(result.credential).toBe('selected-cred')
  })
})
