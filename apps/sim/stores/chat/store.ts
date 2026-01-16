import { createLogger } from '@sim/logger'
import { v4 as uuidv4 } from 'uuid'
import { create } from 'zustand'
import { devtools, persist, type PersistStorage } from 'zustand/middleware'
import { sanitizeMessagesForPersistence } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/chat/components/chat-message/constants'
import type { ChatMessage, ChatState } from './types'
import { MAX_CHAT_HEIGHT, MAX_CHAT_WIDTH, MIN_CHAT_HEIGHT, MIN_CHAT_WIDTH } from './utils'

const logger = createLogger('ChatStore')

/**
 * Maximum number of messages to store across all workflows
 */
const MAX_MESSAGES = 500

/**
 * Floating chat dimensions
 */
const DEFAULT_WIDTH = 305
const DEFAULT_HEIGHT = 286

/**
 * Safe storage adapter that handles QuotaExceededError gracefully
 * Sanitizes messages before storing to prevent localStorage quota issues
 */
const safeStorageAdapter: PersistStorage<ChatState> = {
  getItem: (name: string) => {
    if (typeof localStorage === 'undefined') return null
    try {
      const value = localStorage.getItem(name)
      if (value === null) return null
      return JSON.parse(value)
    } catch (e) {
      logger.warn('Failed to read from localStorage', e)
      return null
    }
  },
  setItem: (name: string, value: any) => {
    if (typeof localStorage === 'undefined') return
    try {
      // Ensure messages are sanitized before storing
      const sanitizedValue = {
        ...value,
        state: {
          ...value.state,
          messages: sanitizeMessagesForPersistence(value.state?.messages || []),
        },
      }
      const serialized = JSON.stringify(sanitizedValue)
      localStorage.setItem(name, serialized)
    } catch (e) {
      // Handle QuotaExceededError gracefully
      if (e instanceof Error && e.name === 'QuotaExceededError') {
        logger.warn('localStorage quota exceeded, reducing message count and retrying', e)
        try {
          // Try to keep only the most recent messages to ensure we don't exceed quota
          const messages = value.state?.messages || []
          const limitedMessages = messages.slice(0, Math.min(50, messages.length))
          const limitedState = {
            ...value,
            state: {
              ...value.state,
              messages: sanitizeMessagesForPersistence(limitedMessages),
            },
          }
          const serialized = JSON.stringify(limitedState)
          localStorage.setItem(name, serialized)
          logger.info('Successfully stored chat messages after reducing count')
        } catch (retryError) {
          logger.error('Failed to store chat messages even after reduction', retryError)
          // Last resort: try storing without messages
          try {
            const noMessagesState = {
              ...value,
              state: {
                ...value.state,
                messages: [],
              },
            }
            localStorage.setItem(name, JSON.stringify(noMessagesState))
            logger.warn('Stored chat state without messages due to quota limit')
          } catch (finalError) {
            logger.error('Failed to store chat state even without messages', finalError)
          }
        }
      } else {
        logger.warn('Failed to save to localStorage', e)
      }
    }
  },
  removeItem: (name: string) => {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.removeItem(name)
    } catch (e) {
      logger.warn('Failed to remove from localStorage', e)
    }
  },
}

/**
 * Floating chat store
 * Manages the open/close state, position, messages, and all chat functionality
 */
