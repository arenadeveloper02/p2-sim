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
              {name}
            </Label>
            <Input
              id={name}
              value={inputs[name] || ''}
              onChange={(e) => handleInputChange(name, e.target.value)}
              placeholder={description || `Enter ${name}`}
            />
            {description && <p className='mt-1 text-muted-foreground text-sm'>{description}</p>}
          </div>
        )
      case 'text':
        return (
          <div key={name} className='mb-4'>
            <Label htmlFor={name} className='mb-2 block'>
              {name}
            </Label>
            <Textarea
              id={name}
              value={inputs[name] || ''}
              onChange={(e) => handleInputChange(name, e.target.value)}
              placeholder={description || `Enter ${name}`}
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
                {name}
              </Label>
              {description && <p className='text-muted-foreground text-sm'>{description}</p>}
            </div>
          </div>
        )
      case 'number':
        return (
          <div key={name} className='mb-4'>
            <Label htmlFor={name} className='mb-2 block'>
              {name}
            </Label>
            <Input
              id={name}
              type='number'
              value={inputs[name] || ''}
              onChange={(e) =>
                handleInputChange(name, e.target.value ? Number(e.target.value) : '')
              }
              placeholder={description || `Enter ${name}`}
            />
            {description && <p className='mt-1 text-muted-foreground text-sm'>{description}</p>}
          </div>
        )
      default:
        return (
          <div key={name} className='mb-4'>
            <Label htmlFor={name} className='mb-2 block'>
              {name} ({type})
            </Label>
            <Input
              id={name}
              value={inputs[name] || ''}
              onChange={(e) => handleInputChange(name, e.target.value)}
              placeholder={description || `Enter ${name}`}
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
          <Button type='submit' className='w-full' disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <div className='mr-2 h-4 w-4'>
                  <LoadingAgent />
                </div>
                Processing...
              </>
            ) : (
              'Submit Inputs & Start Chat'
            )}
          </Button>
        </>
      )}
    </form>
  )
}
