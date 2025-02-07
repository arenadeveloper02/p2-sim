export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface AIChatState {
  messages: ChatMessage[]
  isProcessing: boolean
  error: string | null
}

export interface AIChatActions {
  sendMessage: (content: string) => Promise<void>
  clearChat: () => void
  setError: (error: string | null) => void
}

export type AIChatStore = AIChatState & AIChatActions