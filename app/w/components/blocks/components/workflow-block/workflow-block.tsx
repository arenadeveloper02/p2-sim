import { Card } from '@/components/ui/card'
import { BlockConfig, SubBlockConfig } from '../../types/block'
import { cn } from '@/lib/utils'
import { SubBlock } from './sub-block/sub-block'
import { useCallback, useState, MouseEvent, useEffect } from 'react'

export interface WorkflowBlockProps {
  id: string
  type: string
  position: { x: number; y: number }
  config: BlockConfig
  name: string
  onPositionUpdate: (id: string, position: { x: number; y: number }) => void
  zoom: number
}

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

export function WorkflowBlock({
  id,
  type,
  position,
  config,
  name,
  onPositionUpdate,
  zoom,
}: WorkflowBlockProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      setIsDragging(true)

      // Account for the sidebar width (344px) and control bar height (56px)
      const sidebarWidth = 344 // 72px (sidebar) + 272px (toolbar)
      const controlBarHeight = 56

      const rect = e.currentTarget.getBoundingClientRect()
      setDragOffset({
        x: (e.clientX - sidebarWidth) / zoom - position.x,
        y: (e.clientY - controlBarHeight) / zoom - position.y,
      })
    },
    [zoom, position]
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging) {
        e.stopPropagation()

        // Account for the sidebar width and control bar height
        const sidebarWidth = 344
        const controlBarHeight = 56

        const newX = (e.clientX - sidebarWidth) / zoom - dragOffset.x
        const newY = (e.clientY - controlBarHeight) / zoom - dragOffset.y

        onPositionUpdate(id, { x: newX, y: newY })
      }
    },
    [id, isDragging, dragOffset, onPositionUpdate, zoom]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Add event listeners to handle dragging outside the block
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove as any)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove as any)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  const { toolbar, workflow } = config
  const subBlockRows = groupSubBlocks(workflow.subBlocks)

  return (
    <Card
      className={cn(
        'absolute w-[320px] shadow-md cursor-move',
        'transform -translate-x-1/2 -translate-y-1/2',
        isDragging && 'pointer-events-none'
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="flex items-center gap-3 p-3 border-b">
        <div
          className="flex items-center justify-center w-7 h-7 rounded"
          style={{ backgroundColor: toolbar.bgColor }}
        >
          <toolbar.icon className="w-5 h-5 text-white" />
        </div>
        <span className="font-medium text-md">{name}</span>
      </div>

      <div className="px-4 pt-3 pb-4 space-y-4">
        {subBlockRows.map((row, rowIndex) => (
          <div key={`row-${rowIndex}`} className="flex gap-4">
            {row.map((subBlock, blockIndex) => (
              <div
                key={`${id}-${rowIndex}-${blockIndex}`}
                className={cn(
                  'space-y-1',
                  subBlock.layout === 'half' ? 'flex-1' : 'w-full'
                )}
              >
                <SubBlock config={subBlock} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Card>
  )
}
