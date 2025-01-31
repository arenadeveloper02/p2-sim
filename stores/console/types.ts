export interface ConsoleEntry {
  id: string
  output: any
  error?: string
  durationMs: number
  startedAt: string
  endedAt: string
  workflowId?: string | null
  timestamp: string
  blockName?: string
}

export interface ConsoleStore {
  entries: ConsoleEntry[]
  addConsole: (entry: Omit<ConsoleEntry, 'id'>) => void
  clearConsole: (workflowId: string | null) => void
  getWorkflowEntries: (workflowId: string) => ConsoleEntry[]
}