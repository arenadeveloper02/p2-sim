import { Input } from '@/components/ui/input'
import { SubBlockConfig } from './blocks'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { useState } from 'react'

interface SubBlockProps {
  config: SubBlockConfig
}

export function SubBlock({ config }: SubBlockProps) {
  const [sliderValue, setSliderValue] = useState(
    config.type === 'slider'
      ? (config.min || 0) + ((config.max || 100) - (config.min || 0)) / 2
      : 0
  )

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const renderInput = () => {
    switch (config.type) {
      case 'short-text':
        return <Input className="w-full" />
      case 'long-text':
        return <Textarea className="w-full resize-none" rows={3} />
      case 'dropdown':
        return (
          <div onMouseDown={handleMouseDown}>
            <Select defaultValue={config.options?.[0]}>
              <SelectTrigger>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {config.options?.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      case 'slider':
        return (
          <div className="relative pt-2 pb-6">
            <Slider
              defaultValue={[
                config.type === 'slider'
                  ? (config.min || 0) +
                    ((config.max || 100) - (config.min || 0)) / 2
                  : 0,
              ]}
              min={config.min}
              max={config.max}
              step={0.1}
              onValueChange={(value) => setSliderValue(value[0])}
              className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[class*=SliderTrack]]:h-1"
            />
            <div
              className="absolute text-sm text-muted-foreground"
              style={{
                left: `clamp(0%, ${
                  ((sliderValue - (config.min || 0)) /
                    ((config.max || 100) - (config.min || 0))) *
                  100
                }%, 100%)`,
                transform: `translateX(-${
                  ((sliderValue - (config.min || 0)) /
                    ((config.max || 100) - (config.min || 0))) *
                    100 ===
                  0
                    ? 0
                    : ((sliderValue - (config.min || 0)) /
                        ((config.max || 100) - (config.min || 0))) *
                        100 ===
                      100
                    ? 100
                    : 50
                }%)`,
                top: '24px',
              }}
            >
              {sliderValue.toFixed(1)}
            </div>
          </div>
        )
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
