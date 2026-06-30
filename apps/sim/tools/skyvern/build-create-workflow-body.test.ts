/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { buildSkyvernCreateWorkflowBody } from '@/tools/skyvern/build-create-workflow-body'

describe('buildSkyvernCreateWorkflowBody', () => {
  it('builds workflow parameters and navigation block with parameter_keys', () => {
    const body = buildSkyvernCreateWorkflowBody({
      title: 'Appointment Finder',
      url: '{{starting_url}}',
      navigationGoal: 'Find slots for {{appointment_type}}',
      workflowParameters: [
        {
          name: 'starting_url',
          type: 'string',
          description: 'Starting URL',
          value: '',
        },
        {
          name: 'appointment_type',
          type: 'string',
          description: 'Appointment type',
          value: 'New patient',
        },
        {
          name: 'days_to_search',
          type: 'integer',
          description: 'Days to search',
          value: '14',
        },
      ],
    })

    const definition = body.json_definition as {
      workflow_definition: {
        parameters: Array<Record<string, unknown>>
        blocks: Array<Record<string, unknown>>
      }
    }

    expect(definition.workflow_definition.parameters).toEqual([
      {
        key: 'starting_url',
        parameter_type: 'workflow',
        workflow_parameter_type: 'string',
        description: 'Starting URL',
        default_value: null,
      },
      {
        key: 'appointment_type',
        parameter_type: 'workflow',
        workflow_parameter_type: 'string',
        description: 'Appointment type',
        default_value: 'New patient',
      },
      {
        key: 'days_to_search',
        parameter_type: 'workflow',
        workflow_parameter_type: 'integer',
        description: 'Days to search',
        default_value: 14,
      },
    ])

    expect(definition.workflow_definition.blocks[0]).toMatchObject({
      block_type: 'navigation',
      label: 'UI_Automation',
      url: '{{starting_url}}',
      navigation_goal: 'Find slots for {{appointment_type}}',
      parameter_keys: ['starting_url', 'appointment_type', 'days_to_search'],
      max_steps_per_run: 100,
    })
  })

  it('uses task block when navigation goal is omitted', () => {
    const body = buildSkyvernCreateWorkflowBody({
      title: 'Simple Task',
      url: 'https://example.com',
    })

    const definition = body.json_definition as {
      workflow_definition: { blocks: Array<Record<string, unknown>> }
    }

    expect(definition.workflow_definition.blocks[0]).toMatchObject({
      block_type: 'task',
      url: 'https://example.com',
    })
    expect(definition.workflow_definition.blocks[0]).not.toHaveProperty('navigation_goal')
  })

  it('uses prompt as navigation goal when navigation goal is empty', () => {
    const body = buildSkyvernCreateWorkflowBody({
      title: 'Prompt Task',
      url: 'https://example.com',
      prompt: 'Find the top post on Hacker News',
    })

    const definition = body.json_definition as {
      workflow_definition: { blocks: Array<Record<string, unknown>> }
    }

    expect(definition.workflow_definition.blocks).toHaveLength(1)
    expect(definition.workflow_definition.blocks[0]).toMatchObject({
      block_type: 'navigation',
      navigation_goal: 'Find the top post on Hacker News',
    })
  })

  it('creates a dedicated extraction block for data extraction goal', () => {
    const body = buildSkyvernCreateWorkflowBody({
      title: 'Extract Only',
      url: 'https://example.com',
      dataExtractionGoal: 'Extract the company email address',
    })

    const definition = body.json_definition as {
      workflow_definition: { blocks: Array<Record<string, unknown>> }
    }

    expect(definition.workflow_definition.blocks).toHaveLength(1)
    expect(definition.workflow_definition.blocks[0]).toMatchObject({
      block_type: 'extraction',
      url: 'https://example.com',
      data_extraction_goal: 'Extract the company email address',
    })
  })

  it('creates navigation and extraction blocks when both goals are set', () => {
    const body = buildSkyvernCreateWorkflowBody({
      title: 'Navigate and Extract',
      url: '{{starting_url}}',
      navigationGoal: 'Fill out the contact form',
      dataExtractionGoal: 'Extract confirmation message',
      prompt: 'Use polite language in the form body',
    })

    const definition = body.json_definition as {
      workflow_definition: { blocks: Array<Record<string, unknown>> }
    }

    expect(definition.workflow_definition.blocks).toHaveLength(2)
    expect(definition.workflow_definition.blocks[0]).toMatchObject({
      block_type: 'navigation',
      navigation_goal: 'Fill out the contact form\n\nUse polite language in the form body',
    })
    expect(definition.workflow_definition.blocks[1]).toMatchObject({
      block_type: 'extraction',
      label: 'UI_Automation_Extraction',
      url: '',
      data_extraction_goal: 'Extract confirmation message',
    })
  })

  it('normalizes spaced template placeholders', () => {
    const body = buildSkyvernCreateWorkflowBody({
      title: 'Template Test',
      url: '{{ starting_url }}',
      workflowParameters: [{ name: 'starting_url', type: 'string', value: '' }],
    })

    const definition = body.json_definition as {
      workflow_definition: { blocks: Array<Record<string, unknown>> }
    }

    expect(definition.workflow_definition.blocks[0].url).toBe('{{starting_url}}')
  })
})
