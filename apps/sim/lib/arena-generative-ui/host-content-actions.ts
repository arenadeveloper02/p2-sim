import { fieldIsVisible } from '@/lib/arena-generative-ui/form-fields'
import { markdownToPdfBytes } from '@/lib/arena-generative-ui/markdown-pdf'
import {
  ARENA_GENERATIVE_SELECTED_KEY,
  ARENA_GENERATIVE_STREAM_CONTENT_KEY,
  displayTextFromActionData,
  type RepeatItemScope,
  readHostStatePath,
  readScopedStatePath,
} from '@/lib/arena-generative-ui/types'

interface SpecElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

export type HostContentAction = 'copy' | 'downloadPdf'

const COPY_DOWNLOAD_LABEL = /copy\s*markdown|download\s*pdf|^pdf$/i

export function isCopyOrDownloadLabel(label: string): boolean {
  const trimmed = label.trim()
  if (!trimmed) return false
  return COPY_DOWNLOAD_LABEL.test(trimmed)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asBoolean(value: unknown): boolean {
  return value === true
}

/**
 * Host Copy Markdown / Download PDF. Explicit props win. Matching labels
 * still count when actionId is set, so a rebound generate button copies
 * instead of refetching.
 */
export function resolveHostContentAction(
  props: Record<string, unknown>
): HostContentAction | undefined {
  if (asBoolean(props.copyContent) || asBoolean(props.copyMarkdown)) return 'copy'
  if (asBoolean(props.downloadPdf)) return 'downloadPdf'
  return hostContentActionFromLabel(asString(props.label) || asString(props.text))
}

export function hostContentActionFromLabel(label: string): HostContentAction | undefined {
  const trimmed = label.trim()
  if (!trimmed || !COPY_DOWNLOAD_LABEL.test(trimmed)) return undefined
  if (/download|pdf/i.test(trimmed) && !/^copy/i.test(trimmed)) return 'downloadPdf'
  return 'copy'
}

export function markdownFilename(markdown: string): string {
  const heading = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim()
  const slug = (heading ?? 'article')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'article'}.pdf`
}

/**
 * Markdown for a Copy / Download control: nearest visible DataText, then
 * `content`, then the selected row's prose.
 */
export function visibleMarkdownForElement(
  elements: Record<string, SpecElement>,
  elementId: string,
  state: Record<string, unknown>,
  visibilityValues: Record<string, unknown>,
  scope?: RepeatItemScope
): string {
  const parentId = parentOf(elements, elementId)
  const local = visibleDataTextPaths(
    elements,
    parentId ? descendantsOf(elements, parentId) : [],
    visibilityValues
  )
  const all = visibleDataTextPaths(elements, Object.keys(elements), visibilityValues)
  for (const path of [...local, ...all]) {
    const text = markdownFromState(state, path, scope)
    if (text) return text
  }
  return (
    markdownFromState(state, ARENA_GENERATIVE_STREAM_CONTENT_KEY, scope) ||
    markdownFromState(state, ARENA_GENERATIVE_SELECTED_KEY, scope)
  )
}

function markdownFromState(
  state: Record<string, unknown>,
  path: string,
  scope?: RepeatItemScope
): string {
  const value = scope ? readScopedStatePath(state, path, scope) : readHostStatePath(state, path)
  if (typeof value === 'string' && value.trim()) return value
  const fromAction = displayTextFromActionData(value)
  return fromAction?.trim() ? fromAction : ''
}

function parentOf(elements: Record<string, SpecElement>, childId: string): string | undefined {
  for (const [id, element] of Object.entries(elements)) {
    if ((element.children ?? []).includes(childId)) return id
  }
  return undefined
}

function descendantsOf(elements: Record<string, SpecElement>, rootId: string): string[] {
  const ids: string[] = []
  const visit = (id: string) => {
    for (const child of elements[id]?.children ?? []) {
      ids.push(child)
      visit(child)
    }
  }
  visit(rootId)
  return ids
}

function visibleDataTextPaths(
  elements: Record<string, SpecElement>,
  ids: string[],
  visibilityValues: Record<string, unknown>
): string[] {
  const paths: string[] = []
  for (const id of ids) {
    const element = elements[id]
    if (element?.type !== 'DataText') continue
    if (!isTreeVisible(elements, id, visibilityValues)) continue
    const path = asString(element.props?.statePath)
    if (path) paths.push(path)
  }
  return paths
}

function isTreeVisible(
  elements: Record<string, SpecElement>,
  id: string,
  visibilityValues: Record<string, unknown>
): boolean {
  let current: string | undefined = id
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    const element = elements[current]
    if (!element) return false
    if (!fieldIsVisible(element.props ?? {}, visibilityValues)) return false
    current = parentOf(elements, current)
  }
  return true
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to execCommand */
  }
  if (typeof document === 'undefined') return false
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

export async function downloadMarkdownPdf(
  markdown: string,
  filename = markdownFilename(markdown)
): Promise<void> {
  if (typeof document === 'undefined') return
  const bytes = markdownToPdfBytes(markdown)
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
