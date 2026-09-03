/**
 * @vitest-environment node
 */
import { dbChainMock, queueTableRows, resetDbChainMock, schemaMock } from '@sim/testing'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockMaterializeExecutionData } = vi.hoisted(() => ({
  mockMaterializeExecutionData: vi.fn(),
}))

vi.mock('@sim/db', () => ({ ...dbChainMock, ...schemaMock }))
vi.mock('@sim/db/schema', () => schemaMock)

vi.mock('@/lib/logs/execution/trace-store', () => ({
  materializeExecutionData: mockMaterializeExecutionData,
}))

import {
  LAST_RUN_EMPTY_LIST_WARNING,
  LAST_RUN_STALE_WARNING,
  LAST_RUN_TRUNCATED_WARNING,
  loadLastSuccessfulRunOutputSchema,
} from '@/lib/arena-generative-ui/last-run-output-schema'

const HISTORY_OUTPUT = {
  run_data: {
    history: [
      {
        id: 'h1',
        email: 'ada@example.com',
        input: { keyword: 'Dental Implants', client: 'Gentle Dental' },
        output: '',
        createdAt: '2026-08-24T06:28:56.717Z',
      },
    ],
  },
}

function queueCompletedRun(
  overrides: { deploymentVersionId?: string | null; executionData?: Record<string, unknown> } = {}
) {
  queueTableRows(schemaMock.workflowExecutionLogs, [
    {
      executionId: 'exec-1',
      workspaceId: 'ws-1',
      workflowId: 'wf-history',
      deploymentVersionId:
        'deploymentVersionId' in overrides ? overrides.deploymentVersionId : 'deploy-current',
      executionData: overrides.executionData ?? {},
    },
  ])
}

