'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useState, useRef, useEffect, useMemo } from 'react'
import { useEnvironmentStore } from '@/stores/environment/store'
import { EnvironmentVariable as StoreEnvironmentVariable } from '@/stores/environment/types'

// Extend the store type with our UI-specific fields
interface UIEnvironmentVariable extends StoreEnvironmentVariable {
  id?: number
}

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const GRID_COLS = 'grid grid-cols-[minmax(0,1fr),minmax(0,1fr),40px] gap-4'
const INITIAL_ENV_VAR: UIEnvironmentVariable = { key: '', value: '' }

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { variables, setVariable, removeVariable } = useEnvironmentStore()
  const [envVars, setEnvVars] = useState<UIEnvironmentVariable[]>([])
  const [focusedValueIndex, setFocusedValueIndex] = useState<number | null>(null)
  const [showUnsavedChanges, setShowUnsavedChanges] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pendingClose = useRef(false)
  const initialVarsRef = useRef<UIEnvironmentVariable[]>([])

  // Check if there are unsaved changes by comparing with initial state
  const hasChanges = useMemo(() => {
    // Filter out empty rows from both initial and current state
    const initialVars = initialVarsRef.current.filter(v => v.key || v.value)
    const currentVars = envVars.filter(v => v.key || v.value)

    // Create maps for easier comparison
    const initialMap = new Map(initialVars.map(v => [v.key, v.value]))
    const currentMap = new Map(currentVars.map(v => [v.key, v.value]))

    // Different number of non-empty variables
    if (initialMap.size !== currentMap.size) return true

    // Check for any differences in keys or values
    for (const [key, value] of currentMap) {
      const initialValue = initialMap.get(key)
      // If key doesn't exist in initial or value is different
      if (initialValue !== value) {
        return true
      }
    }

    // Check if any initial keys are missing from current
    for (const key of initialMap.keys()) {
      if (!currentMap.has(key)) {
        return true
      }
    }

    return false
  }, [envVars])

  // Reset state when modal is opened
  useEffect(() => {
    if (open) {
      const existingVars = Object.values(variables)
      const initialVars = existingVars.length ? existingVars : [INITIAL_ENV_VAR]
      // Create deep copy of initial vars to prevent reference issues
      initialVarsRef.current = JSON.parse(JSON.stringify(initialVars))
      setEnvVars(JSON.parse(JSON.stringify(initialVars)))
      pendingClose.current = false
    }
  }, [open, variables])

  const handleClose = () => {
    if (hasChanges) {
      setShowUnsavedChanges(true)
      pendingClose.current = true
    } else {
      onOpenChange(false)
    }
  }

  const handleCancel = () => {
    // Reset to initial state when cancelling (without saving)
    setEnvVars(JSON.parse(JSON.stringify(initialVarsRef.current)))
    setShowUnsavedChanges(false)
    if (pendingClose.current) {
      onOpenChange(false)
    }
  }

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [envVars])

  const handleValueFocus = (index: number, e: React.FocusEvent<HTMLInputElement>) => {
    setFocusedValueIndex(index)
    // Always scroll to the start of the input
    e.target.scrollLeft = 0
  }

  const handleValueClick = (e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault()
    // Always scroll to the start of the input
    e.currentTarget.scrollLeft = 0
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

  const addEnvVar = () => {
    // Create a fresh empty variable with a unique id
    const newVar = { key: '', value: '', id: Date.now() }
    setEnvVars([...envVars, newVar])
  }

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    const newEnvVars = [...envVars]
    newEnvVars[index][field] = value
    setEnvVars(newEnvVars)
  }

  const removeEnvVar = (index: number) => {
    const newEnvVars = envVars.filter((_, i) => i !== index)
    setEnvVars(newEnvVars.length ? newEnvVars : [INITIAL_ENV_VAR])
  }

  const handleSave = () => {
    // Save all valid environment variables to the store
    const validVars = envVars.filter(v => v.key && v.value)
    validVars.forEach(v => setVariable(v.key, v.value))
    
    // Remove any variables that were deleted
    const currentKeys = new Set(validVars.map(v => v.key))
    Object.keys(variables).forEach(key => {
      if (!currentKeys.has(key)) {
        removeVariable(key)
      }
    })
    
    if (pendingClose.current) {
      onOpenChange(false)
    }
  }

  const renderEnvVarRow = (envVar: UIEnvironmentVariable, index: number) => (
    <div key={envVar.id || index} className={`${GRID_COLS} items-center`}>
      <Input
        value={envVar.key}
        onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
        onPaste={(e) => handlePaste(e, index)}
        placeholder="e.g. API_KEY"
      />
      <Input
        value={envVar.value}
        onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
        type={focusedValueIndex === index ? 'text' : 'password'}
        onFocus={(e) => handleValueFocus(index, e)}
        onClick={handleValueClick}
        onBlur={() => setFocusedValueIndex(null)}
        onPaste={(e) => handlePaste(e, index)}
        placeholder="Enter value"
        className="allow-scroll"
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
    <>
      <Dialog open={open} onOpenChange={handleClose}>
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
                <div
                  ref={scrollContainerRef}
                  className="overflow-y-auto max-h-[40vh] space-y-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/25 scrollbar-track-transparent pr-6 -mr-6 pb-2 pt-2 px-2 -mx-2"
                >
                  {envVars.map(renderEnvVarRow)}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 pt-4 border-t mt-4">
              <Button variant="outline" size="sm" onClick={addEnvVar}>
                Add Variable
              </Button>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSave} 
                  disabled={!hasChanges}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showUnsavedChanges} onOpenChange={setShowUnsavedChanges}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Do you want to save them before closing?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              Discard Changes
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSave}>
              Save Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
