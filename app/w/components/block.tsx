import Image from 'next/image'

export interface BlockProps {
  title: string
  description: string
  imagePath: string
  type: 'agent' | 'api' | 'conditional'
  bgColor: string
}

export function Block({
  title,
  description,
  imagePath,
  type,
  bgColor,
}: BlockProps) {
  const handleDragStart = (e: React.DragEvent) => {
    // Pass block data as JSON string
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type,
        title,
        description,
        imagePath,
        bgColor,
      })
    )
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="group flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent/50 cursor-grab active:cursor-grabbing"
    >
      <div
        className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg"
        style={{ backgroundColor: bgColor }}
      >
        <Image
          src={imagePath}
          alt={`${title} icon`}
          width={22}
          height={22}
          className="transition-transform duration-200 group-hover:scale-110"
        />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-medium leading-none">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
