import { Info, Label, Switch as UISwitch } from '@sim/emcn'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-value'

interface SwitchProps {
  blockId: string
  subBlockId: string
  title: string
  /** Optional help text shown via an info icon next to the title. */
  tooltip?: string
  value?: boolean
  isPreview?: boolean
  previewValue?: boolean | null
  disabled?: boolean
}

export function Switch({
  blockId,
  subBlockId,
  title,
  tooltip,
  value: propValue,
  isPreview = false,
  previewValue,
  disabled = false,
}: SwitchProps) {
  const [storeValue, setStoreValue] = useSubBlockValue<boolean>(blockId, subBlockId)

  const value = isPreview ? previewValue : (storeValue ?? propValue)

  const handleChange = (checked: boolean) => {
    if (!isPreview && !disabled) {
      setStoreValue(checked)
    }
  }

  return (
    <div className='flex items-center gap-x-3'>
      <UISwitch
        id={`${blockId}-${subBlockId}`}
        checked={Boolean(value)}
        onCheckedChange={handleChange}
        disabled={isPreview || disabled}
      />
      <Label
        htmlFor={`${blockId}-${subBlockId}`}
        className='flex cursor-pointer items-center gap-1.5 font-medium font-sans text-[var(--text-primary)] text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50'
      >
        {title}
        {tooltip ? <Info>{tooltip}</Info> : null}
      </Label>
    </div>
  )
}
