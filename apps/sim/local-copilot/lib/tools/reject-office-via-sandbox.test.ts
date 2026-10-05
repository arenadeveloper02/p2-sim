/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  OFFICE_VIA_SANDBOX_ERROR,
  rejectOfficeFileViaSandbox,
} from '@/local-copilot/lib/tools/reject-office-via-sandbox'

describe('rejectOfficeFileViaSandbox', () => {
  it('rejects function_execute with python-pptx code', () => {
    const result = rejectOfficeFileViaSandbox('function_execute', {
      language: 'python',
      code: 'from pptx import Presentation\nprs = Presentation()\n',
    })
    expect(result?.success).toBe(false)
    expect(result?.error).toBe(OFFICE_VIA_SANDBOX_ERROR)
  })

  it('rejects manage_sandbox that installs python-pptx', () => {
    const result = rejectOfficeFileViaSandbox('manage_sandbox', {
      operation: 'add',
      language: 'python',
      dependencies: ['python-pptx', 'requests'],
    })
    expect(result?.success).toBe(false)
    expect(result?.error).toContain('create_file')
  })

  it('rejects function_execute targeting a .pptx output path', () => {
    const result = rejectOfficeFileViaSandbox('function_execute', {
      language: 'python',
      code: 'print("hi")',
      outputs: { files: [{ path: 'files/Deck.pptx', mode: 'create' }] },
    })
    expect(result?.success).toBe(false)
  })

  it('allows ordinary python data jobs', () => {
    expect(
      rejectOfficeFileViaSandbox('function_execute', {
        language: 'python',
        code: 'import pandas as pd\nprint(pd.DataFrame({"a":[1]}).sum())',
        outputs: { files: [{ path: 'files/summary.csv', mode: 'create' }] },
      })
    ).toBeNull()
  })

  it('ignores unrelated tools', () => {
    expect(
      rejectOfficeFileViaSandbox('create_file', {
        fileName: 'files/Deck.pptx',
      })
    ).toBeNull()
  })
})
