import type React from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingAgent } from '@/components/ui/loading-agent'
import { Textarea } from '@/components/ui/textarea'

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
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleInputChange = (name: string, value: any) => {
    setInputs((prev) => ({ ...prev, [name]: value }))
  }

  // Utility function to format text: replace underscores with spaces and capitalize first letter
  const formatText = (text: string) => {
    return text.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  }

  // Check if at least one input field has a meaningful value
  const hasValidInput = () => {
    return fields.every((field) => {
      const value = inputs[field.name]
      if (value === undefined || value === null) return false

      // For different field types, check if they have meaningful values
      switch (field.type.toLowerCase()) {
        case 'string':
        case 'text':
          return typeof value === 'string' && value.trim().length > 0
        case 'number':
          return typeof value === 'number' && !Number.isNaN(value)
        case 'boolean':
          return typeof value === 'boolean'
        default:
          return typeof value === 'string' && value.trim().length > 0
      }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setTimeout(() => {
      onSubmit(inputs)
    }, 0)
  }

  const renderInputField = (field: InputField) => {
    const { name, type, description } = field

    switch (type.toLowerCase()) {
      case 'string':
        return (
          <div key={name} className='mb-4'>
            <Label htmlFor={name} className='mb-2 block'>
              {formatText(name)}
            </Label>
            <Input
              id={name}
              value={inputs[name] || ''}
              onChange={(e) => handleInputChange(name, e.target.value)}
              placeholder={description || `Enter ${formatText(name)}`}
            />
            {description && <p className='mt-1 text-muted-foreground text-sm'>{description}</p>}
          </div>
        )
      case 'text':
        return (
          <div key={name} className='mb-4'>
            <Label htmlFor={name} className='mb-2 block'>
              {formatText(name)}
            </Label>
            <Textarea
              id={name}
              value={inputs[name] || ''}
              onChange={(e) => handleInputChange(name, e.target.value)}
              placeholder={description || `Enter ${formatText(name)}`}
              rows={4}
            />
            {description && <p className='mt-1 text-muted-foreground text-sm'>{description}</p>}
          </div>
        )
      case 'boolean':
        return (
          <div key={name} className='mb-4 flex items-start space-x-3'>
            <Checkbox
              id={name}
              checked={inputs[name] || false}
              onCheckedChange={(checked) => handleInputChange(name, checked)}
            />
            <div className='space-y-1 leading-none'>
              <Label htmlFor={name} className='cursor-pointer'>
                {formatText(name)}
              </Label>
              {description && <p className='text-muted-foreground text-sm'>{description}</p>}
            </div>
          </div>
        )
      case 'number':
        return (
          <div key={name} className='mb-4'>
            <Label htmlFor={name} className='mb-2 block'>
              {formatText(name)}
            </Label>
            <Input
              id={name}
              type='number'
              value={inputs[name] || ''}
              onChange={(e) =>
                handleInputChange(name, e.target.value ? Number(e.target.value) : '')
              }
              placeholder={description || `Enter ${formatText(name)}`}
            />
            {description && <p className='mt-1 text-muted-foreground text-sm'>{description}</p>}
          </div>
        )
      default:
        return (
          <div key={name} className='mb-4'>
            <Label htmlFor={name} className='mb-2 block'>
              {formatText(name)} ({type})
            </Label>
            <Input
              id={name}
              value={inputs[name] || ''}
              onChange={(e) => handleInputChange(name, e.target.value)}
              placeholder={description || `Enter ${formatText(name)}`}
            />
            {description && <p className='mt-1 text-muted-foreground text-sm'>{description}</p>}
          </div>
        )
    }
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      {fields.length === 0 ? (
        <p className='text-muted-foreground'>No input fields required for this workflow.</p>
      ) : (
        <>
          {fields.map(renderInputField)}
          <Button type='submit' className='w-full' disabled={isSubmitting || !hasValidInput()}>
            {isSubmitting ? (
              <>
                <div className='mr-2 h-4 w-4'>
                  <LoadingAgent />
                </div>
                Processing...
              </>
            ) : (
              'Submit Inputs & Start Workflow'
            )}
          </Button>
        </>
      )}
    </form>
  )
}
