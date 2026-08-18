/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE,
  GOLD_EXAMPLE_API_KEY,
  GOLD_EXAMPLE_LOAD_API_KEY,
  goldExampleManifest,
  goldExampleOutput,
} from '@/lib/arena-generative-ui/gold-example'
import { extractManifestCandidate } from '@/lib/arena-generative-ui/parse-inputs'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'
import { validateArenaGenerativeManifest } from '@/lib/arena-generative-ui/validate-manifest'

const bindings: ArenaGenerativeApiBinding[] = [
  {
    key: GOLD_EXAMPLE_API_KEY,
    label: 'Compile report',
    kind: 'workflow',
    workflowId: 'wf_gold',
  },
  {
    key: GOLD_EXAMPLE_LOAD_API_KEY,
    label: 'Dashboard metrics',
    kind: 'workflow',
    workflowId: 'wf_gold_metrics',
  },
]

/** Runs the example through the same envelope unwrap the generator uses. */
function validateExample() {
  return validateArenaGenerativeManifest(extractManifestCandidate(goldExampleOutput), {
    apiBindings: bindings,
  })
}

describe('gold example', () => {
  it('passes manifest validation so the prompt never teaches an invalid shape', () => {
    const result = validateExample()
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
  })

  it('keeps every page reachable from the entry path', () => {
    const result = validateExample()
    expect(Object.keys(result.manifest?.pages ?? {})).toEqual(['home', 'report'])
    expect(result.manifest?.entryPath).toBe('home')
  })

  it('is unchanged by normalization, so it models the canonical flat shape', () => {
    const result = validateExample()
    expect(result.manifest?.pages.home.spec).toEqual(goldExampleManifest.pages.home.spec)
    expect(result.manifest?.pages.report.spec).toEqual(goldExampleManifest.pages.report.spec)
  })

  it('demonstrates the layout primitives the rules ask for', () => {
    const serialized = JSON.stringify(goldExampleManifest)
    for (const type of [
      'PageHeader',
      'Grid',
      'Columns',
      'Stat',
      'Table',
      'KeyValue',
      'Card',
      'Repeat',
      'Switch',
    ]) {
      expect(serialized).toContain(`"${type}"`)
    }
    expect(serialized).toContain('"width":"wide"')
    expect(serialized).toContain('"width":"narrow"')
    expect(serialized).toContain('"deltaTone":"positive"')
  })

  it('teaches onLoad on the page that fetches its own data, not the CTA result page', () => {
    const result = validateExample()

    expect(result.manifest?.pages.home.onLoad).toEqual(['load_metrics'])
    expect(result.manifest?.pages.report.onLoad).toBeUndefined()
    expect(JSON.stringify(goldExampleManifest.pages.home.spec)).toContain(
      '"statePath":"totalReports"'
    )
  })

  it('teaches Repeat inside a Grid with per-item title and href placeholders', () => {
    const report = JSON.stringify(goldExampleManifest.pages.report.spec)
    expect(report).toContain('"type":"Repeat"')
    expect(report).toContain('"statePath":"articles"')
    expect(report).toContain('{item.title}')
    expect(report).toContain('{item.url}')
    expect(report).toContain('No articles ranked yet.')
    expect(report.indexOf('"type":"Grid"')).toBeLessThan(report.indexOf('"type":"Repeat"'))
  })

  it('embeds the framing and the serialized manifest in the prompt section', () => {
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).toContain('GOLD STANDARD REFERENCE LAYOUT')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).toContain(GOLD_EXAMPLE_API_KEY)
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).toContain('"entryPath": "home"')
    expect(ARENA_GENERATIVE_UI_GOLD_EXAMPLE).not.toContain('```')
  })
})
