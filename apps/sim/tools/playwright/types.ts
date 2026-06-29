import type { PlaywrightRunOutput } from '@/lib/api/contracts/tools/playwright'
import type { ToolResponse } from '@/tools/types'

export interface PlaywrightRunParams {
  steps: Array<Record<string, unknown>>
  headless?: boolean
  timeoutMs?: number
}

export interface PlaywrightRunResponse extends ToolResponse {
  output: PlaywrightRunOutput
}
