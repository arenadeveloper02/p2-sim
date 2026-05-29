import type { ToolResponse, WorkflowToolExecutionContext } from '@/tools/types'

export interface SpyfuRequestParams {
  operationId?: string
  domain?: string
  keyword?: string
  date?: string
  countryCode?: string
  term?: string
  query?: string
  includeDomainsCsv?: string
  isIntersection?: boolean
  _context?: WorkflowToolExecutionContext
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
