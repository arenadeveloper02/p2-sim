import { useEffect, useRef, useState } from 'react'
import { RectangleHorizontal, RectangleVertical } from 'lucide-react'
import { Handle, NodeProps, Position, useUpdateNodeInternals } from 'reactflow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useWorkflowStore } from '@/stores/workflow/store'
import { BlockConfig, SubBlockConfig } from '@/blocks/types'
import { ActionBar } from './components/action-bar/action-bar'
import { ConnectionBlocks } from './components/connection-blocks/connection-blocks'
import { SubBlock } from './components/sub-block/sub-block'

interface WorkflowBlockProps {
  type: string
  config: BlockConfig
  name: string
}

// Combine both interfaces into a single component
export function WorkflowBlock({ id, data, selected }: NodeProps<WorkflowBlockProps>) {
  const { type, config, name } = data
  const { toolbar, workflow } = config

  // State management
  const [isConnecting, setIsConnecting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState('')

  // Refs
  const blockRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const updateNodeInternals = useUpdateNodeInternals()

  // Store selectors
  const isEnabled = useWorkflowStore((state) => state.blocks[id]?.enabled ?? true)
  const horizontalHandles = useWorkflowStore(
    (state) => state.blocks[id]?.horizontalHandles ?? false
  )
  const isWide = useWorkflowStore((state) => state.blocks[id]?.isWide ?? false)
  const blockHeight = useWorkflowStore((state) => state.blocks[id]?.height ?? 0)

  // Store actions
  const updateBlockName = useWorkflowStore((state) => state.updateBlockName)
  const toggleBlockWide = useWorkflowStore((state) => state.toggleBlockWide)
  const updateBlockHeight = useWorkflowStore((state) => state.updateBlockHeight)

  // Update node internals when handles change
  useEffect(() => {
    updateNodeInternals(id)
  }, [id, horizontalHandles, updateNodeInternals])

  // Add debounce helper
  const debounce = (func: Function, wait: number) => {
    let timeout: NodeJS.Timeout
    return (...args: any[]) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => func(...args), wait)
    }
  }

  // Add effect to observe size changes with debounced updates
  useEffect(() => {
    if (!contentRef.current) return

    let rafId: number
    const debouncedUpdate = debounce((height: number) => {
      if (height !== blockHeight) {
        updateBlockHeight(id, height)
        updateNodeInternals(id)
      }
    }, 100)

    const resizeObserver = new ResizeObserver((entries) => {
      // Cancel any pending animation frame
      if (rafId) {
        cancelAnimationFrame(rafId)
      }

      // Schedule the update on the next animation frame
      rafId = requestAnimationFrame(() => {
        for (const entry of entries) {
          const height =
            entry.borderBoxSize[0]?.blockSize ?? entry.target.getBoundingClientRect().height
          debouncedUpdate(height)
        }
      })
    })

    resizeObserver.observe(contentRef.current)

    return () => {
      resizeObserver.disconnect()
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [id, blockHeight, updateBlockHeight, updateNodeInternals])

  // SubBlock layout management
  function groupSubBlocks(subBlocks: SubBlockConfig[]) {
    const visibleSubBlocks = subBlocks.filter((block) => !block.hidden)
    const rows: SubBlockConfig[][] = []
    let currentRow: SubBlockConfig[] = []
    let currentRowWidth = 0

    visibleSubBlocks.forEach((block) => {
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

  // Name editing handlers
  const handleNameClick = () => {
    setEditedName(name)
    setIsEditing(true)
  }

  const handleNameSubmit = () => {
    const trimmedName = editedName.trim()
    if (trimmedName && trimmedName !== name) {
      updateBlockName(id, trimmedName)
    }
    setIsEditing(false)
  }

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSubmit()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
    }
  }

  return (
    <Card
      ref={blockRef}
      className={cn(
        'shadow-md select-none group relative cursor-default',
        isWide ? 'w-[480px]' : 'w-[320px]',
        !isEnabled && 'shadow-sm'
      )}
    >
      {selected && <ActionBar blockId={id} />}
      <ConnectionBlocks blockId={id} setIsConnecting={setIsConnecting} />

      {/* Input Handle */}
      <Handle
        type="target"
        position={horizontalHandles ? Position.Left : Position.Top}
        id="target"
        className={cn(
          '!w-3.5 !h-3.5',
          '!bg-white !rounded-full !border !border-gray-200',
          'group-hover:!border-blue-500',
          '!cursor-crosshair',
          'transition-[border-color] duration-150',
          horizontalHandles ? '!left-[-7px]' : '!top-[-7px]'
        )}
        data-nodeid={id}
        data-handleid="target"
        isConnectableStart={false}
        isConnectableEnd={true}
      />

      {/* Block Header */}
      <div className="flex items-center justify-between p-3 border-b workflow-drag-handle cursor-grab [&:active]:cursor-grabbing">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-7 h-7 rounded"
            style={{ backgroundColor: isEnabled ? toolbar.bgColor : 'gray' }}
          >
            <toolbar.icon className="w-5 h-5 text-white" />
          </div>
          {isEditing ? (
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value.slice(0, 40))}
              onBlur={handleNameSubmit}
              onKeyDown={handleNameKeyDown}
              autoFocus
              className="font-medium text-md bg-transparent border-none outline-none p-0 w-[200px]"
              maxLength={40}
            />
          ) : (
            <span
              className="font-medium text-md hover:text-muted-foreground cursor-text"
              onClick={handleNameClick}
            >
              {name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isEnabled && (
            <Badge variant="secondary" className="bg-gray-100 text-gray-500 hover:bg-gray-100">
              Disabled
            </Badge>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleBlockWide(id)}
                className="text-gray-500 p-1 h-7"
              >
                {isWide ? (
                  <RectangleHorizontal className="h-5 w-5" />
                ) : (
                  <RectangleVertical className="h-5 w-5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{isWide ? 'Narrow Block' : 'Expand Block'}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Block Content */}
      <div ref={contentRef} className="px-4 pt-3 pb-4 space-y-4 cursor-pointer">
        {subBlockRows.map((row, rowIndex) => (
          <div key={`row-${rowIndex}`} className="flex gap-4">
            {row.map((subBlock, blockIndex) => (
              <div
                key={`${id}-${rowIndex}-${blockIndex}`}
                className={`space-y-1 ${subBlock.layout === 'half' ? 'flex-1' : 'w-full'}`}
              >
                <SubBlock blockId={id} config={subBlock} isConnecting={isConnecting} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Output Handle */}
      {type !== 'condition' && (
        <Handle
          type="source"
          position={horizontalHandles ? Position.Right : Position.Bottom}
          id="source"
          className={cn(
            '!w-3.5 !h-3.5',
            '!bg-white !rounded-full !border !border-gray-200',
            'group-hover:!border-blue-500',
            '!cursor-crosshair',
            'transition-[border-color] duration-150',
            horizontalHandles ? '!right-[-7px]' : '!bottom-[-7px]'
          )}
          data-nodeid={id}
          data-handleid="source"
          isConnectableStart={true}
          isConnectableEnd={false}
        />
      )}
    </Card>
  )
}
