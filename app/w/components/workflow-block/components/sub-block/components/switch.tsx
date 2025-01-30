import { Switch as UISwitch } from '@/components/ui/switch'
import { useSubBlockValue } from '../hooks/use-sub-block-value'

interface SwitchProps {
  blockId: string
  subBlockId: string
}

export function Switch({ blockId, subBlockId }: SwitchProps) {
  const [value, setValue] = useSubBlockValue(blockId, subBlockId)

  return (
    <UISwitch
      checked={Boolean(value)}
      onCheckedChange={(checked) => setValue(checked)}
    />
  )
} 
