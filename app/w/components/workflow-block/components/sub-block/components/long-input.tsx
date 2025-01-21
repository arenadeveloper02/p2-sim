import { Textarea } from '@/components/ui/textarea'
import { useSubBlockValue } from '../hooks/use-sub-block-value'

interface LongInputProps {
  placeholder?: string
  blockId: string
  subBlockId: string
}

export function LongInput({
  placeholder,
  blockId,
  subBlockId,
}: LongInputProps) {
  const [value, setValue] = useSubBlockValue(blockId, subBlockId)

  return (
    <Textarea
      className="w-full resize-none placeholder:text-muted-foreground/50 allow-scroll"
      rows={3}
      placeholder={placeholder ?? ''}
      value={value?.toString() ?? ''}
      onChange={(e) => setValue(e.target.value)}
    />
  )
}
