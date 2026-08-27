'use client'

import { useCallback, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import type {
  ApplyLocalCopilotPatchBody,
  LocalCopilotChatBody,
  LocalCopilotConfigResponse,
} from '@/local-copilot/contracts/local-copilot'
import {
  applyLocalCopilotPatchContract,
  getLocalCopilotConfigContract,
  getLocalCopilotPatchContract,
  getLocalCopilotSessionMemoryContract,
  listLocalCopilotConversationsContract,
  rejectLocalCopilotPatchContract,
  updateLocalCopilotConfigContract,
} from '@/local-copilot/contracts/local-copilot'
import { formatLocalToolConfirmationTag } from '@/local-copilot/lib/security/tool-confirmation-policy'
import { formatTrustedControl } from '@/local-copilot/lib/security/trusted-controls'
import type { LocalCopilotStreamEvent, WorkflowPatch } from '@/local-copilot/lib/types'
import { stripIdsFromUserFacingText } from '@/local-copilot/lib/user-facing-text'

export const LOCAL_COPILOT_SESSION_MEMORY_STALE_TIME = 30_000

export const localCopilotKeys = {
  all: ['local-copilot'] as const,
  config: () => [...localCopilotKeys.all, 'config'] as const,
  conversations: () => [...localCopilotKeys.all, 'conversations'] as const,
  conversationList: (workspaceId?: string, workflowId?: string) =>
    [...localCopilotKeys.conversations(), workspaceId ?? '', workflowId ?? ''] as const,
  patch: (patchId?: string) => [...localCopilotKeys.all, 'patch', patchId ?? ''] as const,
  sessionMemories: () => [...localCopilotKeys.all, 'session-memory'] as const,
  sessionMemory: (chatId?: string) =>
    [...localCopilotKeys.sessionMemories(), chatId ?? ''] as const,
}

/**
 * Loads chat-scoped session memory for the Local Copilot inspector.
 */
export function useLocalCopilotSessionMemory(chatId?: string) {
  return useQuery({
    queryKey: localCopilotKeys.sessionMemory(chatId),
    queryFn: ({ signal }) =>
      requestJson(getLocalCopilotSessionMemoryContract, {
        query: { chatId: chatId as string },
        signal,
      }),
    enabled: Boolean(chatId),
    staleTime: LOCAL_COPILOT_SESSION_MEMORY_STALE_TIME,
  })
}

export interface LocalCopilotMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  patchId?: string
  patch?: WorkflowPatch
  recommendations?: string[]
  streaming?: boolean
}

export interface UseLocalCopilotOptions {
  workspaceId: string
  workflowId: string
  selectedBlockId?: string
  executionId?: string
  onPatchApplied?: () => void
}

export function useLocalCopilotConfig() {
  return useQuery({
    queryKey: localCopilotKeys.config(),
    queryFn: ({ signal }) => requestJson(getLocalCopilotConfigContract, { signal }),
    staleTime: 60_000,
  })
}

/**
 * Persists the Local picker selection to `local_copilot_user_access.default_model`.
 */
export function useUpdateLocalCopilotDefaultModel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (defaultCatalogId: LocalCopilotConfigResponse['defaultCatalogId']) =>
      requestJson(updateLocalCopilotConfigContract, { body: { defaultCatalogId } }),
    onMutate: async (defaultCatalogId) => {
      await queryClient.cancelQueries({ queryKey: localCopilotKeys.config() })
      const previous = queryClient.getQueryData<LocalCopilotConfigResponse>(
        localCopilotKeys.config()
      )
      if (previous) {
        queryClient.setQueryData<LocalCopilotConfigResponse>(localCopilotKeys.config(), {
          ...previous,
          defaultCatalogId,
        })
      }
      return { previous }
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(localCopilotKeys.config(), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: localCopilotKeys.config() })
    },
  })
}

export function useLocalCopilotConversations(workspaceId: string, workflowId?: string) {
  return useQuery({
    queryKey: localCopilotKeys.conversationList(workspaceId, workflowId),
    queryFn: ({ signal }) =>
      requestJson(listLocalCopilotConversationsContract, {
        query: { workspaceId, workflowId },
        signal,
      }),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  })
}

