'use client'

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Pencil } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArenaIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { createLogger } from '@/lib/logs/console/logger'
import { cn } from '@/lib/utils'
import { useUserPermissionsContext } from '@/app/workspace/[workspaceId]/providers/workspace-permissions-provider'
import { useFolderStore, useIsWorkflowSelected } from '@/stores/folders/store'
import { usePanelStore } from '@/stores/panel/store'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'
import type { WorkflowMetadata } from '@/stores/workflows/registry/types'
import { useWorkflowChatDeployment } from './hooks/use-workflow-chat-deployment'

// Workspace entity interface
interface Workspace {
  id: string
  name: string
  ownerId: string
  role?: string
  membershipId?: string
  permissions?: 'admin' | 'write' | 'read' | null
}

import { extractInputFields } from '@/app/workspace/[workspaceId]/w/[workflowId]/lib/workflow-execution-utils'

const logger = createLogger('WorkflowItem')

// Helper function to check if workspace is AGENTS APPROVAL
const isApproverListWorkspace = (workspace: Workspace | null | undefined): boolean => {
  return workspace?.name === 'AGENTS APPROVAL'
}

// Helper function to lighten a hex color
function lightenColor(hex: string, percent = 30): string {
  // Remove # if present
  const color = hex.replace('#', '')

  // Parse RGB values
  const num = Number.parseInt(color, 16)
  const r = Math.min(255, Math.floor((num >> 16) + ((255 - (num >> 16)) * percent) / 100))
  const g = Math.min(
    255,
    Math.floor(((num >> 8) & 0x00ff) + ((255 - ((num >> 8) & 0x00ff)) * percent) / 100)
  )
  const b = Math.min(255, Math.floor((num & 0x0000ff) + ((255 - (num & 0x0000ff)) * percent) / 100))

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

interface WorkflowItemProps {
  workflow: WorkflowMetadata
  active: boolean
  isMarketplace?: boolean
  level: number
  isDragOver?: boolean
  isFirstItem?: boolean
  isUsedTemplateObj?: any
  activeWorkspace?: Workspace | null
}

export function WorkflowItem({
  workflow,
  active,
  isMarketplace,
  level,
  isDragOver = false,
  isFirstItem = false,
  isUsedTemplateObj,
  activeWorkspace,
}: WorkflowItemProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(workflow.name)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  // State for controlling the deploy modal visibility
  const [showDeployModal, setShowDeployModal] = useState(false)
  // State to track if the workflow has changes that require redeployment
  const [workflowHasChanges, setWorkflowHasChanges] = useState(false)
  const dragStartedRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const params = useParams()
  const workspaceId = params.workspaceId as string
  const { selectedWorkflows, selectOnly, toggleWorkflowSelection } = useFolderStore()
  const isSelected = useIsWorkflowSelected(workflow.id)
  const { updateWorkflow, getWorkflowDeploymentStatus } = useWorkflowRegistry()
  const userPermissions = useUserPermissionsContext()
  const { setParentTemplateId, togglePanel, isOpen, setActiveTab, setFullScreen } = usePanelStore()
  const {
    isLoading: isChatDeploying,
    handleChatDeployment,
    error: chatDeployError,
    checkChatStatus,
  } = useWorkflowChatDeployment()
  const isTemplateId = isUsedTemplateObj?.[0]?.templateId
  const workflowId = workflow.id

  // Get deployment status for the modal
  const deploymentStatus = getWorkflowDeploymentStatus(workflowId)

  // Get active workflow ID to check if this workflow is currently active
  const { activeWorkflowId } = useWorkflowRegistry()
  const route = useRouter()
  const [isLoadingChatDeploy, setIsLoadingChatDeploy] = useState<boolean>(false)

  // Update editValue when workflow name changes
  useEffect(() => {
    setEditValue(workflow.name)
  }, [workflow.name])

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleStartEdit = () => {
    if (isMarketplace) return
    setIsEditing(true)
    setEditValue(workflow.name)
  }

  const handleSaveEdit = async () => {
    if (!editValue.trim() || editValue.trim() === workflow.name) {
      setIsEditing(false)
      setEditValue(workflow.name)
      return
    }

    setIsRenaming(true)
    try {
      await updateWorkflow(workflow.id, { name: editValue.trim() })
      logger.info(`Successfully renamed workflow from "${workflow.name}" to "${editValue.trim()}"`)
      setIsEditing(false)
    } catch (error) {
      logger.error('Failed to rename workflow:', {
        error,
        workflowId: workflow.id,
        oldName: workflow.name,
        newName: editValue.trim(),
      })
      // Reset to original name on error
      setEditValue(workflow.name)
    } finally {
      setIsRenaming(false)
    }
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditValue(workflow.name)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }

  const handleInputBlur = () => {
    handleSaveEdit()
  }

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging || isEditing) {
      e.preventDefault()
      return
    }

    if (e.shiftKey) {
      e.preventDefault()
      toggleWorkflowSelection(workflow.id)
    } else {
      if (!isSelected || selectedWorkflows.size > 1) {
        selectOnly(workflow.id)
      }
    }
  }

  const handleDragStart = (e: React.DragEvent) => {
    if (isMarketplace || isEditing) return

    dragStartedRef.current = true
    setIsDragging(true)

    let workflowIds: string[]
    if (isSelected && selectedWorkflows.size > 1) {
      workflowIds = Array.from(selectedWorkflows)
    } else {
      workflowIds = [workflow.id]
    }

    e.dataTransfer.setData('workflow-ids', JSON.stringify(workflowIds))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    setIsDragging(false)
    requestAnimationFrame(() => {
      dragStartedRef.current = false
    })
  }

  const handleClickWorkflowName = () => {
    console.log('the input fields are', extractInputFields())

    if (isOpen) {
      togglePanel()
    }
    setFullScreen(false)
    setParentTemplateId('')
  }

  const handleClickByChat = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Prevent multiple concurrent deployments
    if (isChatDeploying || isLoadingChatDeploy) return

    setIsLoadingChatDeploy(true)

    // OPTIMIZATION: If this is not the active workflow, skip change detection and redirect directly to chat.
    if (activeWorkflowId !== workflowId) {
      logger.info('Opening chat for non-active workflow, redirecting directly')
      route.push(`/chat/${workflowId}`)
      return
    }

    try {
      // STEP 1: Check if chat interface already exists for this workflow
      const chatStatus = await checkChatStatus(workflowId)

      if (chatStatus.isDeployed) {
        // STEP 2: Chat exists - check if workflow needs redeployment. This compares current workflow state with the deployed state in the database
        const statusResponse = await fetch(`/api/workflows/${workflowId}/status`)
        let hasChanges = false

        if (statusResponse.ok) {
          const statusData = await statusResponse.json()
          hasChanges = statusData.needsRedeployment || false
        }

        if (hasChanges) {
          // This will trigger the existing redeploy functionality when user clicks "Update"
          logger.info('Chat exists but workflow has changes, showing deploy modal for redeployment')
          setWorkflowHasChanges(true) // Update local state for UI feedback
          setShowDeployModal(true) // Open modal with chat tab active
        } else {
          // STEP 3B: No changes - redirect directly to existing chat
          logger.info('Chat already deployed with no changes, opening existing chat')
          setWorkflowHasChanges(false) // Update local state
          route.push(`/chat/${workflowId}`)
        }
      } else {
        // STEP 2: Chat doesn't exist - show deploy modal for initial deployment
        setShowDeployModal(true)
      }
    } catch (error) {
      logger.error('Failed to check chat status:', error)
      // FALLBACK: Show deploy modal on any error to ensure user can still deploy
      setShowDeployModal(true)
    } finally {
      setIsLoadingChatDeploy(false)
    }
  }

  return (
    <div className='mb-1'>
      <div
        className={clsx(
          'group flex h-8 cursor-pointer items-center rounded-[8px] px-2 py-2 font-medium font-sans text-sm transition-colors',
          active && !isDragOver ? 'bg-muted' : 'hover:bg-muted',
          isSelected && selectedWorkflows.size > 1 && !active && !isDragOver ? 'bg-muted' : '',
          isDragging ? 'opacity-50' : '',
          isFirstItem ? 'mr-[36px]' : '',
          isTemplateId && '!pl-1'
        )}
        style={{
          maxWidth: isFirstItem
            ? `${166 - (level >= 0 ? (level + 1) * 20 + 8 : 0) - (level > 0 ? 8 : 0)}px`
            : `${206 - (level >= 0 ? (level + 1) * 20 + 8 : 0) - (level > 0 ? 8 : 0)}px`,
        }}
        draggable={!isMarketplace && !isEditing}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        data-workflow-id={workflow.id}
      >
        <Link
          href={`/workspace/${workspaceId}/w/${workflow.id}`}
          className='flex min-w-0 flex-1 items-center'
          onClick={(e) => {
            handleClick(e)
            handleClickWorkflowName()
          }}
        >
          <div
            className={cn(
              'mr-2 flex h-[14px] w-[14px] flex-shrink-0 items-center justify-center overflow-hidden',
              isTemplateId && '!h-[20px] !w-[20px]'
            )}
            style={{
              backgroundColor: isTemplateId ? 'transparent' : lightenColor(workflow.color, 60),
              borderRadius: '4px',
            }}
          >
            {isTemplateId ? (
              <ArenaIcon className='h-5 w-5 text-[#F3F8FE]' />
            ) : (
              <div
                className='h-[9px] w-[9px]'
                style={{
                  backgroundColor: workflow.color,
                  borderRadius: '2.571px', // Maintains same ratio as outer div (4/14 = 2.571/9)
                }}
              />
            )}
          </div>
          {isEditing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleInputBlur}
              className={clsx(
                'min-w-0 flex-1 border-0 bg-transparent p-0 font-medium font-sans text-sm outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
                active && !isDragOver
                  ? 'text-foreground'
                  : 'text-muted-foreground group-hover:text-foreground'
              )}
              maxLength={100}
              disabled={isRenaming}
              onClick={(e) => e.preventDefault()} // Prevent navigation when clicking input
              autoComplete='off'
              autoCorrect='off'
              autoCapitalize='off'
              spellCheck='false'
            />
          ) : !isDragging ? (
            <Tooltip delayDuration={1000}>
              <TooltipTrigger asChild>
                <span
                  className={clsx(
                    'min-w-0 flex-1 select-none truncate pr-1 font-medium font-sans text-sm',
                    active && !isDragOver
                      ? 'text-foreground'
                      : 'text-muted-foreground group-hover:text-foreground'
                  )}
                >
                  {workflow.name}
                  {isMarketplace && ' (Preview)'}
                </span>
              </TooltipTrigger>
              <TooltipContent side='top' align='start' sideOffset={10}>
                <p>
                  {workflow.name}
                  {isMarketplace && ' (Preview)'}
                </p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <span
              className={clsx(
                'min-w-0 flex-1 select-none truncate pr-1 font-medium font-sans text-sm',
                active && !isDragOver
                  ? 'text-foreground'
                  : 'text-muted-foreground group-hover:text-foreground'
              )}
            >
              {workflow.name}
              {isMarketplace && ' (Preview)'}
            </span>
          )}
        </Link>

        {!isMarketplace &&
          !isEditing &&
          isHovered &&
          userPermissions.canEdit &&
          !isApproverListWorkspace(activeWorkspace) && (
            <div className='flex items-center justify-center' onClick={(e) => e.stopPropagation()}>
              <Button
                variant='ghost'
                size='icon'
                className='h-4 w-4 p-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground'
                onClick={(e) => {
                  e.stopPropagation()
                  handleStartEdit()
                }}
              >
                <Pencil className='!h-3.5 !w-3.5' />
                <span className='sr-only'>Rename workflow</span>
              </Button>
            </div>
          )}
        {/* {isHovered && (
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                onClick={handleClickByChat}
                disabled={isChatDeploying || isLoadingChatDeploy}
                className={cn(
                  'ml-1 flex h-4 w-4 items-center justify-center rounded p-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground',
                  isChatDeploying || (isLoadingChatDeploy && 'cursor-not-allowed opacity-50')
                )}
              >
                {isChatDeploying || isLoadingChatDeploy ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                ) : (
                  <MessageCircleMore className='h-3.5 w-3.5' />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side='top' align='center' sideOffset={10}>
              <p>
                {isChatDeploying ? 'Deploying chat...' : 'Open chat interface'}
                {chatDeployError && (
                  <span className='mt-1 block text-red-400 text-xs'>{chatDeployError}</span>
                )}
              </p>
            </TooltipContent>
          </Tooltip>
        )} */}
      </div>

      {/* <DeployModal
        open={showDeployModal}
        onOpenChange={setShowDeployModal}
        workflowId={workflowId}
        needsRedeployment={workflowHasChanges} // Pass change detection state
        setNeedsRedeployment={setWorkflowHasChanges} // Allow modal to clear flag
        deployedState={{} as any} // Not needed for chat-only deployment from sidebar
        isLoadingDeployedState={false}
        refetchDeployedState={async () => {}} // Not needed for this use case
        initialTab='chat'
        isSidebar={true}
      /> */}
    </div>
  )
}
