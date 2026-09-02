/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUserPermissionConfig, mockIsIntegrationDeploymentAvailable } = vi.hoisted(() => ({
  mockGetUserPermissionConfig: vi.fn(),
  mockIsIntegrationDeploymentAvailable: vi.fn(() => true),
}))

vi.mock('@/ee/access-control/utils/permission-check', () => ({
  getUserPermissionConfig: mockGetUserPermissionConfig,
}))

vi.mock('@/lib/integrations/availability.server', () => ({
  isIntegrationDeploymentAvailableForVisibility: mockIsIntegrationDeploymentAvailable,
}))

import {
  computeBlockLevelInputs,
  getBlocksMetadataServerTool,
} from '@/lib/copilot/tools/server/blocks/get-blocks-metadata-tool'
import { ArenaGenerativeUiBlock } from '@/blocks/blocks/arena-generative-ui'
import { MothershipBlock } from '@/blocks/blocks/mothership'
import { getBlock } from '@/blocks/registry'

describe('get blocks metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserPermissionConfig.mockResolvedValue({ allowedIntegrations: ['slack'] })
    mockIsIntegrationDeploymentAvailable.mockReturnValue(true)
  })

  it('omits server-only Mothership policy inputs from block metadata definitions', () => {
    const definitions = computeBlockLevelInputs(MothershipBlock)

    expect(definitions).not.toHaveProperty('secretScope')
    expect(definitions).not.toHaveProperty('mountedSecrets')
  })

  it('keeps access-control-exempt and special blocks under a restrictive allowlist', async () => {
    const result = await getBlocksMetadataServerTool.execute(
      { blockIds: ['start_trigger', 'loop', 'slack', 'notion'] },
      { userId: 'user-1', workspaceId: 'workspace-1' }
    )

    expect(result.metadata).toHaveProperty('start_trigger')
    expect(result.metadata).toHaveProperty('loop')
    expect(result.metadata).toHaveProperty('slack')
    expect(result.metadata).not.toHaveProperty('notion')
  })

  it('surfaces Arena Generative UI apiBindings tooltip and Copilot stub contract', async () => {
    vi.mocked(getBlock).mockImplementation((type: string) =>
      type === 'arena_generative_ui' ? ArenaGenerativeUiBlock : undefined
    )

    expect(computeBlockLevelInputs(ArenaGenerativeUiBlock).apiBindings.description).toContain(
      'workflowId'
    )

    const result = await getBlocksMetadataServerTool.execute(
      { blockIds: ['arena_generative_ui'] },
      { userId: 'user-1' }
    )

    const metadata = result.metadata.arena_generative_ui
    expect(metadata).toBeDefined()
    expect(metadata.bestPractices).toContain('edit_workflow')
    expect(metadata.bestPractices).toContain('stubs')
    expect(metadata.bestPractices).toContain('Deploy → GUI App')

    const apiBindings = [
      ...(metadata.inputs?.optional ?? []),
      ...(metadata.inputs?.required ?? []),
    ].find((field: { name: string }) => field.name === 'apiBindings')
    expect(apiBindings).toBeDefined()
    expect(apiBindings.readOnly).toBeUndefined()
    expect(apiBindings.description).toContain('workflowId')
    expect(apiBindings.description).toContain('visitorEmail')
    expect(apiBindings.tooltip).toContain('qualify_lead')
    expect(apiBindings.tooltip).toContain('outputSchema')
  })
})
