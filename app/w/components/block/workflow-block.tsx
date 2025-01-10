import { Card } from '@/components/ui/card'
import { BlockConfig, SubBlockConfig } from './blocks'
import { cn } from '@/lib/utils'
import { SubBlock } from './sub-block'

export interface WorkflowBlockProps {
  id: string
  type: string
  position: { x: number; y: number }
  config: BlockConfig
  name: string
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
}: WorkflowBlockProps) {
  const { toolbar, workflow } = config
  const subBlockRows = groupSubBlocks(workflow.subBlocks)

  return (
    <Card
      className={cn(
        'absolute w-[320px] shadow-md cursor-move',
        'transform -translate-x-1/2 -translate-y-1/2'
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
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

      <div className="px-4 pt-2 pb-4 space-y-4">
        {subBlockRows.map((row, rowIndex) => (
          <div key={`row-${rowIndex}`} className="flex gap-2">
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
