import { SubBlockConfig } from '../../../types/block'
import { Label } from '@/components/ui/label'
import { ShortInput } from './components/short-input'
import { LongInput } from './components/long-input'
import { Dropdown } from './components/dropdown'
import { SliderInput } from './components/slider-input'
import { Table } from './components/table'
import { Code } from './components/code'

interface SubBlockProps {
  config: SubBlockConfig
}

export function SubBlock({ config }: SubBlockProps) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const renderInput = () => {
    switch (config.type) {
      case 'short-input':
        return <ShortInput 
          placeholder={config.placeholder ?? ''} 
          password={config.password}
        />
      case 'long-input':
        return <LongInput />
      case 'dropdown':
        return (
          <div onMouseDown={handleMouseDown}>
            <Dropdown options={config.options ?? []} />
          </div>
        )
      case 'slider':
        return (
          <SliderInput
            min={config.min}
            max={config.max}
            defaultValue={
              (config.min || 0) + ((config.max || 100) - (config.min || 0)) / 2
            }
          />
        )
      case 'table':
        return <Table columns={config.columns ?? []} />
      case 'code':
        return <Code />
      default:
        return null
    }
  }

  return (
    <div className="space-y-1" onMouseDown={handleMouseDown}>
      <Label>{config.title}</Label>
      {renderInput()}
    </div>
  )
}
