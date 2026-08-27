import type { ContentSegment } from '@/app/workspace/[workspaceId]/home/components/message-content/components/special-tags'

type BlockSegment = Exclude<
  ContentSegment,
  { type: 'text' } | { type: 'thinking' } | { type: 'workspace_resource' }
>

export type ChatContentRenderGroup =
  | { kind: 'inline'; markdown: string }
  | { kind: 'block'; segment: BlockSegment; index: number }

function startsInlineWord(value: string): boolean {
  return /^[A-Za-z0-9_(]/.test(value)
}

function endsInlineWord(value: string): boolean {
  return /[A-Za-z0-9_)]$/.test(value)
}

function nextInlineSegmentLabel(segment?: ContentSegment): string {
  if (!segment) return ''
  if (segment.type === 'text') return segment.content
  if (segment.type === 'workspace_resource') return segment.data.title || segment.data.id || ''
  return ''
}

function appendInlineReferenceMarkdown(
  currentMarkdown: string,
  referenceMarkdown: string,
  nextSegment?: ContentSegment
): string {
  let nextMarkdown = currentMarkdown
  if (currentMarkdown && endsInlineWord(currentMarkdown) && !/\s$/.test(currentMarkdown)) {
    nextMarkdown += ' '
  }

  nextMarkdown += referenceMarkdown

  const followingText = nextInlineSegmentLabel(nextSegment)
  if (
    followingText &&
    startsInlineWord(followingText) &&
    !/^\s/.test(followingText) &&
    !/\s$/.test(nextMarkdown)
  ) {
    nextMarkdown += ' '
  }

  return nextMarkdown
}

/**
 * Splits parsed special-tag segments into markdown groups and block chips.
 * Whitespace-only markdown is dropped so a trailing `<options>` tag does not
 * keep an empty Streamdown node that remounts as a blank bubble.
 */
export function groupChatContentSegments(segments: ContentSegment[]): ChatContentRenderGroup[] {
  const groups: ChatContentRenderGroup[] = []
  let pendingMarkdown = ''

  const flushMarkdown = () => {
    if (pendingMarkdown.trim()) {
      groups.push({ kind: 'inline', markdown: pendingMarkdown })
    }
    pendingMarkdown = ''
  }

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    const nextSegment = segments[i + 1]
    if (s.type === 'workspace_resource') {
      const ref = s.data.type === 'file' ? (s.data.path ?? s.data.id ?? '') : (s.data.id ?? '')
      const label = s.data.title || ref
      pendingMarkdown = appendInlineReferenceMarkdown(
        pendingMarkdown,
        `[${label}](<#wsres-${s.data.type}-${ref}>)`,
        nextSegment
      )
    } else if (s.type === 'thinking') {
      // Model-emitted <thinking> tag bodies are reasoning, not answer text.
    } else if (s.type === 'text') {
      pendingMarkdown += s.content
    } else {
      flushMarkdown()
      groups.push({ kind: 'block', segment: s, index: i })
    }
  }
  flushMarkdown()
  return groups
}

export function lastInlineGroupIndex(groups: ChatContentRenderGroup[]): number {
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i]?.kind === 'inline') return i
  }
  return -1
}
