'use client'

import { useEffect, useState } from 'react'
import { createLogger } from '@sim/logger'
import { useParams, useRouter } from 'next/navigation'
import { ReactFlowProvider } from 'reactflow'
import { WorkspaceConicLoader } from '@/app/workspace/workspace-conic-loader'
import { Panel, Terminal } from '@/app/workspace/[workspaceId]/w/[workflowId]/components'
import { useWorkflows } from '@/hooks/queries/workflows'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'

const logger = createLogger('WorkflowsPage')

export default function WorkflowsPage() {
  const router = useRouter()
  const setActiveWorkflow = useWorkflowRegistry((s) => s.setActiveWorkflow)
  const params = useParams()
  const workspaceId = params.workspaceId as string
  const [isMounted, setIsMounted] = useState(false)

  const { data: workflows = [], isLoading, isError, isPlaceholderData } = useWorkflows(workspaceId)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isMounted) return
    if (isLoading || isPlaceholderData) return

    if (isError) {
      logger.error('Failed to load workflows for workspace')
      return
    }

    const workspaceWorkflows = workflows.filter((w) => w.workspaceId === workspaceId)

    if (workspaceWorkflows.length > 0) {
      router.replace(`/workspace/${workspaceId}/w/${workspaceWorkflows[0].id}`)
    }
  }, [
    isMounted,
    isLoading,
    isPlaceholderData,
    workflows,
    workspaceId,
    router,
    setActiveWorkflow,
    isError,
  ])

  // Always show loading state until redirect happens
  // There should always be a default workflow, so we never show "no workflows found"
  return (
    <div className='flex h-full w-full flex-col overflow-hidden bg-[var(--bg)]'>
      <div className='relative h-full w-full flex-1 bg-[var(--bg)]'>
        <div className='workflow-container flex h-full items-center justify-center bg-[var(--bg)]'>
          <WorkspaceConicLoader />
        </div>
        <ReactFlowProvider>
          <Panel />
        </ReactFlowProvider>
      </div>
      <Terminal />
    </div>
  )
}
