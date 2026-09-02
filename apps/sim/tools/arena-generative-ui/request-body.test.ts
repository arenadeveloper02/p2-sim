/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { arenaGenerativeUiEditTool } from '@/tools/arena-generative-ui/edit_app'
import { arenaGenerativeUiGenerateTool } from '@/tools/arena-generative-ui/generate_app'
import { arenaGenerativeToolRequestBody } from '@/tools/arena-generative-ui/request-body'

describe('arenaGenerativeToolRequestBody', () => {
  it('omits null screenshots, pages, and nested binding schemas', () => {
    const body = arenaGenerativeToolRequestBody({
      userInput: 'Article Enhancer Agent with Generator and History.',
      screenshots: null,
      pages: null,
      apiBindings: [
        {
          key: 'enhance_article',
          kind: 'workflow',
          workflowId: '0f016c1a-c322-4d74-b72c-6785c13fd918',
          inputSchema: null,
          outputSchema: null,
          outputSchemaWarnings: null,
        },
      ],
      _context: { workspaceId: 'ws-1' },
    })

    expect(body).toEqual({
      userInput: 'Article Enhancer Agent with Generator and History.',
      apiBindings: [
        {
          key: 'enhance_article',
          kind: 'workflow',
          workflowId: '0f016c1a-c322-4d74-b72c-6785c13fd918',
        },
      ],
      workspaceId: 'ws-1',
    })
    expect(body).not.toHaveProperty('screenshots')
    expect(body).not.toHaveProperty('pages')
  })

  it('passes string apiBindings through unchanged', () => {
    const body = arenaGenerativeToolRequestBody({
      userInput: 'Directory app',
      apiBindings: '[{"key":"run_history","kind":"workflow","workflowId":"abc"}]',
    })

    expect(body.apiBindings).toBe('[{"key":"run_history","kind":"workflow","workflowId":"abc"}]')
  })
})

describe('arena generative UI tool request bodies', () => {
  it('generate omits null screenshots from the POST body', () => {
    const body = arenaGenerativeUiGenerateTool.request.body?.({
      userInput: 'Article Enhancer Agent',
      screenshots: null,
    })

    expect(body).not.toHaveProperty('screenshots')
    expect(JSON.stringify(body)).not.toContain('"screenshots"')
  })

  it('edit omits null screenshots from the POST body', () => {
    const body = arenaGenerativeUiEditTool.request.body?.({
      editInstructions: 'Make the header tighter',
      existingDraftId: 'draft-1',
      screenshots: null,
    })

    expect(body).not.toHaveProperty('screenshots')
    expect(JSON.stringify(body)).not.toContain('"screenshots"')
  })
})
