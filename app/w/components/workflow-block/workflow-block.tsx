import { Card } from '@/components/ui/card'
import { BlockConfig, SubBlockConfig } from '../../../../blocks/types'
import { SubBlock } from './components/sub-block/sub-block'
import { Handle, Position } from 'reactflow'
import { cn } from '@/lib/utils'
import { ActionBar } from './components/action-bar/action-bar'
import { ConnectionBlocks } from './components/connection-blocks/connection-blocks'
import { useState } from 'react'
import { useWorkflowStore } from '@/stores/workflow/workflow-store'
import { Badge } from '@/components/ui/badge'

interface WorkflowBlockProps {
  id: string
  type: string
  position: { x: number; y: number }
  config: BlockConfig
  name: string
  selected?: boolean
}

export function WorkflowBlock({
  id,
  type,
  config,
  name,
  selected,
}: WorkflowBlockProps) {
  const { toolbar, workflow } = config
  // Dragging connection state
  const [isConnecting, setIsConnecting] = useState(false)
  const isEnabled = useWorkflowStore(
    (state) => state.blocks[id]?.enabled ?? true
  )
  const horizontalHandles = useWorkflowStore(
    (state) => state.blocks[id]?.horizontalHandles ?? false
  )

  function groupSubBlocks(subBlocks: SubBlockConfig[]) {
    const rows: SubBlockConfig[][] = []
    let currentRow: SubBlockConfig[] = []
    let currentRowWidth = 0

    subBlocks.forEach((block) => {
      const blockWidth = block.layout === 'half' ? 0.5 : 1
      if (currentRowWidth + blockWidth > 1) {
        rows.push([...currentRow])
        currentRow = [block]
        currentRowWidth = blockWidth
      } else {
        currentRow.push(block)
        currentRowWidth += blockWidth
      }
    })

    if (currentRow.length > 0) {
      rows.push(currentRow)
    }

    return rows
  }

  const subBlockRows = groupSubBlocks(workflow.subBlocks)

  return (
    <Card
      className={cn(
        'w-[320px] shadow-md select-none group relative cursor-default',
        !isEnabled && 'shadow-sm'
      )}
    >
      {selected && <ActionBar blockId={id} />}
      <ConnectionBlocks blockId={id} setIsConnecting={setIsConnecting} />

      <Handle
        type="target"
        position={horizontalHandles ? Position.Left : Position.Top}
        className={cn(
          '!w-3.5 !h-3.5',
          '!bg-white !rounded-full !border !border-gray-200',
          '!opacity-0 group-hover:!opacity-100',
          '!transition-opacity !duration-200 !cursor-crosshair',
          'hover:!border-blue-500',
          horizontalHandles ? '!left-[-7px]' : '!top-[-7px]'
        )}
      />

      <div className="flex items-center justify-between p-3 border-b workflow-drag-handle cursor-grab [&:active]:cursor-grabbing">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-7 h-7 rounded"
            style={{ backgroundColor: isEnabled ? toolbar.bgColor : 'gray' }}
          >
            <toolbar.icon className="w-5 h-5 text-white" />
          </div>
          <span className="font-medium text-md">{name}</span>
        </div>
        {!isEnabled && (
          <Badge
            variant="secondary"
            className="bg-gray-100 text-gray-500 hover:bg-gray-100"
          >
            Disabled
          </Badge>
        )}
      </div>

      <div className="px-4 pt-3 pb-4 space-y-4 cursor-pointer">
        {subBlockRows.map((row, rowIndex) => (
          <div key={`row-${rowIndex}`} className="flex gap-4">
            {row.map((subBlock, blockIndex) => (
              <div
                key={`${id}-${rowIndex}-${blockIndex}`}
                className={`space-y-1 ${
                  subBlock.layout === 'half' ? 'flex-1' : 'w-full'
                }`}
              >
                <SubBlock
                  blockId={id}
                  config={subBlock}
                  isConnecting={isConnecting}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <Handle
        type="source"
        position={horizontalHandles ? Position.Right : Position.Bottom}
        className={cn(
          '!w-3.5 !h-3.5',
          '!bg-white !rounded-full !border !border-gray-200',
          '!opacity-0 group-hover:!opacity-100',
          '!transition-opacity !duration-200 !cursor-crosshair',
          'hover:!border-blue-500',
          horizontalHandles ? '!right-[-7px]' : '!bottom-[-7px]'
        )}
      />
    </Card>
  )
}
