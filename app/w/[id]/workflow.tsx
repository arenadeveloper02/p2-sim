'use client'

import { useEffect, useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import 'reactflow/dist/style.css'
import { useWorkflowRegistry } from '@/stores/workflow/registry'
import { useParams, useRouter } from 'next/navigation'
import { WorkflowCanvas } from './components/workflow-canvas/workflow-canvas'

export default function Workflow() {
  // Track if initial data loading is complete
  const [isInitialized, setIsInitialized] = useState(false)

  const params = useParams()
  const router = useRouter()
  const { workflows, setActiveWorkflow, addWorkflow } = useWorkflowRegistry()

  // Load saved workflows from localStorage on component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedRegistry = localStorage.getItem('workflow-registry')
      if (savedRegistry) {
        useWorkflowRegistry.setState({ workflows: JSON.parse(savedRegistry) })
      }
      setIsInitialized(true)
    }
  }, [])

  // Handle workflow initialization and navigation
  useEffect(() => {
    if (!isInitialized) return

    // Create a new workflow with default values
    const createInitialWorkflow = () => {
      const id = crypto.randomUUID()
      const newWorkflow = {
        id,
        name: 'Workflow 1',
        lastModified: new Date(),
        description: 'New workflow',
        color: '#3972F6',
      }
      addWorkflow(newWorkflow)
      return id
    }

    // Ensure valid workflow ID and redirect if necessary
    const validateAndNavigate = () => {
      const workflowIds = Object.keys(workflows)
      const currentId = params.id as string

      // Create first workflow if none exist
      if (workflowIds.length === 0) {
        const newId = createInitialWorkflow()
        router.replace(`/w/${newId}`)
        return
      }

      // Redirect to first workflow if current ID is invalid
      if (!workflows[currentId]) {
        router.replace(`/w/${workflowIds[0]}`)
        return
      }

      setActiveWorkflow(currentId)
    }

    validateAndNavigate()
  }, [
    params.id,
    workflows,
    setActiveWorkflow,
    addWorkflow,
    router,
    isInitialized,
  ])

  // Don't render until initial data is loaded
  if (!isInitialized) {
    return null
  }

  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  )
}
