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
import { useState } from 'react'

export function SettingsModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([
    { key: '', value: '' },
  ])

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }])
  }

  const updateEnvVar = (
    index: number,
    field: 'key' | 'value',
    value: string
  ) => {
    const newEnvVars = [...envVars]
    newEnvVars[index][field] = value
    setEnvVars(newEnvVars)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-6">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-lg font-medium leading-none">
            Environment Variables
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[400px] overflow-y-auto scrollbar-hide">
          <div className="space-y-4">
            {envVars.map((envVar, index) => (
              <div key={index} className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label
                    htmlFor={`key-${index}`}
                    className="text-sm font-medium leading-none"
                  >
                    Key
                  </Label>
                  <Input
                    id={`key-${index}`}
                    value={envVar.key}
                    onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                    placeholder="API_KEY"
                    className="placeholder:text-muted-foreground/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor={`value-${index}`}
                    className="text-sm font-medium leading-none"
                  >
                    Value
                  </Label>
                  <Input
                    id={`value-${index}`}
                    value={envVar.value}
                    onChange={(e) =>
                      updateEnvVar(index, 'value', e.target.value)
                    }
                    type="password"
                    placeholder="Enter value"
                    className="placeholder:text-muted-foreground/50"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={addEnvVar}
          className="mt-4 w-full border bg-card shadow-sm hover:bg-accent/50"
        >
          Add Variable
        </Button>
        <div className="flex justify-end space-x-3 pt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-card shadow-sm hover:bg-accent/50"
          >
            Cancel
          </Button>
          <Button onClick={() => onOpenChange(false)}>Save Changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
