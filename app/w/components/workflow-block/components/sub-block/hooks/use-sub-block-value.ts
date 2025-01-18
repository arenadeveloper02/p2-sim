import { useWorkflowStore } from '@/stores/workflow/workflow-store'
import { useCallback } from 'react'

export function useSubBlockValue(blockId: string, subBlockId: string) {
  const value = useWorkflowStore(
    useCallback(
      (state) =>
        (state.blocks[blockId]?.subBlocks[subBlockId]?.value) ?? null,
      [blockId, subBlockId]
    )
  )

  const updateSubBlock = useWorkflowStore((state) => state.updateSubBlock)

  const setValue = useCallback(
    (newValue: any) => {
      updateSubBlock(blockId, subBlockId, newValue)
    },
    [blockId, subBlockId, updateSubBlock]
  )

  return [value, setValue] as const
} 