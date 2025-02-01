'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useState, useRef, useEffect } from 'react'

interface EnvVar {
  key: string
  value: string
}

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const GRID_COLS = 'grid grid-cols-[minmax(0,1fr),minmax(0,1fr),40px] gap-4'
const INITIAL_ENV_VAR: EnvVar = { key: '', value: '' }

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [envVars, setEnvVars] = useState<EnvVar[]>([INITIAL_ENV_VAR])
  const [focusedValueIndex, setFocusedValueIndex] = useState<number | null>(
    null
  )
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, envVars.length)
  }, [envVars.length])

  const setInputRef = (el: HTMLInputElement | null, index: number) => {
    inputRefs.current[index] = el
  }

  const handleValueFocus = (index: number) => {
    setFocusedValueIndex(index)
    setTimeout(() => {
      const input = inputRefs.current[index]
      if (input) {
        input.setSelectionRange(0, 0)
        input.scrollLeft = 0
      }
    }, 0)
  }

  const handleValueClick = (
    e: React.MouseEvent<HTMLInputElement>,
    index: number
  ) => {
    e.preventDefault()
    const input = inputRefs.current[index]
    if (input) {
      input.setSelectionRange(0, 0)
      input.scrollLeft = 0
    }
  }

  const handleValueKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
    }
  }

  const handlePaste = (e: React.ClipboardEvent, index: number) => {
    const text = e.clipboardData.getData('text')
    const lines = text.split('\n').filter((line) => line.trim())

    if (lines.length === 0) return
    e.preventDefault()

    if (lines.length === 1) {
      // Single line paste
      const [key, ...valueParts] = lines[0].split('=')
      const value = valueParts.join('=').trim()
      if (key && value) {
        const newEnvVars = [...envVars]
        newEnvVars[index] = { key: key.trim(), value }
        setEnvVars(newEnvVars)
      }
    } else {
      // Multi-line paste
      const parsedVars = lines
        .map((line) => {
          const [key, ...valueParts] = line.split('=')
          return {
            key: key.trim(),
            value: valueParts.join('=').trim(),
          }
        })
        .filter(({ key, value }) => key && value)

      if (parsedVars.length > 0) {
        setEnvVars(parsedVars)
      }
    }
  }

  const addEnvVar = () => setEnvVars([...envVars, INITIAL_ENV_VAR])

  const updateEnvVar = (index: number, field: keyof EnvVar, value: string) => {
    const newEnvVars = [...envVars]
    newEnvVars[index][field] = value
    setEnvVars(newEnvVars)
  }

  const removeEnvVar = (index: number) => {
    const newEnvVars = envVars.filter((_, i) => i !== index)
    setEnvVars(newEnvVars.length ? newEnvVars : [INITIAL_ENV_VAR])
  }

  const renderEnvVarRow = (envVar: EnvVar, index: number) => (
    <div key={index} className={`${GRID_COLS} items-center`}>
      <Input
        value={envVar.key}
        onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
        onPaste={(e) => handlePaste(e, index)}
        placeholder="e.g. API_KEY"
      />
      <Input
        ref={(el) => setInputRef(el, index)}
        value={envVar.value}
        onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
        type={focusedValueIndex === index ? 'text' : 'password'}
        onFocus={() => handleValueFocus(index)}
        onClick={(e) => handleValueClick(e, index)}
        onBlur={() => setFocusedValueIndex(null)}
        onKeyDown={handleValueKeyDown}
        placeholder="Enter value"
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={() => removeEnvVar(index)}
        className="h-10 w-10"
      >
        ×
      </Button>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Environment Variables</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0">
          <div className="space-y-1.5">
            <div className={`${GRID_COLS} px-0.5`}>
              <Label>Key</Label>
              <Label>Value</Label>
              <div />
            </div>

            <div className="relative">
              <div className="overflow-y-auto max-h-[40vh] space-y-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/25 scrollbar-track-transparent pr-6 -mr-6 pb-2 pt-2 px-2 -mx-2">
                {envVars.map(renderEnvVarRow)}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-4 border-t mt-4">
            <Button variant="outline" size="sm" onClick={addEnvVar}>
              Add Variable
            </Button>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => onOpenChange(false)}>Save Changes</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
