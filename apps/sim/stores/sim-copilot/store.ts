/**
 * Sim Copilot Store
 * Zustand store for managing copilot state with model switching and accept/reject flow
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProviderId } from '@/lib/sim-copilot/ai-models'
import { PROVIDER_MODELS } from '@/lib/sim-copilot/ai-models'

export type CopilotMode = 'ask' | 'agent'

export interface ToolCallInfo {
  id: string
  name: string
  arguments: string
  result?: string
}

export interface CopilotMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  timestamp: number
  toolCalls?: ToolCallInfo[]
  toolCallId?: string
}

export interface EditOperation {
  action: string
  block_type?: string
  position?: { x: number; y: number }
  block_id?: string
  source_id?: string
  target_id?: string
  source_handle?: string
  target_handle?: string
  connection_id?: string
  values?: Record<string, unknown>
}

export interface PendingEdit {
  operations: EditOperation[]
  toolCallId: string
  assistantMessageId: string
}

export interface SimCopilotState {
  // UI State
  isOpen: boolean
  mode: CopilotMode
  
  // Chat State
  messages: CopilotMessage[]
  isStreaming: boolean
  
  // Model Selection
  provider: ProviderId
  model: string
  
  // Pending Edit (Accept/Reject)
  pendingEdit: PendingEdit | null
  
  // Actions
  togglePanel: () => void
  setIsOpen: (open: boolean) => void
  setMode: (mode: CopilotMode) => void
  setProvider: (provider: ProviderId) => void
  setModel: (model: string) => void
  clearChat: () => void
  
  // Message Actions
  addMessage: (message: Omit<CopilotMessage, 'id' | 'timestamp'>) => string
  updateMessage: (id: string, content: string) => void
  finalizeMessage: (id: string, content: string, toolCalls?: ToolCallInfo[]) => void
  
  // Pending Edit Actions
  setPendingEdit: (edit: PendingEdit | null) => void
  acceptPending: () => Promise<void>
  rejectPending: () => void
  
  // Send Message
  sendMessage: (text: string, workflowState?: any) => Promise<void>
}

const MAX_TOOL_ROUNDS = 8

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

// Create store
export const useSimCopilotStore = create<SimCopilotState>()(
  persist(
    (set, get) => ({
      // Initial State
      isOpen: false,
      mode: 'agent',
      messages: [],
      isStreaming: false,
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      pendingEdit: null,

      // UI Actions
      togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),
      setIsOpen: (open) => set({ isOpen: open }),
      setMode: (mode) => set({ mode }),
      
      setProvider: (provider) => {
        const models = PROVIDER_MODELS[provider] ?? []
        set({ provider, model: models[0] ?? '' })
      },
      
      setModel: (model) => set({ model }),
      
      clearChat: () => set({ messages: [], isStreaming: false, pendingEdit: null }),

      // Message Actions
      addMessage: (message) => {
        const id = generateId()
        const fullMessage: CopilotMessage = {
          ...message,
          id,
          timestamp: Date.now(),
        }
        set((s) => ({ messages: [...s.messages, fullMessage] }))
        return id
      },

      updateMessage: (id, content) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, content } : m
          ),
        }))
      },

      finalizeMessage: (id, content, toolCalls) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id
              ? { ...m, content, toolCalls: toolCalls?.length ? toolCalls : undefined }
              : m
          ),
        }))
      },

      // Pending Edit Actions
      setPendingEdit: (edit) => set({ pendingEdit: edit, isStreaming: false }),

      acceptPending: async () => {
        const { pendingEdit, provider, model } = get()
        if (!pendingEdit) return

        // Execute the edit operations on the workflow
        const result = await executeEditOperations(pendingEdit.operations)
        const resultStr = JSON.stringify(result)

        // Add tool result message
        const toolMsgId = get().addMessage({
          role: 'tool',
          content: resultStr,
          toolCallId: pendingEdit.toolCallId,
        })

        // Add confirmation message
        get().addMessage({
          role: 'assistant',
          content: result.success
            ? '✅ Changes applied to the workflow.'
            : `⚠️ Some operations failed: ${result.error ?? JSON.stringify(result.data)}`,
        })

        set({ pendingEdit: null })

        // Continue conversation loop
        const updatedHistory = get().messages
        await runConversationLoop(updatedHistory, provider, model, 0)
      },

      rejectPending: () => {
        const { pendingEdit, provider, model } = get()
        if (!pendingEdit) return

        // Add rejection tool result
        get().addMessage({
          role: 'tool',
          content: JSON.stringify({ success: false, error: 'User rejected the proposed changes.' }),
          toolCallId: pendingEdit.toolCallId,
        })

        // Add rejection message
        get().addMessage({
          role: 'assistant',
          content: '❌ Changes were rejected. The workflow was not modified.',
        })

        set({ pendingEdit: null })
      },

      // Send Message
      sendMessage: async (text, workflowState) => {
        const { provider, model, messages: existingMessages, mode } = get()

        // Add user message
        get().addMessage({
          role: 'user',
          content: text,
        })

        set({ isStreaming: true })

        try {
          if (mode === 'ask') {
            // Ask mode: Simple Q&A without tool calling
            await runAskMode(text, provider, model, workflowState)
          } else {
            // Agent mode: Full tool calling with workflow manipulation
            const updatedHistory = get().messages
            await runConversationLoop(updatedHistory, provider, model, 0, workflowState)
          }
        } catch (error) {
          get().addMessage({
            role: 'assistant',
            content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          })
        } finally {
          set({ isStreaming: false })
        }
      },
    }),
    {
      name: 'sim-copilot-store',
      partialize: (state) => ({
        isOpen: state.isOpen,
        mode: state.mode,
        provider: state.provider,
        model: state.model,
      }),
    }
  )
)

// Helper function to execute edit operations
async function executeEditOperations(operations: EditOperation[]): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // This will be called from the client side to actually modify the workflow
    // For now, we'll dispatch a custom event that the workflow editor can listen to
    const event = new CustomEvent('sim-copilot-edit', { detail: { operations } })
    window.dispatchEvent(event)
    
    return { success: true, data: { appliedOperations: operations.length } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Run conversation loop with tool calling
async function runConversationLoop(
  historySnapshot: CopilotMessage[],
  provider: ProviderId,
  model: string,
  round: number,
  workflowState?: any
) {
  if (round >= MAX_TOOL_ROUNDS) return

  const store = useSimCopilotStore.getState()

  try {
    const response = await fetch('/api/sim-copilot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: historySnapshot[historySnapshot.length - 1]?.content || '',
        workflowId: workflowState?.workflowId || 'current',
        conversationHistory: historySnapshot.slice(0, -1).map(m => ({
          role: m.role,
          content: m.content,
          tool_calls: m.toolCalls?.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          })),
          tool_call_id: m.toolCallId,
        })),
        workflowState,
        provider,
        model,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      store.addMessage({
        role: 'assistant',
        content: `Error: ${errText}`,
      })
      return
    }

    const data = await response.json()

    if (data.type === 'tool_execution_required') {
      // Handle pending tools that need client execution
      if (data.pendingTools) {
        for (const tool of data.pendingTools) {
          if (tool.name === 'edit_workflow') {
            // Set pending edit for accept/reject
            store.setPendingEdit({
              operations: tool.arguments.operations || [],
              toolCallId: tool.id,
              assistantMessageId: '',
            })
            
            // Add assistant message about proposed changes
            store.addMessage({
              role: 'assistant',
              content: data.content || 'I\'d like to make the following changes to your workflow:',
              toolCalls: data.pendingTools.map((t: any) => ({
                id: t.id,
                name: t.name,
                arguments: JSON.stringify(t.arguments),
              })),
            })
            return
          }
        }
      }
    }

    // Add assistant response
    if (data.content) {
      store.addMessage({
        role: 'assistant',
        content: data.content,
        toolCalls: data.toolResults?.map((tr: any) => ({
          id: tr.toolCallId,
          name: tr.name,
          arguments: '',
          result: JSON.stringify(tr.result),
        })),
      })
    }

  } catch (error) {
    store.addMessage({
      role: 'assistant',
      content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }
}

// Run simple ask mode without tool calling
async function runAskMode(text: string, provider: ProviderId, model: string, workflowState?: any) {
  const store = useSimCopilotStore.getState()

  try {
    const response = await fetch('/api/sim-copilot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        workflowId: workflowState?.workflowId || 'current',
        conversationHistory: [],
        provider,
        model,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      store.addMessage({
        role: 'assistant',
        content: `Error: ${errText}`,
      })
      return
    }

    const data = await response.json()
    
    if (data.content) {
      store.addMessage({
        role: 'assistant',
        content: data.content,
      })
    }

  } catch (error) {
    store.addMessage({
      role: 'assistant',
      content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }
}
