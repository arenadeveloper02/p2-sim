import { createLogger } from '@sim/logger'
import { create } from 'zustand'
import { createJSONStorage, devtools, type PersistStorage, persist } from 'zustand/middleware'
import { redactApiKeys } from '@/lib/core/security/redaction'
import { getQueryClient } from '@/app/_shell/providers/query-provider'
import { truncateLargeBase64Data } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/chat/components/chat-message/constants'
import type { NormalizedBlockOutput } from '@/executor/types'
import { type GeneralSettings, generalSettingsKeys } from '@/hooks/queries/general-settings'
import { useExecutionStore } from '@/stores/execution'
import { useNotificationStore } from '@/stores/notifications'
import { indexedDBStorage } from '@/stores/terminal/console/storage'
import type { ConsoleEntry, ConsoleStore, ConsoleUpdate } from '@/stores/terminal/console/types'

const logger = createLogger('TerminalConsoleStore')

/**
 * Safe storage adapter that handles QuotaExceededError gracefully
 */
const safeStorageAdapter: PersistStorage<ConsoleStore> = {
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
      const serialized = JSON.stringify(value)
      localStorage.setItem(name, serialized)
    } catch (e) {
      // Handle QuotaExceededError gracefully
      if (e instanceof Error && e.name === 'QuotaExceededError') {
        logger.warn('localStorage quota exceeded, clearing old entries and retrying', e)
        try {
          // Try to clear some old entries and retry
          if (value?.state?.entries && Array.isArray(value.state.entries)) {
            // Keep only the most recent 20 entries to ensure we don't exceed quota
            const limitedEntries = value.state.entries.slice(0, 20)
            const limitedState = {
              ...value,
              state: {
                ...value.state,
                entries: limitedEntries,
              },
            }
            const serialized = JSON.stringify(limitedState)
            localStorage.setItem(name, serialized)
            logger.info('Successfully stored console entries after truncation')
          }
        } catch (retryError) {
          logger.error('Failed to store console entries even after truncation', retryError)
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
 * Updates a NormalizedBlockOutput with new content
 */
const MAX_ENTRIES_PER_WORKFLOW = 5000

const updateBlockOutput = (
  existingOutput: NormalizedBlockOutput | undefined,
  contentUpdate: string
): NormalizedBlockOutput => {
  return {
    ...(existingOutput || {}),
    content: contentUpdate,
  }
}

const isStreamingOutput = (output: any): boolean => {
  if (typeof ReadableStream !== 'undefined' && output instanceof ReadableStream) {
    return true
  }

  if (typeof output !== 'object' || !output) {
    return false
  }

  return (
    output.isStreaming === true ||
    ('executionData' in output &&
      typeof output.executionData === 'object' &&
      output.executionData?.isStreaming === true) ||
    'stream' in output
  )
}

const shouldSkipEntry = (output: any): boolean => {
  if (typeof output !== 'object' || !output) {
    return false
  }

  if ('stream' in output && 'executionData' in output) {
    return true
  }

  if ('stream' in output && 'execution' in output) {
    return true
  }

  return false
}

const matchesEntryForUpdate = (
  entry: ConsoleEntry,
  blockId: string,
  executionId: string | undefined,
  update: string | ConsoleUpdate
): boolean => {
  if (entry.blockId !== blockId || entry.executionId !== executionId) {
    return false
  }

  if (typeof update !== 'object') {
    return true
  }

  if (update.executionOrder !== undefined && entry.executionOrder !== update.executionOrder) {
    return false
  }

  if (update.iterationCurrent !== undefined && entry.iterationCurrent !== update.iterationCurrent) {
    return false
  }

  if (
    update.iterationContainerId !== undefined &&
    entry.iterationContainerId !== update.iterationContainerId
  ) {
    return false
  }

  return true
}

interface NotifyBlockErrorParams {
  error: unknown
  blockName: string
  workflowId?: string
  logContext: Record<string, unknown>
}

/**
 * Sends an error notification for a block failure if error notifications are enabled.
 */
const notifyBlockError = ({ error, blockName, workflowId, logContext }: NotifyBlockErrorParams) => {
  const settings = getQueryClient().getQueryData<GeneralSettings>(generalSettingsKeys.settings())
  const isErrorNotificationsEnabled = settings?.errorNotificationsEnabled ?? true

  if (!isErrorNotificationsEnabled) return

  try {
    const errorMessage = String(error)
    const displayName = blockName || 'Unknown Block'
    const displayMessage = `${displayName}: ${errorMessage}`
    const copilotMessage = `${errorMessage}\n\nError in ${displayName}.\n\nPlease fix this.`

    useNotificationStore.getState().addNotification({
      level: 'error',
      message: displayMessage,
      workflowId,
      action: {
        type: 'copilot',
        message: copilotMessage,
      },
    })
  } catch (notificationError) {
    logger.error('Failed to create block error notification', {
      ...logContext,
      error: notificationError,
    })
  }
}

export const useTerminalConsoleStore = create<ConsoleStore>()(
  devtools(
    persist(
      (set, get) => ({
        entries: [],
        isOpen: false,
        _hasHydrated: false,

        setHasHydrated: (hasHydrated) => set({ _hasHydrated: hasHydrated }),

        addConsole: (entry: Omit<ConsoleEntry, 'id' | 'timestamp'>) => {
          set((state) => {
            if (shouldSkipEntry(entry.output)) {
              return { entries: state.entries }
            }

            // Redact API keys from output
            let redactedEntry = { ...entry }
            if (
              !isStreamingOutput(entry.output) &&
              redactedEntry.output &&
              typeof redactedEntry.output === 'object'
            ) {
              redactedEntry.output = redactApiKeys(redactedEntry.output)
            }
            if (redactedEntry.input && typeof redactedEntry.input === 'object') {
              redactedEntry.input = redactApiKeys(redactedEntry.input)
            }

            // Truncate large base64 image data to prevent localStorage quota issues
            redactedEntry = {
              ...redactedEntry,
              output: truncateLargeBase64Data(redactedEntry.output),
              input: truncateLargeBase64Data(redactedEntry.input),
            }

            // Create new entry with ID and timestamp
            const newEntry: ConsoleEntry = {
              ...redactedEntry,
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
            }

            const newEntries = [newEntry, ...state.entries]

            const executionsToRemove = new Set<string>()

            const workflowGroups = new Map<string, ConsoleEntry[]>()
            for (const e of newEntries) {
              const group = workflowGroups.get(e.workflowId) || []
              group.push(e)
              workflowGroups.set(e.workflowId, group)
            }

            for (const [workflowId, entries] of workflowGroups) {
              if (entries.length <= MAX_ENTRIES_PER_WORKFLOW) continue

              const execOrder: string[] = []
              const seen = new Set<string>()
              for (const e of entries) {
                const execId = e.executionId ?? e.id
                if (!seen.has(execId)) {
                  execOrder.push(execId)
                  seen.add(execId)
                }
              }

              const counts = new Map<string, number>()
              for (const e of entries) {
                const execId = e.executionId ?? e.id
                counts.set(execId, (counts.get(execId) || 0) + 1)
              }

              let total = 0
              const toKeep = new Set<string>()
              for (const execId of execOrder) {
                const c = counts.get(execId) || 0
                if (total + c <= MAX_ENTRIES_PER_WORKFLOW) {
                  toKeep.add(execId)
                  total += c
                }
              }

              for (const execId of execOrder) {
                if (!toKeep.has(execId)) {
                  executionsToRemove.add(`${workflowId}:${execId}`)
                }
              }
            }

            const trimmedEntries = newEntries.filter((e) => {
              const key = `${e.workflowId}:${e.executionId ?? e.id}`
              return !executionsToRemove.has(key)
            })

            return { entries: trimmedEntries }
          })

          const newEntry = get().entries[0]

          if (newEntry?.error) {
            notifyBlockError({
              error: newEntry.error,
              blockName: newEntry.blockName || 'Unknown Block',
              workflowId: entry.workflowId,
              logContext: { entryId: newEntry.id },
            })
          }

          return newEntry
        },

        clearWorkflowConsole: (workflowId: string) => {
          set((state) => ({
            entries: state.entries.filter((entry) => entry.workflowId !== workflowId),
          }))
          useExecutionStore.getState().clearRunPath(workflowId)
        },

        exportConsoleCSV: (workflowId: string) => {
          const entries = get().entries.filter((entry) => entry.workflowId === workflowId)

          if (entries.length === 0) {
            return
          }

          const formatCSVValue = (value: any): string => {
            if (value === null || value === undefined) {
              return ''
            }

            let stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value)

            if (
              stringValue.includes('"') ||
              stringValue.includes(',') ||
              stringValue.includes('\n')
            ) {
              stringValue = `"${stringValue.replace(/"/g, '""')}"`
            }

            return stringValue
          }

          const headers = [
            'timestamp',
            'blockName',
            'blockType',
            'startedAt',
            'endedAt',
            'durationMs',
            'success',
            'input',
            'output',
            'error',
            'warning',
          ]

          const csvRows = [
            headers.join(','),
            ...entries.map((entry) =>
              [
                formatCSVValue(entry.timestamp),
                formatCSVValue(entry.blockName),
                formatCSVValue(entry.blockType),
                formatCSVValue(entry.startedAt),
                formatCSVValue(entry.endedAt),
                formatCSVValue(entry.durationMs),
                formatCSVValue(entry.success),
                formatCSVValue(entry.input),
                formatCSVValue(entry.output),
                formatCSVValue(entry.error),
                formatCSVValue(entry.warning),
              ].join(',')
            ),
          ]

          const csvContent = csvRows.join('\n')
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
          const filename = `terminal-console-${workflowId}-${timestamp}.csv`

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

        getWorkflowEntries: (workflowId) => {
          return get().entries.filter((entry) => entry.workflowId === workflowId)
        },

        toggleConsole: () => {
          set((state) => ({ isOpen: !state.isOpen }))
        },

        updateConsole: (blockId: string, update: string | ConsoleUpdate, executionId?: string) => {
          set((state) => {
            const updatedEntries = state.entries.map((entry) => {
              if (!matchesEntryForUpdate(entry, blockId, executionId, update)) {
                return entry
              }

              if (typeof update === 'string') {
                const newOutput = updateBlockOutput(entry.output, update)
                return {
                  ...entry,
                  output: truncateLargeBase64Data(newOutput),
                }
              }

              const updatedEntry = { ...entry }

              if (update.content !== undefined) {
                updatedEntry.output = truncateLargeBase64Data(
                  updateBlockOutput(entry.output, update.content)
                )
              }

              if (update.replaceOutput !== undefined) {
                updatedEntry.output = truncateLargeBase64Data(update.replaceOutput)
              } else if (update.output !== undefined) {
                updatedEntry.output = truncateLargeBase64Data({
                  ...(entry.output || {}),
                  ...update.output,
                })
              }

              if (update.error !== undefined) {
                updatedEntry.error = update.error
              }

              if (update.warning !== undefined) {
                updatedEntry.warning = update.warning
              }

              if (update.success !== undefined) {
                updatedEntry.success = update.success
              }

              if (update.startedAt !== undefined) {
                updatedEntry.startedAt = update.startedAt
              }

              if (update.endedAt !== undefined) {
                updatedEntry.endedAt = update.endedAt
              }

              if (update.durationMs !== undefined) {
                updatedEntry.durationMs = update.durationMs
              }

              if (update.input !== undefined) {
                updatedEntry.input = truncateLargeBase64Data(update.input)
              }

              if (update.isRunning !== undefined) {
                updatedEntry.isRunning = update.isRunning
              }

              if (update.isCanceled !== undefined) {
                updatedEntry.isCanceled = update.isCanceled
              }

              if (update.iterationCurrent !== undefined) {
                updatedEntry.iterationCurrent = update.iterationCurrent
              }

              if (update.iterationTotal !== undefined) {
                updatedEntry.iterationTotal = update.iterationTotal
              }

              if (update.iterationType !== undefined) {
                updatedEntry.iterationType = update.iterationType
              }

              if (update.iterationContainerId !== undefined) {
                updatedEntry.iterationContainerId = update.iterationContainerId
              }

              return updatedEntry
            })

            return { entries: updatedEntries }
          })

          if (typeof update === 'object' && update.error) {
            const matchingEntry = get().entries.find(
              (e) => e.blockId === blockId && e.executionId === executionId
            )
            notifyBlockError({
              error: update.error,
              blockName: matchingEntry?.blockName || 'Unknown Block',
              workflowId: matchingEntry?.workflowId,
              logContext: { blockId },
            })
          }
        },

        cancelRunningEntries: (workflowId: string) => {
          set((state) => {
            const now = new Date()
            const updatedEntries = state.entries.map((entry) => {
              if (entry.workflowId === workflowId && entry.isRunning) {
                const durationMs = entry.startedAt
                  ? now.getTime() - new Date(entry.startedAt).getTime()
                  : entry.durationMs
                return {
                  ...entry,
                  isRunning: false,
                  isCanceled: true,
                  endedAt: now.toISOString(),
                  durationMs,
                }
              }
              return entry
            })
            return { entries: updatedEntries }
          })
        },
      }),
      {
        name: 'terminal-console-store',
        storage: createJSONStorage(() => indexedDBStorage),
        partialize: (state) => ({
          entries: state.entries,
          isOpen: state.isOpen,
        }),
        onRehydrateStorage: () => (_state, error) => {
          if (error) {
            logger.error('Failed to rehydrate console store', { error })
          }
        },
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<ConsoleStore> | undefined
          const entries = (persisted?.entries ?? currentState.entries).map((entry, index) => {
            if (entry.executionOrder === undefined) {
              return { ...entry, executionOrder: index + 1 }
            }
            return entry
          })
          return {
            ...currentState,
            entries,
            isOpen: persisted?.isOpen ?? currentState.isOpen,
          }
        },
      }
    )
  )
)

if (typeof window !== 'undefined') {
  useTerminalConsoleStore.persist.onFinishHydration(() => {
    useTerminalConsoleStore.setState({ _hasHydrated: true })
  })

  if (useTerminalConsoleStore.persist.hasHydrated()) {
    useTerminalConsoleStore.setState({ _hasHydrated: true })
  }
}
