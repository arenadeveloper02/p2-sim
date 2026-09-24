/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { SlackBlock, SlackV2Block } from '@/blocks/blocks/slack'

describe('Slack block', () => {
  it('keeps the stable slack_v2 credential picker and hides the auth-method dropdown', () => {
    expect(SlackV2Block.type).toBe('slack_v2')
    expect(SlackV2Block.hideFromToolbar).toBe(false)
    expect(SlackV2Block.preview).toBe(true)
    expect(SlackBlock.type).toBe('slack')

    const subBlockIds = SlackV2Block.subBlocks.map((subBlock) => subBlock.id)
    expect(subBlockIds).not.toContain('authMethod')

    const credential = SlackV2Block.subBlocks.find((subBlock) => subBlock.id === 'credential')
    expect(credential).toMatchObject({
      credentialKind: 'any',
      credentialLabels: {
        oauthGroup: 'Sim app',
        serviceAccountGroup: 'Custom bots',
        serviceAccountConnect: 'Set up a custom bot',
      },
    })
  })

  it('keeps assistant operations on their original tools', () => {
    const selectTool = SlackV2Block.tools.config?.tool
    if (!selectTool) throw new Error('Slack v2 tool selector is required')

    expect(selectTool({ operation: 'set_status' })).toBe('slack_set_status')
    expect(selectTool({ operation: 'set_title' })).toBe('slack_set_title')
    expect(selectTool({ operation: 'set_suggested_prompts' })).toBe('slack_set_suggested_prompts')
  })
})
