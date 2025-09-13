import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'

interface InputField {
  name: string
  type: string
  description?: string
}

interface WorkflowInputFormProps {
  fields: InputField[]
  onSubmit: (inputs: Record<string, any>) => void
}

export function WorkflowInputForm({ fields, onSubmit }: WorkflowInputFormProps) {
  const [inputs, setInputs] = useState<Record<string, any>>({})

  const handleInputChange = (name: string, value: any) => {
    setInputs((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(inputs)
  }

  const renderInputField = (field: InputField) => {
    const { name, type, description } = field
    
    switch (type.toLowerCase()) {
      case 'string':
        return (
          <div className="mb-4" key={name}>
            <Label htmlFor={name} className="mb-1 block">
              {name}
            </Label>
            <Input
              id={name}
              value={inputs[name] || ''}
              onChange={(e) => handleInputChange(name, e.target.value)}
              placeholder={description || `Enter ${name}`}
            />
          </div>
        )
      case 'text':
        return (
          <div className="mb-4" key={name}>
            <Label htmlFor={name} className="mb-1 block">
              {name}
            </Label>
            <Textarea
              id={name}
              value={inputs[name] || ''}
              onChange={(e) => handleInputChange(name, e.target.value)}
              placeholder={description || `Enter ${name}`}
              rows={4}
            />
          </div>
        )
      case 'boolean':
        return (
          <div className="mb-4 flex items-center space-x-2" key={name}>
            <Checkbox
              id={name}
              checked={inputs[name] || false}
              onCheckedChange={(checked) => handleInputChange(name, checked)}
            />
            <Label htmlFor={name}>{name}</Label>
          </div>
        )
      case 'number':
        return (
          <div className="mb-4" key={name}>
            <Label htmlFor={name} className="mb-1 block">
              {name}
            </Label>
            <Input
              id={name}
              type="number"
              value={inputs[name] || ''}
              onChange={(e) => handleInputChange(name, e.target.value ? Number(e.target.value) : '')}
              placeholder={description || `Enter ${name}`}
            />
          </div>
        )
      default:
        return (
          <div className="mb-4" key={name}>
            <Label htmlFor={name} className="mb-1 block">
              {name} ({type})
            </Label>
            <Input
              id={name}
              value={inputs[name] || ''}
              onChange={(e) => handleInputChange(name, e.target.value)}
              placeholder={description || `Enter ${name}`}
            />
          </div>
        )
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-muted/30 rounded-lg">
      <h3 className="text-lg font-medium mb-4">Workflow Input Fields</h3>
      {fields.length === 0 ? (
        <p className="text-muted-foreground">No input fields required for this workflow.</p>
      ) : (
        <>
          {fields.map(renderInputField)}
          <Button type="submit" className="w-full">
            Submit Inputs & Start Workflow
          </Button>
        </>
      )}
    </form>
  )
}