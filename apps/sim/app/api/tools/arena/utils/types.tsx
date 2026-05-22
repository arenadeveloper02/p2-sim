export interface WorkflowTokenResult {
  found: true
  workflowId: string
  userId: string
  arenaToken: string
  timezone: string | null
  persona: string | null
}

export interface WorkflowTokenNotFound {
  found: false
  reason: string
}

export type WorkflowTokenLookup = WorkflowTokenResult | WorkflowTokenNotFound
