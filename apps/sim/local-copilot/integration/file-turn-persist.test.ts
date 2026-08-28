/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  extractLocalFileChatResources,
  localFileBodyContent,
  stripLocalFileBodyToolParams,
} from '@/local-copilot/integration/file-turn-persist'

describe('stripLocalFileBodyToolParams', () => {
  it('leaves unrelated tools unchanged', () => {
    const params = { path: 'files/notes.md' }
    expect(stripLocalFileBodyToolParams('workspace_file', params)).toBe(params)
  })

  it('omits edit_content bodies', () => {
    const body = 'pptx.addSlide()'
    expect(stripLocalFileBodyToolParams('edit_content', { content: body })).toEqual({
      contentOmitted: true,
      contentChars: body.length,
    })
  })

  it('omits nested create_file content', () => {
    expect(
      stripLocalFileBodyToolParams('create_file', {
        fileName: 'notes.md',
        args: { content: '# Hello' },
      })
    ).toEqual({
      fileName: 'notes.md',
      args: { contentOmitted: true, contentChars: 7 },
    })
  })
})

describe('localFileBodyContent', () => {
  it('reads top-level and nested content', () => {
    expect(localFileBodyContent({ content: 'a' })).toBe('a')
    expect(localFileBodyContent({ args: { content: 'b' } })).toBe('b')
    expect(localFileBodyContent({ fileName: 'x.md' })).toBeUndefined()
  })
})

describe('extractLocalFileChatResources', () => {
  it('extracts create_file through the shared shape', () => {
    expect(
      extractLocalFileChatResources(
        'create_file',
        { fileName: 'notes.md' },
        { success: true, data: { id: 'file_123', name: 'notes.md' } }
      )
    ).toEqual([{ type: 'file', id: 'file_123', title: 'notes.md' }])
  })

  it('extracts edit_content file ids the shared extractor ignores', () => {
    expect(
      extractLocalFileChatResources(
        'edit_content',
        { content: '# Body' },
        {
          success: true,
          data: { id: 'file_docx_1', name: 'proposal.docx' },
        }
      )
    ).toEqual([{ type: 'file', id: 'file_docx_1', title: 'proposal.docx' }])
  })
})
