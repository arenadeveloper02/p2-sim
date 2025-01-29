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
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Environment Variables</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {envVars.map((envVar, index) => (
            <div key={index} className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor={`key-${index}`}>Key</Label>
                <Input
                  id={`key-${index}`}
                  value={envVar.key}
                  onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                  placeholder="API_KEY"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`value-${index}`}>Value</Label>
                <Input
                  id={`value-${index}`}
                  value={envVar.value}
                  onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                  type="password"
                  placeholder="Enter value"
                />
              </div>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={addEnvVar}
          className="mt-2"
        >
          Add Variable
        </Button>
        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onOpenChange(false)}>Save Changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
