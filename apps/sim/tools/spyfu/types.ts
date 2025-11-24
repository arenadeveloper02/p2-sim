import type { TableRow, ToolResponse } from '@/tools/types'

export type SpyfuExecutionMode = 'predefined' | 'custom'

export interface SpyfuRequestParams {
  mode?: SpyfuExecutionMode
  operationId?: string
  customPath?: string
  customMethod?: string
  countryCode?: string
  queryParamsTable?: TableRow[] | Record<string, any> | null
  body?: string | Record<string, any> | null
  apiUsername?: string
  apiPassword?: string
}

export interface SpyfuResponse extends ToolResponse {
  output: {
    status: number
    data: any
    headers: Record<string, string>
    endpoint: string
    method: string
    query: Record<string, string>
  }
}

