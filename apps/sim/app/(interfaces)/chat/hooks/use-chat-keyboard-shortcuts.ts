'use client'

import { useEffect } from 'react'

interface UseChatKeyboardShortcutsOptions {
  onNewChat?: () => void
  onFocusSearch?: () => void
  onFocusInput?: () => void
  onCloseSidebar?: () => void
  onCancelRename?: () => void
  enabled?: boolean
}

/**
 * Global keyboard shortcuts for the deployed chat surface.
 */
export function useChatKeyboardShortcuts({
  onNewChat,
  onFocusSearch,
  onFocusInput,
  onCloseSidebar,
  onCancelRename,
  enabled = true,
}: UseChatKeyboardShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTyping =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable

      if (event.key === 'Escape') {
        onCancelRename?.()
        onCloseSidebar?.()
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        onNewChat?.()
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onFocusSearch?.()
        return
      }

      if (!isTyping && event.key === '/') {
        event.preventDefault()
        onFocusInput?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onNewChat, onFocusSearch, onFocusInput, onCloseSidebar, onCancelRename])
}
