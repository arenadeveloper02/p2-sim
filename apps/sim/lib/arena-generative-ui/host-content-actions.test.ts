/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  resolveHostContentAction,
  visibleMarkdownForElement,
} from '@/lib/arena-generative-ui/host-content-actions'
import { markdownToPdfBytes } from '@/lib/arena-generative-ui/markdown-pdf'

describe('resolveHostContentAction', () => {
  it('reads copyContent / downloadPdf flags and Copy Markdown labels', () => {
    expect(resolveHostContentAction({ copyContent: true })).toBe('copy')
    expect(resolveHostContentAction({ copyMarkdown: true })).toBe('copy')
    expect(resolveHostContentAction({ downloadPdf: true })).toBe('downloadPdf')
    expect(resolveHostContentAction({ label: 'Copy Markdown' })).toBe('copy')
    expect(resolveHostContentAction({ text: 'Download PDF' })).toBe('downloadPdf')
    expect(resolveHostContentAction({ label: 'Copy' })).toBeUndefined()
    expect(resolveHostContentAction({ label: 'Generate' })).toBeUndefined()
    expect(resolveHostContentAction({ label: 'Copy Markdown', actionId: 'generate' })).toBe('copy')
  })
})

describe('visibleMarkdownForElement', () => {
  it('prefers the nearest visible DataText', () => {
    const markdown = visibleMarkdownForElement(
      {
        page: { type: 'Page', children: ['copy', 'body'] },
        copy: { type: 'Button', props: { label: 'Copy Markdown' }, children: [] },
        body: { type: 'DataText', props: { statePath: 'content' }, children: [] },
      },
      'copy',
      { content: '# Article' },
      { content: '# Article' }
    )
    expect(markdown).toBe('# Article')
  })
})

describe('markdownToPdfBytes', () => {
  it('builds a PDF from markdown headings', () => {
    const bytes = markdownToPdfBytes('# Hello\n\nWriter-ready copy.')
    expect(bytes.byteLength).toBeGreaterThan(100)
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
  })
})
