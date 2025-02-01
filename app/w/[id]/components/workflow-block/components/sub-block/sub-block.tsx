import { SubBlockConfig } from '../../../../../../../blocks/types'
import { Label } from '@/components/ui/label'
import { ShortInput } from './components/short-input'
import { LongInput } from './components/long-input'
import { Dropdown } from './components/dropdown'
import { SliderInput } from './components/slider-input'
import { Table } from './components/table'
import { Code } from './components/code'
import { Switch } from './components/switch'

interface SubBlockProps {
  blockId: string
  config: SubBlockConfig
  isConnecting: boolean
}

export function SubBlock({ blockId, config, isConnecting }: SubBlockProps) {
  if (config.hidden) {
    return null
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const renderInput = () => {
    switch (config.type) {
      case 'short-input':
        return (
          <ShortInput
            blockId={blockId}
            subBlockId={config.id}
            placeholder={config.placeholder}
            password={config.password}
            isConnecting={isConnecting}
            config={config}
          />
        )
      case 'long-input':
        return (
          <LongInput
            blockId={blockId}
            subBlockId={config.id}
            placeholder={config.placeholder}
            isConnecting={isConnecting}
            config={config}
          />
        )
      case 'dropdown':
        return (
          <div onMouseDown={handleMouseDown}>
            <Dropdown
              blockId={blockId}
              subBlockId={config.id}
              options={config.options ?? []}
            />
          </div>
        )
      case 'slider':
        return (
          <SliderInput
            blockId={blockId}
            subBlockId={config.id}
            min={config.min}
            max={config.max}
            defaultValue={
              (config.min || 0) + ((config.max || 100) - (config.min || 0)) / 2
            }
          />
        )
      case 'table':
        return (
          <Table
            blockId={blockId}
            subBlockId={config.id}
            columns={config.columns ?? []}
          />
        )
      case 'code':
        return (
          <Code
            blockId={blockId}
            subBlockId={config.id}
            isConnecting={isConnecting}
          />
        )
      case 'switch':
        return (
          <Switch
            blockId={blockId}
            subBlockId={config.id}
            title={config.title}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-1" onMouseDown={handleMouseDown}>
      {config.type !== 'switch' && <Label>{config.title}</Label>}
      {renderInput()}
    </div>
  )
}
