'use client'

import { useEffect, useRef } from 'react'
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
  if (
    isChannelField &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    raw !== null
  ) {
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
  toolParams,
  onParamChange,
  disabled,
  canonicalToggle,
}: ToolSubBlockRendererProps) {
  // Use real subBlock id so canonical pairs (shared effectiveParamId) do not share one store cell.
  const syntheticId = `${subBlockId}-tool-${toolIndex}-${subBlock.id}`
  const toolParamValue = toolParams?.[effectiveParamId] ?? ''
  const isObjectType = OBJECT_SUBBLOCK_TYPES.has(subBlock.type)

  const syncedRef = useRef<any>(null)
  const onParamChangeRef = useRef(onParamChange)
  onParamChangeRef.current = onParamChange

  useEffect(() => {
    const unsub = useSubBlockStore.subscribe((state, prevState) => {
      const wfId = useWorkflowRegistry.getState().activeWorkflowId
      if (!wfId) return
      const newVal = state.workflowValues[wfId]?.[blockId]?.[syntheticId]
      const oldVal = prevState.workflowValues[wfId]?.[blockId]?.[syntheticId]
      if (newVal === oldVal) return
      let processedVal = newVal == null ? '' : newVal
      if (
        (subBlock.mode === 'advanced' || subBlock.mode === 'trigger-advanced') &&
        typeof processedVal === 'object' &&
        processedVal !== null &&
        !Array.isArray(processedVal) &&
        !isObjectType
      ) {
        processedVal = ''
      }
      processedVal = normalizeToolParamForPersistence(effectiveParamId, subBlock, processedVal)
      if (processedVal === syncedRef.current) return
      syncedRef.current = processedVal
      onParamChangeRef.current(toolIndex, effectiveParamId, processedVal)
    })
    return unsub
  }, [blockId, syntheticId, toolIndex, effectiveParamId, isObjectType, subBlock.mode, subBlock.id, subBlock.type, subBlock.canonicalParamId])

  useEffect(() => {
    if (isObjectType && toolParamValue) {
      try {
        const parsed = JSON.parse(toolParamValue)
        if (typeof parsed === 'object' && parsed !== null) {
          if (toolParamValue === syncedRef.current) return
          syncedRef.current = toolParamValue
          useSubBlockStore.getState().setValue(blockId, syntheticId, parsed)
          return
        }
      } catch {
        // fall through
      }
    }

    const isAdvanced = subBlock.mode === 'advanced' || subBlock.mode === 'trigger-advanced'
    if (!isAdvanced && !isObjectType) {
      const existing = useSubBlockStore.getState().getValue(blockId, syntheticId)
      const toolEmpty = toolParamValue === '' || toolParamValue == null
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
        if (normalizedExisting === syncedRef.current) return
        syncedRef.current = normalizedExisting
        onParamChangeRef.current(toolIndex, effectiveParamId, normalizedExisting)
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
        const toolMatchesClientId =
          typeof toolParamValue === 'string' && id === toolParamValue
        if (toolEmpty || toolMatchesClientId) {
          if (existing === syncedRef.current) return
          syncedRef.current = existing
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
      // Merged tool param is still the basic value (e.g. client object) while the advanced
      // subblock has its own key — keep a previously typed string when toggling back.
      const existing = useSubBlockStore.getState().getValue(blockId, syntheticId)
      if (typeof existing === 'string' && existing.trim().length > 0) {
        if (existing === syncedRef.current) return
        syncedRef.current = existing
        return
      }
      if (toolParamValue === syncedRef.current) return
      useSubBlockStore.getState().setValue(blockId, syntheticId, '')
      syncedRef.current = ''
      return
    }

    if (toolParamValue === syncedRef.current) return
    syncedRef.current = toolParamValue
    useSubBlockStore.getState().setValue(blockId, syntheticId, toolParamValue)
  }, [
    toolParamValue,
    blockId,
    syntheticId,
    isObjectType,
    subBlock.mode,
    effectiveParamId,
    subBlock.type,
    subBlock.canonicalParamId,
  ])

  const visibility = subBlock.paramVisibility ?? 'user-or-llm'
  const isOptionalForUser = visibility !== 'user-only'

  const config = {
    ...subBlock,
    id: syntheticId,
    ...(isOptionalForUser && { required: false }),
  }

  return (
    <SubBlock
      blockId={blockId}
      config={config}
      isPreview={false}
      disabled={disabled}
      canonicalToggle={canonicalToggle}
      dependencyContext={toolParams}
    />
  )
}
