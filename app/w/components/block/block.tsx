import type { BlockConfig } from './blocks'

export type BlockProps = BlockConfig

export function Block({
  title,
  description,
  type,
  bgColor,
  icon: Icon,
}: BlockProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type,
        title,
        description,
        bgColor,
      })
    )
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="group flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent/50 cursor-pointer active:cursor-grabbing"
    >
      <div
        className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg"
        style={{ backgroundColor: bgColor }}
      >
        <Icon
          className={`text-white transition-transform duration-200 group-hover:scale-110 ${
            type === 'agent' ? 'w-[24px] h-[24px]' : 'w-[22px] h-[22px]'
          }`}
        />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-medium leading-none">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
