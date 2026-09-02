/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ArenaGenerativeUiBlock } from '@/blocks/blocks/arena-generative-ui'
import { AGENT_TOOL_BLOCK_TYPES, BUILT_IN_TOOL_TYPES } from '@/blocks/utils'
import { arenaGenerativeUiEditTool } from '@/tools/arena-generative-ui/edit_app'
import { arenaGenerativeUiGenerateTool } from '@/tools/arena-generative-ui/generate_app'
import { createLLMToolSchema, getToolIdForOperation } from '@/tools/params'

describe('ArenaGenerativeUiBlock agent tool', () => {
  it('is eligible as a built-in agent tool', () => {
    expect(AGENT_TOOL_BLOCK_TYPES.has('arena_generative_ui')).toBe(true)
    expect(BUILT_IN_TOOL_TYPES.has('arena_generative_ui')).toBe(true)
  })

  it('maps generate and edit operations to the registered tools', () => {
    expect(ArenaGenerativeUiBlock.tools?.access).toEqual([
      'arena_generative_ui_generate',
      'arena_generative_ui_edit',
    ])
    expect(ArenaGenerativeUiBlock.tools?.config.tool?.({ operation: 'generate' })).toBe(
      'arena_generative_ui_generate'
    )
    expect(ArenaGenerativeUiBlock.tools?.config.tool?.({ operation: 'edit' })).toBe(
      'arena_generative_ui_edit'
    )
    expect(getToolIdForOperation('arena_generative_ui', 'generate', ArenaGenerativeUiBlock)).toBe(
      'arena_generative_ui_generate'
    )
    expect(getToolIdForOperation('arena_generative_ui', 'edit', ArenaGenerativeUiBlock)).toBe(
      'arena_generative_ui_edit'
    )
  })

  it('exposes generate params to the agent except hidden context', async () => {
    const { schema } = await createLLMToolSchema(arenaGenerativeUiGenerateTool, {})

    expect(schema.properties).toHaveProperty('userInput')
    expect(schema.properties).toHaveProperty('pages')
    expect(schema.properties).toHaveProperty('entryPath')
    expect(schema.properties).toHaveProperty('apiBindings')
    expect(schema.properties).toHaveProperty('designNotes')
    expect(schema.properties).not.toHaveProperty('existingDraftId')
    expect(schema.properties).not.toHaveProperty('_context')
    expect(schema.properties).not.toHaveProperty('screenshots')
    expect(schema.required).toEqual(expect.arrayContaining(['userInput']))
  })

  it('requires editInstructions and existingDraftId on the edit tool schema', async () => {
    const { schema } = await createLLMToolSchema(arenaGenerativeUiEditTool, {})

    expect(schema.properties).toHaveProperty('editInstructions')
    expect(schema.properties).toHaveProperty('existingDraftId')
    expect(schema.properties).not.toHaveProperty('userInput')
    expect(schema.required).toEqual(expect.arrayContaining(['editInstructions', 'existingDraftId']))
  })

  it('hides preconfigured generate params from the agent schema', async () => {
    const { schema } = await createLLMToolSchema(arenaGenerativeUiGenerateTool, {
      userInput: 'Lead qualifier with home and results',
      entryPath: 'home',
    })

    expect(schema.properties).not.toHaveProperty('userInput')
    expect(schema.properties).not.toHaveProperty('entryPath')
    expect(schema.properties).toHaveProperty('pages')
  })
})

describe('ArenaGenerativeUiBlock field tooltips', () => {
  const tooltips = Object.fromEntries(
    ArenaGenerativeUiBlock.subBlocks.map((subBlock) => [subBlock.id, subBlock.tooltip])
  )

  it('explains User Input, Pages, Entry Path, API Bindings, Design Notes, and Screenshots', () => {
    expect(tooltips.userInput).toBeTruthy()
    expect(tooltips.pages).toBeTruthy()
    expect(tooltips.entryPath).toBeTruthy()
    expect(tooltips.apiBindings).toBeTruthy()
    expect(tooltips.designNotes).toBeTruthy()
    expect(tooltips.screenshots).toContain('approximates')
  })

  it('pairs the User Input prompt sample with the API Bindings key', () => {
    expect(tooltips.userInput).toContain('qualify_lead')
    expect(tooltips.userInput).toContain('Submit calls qualify_lead')
    expect(tooltips.apiBindings).toContain('qualify_lead')
    expect(tooltips.apiBindings).toContain('Submit calls qualify_lead')
    expect(tooltips.apiBindings).toContain('"stream": true')
  })

  it('opts the API Bindings field into the curl import helper', () => {
    const apiBindings = ArenaGenerativeUiBlock.subBlocks.find(
      (subBlock) => subBlock.id === 'apiBindings'
    )
    expect(apiBindings?.importHelper).toBe('arena-api-binding')
    expect(apiBindings?.readOnly).toBe(true)
    expect(apiBindings?.copilotWritable).toBe(true)
    expect(apiBindings?.maxHeight).toBe(96)
  })

  it('gives User Input extra rows and previews the original brief in Edit', () => {
    const userInput = ArenaGenerativeUiBlock.subBlocks.find(
      (subBlock) => subBlock.id === 'userInput'
    )
    const editInstructions = ArenaGenerativeUiBlock.subBlocks.find(
      (subBlock) => subBlock.id === 'editInstructions'
    )
    const designNotes = ArenaGenerativeUiBlock.subBlocks.find(
      (subBlock) => subBlock.id === 'designNotes'
    )
    const existingDraftId = ArenaGenerativeUiBlock.subBlocks.find(
      (subBlock) => subBlock.id === 'existingDraftId'
    )
    expect(userInput?.rows).toBe(10)
    expect(userInput?.wandConfig?.prompt).toContain('principal product engineer')
    expect(userInput?.wandConfig?.prompt).toContain('often a job, not a spec')
    expect(userInput?.wandConfig?.prompt).toContain('Do not invent API keys')
    expect(editInstructions?.rows).toBeUndefined()
    expect(designNotes?.rows).toBeUndefined()
    expect(existingDraftId?.previewHelper).toBe('arena-draft-brief')
  })
})
