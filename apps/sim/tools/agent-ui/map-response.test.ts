/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockBuildToolLlmCostFromModelUsage } = vi.hoisted(() => ({
  mockBuildToolLlmCostFromModelUsage: vi.fn(),
}))

vi.mock('@/lib/billing/core/tool-llm-cost', () => ({
  buildToolLlmCostFromModelUsage: mockBuildToolLlmCostFromModelUsage,
}))

vi.mock('@/lib/development/format-generated-app-build-errors', () => ({
  formatBuildErrorsSummary: vi.fn(() => ''),
}))

import { mapAgentUiResultToToolResponse } from '@/tools/agent-ui/map-response'

describe('mapAgentUiResultToToolResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildToolLlmCostFromModelUsage.mockReturnValue({
      cost: { input: 0.01, output: 0.02, total: 0.03 },
      model: 'claude-sonnet-5',
      tokens: { input: 100, output: 50, total: 150 },
    })
  })

  it('maps preview and API wiring fields on success', () => {
    const result = mapAgentUiResultToToolResponse({
      success: true,
      appName: 'Risk UI',
      repoName: 'risk-ui',
      fileCount: 12,
      previewHtml: '<html></html>',
      previewPath: 'generated-apps/risk-ui/preview.html',
      apiWired: true,
      hasDatabase: true,
      mode: 'generate',
    })

    expect(result.success).toBe(true)
    expect(result.output.previewHtml).toBe('<html></html>')
    expect(result.output.previewPath).toBe('generated-apps/risk-ui/preview.html')
    expect(result.output.apiWired).toBe(true)
    expect(result.output.hasDatabase).toBe(true)
    expect(result.output.content).toContain('Workflow API wired')
    expect(result.output.content).toContain('preview.html')
  })
})
