/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  clampReadResultForLocalModel,
  LOCAL_VFS_READ_MAX_LINE_CHARS,
  LOCAL_VFS_READ_SOFT_MAX_CHARS,
} from '@/local-copilot/lib/tools/clamp-read-result'
import { rejectCreateFileImageAsText } from '@/local-copilot/lib/tools/enrich-file-tool-args'

describe('clampReadResultForLocalModel', () => {
  it('passes through small reads unchanged', () => {
    const input = { content: '<html>ok</html>', totalLines: 1 }
    expect(clampReadResultForLocalModel(input)).toEqual(input)
  })

  it('truncates mega SVG lines so Arena-scale HTML stays readable', () => {
    const mega = 'M'.repeat(LOCAL_VFS_READ_MAX_LINE_CHARS + 50_000)
    const input = {
      content: `<svg>${mega}</svg>\n<footer>ok</footer>`,
      totalLines: 2,
    }
    const result = clampReadResultForLocalModel(input)
    expect(result.truncated).toBe(true)
    expect(result.content.length).toBeLessThan(input.content.length)
    expect(result.content).toContain('footer>ok')
    expect(result.content).toContain('line truncated')
  })

  it('caps total body under the soft max', () => {
    const many = Array.from({ length: 40 }, (_, i) => `L${i}:${'x'.repeat(4_000)}`).join('\n')
    expect(many.length).toBeGreaterThan(LOCAL_VFS_READ_SOFT_MAX_CHARS)
    const result = clampReadResultForLocalModel({ content: many, totalLines: 40 })
    expect(result.truncated).toBe(true)
    expect(result.content.length).toBeLessThan(many.length)
  })
})

describe('rejectCreateFileImageAsText', () => {
  it('rejects png create_file paths', () => {
    expect(
      rejectCreateFileImageAsText({ fileName: 'files/diagram.png', content: 'abc' })
    ).toMatch(/generate_image/i)
  })

  it('allows html create_file paths', () => {
    expect(rejectCreateFileImageAsText({ fileName: 'files/page.html', content: '<html/>' })).toBe(
      null
    )
  })
})
