import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WorkflowInputForm } from './workflow-input-form'

interface InputField {
  name: string
  type: string
  description?: string
}

interface WorkflowInputOverlayProps {
  fields: InputField[]
  onSubmit: (inputs: Record<string, any>) => void
  onClose: () => void
  isVisible: boolean
}

export function WorkflowInputOverlay({
  fields,
  onSubmit,
  onClose,
  isVisible,
}: WorkflowInputOverlayProps) {
  if (!isVisible) return null

  // Handle form submission - close the overlay when submitting
  const handleSubmit = (inputs: Record<string, any>) => {
    onSubmit(inputs)
    // No need to call onClose here, the parent component will handle it
  }

  return (
    <div className='absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm'>
      <Card className='max-h-[80vh] w-[90%] max-w-md overflow-auto shadow-lg'>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='font-medium text-xl'>Workflow Inputs</CardTitle>
          {/* <Button variant='ghost' size='icon' className='h-8 w-8 rounded-full' onClick={onClose}>
            <X className='h-4 w-4' />
            <span className='sr-only'>Close</span>
          </Button> */}
        </CardHeader>
        <CardContent>
          <WorkflowInputForm fields={fields} onSubmit={handleSubmit} />
        </CardContent>
      </Card>
    </div>
  )
}
