'use client'

import { useCallback, useEffect, useRef } from 'react'
import {
  buildToolSubBlockId,
  resolveToolParamSync,
} from '@/lib/workflows/tool-input/synthetic-subblocks'
import { parseStoredToolInputValue } from '@/lib/workflows/tool-input/types'
import { DependencyBlockTypeProvider } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-dependency-block-type'
import { SubBlock } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/sub-block'
import type { SubBlockConfig as BlockSubBlockConfig } from '@/blocks/types'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'
import { useSubBlockStore } from '@/stores/workflows/subblock/store'

interface ToolSubBlockRendererProps {
  blockId: string
  subBlockId: string
  toolIndex: number
  subBlock: BlockSubBlockConfig
  effectiveParamId: string
  /** The tool's block type (e.g. `gmail`), so its params' selectors resolve dependencies. */
  toolType: string
  toolParams: Record<string, any> | undefined
  onParamChange: (toolIndex: number, paramId: string, value: any) => void
  disabled: boolean
  canonicalToggle?: {
    mode: 'basic' | 'advanced'
    disabled?: boolean
    onToggle?: () => void
  }
}

/**
 * SubBlock types whose store values are objects/arrays/non-strings.
 * tool.params stores strings (via JSON.stringify), so when syncing
 * back to the store we parse them to restore the native shape.
 */
const OBJECT_SUBBLOCK_TYPES = new Set(['file-upload', 'table', 'grouped-checkbox-list'])

function preprocessSyntheticToolStoreValue(params: {
  storeValue: unknown
  effectiveParamId: string
  subBlock: BlockSubBlockConfig
  isObjectType: boolean
}): unknown {
  const { storeValue, effectiveParamId, subBlock, isObjectType } = params

  let processed = storeValue === null ? '' : storeValue

  if (
    (subBlock.mode === 'advanced' || subBlock.mode === 'trigger-advanced') &&
    typeof processed === 'object' &&
    processed !== null &&
    !Array.isArray(processed) &&
    !isObjectType
  ) {
    processed = ''
  }

  return normalizeToolParamForPersistence(effectiveParamId, subBlock, processed)
}

function syncToolParamValueToSyntheticStore(params: {
  toolParamValue: unknown
  isObjectType: boolean
  isAdvanced: boolean
  effectiveParamId: string
  subBlock: BlockSubBlockConfig
  blockId: string
  syntheticId: string
  subBlockId: string
  toolIndex: number
  pushParamValueToStore: (rawValue: string) => void
  onParamChange: (toolIndex: number, paramId: string, value: unknown) => void
  syncedValue: string | null
  setSyncedValue: (value: string | null) => void
}): void {
  const {
    toolParamValue,
    isObjectType,
    isAdvanced,
    effectiveParamId,
    subBlock,
    blockId,
    syntheticId,
    pushParamValueToStore,
    onParamChange,
    syncedValue,
    setSyncedValue,
  } = params

  const toolParamString = toolParamValue == null ? '' : toolParamValue

  if (isObjectType && typeof toolParamString === 'string' && toolParamString) {
    try {
      const parsed = JSON.parse(toolParamString)
      if (typeof parsed === 'object' && parsed !== null) {
        if (toolParamString === syncedValue) return
        setSyncedValue(toolParamString)
        useSubBlockStore.getState().setValue(blockId, syntheticId, parsed)
        return
      }
    } catch {
      // fall through
    }
  }

  if (!isAdvanced && !isObjectType) {
    const existing = useSubBlockStore.getState().getValue(blockId, syntheticId)
    const toolEmpty = toolParamString === '' || toolParamString == null
    const normalizedExisting = normalizeToolParamForPersistence(
      effectiveParamId,
      subBlock,
      existing
    )
    if (
      toolEmpty &&
      typeof normalizedExisting === 'string' &&
      normalizedExisting.trim().length > 0
    ) {
      if (normalizedExisting === syncedValue) return
      setSyncedValue(normalizedExisting)
      onParamChange(params.toolIndex, effectiveParamId, normalizedExisting)
      return
    }
    if (
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing) &&
      'clientId' in existing &&
      typeof (existing as { clientId?: unknown }).clientId === 'string'
    ) {
      const id = (existing as { clientId: string }).clientId
      const toolMatchesClientId = typeof toolParamString === 'string' && id === toolParamString
      if (toolEmpty || toolMatchesClientId) {
        // We intentionally *don't* push to onParamChange here — keep the previously persisted string.
        // The next store->params pass will normalize via normalizeToolParamForPersistence.
        return
      }
    }
  }

  if (
    isAdvanced &&
    toolParamValue &&
    typeof toolParamValue === 'object' &&
    !Array.isArray(toolParamValue) &&
    !isObjectType
  ) {
    const existing = useSubBlockStore.getState().getValue(blockId, syntheticId)
    if (typeof existing === 'string' && existing.trim().length > 0) {
      if (existing === syncedValue) return
      setSyncedValue(existing)
      return
    }
    if (syncedValue === '') return
    useSubBlockStore.getState().setValue(blockId, syntheticId, '')
    setSyncedValue('')
    return
  }

  if (typeof toolParamString === 'string') {
    if (toolParamString === syncedValue) return
    setSyncedValue(toolParamString)
    pushParamValueToStore(toolParamString)
    return
  }

  // Fallback for non-string param values (should be rare).
  const stringified = JSON.stringify(toolParamValue ?? '')
  if (stringified === syncedValue) return
  setSyncedValue(stringified)
  pushParamValueToStore(stringified)
}

