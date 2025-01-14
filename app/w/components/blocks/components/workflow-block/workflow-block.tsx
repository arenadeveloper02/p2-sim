import { Card } from '@/components/ui/card'
import { BlockConfig, SubBlockConfig } from '../../types/block'
import { SubBlock } from './components/sub-block/sub-block'
import { ConnectionPoint } from './components/connection/connection-point'
import { Handle, Position } from 'reactflow'

interface WorkflowBlockProps {
  id: string
  type: string
  position: { x: number; y: number }
  config: BlockConfig
  name: string
}

export function WorkflowBlock({ id, type, config, name }: WorkflowBlockProps) {
  const { toolbar, workflow } = config

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
    <Card className="w-[320px] shadow-md select-none group">
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-white border-2 border-blue-500"
      />

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
                className={`space-y-1 ${
                  subBlock.layout === 'half' ? 'flex-1' : 'w-full'
                }`}
              >
                <SubBlock config={subBlock} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-white border-2 border-blue-500"
      />
    </Card>
  )
}
