import { useBlockConnections } from '@/app/w/hooks/use-block-connections'
import { Card } from '@/components/ui/card'

interface ConnectionBlocksProps {
  blockId: string
  setIsConnecting: (isConnecting: boolean) => void
}

export function ConnectionBlocks({
  blockId,
  setIsConnecting,
}: ConnectionBlocksProps) {
  const { incomingConnections, hasIncomingConnections } =
    useBlockConnections(blockId)

  if (!hasIncomingConnections) return null

  const handleDragStart = (e: React.DragEvent, connection: any) => {
    e.stopPropagation() // Prevent parent drag handlers from firing
    setIsConnecting(true)
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type: 'connectionBlock',
        connectionData: {
          id: connection.id,
          name: connection.name,
          outputType: connection.outputType,
          sourceBlockId: blockId,
        },
      })
    )
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleDragEnd = (e: React.DragEvent) => {
    setIsConnecting(false)
  }

  return (
    <div className="absolute -left-[180px] top-0 space-y-2 flex flex-col items-end w-[160px]">
      {incomingConnections.map((connection) => (
        <Card
          key={connection.id}
          draggable
          onDragStart={(e) => handleDragStart(e, connection)}
          onDragEnd={handleDragEnd}
          className="group flex items-center rounded-lg border bg-card p-2 shadow-sm transition-colors hover:bg-accent/50 cursor-grab active:cursor-grabbing w-fit"
        >
          <div className="text-sm">
            <span className="font-medium leading-none">
              {connection.name.replace(' ', '').toLowerCase()}
            </span>
            <span className="text-muted-foreground">
              .{connection.outputType === 'any' ? 'res' : connection.outputType}
            </span>
          </div>
        </Card>
      ))}
    </div>
  )
}
