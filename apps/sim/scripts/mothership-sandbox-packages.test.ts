/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { parseMothershipBuildArgs } from '@/scripts/mothership-e2b-release'
import {
  mergeMothershipPipPackages,
  MOTHERSHIP_E2B_DEFAULT_TEMPLATE_NAME,
  MOTHERSHIP_E2B_PYTHON_PACKAGES,
} from '@/scripts/mothership-sandbox-packages'
import { upsertEnvVar } from '@/scripts/upsert-env-var'

describe('mergeMothershipPipPackages', () => {
  it('keeps the contract pins by default', () => {
    expect(mergeMothershipPipPackages([])).toEqual([...MOTHERSHIP_E2B_PYTHON_PACKAGES])
  })

  it('lets CLI extras override the same distribution', () => {
    const merged = mergeMothershipPipPackages(['requests==9.9.9', 'pillow==11.0.0'])
    expect(merged).toContain('requests==9.9.9')
    expect(merged).toContain('pillow==11.0.0')
    expect(merged.filter((spec) => spec.toLowerCase().startsWith('requests'))).toHaveLength(1)
  })
})

describe('parseMothershipBuildArgs', () => {
  it('defaults to the stable mothership alias', () => {
    expect(parseMothershipBuildArgs([])).toMatchObject({
      templateName: MOTHERSHIP_E2B_DEFAULT_TEMPLATE_NAME,
      writeEnv: true,
      skipCache: false,
    })
  })

  it('accepts name, pip extras, and write-env flags', () => {
    expect(
      parseMothershipBuildArgs([
        '--name',
        'sim-mothership',
        '--pip',
        'httpx==0.28.1',
        '--no-cache',
        '--no-write-env',
      ])
    ).toEqual({
      templateName: 'sim-mothership',
      baseTemplate: 'code-interpreter-v1',
      pipExtras: ['httpx==0.28.1'],
      skipCache: true,
      writeEnv: false,
    })
  })

  it('rejects a content-addressed --name that cannot be a stable alias', () => {
    expect(() =>
      parseMothershipBuildArgs([
        '--name',
        'sim-sbx-8aa6d9467cff102a2c69fe47-g1787833902068002-bf0724903cf8',
      ])
    ).toThrow(/stable alias/)
  })
})

describe('upsertEnvVar', () => {
  it('replaces an existing mothership template id without changing other keys', () => {
    const before = 'FOO=1\nMOTHERSHIP_E2B_TEMPLATE_ID=old-value\nBAR=2\n'
    expect(upsertEnvVar(before, 'MOTHERSHIP_E2B_TEMPLATE_ID', 'sim-mothership')).toBe(
      'FOO=1\nMOTHERSHIP_E2B_TEMPLATE_ID=sim-mothership\nBAR=2\n'
    )
  })

  it('appends when the key is missing', () => {
    expect(upsertEnvVar('FOO=1\n', 'MOTHERSHIP_E2B_TEMPLATE_ID', 'sim-mothership')).toBe(
      'FOO=1\n\nMOTHERSHIP_E2B_TEMPLATE_ID=sim-mothership\n'
    )
  })

  it('is a no-op when the alias is already correct', () => {
    const contents = 'MOTHERSHIP_E2B_TEMPLATE_ID=sim-mothership\n'
    expect(upsertEnvVar(contents, 'MOTHERSHIP_E2B_TEMPLATE_ID', 'sim-mothership')).toBe(contents)
  })
})
