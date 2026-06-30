/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { formatOptionsTag } from '@/local-copilot/lib/format-options-tag'

describe('formatOptionsTag', () => {
  it('returns empty string for no items', () => {
    expect(formatOptionsTag([])).toBe('')
  })

  it('formats clickable options tag', () => {
    const tag = formatOptionsTag(['Run workflow', 'Build new workflow'])
    expect(tag).toContain('<options>')
    expect(tag).toContain('</options>')
    expect(tag).toContain('"title":"Run workflow"')
    expect(tag).toContain('"title":"Build new workflow"')
  })

  it('deduplicates items', () => {
    const tag = formatOptionsTag(['Run workflow', 'Run workflow'])
    expect(tag.match(/Run workflow/g)?.length).toBe(2)
  })
})
