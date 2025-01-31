export interface ConsoleEntry {
  id: string
  output: any
  error?: string
  durationMs: number
  startedAt: string
  endedAt: string
  workflowId?: string | null
  timestamp: string 
}

export interface ConsoleStore {
  entries: ConsoleEntry[]
  addConsole: (entry: Omit<ConsoleEntry, 'id'>) => void
  clearConsole: () => void
  getWorkflowEntries: (workflowId: string) => ConsoleEntry[]
}