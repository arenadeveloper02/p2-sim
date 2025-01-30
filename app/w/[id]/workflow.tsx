'use client'

import { useEffect, useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import 'reactflow/dist/style.css'
import { useWorkflowRegistry } from '@/stores/workflow/workflow-registry'
import { useParams, useRouter } from 'next/navigation'
import { WorkflowCanvas } from './components/workflow-canvas/workflow-canvas'

export default function Workflow() {
  const params = useParams()
  const router = useRouter()
  const { workflows, setActiveWorkflow, addWorkflow } = useWorkflowRegistry()
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedRegistry = localStorage.getItem('workflow-registry')
      if (savedRegistry) {
        useWorkflowRegistry.setState({ workflows: JSON.parse(savedRegistry) })
      }
      setIsInitialized(true)
    }
  }, [])

  useEffect(() => {
    if (!isInitialized) return

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

    const validateAndNavigate = () => {
      const workflowIds = Object.keys(workflows)
      const currentId = params.id as string

      if (workflowIds.length === 0) {
        const newId = createInitialWorkflow()
        router.replace(`/w/${newId}`)
        return
      }

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

  if (!isInitialized) {
    return null
  }

  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  )
}