/**
 * Normalizes selector/store shapes (e.g. Slack `{ channel_id }`) to a string for `tool.params`.
 */
function normalizeToolParamForPersistence(
  effectiveParamId: string,
  subBlock: BlockSubBlockConfig,
  raw: unknown
): unknown {
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'string') return raw
  const isChannelField =
    effectiveParamId === 'channel' ||
    subBlock.canonicalParamId === 'channel' ||
    subBlock.type === 'channel-selector'
  if (isChannelField && typeof raw === 'object' && !Array.isArray(raw) && raw !== null) {
    const o = raw as Record<string, unknown>
    const id = o.channel_id ?? o.channelId ?? o.id
    if (typeof id === 'string' && id.trim()) return id.trim()
  }
  return raw
}

/**
 * Bridges the subblock store with StoredTool.params via a synthetic store key,
 * then delegates all rendering to SubBlock for full parity.
 */
export function ToolSubBlockRenderer({
  blockId,
  subBlockId,
  toolIndex,
  subBlock,
  effectiveParamId,
  toolType,
  toolParams,
  onParamChange,
  disabled,
  canonicalToggle,
}: ToolSubBlockRendererProps) {
  const syntheticId = buildToolSubBlockId(subBlockId, toolIndex, effectiveParamId)
  const toolParamValue = toolParams?.[effectiveParamId] ?? ''
  const isObjectType = OBJECT_SUBBLOCK_TYPES.has(subBlock.type)

  const syncedRef = useRef<string | null>(null)
  const onParamChangeRef = useRef(onParamChange)
  onParamChangeRef.current = onParamChange

  const pushParamValueToStore = useCallback(
    (rawValue: string) => {
      syncedRef.current = rawValue
      if (isObjectType && rawValue) {
        try {
          const parsed = JSON.parse(rawValue)
          if (typeof parsed === 'object' && parsed !== null) {
            useSubBlockStore.getState().setValue(blockId, syntheticId, parsed)
            return
          }
        } catch {}
      }
      useSubBlockStore.getState().setValue(blockId, syntheticId, rawValue)
    },
    [blockId, syntheticId, isObjectType]
  )

  const pushParamValueToStoreRef = useRef(pushParamValueToStore)
  pushParamValueToStoreRef.current = pushParamValueToStore

  useEffect(() => {
    const unsub = useSubBlockStore.subscribe((state, prevState) => {
      const wfId = useWorkflowRegistry.getState().activeWorkflowId
      if (!wfId) return
      const newVal = state.workflowValues[wfId]?.[blockId]?.[syntheticId]
      const oldVal = prevState.workflowValues[wfId]?.[blockId]?.[syntheticId]
      if (newVal === oldVal) return
      const processed = preprocessSyntheticToolStoreValue({
        storeValue: newVal,
        effectiveParamId,
        subBlock,
        isObjectType,
      })
      const result = resolveToolParamSync(processed, syncedRef.current)
      if (result.action === 'noop') return

      if (result.action === 'reproject') {
        const tools = parseStoredToolInputValue(
          useSubBlockStore.getState().getValue(blockId, subBlockId)
        )
        const sourceValue = tools[toolIndex]?.params?.[effectiveParamId]
        pushParamValueToStoreRef.current(typeof sourceValue === 'string' ? sourceValue : '')
        return
      }

      syncedRef.current = result.value
      onParamChangeRef.current(toolIndex, effectiveParamId, result.value)
    })
    return unsub
  }, [
    blockId,
    subBlockId,
    syntheticId,
    toolIndex,
    effectiveParamId,
    isObjectType,
    subBlock.mode,
    subBlock.id,
    subBlock.type,
    subBlock.canonicalParamId,
  ])

  useEffect(() => {
    const isAdvanced = subBlock.mode === 'advanced' || subBlock.mode === 'trigger-advanced'
    syncToolParamValueToSyntheticStore({
      toolParamValue,
      isObjectType,
      isAdvanced,
      effectiveParamId,
      subBlock,
      blockId,
      syntheticId,
      subBlockId,
      toolIndex,
      pushParamValueToStore,
      onParamChange: onParamChangeRef.current,
      syncedValue: syncedRef.current,
      setSyncedValue: (value) => {
        syncedRef.current = value
      },
    })
  }, [
    toolParamValue,
    blockId,
    syntheticId,
    isObjectType,
    subBlock.mode,
    effectiveParamId,
    subBlock.type,
    subBlock.canonicalParamId,
    pushParamValueToStore,
    toolIndex,
    subBlockId,
  ])

  const visibility = subBlock.paramVisibility ?? 'user-or-llm'
  const isOptionalForUser = visibility !== 'user-only'

  const config = {
    ...subBlock,
    id: syntheticId,
    ...(isOptionalForUser && { required: false }),
  }

  return (
    <DependencyBlockTypeProvider value={toolType}>
      <SubBlock
        blockId={blockId}
        config={config}
        isPreview={false}
        disabled={disabled}
        canonicalToggle={canonicalToggle}
        dependencyContext={toolParams}
      />
    </DependencyBlockTypeProvider>
  )
}
