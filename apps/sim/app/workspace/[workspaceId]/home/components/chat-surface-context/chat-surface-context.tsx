'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import { noop } from '@sim/utils/helpers'
import type { WorkspaceResourceRef } from '@/app/workspace/[workspaceId]/home/types'
import type { CopilotBackendPreference } from '@/local-copilot/lib/copilot-backend-preference'
import type { LocalCopilotCatalogId } from '@/local-copilot/lib/model-catalog'
import type { ChatContext } from '@/stores/panel'

/**
 * Identity and interaction callbacks shared across a Mothership chat surface
 * (home conversation view, home initial view, copilot panel). Carried via
 * context so leaf components (UserInput, MessageContent, MessageActions) can
 * consume them without relaying through every intermediate component.
 */
interface ChatSurfaceContextValue {
  /** Resolved id of the chat backing this surface, if one exists yet. */
  chatId?: string
  /** Id of the user interacting with this surface. */
  userId?: string
  /** Notifies the surface owner that a context chip was added to the input. */
  onContextAdd: (context: ChatContext) => void
  /**
   * Notifies the surface owner that a context chip was removed from the input.
   * `remaining` is the input's context list AFTER the removal, so the owner can
   * tell whether any other chip still references the removed chip's resource
   * before closing a shared slideover tab.
   */
  onContextRemove: (context: ChatContext, remaining: ChatContext[]) => void
  /** Opens a workspace resource referenced from rendered message content. */
  onWorkspaceResourceSelect: (resource: WorkspaceResourceRef) => void
  /** When true, show the Local / Cloud copilot switch in the chat input. */
  canSwitchCopilotBackend?: boolean
  copilotBackend?: CopilotBackendPreference
  setCopilotBackend?: (value: CopilotBackendPreference) => void
  /** Selected Local Copilot catalog model id for this conversation. */
  localCopilotCatalogId?: LocalCopilotCatalogId
  setLocalCopilotCatalogId?: (id: LocalCopilotCatalogId) => void
}

const ChatSurfaceContext = createContext<ChatSurfaceContextValue>({
  onContextAdd: noop,
  onContextRemove: noop,
  onWorkspaceResourceSelect: noop,
})

interface ChatSurfaceProviderProps {
  chatId?: string
  userId?: string
  onContextAdd?: (context: ChatContext) => void
  onContextRemove?: (context: ChatContext, remaining: ChatContext[]) => void
  onWorkspaceResourceSelect?: (resource: WorkspaceResourceRef) => void
  canSwitchCopilotBackend?: boolean
  copilotBackend?: CopilotBackendPreference
  setCopilotBackend?: (value: CopilotBackendPreference) => void
  localCopilotCatalogId?: LocalCopilotCatalogId
  setLocalCopilotCatalogId?: (id: LocalCopilotCatalogId) => void
  children: ReactNode
}

/**
 * Provides the chat-surface identity and interaction callbacks to descendants.
 * Callbacks are latched in refs and exposed as stable wrappers so the memoized
 * context value only changes when `chatId` or `userId` change — consumers do
 * not re-render when a parent re-creates a handler.
 */
export function ChatSurfaceProvider({
  chatId,
  userId,
  onContextAdd,
  onContextRemove,
  onWorkspaceResourceSelect,
  canSwitchCopilotBackend,
  copilotBackend,
  setCopilotBackend,
  localCopilotCatalogId,
  setLocalCopilotCatalogId,
  children,
}: ChatSurfaceProviderProps) {
  const onContextAddRef = useRef(onContextAdd)
  const onContextRemoveRef = useRef(onContextRemove)
  const onWorkspaceResourceSelectRef = useRef(onWorkspaceResourceSelect)

  useLayoutEffect(() => {
    onContextAddRef.current = onContextAdd
    onContextRemoveRef.current = onContextRemove
    onWorkspaceResourceSelectRef.current = onWorkspaceResourceSelect
  })

  const stableOnContextAdd = useCallback((context: ChatContext) => {
    onContextAddRef.current?.(context)
  }, [])
  const stableOnContextRemove = useCallback((context: ChatContext, remaining: ChatContext[]) => {
    onContextRemoveRef.current?.(context, remaining)
  }, [])
  const stableOnWorkspaceResourceSelect = useCallback((resource: WorkspaceResourceRef) => {
    onWorkspaceResourceSelectRef.current?.(resource)
  }, [])

  const value = useMemo<ChatSurfaceContextValue>(
    () => ({
      chatId,
      userId,
      onContextAdd: stableOnContextAdd,
      onContextRemove: stableOnContextRemove,
      onWorkspaceResourceSelect: stableOnWorkspaceResourceSelect,
      canSwitchCopilotBackend,
      copilotBackend,
      setCopilotBackend,
      localCopilotCatalogId,
      setLocalCopilotCatalogId,
    }),
    [
      chatId,
      userId,
      stableOnContextAdd,
      stableOnContextRemove,
      stableOnWorkspaceResourceSelect,
      canSwitchCopilotBackend,
      copilotBackend,
      setCopilotBackend,
      localCopilotCatalogId,
      setLocalCopilotCatalogId,
    ]
  )

  return <ChatSurfaceContext.Provider value={value}>{children}</ChatSurfaceContext.Provider>
}

/**
 * Reads the surrounding chat surface. Outside a provider this returns no-op
 * callbacks and undefined identity, matching the previous optional-prop
 * behavior.
 */
export function useChatSurface(): ChatSurfaceContextValue {
  return useContext(ChatSurfaceContext)
}
