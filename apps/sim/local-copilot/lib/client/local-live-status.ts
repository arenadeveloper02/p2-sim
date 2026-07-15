'use client'

/**
 * Ephemeral Local-only live status bus so the right-hand preview panel can show
 * the same server status lines as the chat trailing indicator — without a second LLM path.
 */

let current: string | undefined
const listeners = new Set<() => void>()

export function setLocalLiveStatus(message: string | undefined): void {
  const next = message?.trim() || undefined
  if (next === current) return
  current = next
  for (const listener of listeners) {
    listener()
  }
}

export function getLocalLiveStatus(): string | undefined {
  return current
}

export function subscribeLocalLiveStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
