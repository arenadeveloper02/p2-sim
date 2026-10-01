import { sourceLabel } from '@/app/workspace/[workspaceId]/home/components/message-content/components/source-chip'
import type { ContentSegment } from '@/app/workspace/[workspaceId]/home/components/message-content/components/special-tags'

type BlockSegment = Exclude<
  ContentSegment,
  { type: 'text' } | { type: 'thinking' } | { type: 'workspace_resource' } | { type: 'source' }
>

export type ChatContentRenderGroup =
  | { kind: 'inline'; markdown: string }
  | { kind: 'block'; segment: BlockSegment; index: number }

/**
 * Fragment prefix of a generated citation link. Internal — never navigated —
 * and deliberately not a name the model would write on its own; an index that
 * resolves to no parsed source falls back to the link text.
 */
export const SOURCE_LINK_PREFIX = '#sim-source-ref-'

function startsInlineWord(value: string): boolean {
  return /^[A-Za-z0-9_(]/.test(value)
}

function endsInlineWord(value: string): boolean {
  return /[A-Za-z0-9_)]$/.test(value)
}

function nextInlineSegmentLabel(segment?: ContentSegment): string {
  if (!segment) return ''
  // Thinking segments are never rendered, so they contribute no following text.
  if (segment.type === 'text') return segment.content
  if (segment.type === 'workspace_resource') return segment.data.title || segment.data.id || ''
  if (segment.type === 'source') return sourceLabel(segment.data)
  return ''
}

/**
 * A source's name as a Markdown link label. A site name or knowledge-base
 * name is free text: an unescaped `]` would end the label early and a `*` or
 * `_` would style it, so the delimiters are backslash-escaped.
 */
function escapeLinkLabel(label: string): string {
  return label.replace(/[\\[\]*_`<>]/g, '\\$&')
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
 * Workspace resources and citations stay inline so they flow with the
 * surrounding prose; whitespace-only markdown is dropped so a trailing
 * `<options>` tag does not keep an empty Streamdown node that remounts as a
 * blank bubble.
 */
export function groupChatContentSegments(segments: ContentSegment[]): ChatContentRenderGroup[] {
  const groups: ChatContentRenderGroup[] = []
  let pendingMarkdown = ''
  let sourceIndex = 0

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
      // Files are addressed by their encoded VFS path (copied verbatim from the tag);
      // workflows/tables/KBs by id. The angle-bracket link destination keeps the path
      // intact through markdown parsing (tolerates parens) without re-encoding it.
      const ref = s.data.type === 'file' ? (s.data.path ?? s.data.id ?? '') : (s.data.id ?? '')
      const label = s.data.title || ref
      pendingMarkdown = appendInlineReferenceMarkdown(
        pendingMarkdown,
        `[${label}](<#wsres-${s.data.type}-${ref}>)`,
        nextSegment
      )
    } else if (s.type === 'source') {
      // A citation always stands off from the sentence it supports, even when
      // the model closes the sentence on punctuation the word-boundary rule
      // would otherwise glue the chip to.
      if (pendingMarkdown && !/\s$/.test(pendingMarkdown)) pendingMarkdown += ' '
      pendingMarkdown = appendInlineReferenceMarkdown(
        pendingMarkdown,
        `[${escapeLinkLabel(sourceLabel(s.data))}](<${SOURCE_LINK_PREFIX}${sourceIndex++}>)`,
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
