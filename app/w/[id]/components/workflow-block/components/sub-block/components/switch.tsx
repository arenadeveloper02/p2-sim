import { Switch as UISwitch } from '@/components/ui/switch'
import { useSubBlockValue } from '../hooks/use-sub-block-value'
import { Label } from '@/components/ui/label'

interface SwitchProps {
  blockId: string
  subBlockId: string
  title: string
}

export function Switch({ blockId, subBlockId, title }: SwitchProps) {
  const [value, setValue] = useSubBlockValue(blockId, subBlockId)

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        {title}
      </Label>
      <UISwitch
        checked={Boolean(value)}
        onCheckedChange={(checked) => setValue(checked)}
      />
    </div>
  )
}
