/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ARENA_GENERATIVE_UI_COMPONENT_SELECTION_PROMPT } from '@/lib/arena-generative-ui/component-decisions'

const CATALOG_TYPES = [
  'EntityHeader',
  'PageHeader',
  'AppHeader',
  'Card',
  'Table',
  'Repeat',
  'Grid',
  'Tabs',
  'Modal',
  'Drawer',
  'SearchField',
  'Filter',
  'Stat',
  'Alert',
  'Toast',
  'Skeleton',
  'KeyValue',
  'WorkingCard',
  'DataText',
  'EmptyState',
  'Columns',
  'Toolbar',
  'Stepper',
  'Workspace',
  'Chart',
  'Sparkline',
] as const

describe('ARENA_GENERATIVE_UI_COMPONENT_SELECTION_PROMPT', () => {
  it('names every selection type', () => {
    expect(ARENA_GENERATIVE_UI_COMPONENT_SELECTION_PROMPT).toContain('COMPONENT SELECTION RULES')
    for (const type of CATALOG_TYPES) {
      expect(ARENA_GENERATIVE_UI_COMPONENT_SELECTION_PROMPT).toContain(type)
    }
  })

  it('tells Tabs not to be sequential steps', () => {
    expect(ARENA_GENERATIVE_UI_COMPONENT_SELECTION_PROMPT).toMatch(
      /Tabs[^\n]*[Nn]ot sequential workflow steps/
    )
  })

  it('tells Grid not to wrap a single child', () => {
    expect(ARENA_GENERATIVE_UI_COMPONENT_SELECTION_PROMPT).toMatch(
      /Grid[^\n]*[Dd]o not use Grid merely to place one component/
    )
  })

  it('tells Stat not to hold arbitrary text', () => {
    expect(ARENA_GENERATIVE_UI_COMPONENT_SELECTION_PROMPT).toMatch(
      /Stat[^\n]*[Nn]ever use Stat for arbitrary text/
    )
  })

  it('tells Skeleton to prefer statePath', () => {
    expect(ARENA_GENERATIVE_UI_COMPONENT_SELECTION_PROMPT).toMatch(/Skeleton[^\n]*prefer statePath/)
  })

  it('tells EmptyState the child is the next useful action', () => {
    expect(ARENA_GENERATIVE_UI_COMPONENT_SELECTION_PROMPT).toMatch(
      /EmptyState[^\n]*next useful action/
    )
  })

  it('keeps Modal off delete confirm and Toast off save success', () => {
    expect(ARENA_GENERATIVE_UI_COMPONENT_SELECTION_PROMPT).toMatch(
      /Modal[^\n]*[Nn]ot delete confirm/
    )
    expect(ARENA_GENERATIVE_UI_COMPONENT_SELECTION_PROMPT).toMatch(/Toast[^\n]*[Nn]ot save success/)
  })
})
