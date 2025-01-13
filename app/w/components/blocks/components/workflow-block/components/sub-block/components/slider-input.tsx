import { Slider } from '@/components/ui/slider'
import { useState } from 'react'

interface SliderInputProps {
  min?: number
  max?: number
  defaultValue: number
}

export function SliderInput({
  min = 0,
  max = 100,
  defaultValue,
}: SliderInputProps) {
  const [sliderValue, setSliderValue] = useState(defaultValue)

  return (
    <div className="relative pt-2 pb-6">
      <Slider
        defaultValue={[defaultValue]}
        min={min}
        max={max}
        step={0.1}
        onValueChange={(value) => setSliderValue(value[0])}
        className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[class*=SliderTrack]]:h-1"
      />
      <div
        className="absolute text-sm text-muted-foreground"
        style={{
          left: `clamp(0%, ${
            ((sliderValue - min) / (max - min)) * 100
          }%, 100%)`,
          transform: `translateX(-${(() => {
            const percentage = ((sliderValue - min) / (max - min)) * 100
            const bias = -25 * Math.sin((percentage * Math.PI) / 50)
            return percentage === 0 ? 0 : percentage === 100 ? 100 : 50 + bias
          })()}%)`,
          top: '24px',
        }}
      >
        {sliderValue.toFixed(1)}
      </div>
    </div>
  )
}
