import { useCallback } from 'react'
import { useWorkflowStore } from '@/stores/workflow/store'

export function useSubBlockValue<T = any>(
  blockId: string,
  subBlockId: string
): readonly [T | null, (value: T) => void] {
  const value = useWorkflowStore(
    useCallback(
      (state) => state.blocks[blockId]?.subBlocks[subBlockId]?.value ?? null,
      [blockId, subBlockId]
    )
  )

  const updateSubBlock = useWorkflowStore((state) => state.updateSubBlock)

  const setValue = useCallback(
    (newValue: T) => {
      updateSubBlock(blockId, subBlockId, newValue as any)
    },
    [blockId, subBlockId, updateSubBlock]
  )

  return [value as T | null, setValue] as const
}