export function useLocalCopilot(options: UseLocalCopilotOptions) {
  const { workspaceId, workflowId, selectedBlockId, executionId, onPatchApplied } = options
  const queryClient = useQueryClient()
  const [messages, setMessages] = useState<LocalCopilotMessage[]>([])
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [isStreaming, setIsStreaming] = useState(false)
  const [pendingPatch, setPendingPatch] = useState<{
    patchId: string
    patch: WorkflowPatch
  } | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim() || isStreaming) return

      const userMessage: LocalCopilotMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: message.trim(),
      }

      const assistantId = `assistant-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: assistantId, role: 'assistant', text: '', streaming: true },
      ])
      setIsStreaming(true)
      setPendingPatch(null)

      abortRef.current?.abort()
      abortRef.current = new AbortController()
      let assistantText = ''

      const body: LocalCopilotChatBody = {
        workspaceId,
        workflowId,
        message: message.trim(),
        conversationId,
        selectedBlockId,
        executionId,
      }

      try {
        // boundary-raw-fetch: SSE streaming chunks must be processed as they arrive
        const response = await fetch('/api/local-copilot/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abortRef.current.signal,
        })

        if (!response.ok) {
          const errorBody = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(errorBody.error ?? `Request failed (${response.status})`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response stream')

        const decoder = new TextDecoder()
        let buffer = ''
        let patchId: string | undefined
        let patch: WorkflowPatch | undefined
        let recommendations: string[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''

          for (const part of parts) {
            const line = part.trim()
            if (!line.startsWith('data:')) continue
            const event = JSON.parse(line.slice(5).trim()) as LocalCopilotStreamEvent

            if (event.type === 'text_delta') {
              const safe = stripIdsFromUserFacingText(event.content)
              if (!safe) continue
              assistantText += safe
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, text: assistantText, streaming: true } : m
                )
              )
            }
            if (event.type === 'trusted_control') {
              const controlText = formatTrustedControl(event.control)
              assistantText += `${assistantText.trim() ? '\n\n' : ''}${controlText}`
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, text: assistantText, streaming: true } : m
                )
              )
            }
            if (event.type === 'confirmation_required') {
              const controlText = formatLocalToolConfirmationTag(
                event.toolCallId,
                event.toolName,
                event.requirement
              )
              assistantText += `${assistantText.trim() ? '\n\n' : ''}${controlText}`
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, text: assistantText, streaming: true } : m
                )
              )
            }
            if (event.type === 'patch_proposed') {
              patchId = event.patchId
              patch = event.patch
              setPendingPatch({ patchId: event.patchId, patch: event.patch })
            }
            if (event.type === 'recommendations') {
              recommendations = event.items
            }
            if (event.type === 'error') {
              throw new Error(stripIdsFromUserFacingText(event.message) || event.message)
            }
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  text: assistantText || 'Done.',
                  streaming: false,
                  patchId,
                  patch,
                  recommendations: recommendations.length ? recommendations : undefined,
                }
              : m
          )
        )
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    text: assistantText.trim() || 'Stopped.',
                    streaming: false,
                  }
                : m
            )
          )
          return
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  text: error instanceof Error ? error.message : 'Something went wrong',
                  streaming: false,
                }
              : m
          )
        )
      } finally {
        setIsStreaming(false)
      }
    },
    [conversationId, executionId, isStreaming, selectedBlockId, workflowId, workspaceId]
  )

  const applyPatch = useMutation({
    mutationFn: async (patchId: string) => {
      const body: ApplyLocalCopilotPatchBody = { workflowId }
      return requestJson(applyLocalCopilotPatchContract, {
        params: { patchId },
        body,
      })
    },
    onSettled: (_data, _error, patchId) => {
      queryClient.invalidateQueries({ queryKey: localCopilotKeys.patch(patchId) })
      setPendingPatch(null)
      onPatchApplied?.()
    },
  })

  const rejectPatch = useMutation({
    mutationFn: (patchId: string) =>
      requestJson(rejectLocalCopilotPatchContract, { params: { patchId } }),
    onSettled: () => setPendingPatch(null),
  })

  const loadPatch = useCallback(async (patchId: string) => {
    const data = await requestJson(getLocalCopilotPatchContract, { params: { patchId } })
    setPendingPatch({ patchId: data.id, patch: data.patch })
    setShowDiff(true)
  }, [])

  const clearChat = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setConversationId(undefined)
    setPendingPatch(null)
    setShowDiff(false)
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }, [])

  const debugLastRun = useCallback(() => {
    void sendMessage('Debug the last failed workflow run. Explain root cause and suggest fixes.')
  }, [sendMessage])

  const explainSelectedBlock = useCallback(() => {
    if (!selectedBlockId) return
    void sendMessage(`Explain block ${selectedBlockId} — what it does and why it is needed.`)
  }, [selectedBlockId, sendMessage])

  const generateWorkflow = useCallback(() => {
    void sendMessage(
      'Help me generate a workflow from my description. Ask clarifying questions if needed.'
    )
  }, [sendMessage])

  return {
    messages,
    isStreaming,
    pendingPatch,
    showDiff,
    setShowDiff,
    sendMessage,
    stop,
    applyPatch,
    rejectPatch,
    loadPatch,
    clearChat,
    debugLastRun,
    explainSelectedBlock,
    generateWorkflow,
  }
}
