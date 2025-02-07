import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { useWorkflowStore } from '../workflow/store'
import { useEnvironmentStore } from '../environment/store'
import { AIChatStore, ChatMessage } from './types'
import { getNextBlockNumber } from './utils'

export const useAIChatStore = create<AIChatStore>()(
  devtools(
    (set, get) => ({
      messages: [],
      isProcessing: false,
      error: null,

      sendMessage: async (content: string) => {
        try {
          set({ isProcessing: true, error: null })
          
          const workflowStore = useWorkflowStore.getState()
          const apiKey = useEnvironmentStore.getState().getVariable('OPENAI_API_KEY')
          
          if (!apiKey) {
            throw new Error('OpenAI API key not found. Please add it to your environment variables.')
          }

          // User message
          const newMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: content.trim(),
            timestamp: Date.now(),
          }

          // Format messages for OpenAI API
          const formattedMessages = [
            ...get().messages.map(msg => ({
              role: msg.role,
              content: msg.content
            })),
            {
              role: newMessage.role,
              content: newMessage.content
            }
          ]

          // Add message to local state first
          set(state => ({
            messages: [...state.messages, newMessage]
          }))

          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-OpenAI-Key': apiKey
            },
            body: JSON.stringify({
              messages: formattedMessages,
              workflowState: {
                blocks: workflowStore.blocks,
                edges: workflowStore.edges
              }
            })
          })

          if (!response.ok) {
            throw new Error('Failed to send message')
          }

          const data = await response.json()

          console.log('OPENAI RESPONSE', data)
          
          // Handle any actions returned from the API
          if (data.actions) {
            for (const action of data.actions) {
              switch (action.name) {
                case 'addBlock': {
                  const { type, name, position } = action.parameters
                  const id = crypto.randomUUID()
                  const defaultPosition = position || {
                    x: Object.keys(workflowStore.blocks).length * 250,
                    y: 100
                  }
                  
                  // Generate name if not provided
                  const blockName = name || `${type} ${getNextBlockNumber(workflowStore.blocks, type)}`
                  
                  workflowStore.addBlock(id, type, blockName, defaultPosition)
                  break
                }
                case 'addEdge': {
                  const { sourceId, targetId, sourceHandle, targetHandle } = action.parameters
                  
                  workflowStore.addEdge({
                    id: crypto.randomUUID(),
                    source: sourceId,
                    target: targetId,
                    sourceHandle,
                    targetHandle,
                    type: 'custom'
                  })
                  break
                }
                case 'removeBlock': {
                  workflowStore.removeBlock(action.parameters.id)
                  break
                }
                case 'removeEdge': {
                  workflowStore.removeEdge(action.parameters.id)
                  break
                }
              }
            }
          }

          // Add assistant's response to chat
          if (data.message) {
            set(state => ({
              messages: [...state.messages, {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: data.message,
                timestamp: Date.now()
              }]
            }))
          }

        } catch (error) {
          console.error('Chat error:', error)
          set({ error: error instanceof Error ? error.message : 'Unknown error' })
        } finally {
          set({ isProcessing: false })
        }
      },

      clearChat: () => set({ messages: [], error: null }),
      setError: (error) => set({ error })
    }),
    { name: 'chat-store' }
  )
)