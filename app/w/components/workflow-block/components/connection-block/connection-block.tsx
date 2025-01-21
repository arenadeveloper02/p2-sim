import { useBlockConnections } from '@/app/w/hooks/use-block-connections'
import { Card } from '@/components/ui/card'

interface ConnectionBlockProps {
  blockId: string
}

export function ConnectionBlock({ blockId }: ConnectionBlockProps) {
  const { incomingConnections, hasIncomingConnections } =
    useBlockConnections(blockId)

  if (!hasIncomingConnections) return null

  return (
    <div className="absolute -left-[180px] top-0 space-y-2 flex flex-col items-end w-[160px]">
      {incomingConnections.map((connection) => (
        <Card
          key={connection.id}
          className="group flex items-center rounded-lg border bg-card p-2 shadow-sm transition-colors hover:bg-accent/50 cursor-grab w-fit"
        >
          <div className="text-sm">
            <span className="font-medium leading-none">
              {connection.name.replace(' ', '').toLowerCase()}
            </span>
            <span className="text-muted-foreground">
              .{connection.outputType}
            </span>
          </div>
        </Card>
      ))}
    </div>
  )
}
