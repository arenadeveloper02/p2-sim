'use client'

import { useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

function isEditableElement(element: Element | null): boolean {
  if (!element) return false
  
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element.hasAttribute('contenteditable') ||
    element.getAttribute('role') === 'textbox'
  )
}

/**
 * Get a formatted keyboard shortcut string for display
 */
export function getKeyboardShortcutText(
  key: string,
  requiresCmd = false,
  requiresShift = false,
  requiresAlt = false
): string {
  const isMac = isMacPlatform()
  const cmdKey = isMac ? '⌘' : 'Ctrl'
  const altKey = isMac ? '⌥' : 'Alt'
  const shiftKey = '⇧'

  const parts: string[] = []
  if (requiresCmd) parts.push(cmdKey)
  if (requiresShift) parts.push(shiftKey)
  if (requiresAlt) parts.push(altKey)
  parts.push(key)

  return parts.join('+')
}

/**
 * Hook to manage keyboard shortcuts for workflow execution
 */
export function useKeyboardShortcuts(
  onRunWorkflow: () => void, 
  isDisabled = false
) {
  const isMac = useMemo(() => isMacPlatform(), [])

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Early return if shortcuts are disabled
    if (isDisabled) return
    
    // Ensure event.key exists
    if (!event.key) return

    // Check for Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
    if (
      event.key === 'Enter' && 
      ((isMac && event.metaKey) || (!isMac && event.ctrlKey))
    ) {
      // Don't trigger if user is typing in an editable element
      if (isEditableElement(document.activeElement)) return

      event.preventDefault()
      onRunWorkflow()
    }
  }, [onRunWorkflow, isDisabled, isMac])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

/**
 * Hook to manage global navigation shortcuts
 */
export function useGlobalShortcuts() {
  const router = useRouter()
  const isMac = useMemo(() => isMacPlatform(), [])

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Ensure event.key exists
    if (!event.key) return

    // Don't trigger if user is typing in an editable element
    if (isEditableElement(document.activeElement)) return

    // Cmd/Ctrl + Shift + L - Navigate to Logs
    if (
      event.key.toLowerCase() === 'l' &&
      event.shiftKey &&
      ((isMac && event.metaKey) || (!isMac && event.ctrlKey))
    ) {
      event.preventDefault()

      try {
        const pathParts = window.location.pathname.split('/')
        const workspaceIndex = pathParts.indexOf('workspace')

        if (workspaceIndex !== -1 && pathParts[workspaceIndex + 1]) {
          const workspaceId = pathParts[workspaceIndex + 1]
          router.push(`/workspace/${workspaceId}/logs`)
        } else {
          router.push('/workspace')
        }
      } catch (error) {
        console.error('Navigation error:', error)
        // Fallback navigation
        router.push('/workspace')
      }
    }
  }, [router, isMac])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

export function useAllShortcuts(
  onRunWorkflow: () => void,
  isWorkflowDisabled = false
) {
  useKeyboardShortcuts(onRunWorkflow, isWorkflowDisabled)
  useGlobalShortcuts()
}