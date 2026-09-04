/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  groupChatContentSegments,
  lastInlineGroupIndex,
  SOURCE_LINK_PREFIX,
} from '@/app/workspace/[workspaceId]/home/components/message-content/components/chat-content/chat-content-groups'
import type { ContentSegment } from '@/app/workspace/[workspaceId]/home/components/message-content/components/special-tags'

describe('groupChatContentSegments', () => {
  it('folds workspace resources into surrounding markdown', () => {
    const groups = groupChatContentSegments([
      { type: 'text', content: 'Updated ' },
      {
        type: 'workspace_resource',
        data: { type: 'workflow', id: 'wf-1', title: 'Intake' },
      },
      { type: 'text', content: ' for you.' },
    ])

    expect(groups).toEqual([
      {
        kind: 'inline',
        markdown: 'Updated [Intake](<#wsres-workflow-wf-1>) for you.',
      },
    ])
  })

  it('folds citations into surrounding markdown as sentinel links', () => {
    const groups = groupChatContentSegments([
      { type: 'text', content: 'Block them first.' },
      {
        type: 'source',
        data: { url: 'https://docs.github.com/a', siteName: 'GitHub Docs' },
      },
      { type: 'text', content: 'Then merge.' },
    ])

    expect(groups).toEqual([
      {
        kind: 'inline',
        markdown: `Block them first. [GitHub Docs](<${SOURCE_LINK_PREFIX}0>) Then merge.`,
      },
    ])
  })

  it('escapes markdown-sensitive characters in citation labels', () => {
    const groups = groupChatContentSegments([
      { type: 'text', content: 'See' },
      {
        type: 'source',
        data: { url: 'https://example.com', siteName: 'Docs [beta]*' },
      },
    ])

    expect(groups[0]).toEqual({
      kind: 'inline',
      markdown: `See [Docs \\[beta\\]\\*](<${SOURCE_LINK_PREFIX}0>)`,
    })
  })

  it('omits thinking bodies and keeps later special tags as blocks', () => {
    const groups = groupChatContentSegments([
      { type: 'thinking', content: 'weighing options' },
      { type: 'text', content: 'Pick one.' },
      { type: 'options', data: { a: { title: 'A', description: 'First' } } },
    ])

    expect(groups).toEqual([
      { kind: 'inline', markdown: 'Pick one.' },
      {
        kind: 'block',
        segment: { type: 'options', data: { a: { title: 'A', description: 'First' } } },
        index: 2,
      },
    ])
    expect(lastInlineGroupIndex(groups)).toBe(0)
  })

  it('keeps tool confirmation and workflow patch as block chips', () => {
    const segments: ContentSegment[] = [
      { type: 'text', content: 'Needs approval.' },
      {
        type: 'tool_confirmation',
        data: {
          toolCallId: 'call-1',
          toolName: 'delete_file',
          category: 'destructive',
          summary: 'Delete the draft',
        },
      },
      {
        type: 'workflow_patch',
        data: { patchId: 'p-1', summary: 'Add a delay', workflowId: 'wf-1' },
      },
    ]

    expect(groupChatContentSegments(segments)).toEqual([
      { kind: 'inline', markdown: 'Needs approval.' },
      { kind: 'block', segment: segments[1], index: 1 },
      { kind: 'block', segment: segments[2], index: 2 },
    ])
  })
})
