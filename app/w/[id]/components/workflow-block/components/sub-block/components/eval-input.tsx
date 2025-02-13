import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useSubBlockValue } from '../hooks/use-sub-block-value'

interface EvalMetric {
  id: string
  name: string
  description: string
  range: {
    min: number
    max: number
  }
}

interface EvalInputProps {
  blockId: string
  subBlockId: string
}

export function EvalInput({ blockId, subBlockId }: EvalInputProps) {
  const [value, setValue] = useSubBlockValue<EvalMetric[]>(blockId, subBlockId)
  const containerRef = useRef<HTMLDivElement>(null)

  // Initialize with default metrics if value is null
  const metrics = value || [
    {
      id: crypto.randomUUID(),
      name: '',
      description: '',
      range: { min: 0, max: 1 },
    },
  ]

  const addMetric = () => {
    const newMetric: EvalMetric = {
      id: crypto.randomUUID(),
      name: '',
      description: '',
      range: { min: 0, max: 1 },
    }
    setValue([...metrics, newMetric])

    // Focus the new metric's name input after a short delay
    setTimeout(() => {
      const newInput = containerRef.current?.querySelector(
        `[data-metric-id="${newMetric.id}"] input[name="name"]`
      ) as HTMLInputElement
      if (newInput) {
        newInput.focus()
      }
    }, 0)
  }

  const removeMetric = (id: string) => {
    if (metrics.length === 1) return
    setValue(metrics.filter((metric) => metric.id !== id))
  }

  const updateMetric = (id: string, field: keyof EvalMetric, value: any) => {
    setValue(
      metrics.map((metric) =>
        metric.id === id
          ? {
              ...metric,
              [field]: value,
            }
          : metric
      )
    )
  }

  const updateRange = (id: string, field: 'min' | 'max', value: string) => {
    setValue(
      metrics.map((metric) =>
        metric.id === id
          ? {
              ...metric,
              range: {
                ...metric.range,
                [field]: value,
              },
            }
          : metric
      )
    )
  }

  const handleRangeBlur = (id: string, field: 'min' | 'max', value: string) => {
    // Allow any number including negatives, just remove non-numeric characters except - and .
    const sanitizedValue = value.replace(/[^\d.-]/g, '')
    const numValue = parseFloat(sanitizedValue)

    setValue(
      metrics.map((metric) =>
        metric.id === id
          ? {
              ...metric,
              range: {
                ...metric.range,
                [field]: !isNaN(numValue) ? numValue : 0,
              },
            }
          : metric
      )
    )
  }

  const moveMetric = (id: string, direction: 'up' | 'down') => {
    const index = metrics.findIndex((metric) => metric.id === id)
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === metrics.length - 1)
    )
      return

    const newMetrics = [...metrics]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    ;[newMetrics[index], newMetrics[targetIndex]] = [newMetrics[targetIndex], newMetrics[index]]
    setValue(newMetrics)
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      {metrics.map((metric, index) => (
        <div
          key={metric.id}
          data-metric-id={metric.id}
          className="overflow-visible rounded-lg border bg-background group relative"
        >
          <div className="flex h-10 items-center justify-between bg-card px-3 rounded-t-lg border-b">
            <span className="text-sm font-medium">Metric {index + 1}</span>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={addMetric} className="h-8 w-8">
                    <Plus className="h-4 w-4" />
                    <span className="sr-only">Add Metric</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add Metric</TooltipContent>
              </Tooltip>

              <div className="flex items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveMetric(metric.id, 'up')}
                      disabled={index === 0}
                      className="h-8 w-8"
                    >
                      <ChevronUp className="h-4 w-4" />
                      <span className="sr-only">Move Up</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Move Up</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveMetric(metric.id, 'down')}
                      disabled={index === metrics.length - 1}
                      className="h-8 w-8"
                    >
                      <ChevronDown className="h-4 w-4" />
                      <span className="sr-only">Move Down</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Move Down</TooltipContent>
                </Tooltip>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMetric(metric.id)}
                    disabled={metrics.length === 1}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash className="h-4 w-4" />
                    <span className="sr-only">Delete Metric</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete Metric</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="px-4 py-3 space-y-2">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                name="name"
                value={metric.name}
                onChange={(e) => updateMetric(metric.id, 'name', e.target.value)}
                placeholder="Accuracy"
                className="text-muted-foreground placeholder:text-muted-foreground/50"
              />
            </div>

            <div className="space-y-1">
              <Label>Description</Label>
              <Input
                value={metric.description}
                onChange={(e) => updateMetric(metric.id, 'description', e.target.value)}
                placeholder="How well does it meet the requirements?"
                className="text-muted-foreground placeholder:text-muted-foreground/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Min Value</Label>
                <Input
                  type="text"
                  value={metric.range.min}
                  onChange={(e) => updateRange(metric.id, 'min', e.target.value)}
                  onBlur={(e) => handleRangeBlur(metric.id, 'min', e.target.value)}
                  className="text-muted-foreground placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="space-y-1">
                <Label>Max Value</Label>
                <Input
                  type="text"
                  value={metric.range.max}
                  onChange={(e) => updateRange(metric.id, 'max', e.target.value)}
                  onBlur={(e) => handleRangeBlur(metric.id, 'max', e.target.value)}
                  className="text-muted-foreground placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