export const useChatStore = create<ChatState>()(
  devtools(
    persist(
      (set, get) => ({
        // UI State
        isChatOpen: false,
        chatPosition: null,
        chatWidth: DEFAULT_WIDTH,
        chatHeight: DEFAULT_HEIGHT,

        setIsChatOpen: (open) => {
          set({ isChatOpen: open })
        },

        setChatPosition: (position) => {
          set({ chatPosition: position })
        },

        setChatDimensions: (dimensions) => {
          set({
            chatWidth: Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, dimensions.width)),
            chatHeight: Math.max(MIN_CHAT_HEIGHT, Math.min(MAX_CHAT_HEIGHT, dimensions.height)),
          })
        },

        resetChatPosition: () => {
          set({ chatPosition: null })
        },

        // Message State
        messages: [],
        selectedWorkflowOutputs: {},
        conversationIds: {},

        addMessage: (message) => {
          set((state) => {
            const newMessage: ChatMessage = {
              ...message,
              // Preserve provided id and timestamp if they exist; otherwise generate new ones
              id: (message as any).id ?? crypto.randomUUID(),
              timestamp: (message as any).timestamp ?? new Date().toISOString(),
            }

            // Keep only the last MAX_MESSAGES
            const newMessages = [newMessage, ...state.messages].slice(0, MAX_MESSAGES)

            return { messages: newMessages }
          })
        },

        clearChat: (workflowId: string | null) => {
          set((state) => {
            const newState = {
              messages: state.messages.filter(
                (message) => !workflowId || message.workflowId !== workflowId
              ),
            }

            // Generate a new conversationId when clearing chat for a specific workflow
            if (workflowId) {
              const newConversationIds = { ...state.conversationIds }
              newConversationIds[workflowId] = uuidv4()
              return {
                ...newState,
                conversationIds: newConversationIds,
              }
            }
            // When clearing all chats (workflowId is null), also clear all conversationIds
            return {
              ...newState,
              conversationIds: {},
            }
          })
        },

        exportChatCSV: (workflowId: string) => {
          const messages = get().messages.filter((message) => message.workflowId === workflowId)

          if (messages.length === 0) {
            return
          }

          /**
           * Safely stringify and escape CSV values
           */
          const formatCSVValue = (value: any): string => {
            if (value === null || value === undefined) {
              return ''
            }

            let stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value)

            // Truncate very long strings
            if (stringValue.length > 2000) {
              stringValue = `${stringValue.substring(0, 2000)}...`
            }

            // Escape quotes and wrap in quotes if contains special characters
            if (
              stringValue.includes('"') ||
              stringValue.includes(',') ||
              stringValue.includes('\n')
            ) {
              stringValue = `"${stringValue.replace(/"/g, '""')}"`
            }

            return stringValue
          }

          // CSV Headers
          const headers = ['timestamp', 'type', 'content']

          // Sort messages by timestamp (oldest first)
          const sortedMessages = messages.sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          )

          // Generate CSV rows
          const csvRows = [
            headers.join(','),
            ...sortedMessages.map((message) =>
              [
                formatCSVValue(message.timestamp),
                formatCSVValue(message.type),
                formatCSVValue(message.content),
              ].join(',')
            ),
          ]

          // Create CSV content
          const csvContent = csvRows.join('\n')

          // Generate filename with timestamp
          const now = new Date()
          const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
          const filename = `chat-${workflowId}-${timestamp}.csv`

          // Create and trigger download
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
          const link = document.createElement('a')

          if (link.download !== undefined) {
            const url = URL.createObjectURL(blob)
            link.setAttribute('href', url)
            link.setAttribute('download', filename)
            link.style.visibility = 'hidden'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)
          }
        },

        setSelectedWorkflowOutput: (workflowId, outputIds) => {
          set((state) => {
            // Create a new copy of the selections state
            const newSelections = { ...state.selectedWorkflowOutputs }

            // If empty array, explicitly remove the key to prevent empty arrays from persisting
            if (outputIds.length === 0) {
              // Delete the key entirely instead of setting to empty array
              delete newSelections[workflowId]
            } else {
              // Ensure no duplicates in the selection by using Set
              newSelections[workflowId] = [...new Set(outputIds)]
            }

            return { selectedWorkflowOutputs: newSelections }
          })
        },

        getSelectedWorkflowOutput: (workflowId) => {
          return get().selectedWorkflowOutputs[workflowId] || []
        },

        getConversationId: (workflowId) => {
          const state = get()
          if (!state.conversationIds[workflowId]) {
            // Generate a new conversation ID if one doesn't exist
            return get().generateNewConversationId(workflowId)
          }
          return state.conversationIds[workflowId]
        },

        generateNewConversationId: (workflowId) => {
          const newId = uuidv4()
          set((state) => {
            const newConversationIds = { ...state.conversationIds }
            newConversationIds[workflowId] = newId
            return { conversationIds: newConversationIds }
          })
          return newId
        },

        appendMessageContent: (messageId, content) => {
          logger.debug('[ChatStore] appendMessageContent called', {
            messageId,
            contentLength: content.length,
            content: content.substring(0, 30),
          })
          set((state) => {
            const message = state.messages.find((m) => m.id === messageId)
            if (!message) {
              logger.warn('[ChatStore] Message not found for appending', { messageId })
            }

            const newMessages = state.messages.map((message) => {
              if (message.id === messageId) {
                const newContent =
                  typeof message.content === 'string'
                    ? message.content + content
                    : message.content
                      ? String(message.content) + content
                      : content
                logger.debug('[ChatStore] Updated message content', {
                  messageId,
                  oldLength: typeof message.content === 'string' ? message.content.length : 0,
                  newLength: newContent.length,
                  addedLength: content.length,
                })
                return {
                  ...message,
                  content: newContent,
                }
              }
              return message
            })

            return { messages: newMessages }
          })
        },

        finalizeMessageStream: (messageId) => {
          set((state) => {
            const newMessages = state.messages.map((message) => {
              if (message.id === messageId) {
                const { isStreaming, ...rest } = message
                return rest
              }
              return message
            })

            return { messages: newMessages }
          })
        },
      }),
      {
        name: 'chat-store',
        storage: safeStorageAdapter,
        partialize: (state) => {
          // Sanitize messages before persisting - replace base64 images with placeholders
          // This prevents localStorage quota issues while preserving message structure
          const sanitizedMessages = sanitizeMessagesForPersistence(state.messages)
          return {
            ...state,
            messages: sanitizedMessages,
          }
        },
      }
    )
  )
)
