'use client'

import { useCallback, useRef, useState } from 'react'
import { generateId } from '@sim/utils/id'
import { P2_COPILOT_CHAT_API_PATH } from '@/lib/p2-copilot/constants'
import type { BrainEvent, P2ChatMessage, P2ToolCallStatus } from '@/lib/p2-copilot/protocol'

interface UseP2CopilotChatOptions {
  workspaceId: string
  workflowId?: string
}

function parseBrainEvent(line: string): BrainEvent | null {
  if (!line.startsWith('data: ')) return null
  try {
    return JSON.parse(line.slice(6)) as BrainEvent
  } catch {
    return null
  }
}

export function useP2CopilotChat({ workspaceId, workflowId }: UseP2CopilotChatOptions) {
  const [messages, setMessages] = useState<P2ChatMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsSending(false)
  }, [])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isSending) return

      setError(null)
      setIsSending(true)

      const userMessage: P2ChatMessage = { id: generateId(), role: 'user', content: trimmed }
      const assistantId = generateId()

      const history = messages.map((m) => ({ role: m.role, content: m.content }))
      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: assistantId, role: 'assistant', content: '', toolCalls: [] },
      ])

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch(P2_COPILOT_CHAT_API_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            messages: history,
            workspaceId,
            workflowId,
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? `Request failed (${res.status})`)
        }

        if (!res.body) throw new Error('No response stream')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        const upsertToolCall = (toolCall: P2ToolCallStatus) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m
              const existing = m.toolCalls ?? []
              const idx = existing.findIndex((t) => t.id === toolCall.id)
              const toolCalls =
                idx >= 0
                  ? existing.map((t, i) => (i === idx ? { ...t, ...toolCall } : t))
                  : [...existing, toolCall]
              return { ...m, toolCalls }
            })
          )
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const event = parseBrainEvent(line.trim())
            if (!event) continue

            switch (event.type) {
              case 'text':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: m.content + event.delta } : m
                  )
                )
                break
              case 'tool_call':
                upsertToolCall({ id: event.id, name: event.name, status: 'running' })
                break
              case 'tool_result':
                upsertToolCall({
                  id: event.id,
                  name: event.name,
                  status: event.isError ? 'error' : 'done',
                  result: event.result,
                })
                break
              case 'error':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content || event.message }
                      : m
                  )
                )
                setError(event.message)
                break
              case 'complete':
                if (event.status === 'error' && event.message) setError(event.message)
                break
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'Failed to send message'
        setError(message)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && !m.content
              ? { ...m, content: `Error: ${message}` }
              : m
          )
        )
      } finally {
        setIsSending(false)
        abortRef.current = null
      }
    },
    [isSending, messages, workspaceId, workflowId]
  )

  const clearMessages = useCallback(() => {
    stopGeneration()
    setMessages([])
    setError(null)
  }, [stopGeneration])

  return { messages, isSending, error, sendMessage, stopGeneration, clearMessages }
}
