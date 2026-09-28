/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  parseMothershipBuildArgs,
  resolveDefaultMothershipTemplateName,
} from '@/scripts/mothership-e2b-release'
import {
  mergeMothershipPipPackages,
  MOTHERSHIP_E2B_DEFAULT_TEMPLATE_NAME,
  MOTHERSHIP_E2B_PYTHON_PACKAGES,
  MOTHERSHIP_NPM_CLI_PACKAGES,
  MOTHERSHIP_REQUIRED_COMMANDS,
} from '@/scripts/mothership-sandbox-packages'
import { upsertEnvVar } from '@/scripts/upsert-env-var'

const EXISTING_ID =
  'arenas-default-team/sim-sbx-8aa6d9467cff102a2c69fe47-g1787833902068002-bf0724903cf8'

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

describe('mothership mermaid CLI contract', () => {
  it('pins @mermaid-js/mermaid-cli and requires mmdc on PATH', () => {
    expect(MOTHERSHIP_NPM_CLI_PACKAGES).toEqual(['@mermaid-js/mermaid-cli@11.12.0'])
    expect(MOTHERSHIP_REQUIRED_COMMANDS).toContain('mmdc')
  })
})

describe('resolveDefaultMothershipTemplateName', () => {
  it('reuses the configured mothership id instead of minting a new alias', () => {
    expect(resolveDefaultMothershipTemplateName(EXISTING_ID)).toBe(EXISTING_ID)
  })

  it('falls back to sim-mothership only when unset', () => {
    expect(resolveDefaultMothershipTemplateName(null)).toBe(MOTHERSHIP_E2B_DEFAULT_TEMPLATE_NAME)
    expect(resolveDefaultMothershipTemplateName('')).toBe(MOTHERSHIP_E2B_DEFAULT_TEMPLATE_NAME)
  })
})

describe('parseMothershipBuildArgs', () => {
  it('defaults name and base to the existing mothership id', () => {
    expect(parseMothershipBuildArgs([], EXISTING_ID)).toEqual({
      templateName: EXISTING_ID,
      baseTemplate: EXISTING_ID,
      pipExtras: [],
      skipCache: false,
      writeEnv: true,
    })
  })

  it('accepts an explicit existing sim-sbx reference as --name', () => {
    expect(
      parseMothershipBuildArgs(
        ['--name', EXISTING_ID, '--no-cache', '--no-write-env'],
        EXISTING_ID
      )
    ).toMatchObject({
      templateName: EXISTING_ID,
      baseTemplate: EXISTING_ID,
      skipCache: true,
      writeEnv: false,
    })
  })

  it('accepts pip extras without changing the template id', () => {
    expect(
      parseMothershipBuildArgs(['--pip', 'httpx==0.28.1'], EXISTING_ID)
    ).toMatchObject({
      templateName: EXISTING_ID,
      pipExtras: ['httpx==0.28.1'],
    })
  })

  it('rejects immutable build ids as --name', () => {
    expect(() =>
      parseMothershipBuildArgs([
        '--name',
        'sim-mothership:0cc50c4d-951d-4982-a131-3f0ae022d8d2',
      ])
    ).toThrow(/mutable template alias/)
  })
})

describe('upsertEnvVar', () => {
  it('keeps the same mothership id when rewriting', () => {
    const before = `FOO=1\nMOTHERSHIP_E2B_TEMPLATE_ID=${EXISTING_ID}\nBAR=2\n`
    expect(upsertEnvVar(before, 'MOTHERSHIP_E2B_TEMPLATE_ID', EXISTING_ID)).toBe(before)
  })

  it('appends when the key is missing', () => {
    expect(upsertEnvVar('FOO=1\n', 'MOTHERSHIP_E2B_TEMPLATE_ID', EXISTING_ID)).toBe(
      `FOO=1\n\nMOTHERSHIP_E2B_TEMPLATE_ID=${EXISTING_ID}\n`
    )
  })
})