describe('loadLastSuccessfulRunOutputSchema', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
    mockMaterializeExecutionData.mockReset()
  })

  afterAll(() => {
    resetDbChainMock()
  })

  it('returns nothing when there is no completed run', async () => {
    queueTableRows(schemaMock.workflowExecutionLogs, [])

    await expect(loadLastSuccessfulRunOutputSchema('wf-history')).resolves.toEqual({
      fields: [],
      warnings: [],
      found: false,
    })
    expect(mockMaterializeExecutionData).not.toHaveBeenCalled()
  })

  it('walks nested finalOutput and discards sample values', async () => {
    queueCompletedRun()
    mockMaterializeExecutionData.mockResolvedValueOnce({ finalOutput: HISTORY_OUTPUT })

    const result = await loadLastSuccessfulRunOutputSchema('wf-history', {
      activeDeploymentVersionId: 'deploy-current',
    })

    expect(result.found).toBe(true)
    expect(result.warnings).toEqual([])
    expect(result.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining([
        'run_data',
        'run_data.history',
        'run_data.history[].id',
        'run_data.history[].input.keyword',
        'run_data.history[].createdAt',
      ])
    )
    expect(JSON.stringify(result.fields)).not.toContain('ada@example.com')
    expect(JSON.stringify(result.fields)).not.toContain('Dental Implants')
  })

  it('strips a Response envelope before walking', async () => {
    queueCompletedRun()
    mockMaterializeExecutionData.mockResolvedValueOnce({
      finalOutput: { data: HISTORY_OUTPUT, status: 200, headers: {} },
    })

    const names = (await loadLastSuccessfulRunOutputSchema('wf-history')).fields.map(
      (field) => field.name
    )

    expect(names).toContain('run_data.history[].input.keyword')
    expect(names).not.toContain('status')
    expect(names).not.toContain('headers')
  })

  it('walks gap_analysis from a Response data envelope', async () => {
    queueCompletedRun()
    mockMaterializeExecutionData.mockResolvedValueOnce({
      finalOutput: {
        data: {
          gap_analysis: { coverage_gaps: [{ id: 'g1' }] },
          enhanced_article: 'Hi',
        },
      },
    })

    const names = (await loadLastSuccessfulRunOutputSchema('wf-history')).fields.map(
      (field) => field.name
    )

    expect(names).toEqual(
      expect.arrayContaining(['gap_analysis', 'gap_analysis.coverage_gaps', 'enhanced_article'])
    )
    expect(names).not.toContain('data')
  })

  it('warns when the run used an older deployment', async () => {
    queueCompletedRun({ deploymentVersionId: 'deploy-old' })
    mockMaterializeExecutionData.mockResolvedValueOnce({ finalOutput: HISTORY_OUTPUT })

    const result = await loadLastSuccessfulRunOutputSchema('wf-history', {
      activeDeploymentVersionId: 'deploy-current',
    })

    expect(result.found).toBe(true)
    expect(result.warnings).toContain(LAST_RUN_STALE_WARNING)
    expect(result.fields.map((field) => field.name)).toContain('run_data.history')
  })

  it('warns when a canvas run has no deployment version', async () => {
    queueCompletedRun({ deploymentVersionId: null })
    mockMaterializeExecutionData.mockResolvedValueOnce({ finalOutput: HISTORY_OUTPUT })

    const result = await loadLastSuccessfulRunOutputSchema('wf-history', {
      activeDeploymentVersionId: 'deploy-current',
    })

    expect(result.warnings).toEqual([LAST_RUN_STALE_WARNING])
  })

  it('warns when execution data was truncated', async () => {
    queueCompletedRun()
    mockMaterializeExecutionData.mockResolvedValueOnce({
      executionDataTruncated: true,
      finalOutput: { run_data: { history: [{ id: 'h1' }] } },
    })

    const result = await loadLastSuccessfulRunOutputSchema('wf-history', {
      activeDeploymentVersionId: 'deploy-current',
    })

    expect(result.warnings).toContain(LAST_RUN_TRUNCATED_WARNING)
    expect(result.fields.map((field) => field.name)).toContain('run_data.history[].id')
  })

  it('warns when history is an empty array so item columns are unknown', async () => {
    queueCompletedRun()
    mockMaterializeExecutionData.mockResolvedValueOnce({
      finalOutput: { run_data: { history: [] } },
    })

    const result = await loadLastSuccessfulRunOutputSchema('wf-history', {
      activeDeploymentVersionId: 'deploy-current',
    })

    expect(result.fields).toEqual([
      { name: 'run_data', type: 'object' },
      { name: 'run_data.history', type: 'array' },
    ])
    expect(result.warnings).toEqual([LAST_RUN_EMPTY_LIST_WARNING])
  })

  it('combines truncated and stale warnings', async () => {
    queueCompletedRun({ deploymentVersionId: 'deploy-old' })
    mockMaterializeExecutionData.mockResolvedValueOnce({
      executionDataTruncated: true,
      finalOutput: HISTORY_OUTPUT,
    })

    const result = await loadLastSuccessfulRunOutputSchema('wf-history', {
      activeDeploymentVersionId: 'deploy-current',
    })

    expect(result.warnings).toEqual([LAST_RUN_TRUNCATED_WARNING, LAST_RUN_STALE_WARNING])
  })

  it('drops execution telemetry so regenerate cannot bind Stats to it', async () => {
    queueCompletedRun()
    mockMaterializeExecutionData.mockResolvedValueOnce({
      finalOutput: {
        articles: [{ title: 'One' }],
        tokens: { input: 10, output: 20, total: 30 },
        cost: { total: 0.03 },
        providerTiming: { duration: 1200 },
        timeSegments: [{ name: 'llm' }],
      },
    })

    const names = (await loadLastSuccessfulRunOutputSchema('wf-history')).fields.map(
      (field) => field.name
    )

    expect(names).toContain('articles')
    expect(names).toContain('articles[].title')
    expect(names).not.toContain('tokens')
    expect(names).not.toContain('cost')
    expect(names).not.toContain('providerTiming')
    expect(names).not.toContain('timeSegments')
  })
})
