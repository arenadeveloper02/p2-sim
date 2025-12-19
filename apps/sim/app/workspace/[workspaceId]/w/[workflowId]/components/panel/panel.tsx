'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Square, Zap } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  BubbleChatPreview,
  Button,
  Copy,
  Layout,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  MoreHorizontal,
  Play,
  Popover,
  PopoverContent,
  PopoverItem,
  PopoverTrigger,
  Trash,
} from '@/components/emcn'
import { VariableIcon } from '@/components/icons'
import { createLogger } from '@/lib/logs/console/logger'
import {
  openWorkflowChatEvent,
  workflowClickMoreOptionsEvent,
  workflowRunCTAEvent,
  workflowTabSwitchEvent,
  workflowTestCTAEvent,
} from '@/app/arenaMixpanelEvents/mixpanelEvents'
import { useRegisterGlobalCommands } from '@/app/workspace/[workspaceId]/providers/global-commands-provider'
import { useUserPermissionsContext } from '@/app/workspace/[workspaceId]/providers/workspace-permissions-provider'
import { createCommands } from '@/app/workspace/[workspaceId]/utils/commands-utils'
import {
  Copilot,
  Deploy,
  Editor,
  Toolbar,
} from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components'
import {
  usePanelResize,
  useUsageLimits,
} from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/hooks'
import { Variables } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/variables/variables'
import { useWorkflowExecution } from '@/app/workspace/[workspaceId]/w/[workflowId]/hooks/use-workflow-execution'
import { useDeleteWorkflow, useImportWorkflow } from '@/app/workspace/[workspaceId]/w/hooks'
import { useWorkspaceSettings } from '@/hooks/queries/workspace'
import { useChatStore } from '@/stores/chat/store'
import { usePanelStore } from '@/stores/panel/store'
import type { PanelTab } from '@/stores/panel/types'
import { useVariablesStore } from '@/stores/variables/store'
import { useWorkflowJsonStore } from '@/stores/workflows/json/store'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'
import { useWorkflowStore } from '@/stores/workflows/workflow/store'

const logger = createLogger('Panel')

const RunAgentExternalChat = ({
  workflowId,
  workspaceId,
  workspaceName,
}: {
  workflowId: string
  workspaceId: string
  workspaceName?: string
}) => {
  const [chatUrl, setChatUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Watch for deployment status changes
  const deploymentStatus = useWorkflowRegistry((state) => state.deploymentStatuses[workflowId])

  useEffect(() => {
    if (!workflowId) {
      setChatUrl(null)
      return
    }

    const fetchChatUrl = async () => {
      try {
        setIsLoading(true)
        const response = await fetch(`/api/workflows/${workflowId}/chat/status`)
        if (response.ok) {
          const data = await response.json()
          if (data.isDeployed && data.deployment?.identifier) {
            const url = `/chat/${data.deployment.identifier}?workspaceId=${workspaceId}&fromControlBar=true`
            setChatUrl(url)
          } else {
            setChatUrl(null)
          }
        } else {
          setChatUrl(null)
        }
      } catch (error) {
        logger.error('Error fetching chat status:', error)
        setChatUrl(null)
      } finally {
        setIsLoading(false)
        workflowRunCTAEvent({
          'Workspace Name': workspaceName || '',
          'Workspace ID': workspaceId || '',
        })
      }
    }

    fetchChatUrl()
  }, [workflowId, deploymentStatus?.isDeployed, deploymentStatus?.deployedAt])

  if (!chatUrl) {
    return null
  }

  return (
    <Link href={chatUrl}>
      <Button className='h-[32px] w-[61.5px] gap-[8px]' variant={'primary'}>
        <Zap className='h-[11.5px] w-[11.5px] fill-current' />
        Run
      </Button>
    </Link>
  )
}

/**
 * Panel component with resizable width and tab navigation that persists across page refreshes.
 *
 * Uses a CSS-based approach to prevent hydration mismatches and flash on load:
 * 1. Width is controlled by CSS variable (--panel-width)
 * 2. Blocking script in layout.tsx sets CSS variable and data-panel-active-tab before React hydrates
 * 3. CSS rules control initial visibility based on data-panel-active-tab attribute
 * 4. React takes over visibility control after hydration completes
 * 5. Store updates CSS variable when width changes
 *
 * This ensures server and client render identical HTML, preventing hydration errors and visual flash.
 *
 * Note: All tabs are kept mounted but hidden to preserve component state during tab switches.
 * This prevents unnecessary remounting which would trigger data reloads and reset state.
 *
 * @returns Panel on the right side of the workflow
 */
export function Panel() {
  const router = useRouter()
  const params = useParams()
  const workspaceId = params.workspaceId as string

  const panelRef = useRef<HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { activeTab, setActiveTab, panelWidth, _hasHydrated, setHasHydrated } = usePanelStore()
  const copilotRef = useRef<{
    createNewChat: () => void
    setInputValueAndFocus: (value: string) => void
    focusInput: () => void
  }>(null)
  const toolbarRef = useRef<{
    focusSearch: () => void
  } | null>(null)

  // State
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isAutoLayouting, setIsAutoLayouting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  // Hooks
  const userPermissions = useUserPermissionsContext()
  const { isImporting, handleFileChange } = useImportWorkflow({ workspaceId })
  const { workflows, activeWorkflowId, duplicateWorkflow, hydration } = useWorkflowRegistry()
  const isRegistryLoading =
    hydration.phase === 'idle' ||
    hydration.phase === 'metadata-loading' ||
    hydration.phase === 'state-loading'
  const { getJson } = useWorkflowJsonStore()
  const { blocks } = useWorkflowStore()
  const { data: workspaceData } = useWorkspaceSettings(workspaceId)
  // API returns { workspace: { name, ... } }, and hook returns { settings, permissions }
  const workspaceName = workspaceData?.settings?.workspace?.name || 'Unknown Workspace'

  // Delete workflow hook
  const { isDeleting, handleDeleteWorkflow } = useDeleteWorkflow({
    workspaceId,
    getWorkflowIds: () => activeWorkflowId || '',
    isActive: true,
    onSuccess: () => setIsDeleteModalOpen(false),
  })

  // Usage limits hook
  const { usageExceeded } = useUsageLimits({
    context: 'user',
    autoRefresh: !isRegistryLoading,
  })

  // Workflow execution hook
  const { handleRunWorkflow, handleCancelExecution, isExecuting } = useWorkflowExecution()

  // Panel resize hook
  const { handleMouseDown } = usePanelResize()

  /**
   * Opens subscription settings modal
   */
  const openSubscriptionSettings = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('open-settings', {
          detail: { tab: 'subscription' },
        })
      )
    }
  }

  /**
   * Runs the workflow with usage limit check
   */
  const runWorkflow = useCallback(async () => {
    workflowTestCTAEvent({
      'Workspace Name': workspaceName || '',
      'Workspace ID': workspaceId || '',
    })
    if (usageExceeded) {
      openSubscriptionSettings()
      return
    }
    await handleRunWorkflow()
  }, [usageExceeded, handleRunWorkflow])

  /**
   * Cancels the currently executing workflow
   */
  const cancelWorkflow = useCallback(async () => {
    await handleCancelExecution()
  }, [handleCancelExecution])

  // Chat state
  const { isChatOpen, setIsChatOpen } = useChatStore()
  const { isOpen: isVariablesOpen, setIsOpen: setVariablesOpen } = useVariablesStore()

  const currentWorkflow = activeWorkflowId ? workflows[activeWorkflowId] : null

  /**
   * Mark hydration as complete on mount
   * This allows React to take over visibility control from CSS
   */
  useEffect(() => {
    setHasHydrated(true)
  }, [setHasHydrated])

  /**
   * Handles tab click events
   */
  const handleTabClick = (tab: PanelTab) => {
    setActiveTab(tab)
    workflowTabSwitchEvent({
      'Workflow Tabs': tab?.charAt(0).toUpperCase() + tab?.slice(1),
    })
  }

  /**
   * Downloads a file with the given content
   */
  const downloadFile = useCallback((content: string, filename: string, mimeType: string) => {
    try {
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      logger.error('Failed to download file:', error)
    }
  }, [])

  /**
   * Handles auto-layout of workflow blocks
   */
  const handleAutoLayout = useCallback(async () => {
    if (isExecuting || !userPermissions.canEdit || isAutoLayouting) {
      return
    }

    setIsAutoLayouting(true)
    try {
      // Use the standalone auto layout utility for immediate frontend updates
      const { applyAutoLayoutAndUpdateStore } = await import('../../utils')

      const result = await applyAutoLayoutAndUpdateStore(activeWorkflowId!)

      if (result.success) {
        logger.info('Auto layout completed successfully')
      } else {
        logger.error('Auto layout failed:', result.error)
      }
    } catch (error) {
      logger.error('Auto layout error:', error)
    } finally {
      setIsAutoLayouting(false)
      workflowClickMoreOptionsEvent({
        Options: 'Auto Layout',
      })
    }
  }, [isExecuting, userPermissions.canEdit, isAutoLayouting, activeWorkflowId])

  /**
   * Handles exporting workflow as JSON
   */
  const handleExportJson = useCallback(async () => {
    if (!currentWorkflow || !activeWorkflowId) {
      logger.warn('No active workflow to export')
      return
    }

    setIsExporting(true)
    try {
      // Get the JSON from the store
      const jsonContent = await getJson()

      if (!jsonContent) {
        throw new Error('Failed to generate JSON')
      }

      const filename = `${currentWorkflow.name.replace(/[^a-z0-9]/gi, '-')}.json`
      downloadFile(jsonContent, filename, 'application/json')
      logger.info('Workflow exported as JSON')
    } catch (error) {
      logger.error('Failed to export workflow as JSON:', error)
    } finally {
      setIsExporting(false)
      setIsMenuOpen(false)
      workflowClickMoreOptionsEvent({
        Options: 'Export',
      })
    }
  }, [currentWorkflow, activeWorkflowId, getJson, downloadFile])

  /**
   * Handles duplicating the current workflow
   */
  const handleDuplicateWorkflow = useCallback(async () => {
    if (!activeWorkflowId || !userPermissions.canEdit || isDuplicating) {
      return
    }

    setIsDuplicating(true)
    try {
      const newWorkflow = await duplicateWorkflow(activeWorkflowId)
      if (newWorkflow) {
        router.push(`/workspace/${workspaceId}/w/${newWorkflow}`)
      }
    } catch (error) {
      logger.error('Error duplicating workflow:', error)
    } finally {
      setIsDuplicating(false)
      setIsMenuOpen(false)
      workflowClickMoreOptionsEvent({
        Options: 'Duplicate Workflow',
      })
    }
  }, [
    activeWorkflowId,
    userPermissions.canEdit,
    isDuplicating,
    duplicateWorkflow,
    router,
    workspaceId,
  ])

  // Compute run button state
  const canRun = userPermissions.canRead // Running only requires read permissions
  const isLoadingPermissions = userPermissions.isLoading
  const hasValidationErrors = false // TODO: Add validation logic if needed
  const isWorkflowBlocked = isExecuting || hasValidationErrors
  const isButtonDisabled = !isExecuting && (isWorkflowBlocked || (!canRun && !isLoadingPermissions))

  /**
   * Register global keyboard shortcuts using the central commands registry.
   *
   * - Mod+Enter: Run / cancel workflow (matches the Run button behavior)
   * - C: Focus Copilot tab
   * - T: Focus Toolbar tab
   * - E: Focus Editor tab
   * - Mod+F: Focus Toolbar tab and search input
   *
   * The tab-switching commands are disabled inside editable elements so typing
   * in inputs or textareas is not interrupted.
   */
  useRegisterGlobalCommands(() =>
    createCommands([
      {
        id: 'run-workflow',
        handler: () => {
          // Do exactly what the Run button does
          if (isExecuting) {
            void cancelWorkflow()
          } else {
            void runWorkflow()
          }
        },
        overrides: {
          allowInEditable: false,
        },
      },
      {
        id: 'focus-copilot-tab',
        handler: () => {
          setActiveTab('copilot')
        },
        overrides: {
          allowInEditable: false,
        },
      },
      {
        id: 'focus-toolbar-tab',
        handler: () => {
          setActiveTab('toolbar')
        },
        overrides: {
          allowInEditable: false,
        },
      },
      {
        id: 'focus-editor-tab',
        handler: () => {
          setActiveTab('editor')
        },
        overrides: {
          allowInEditable: false,
        },
      },
      {
        id: 'focus-toolbar-search',
        handler: () => {
          setActiveTab('toolbar')
          toolbarRef.current?.focusSearch()
        },
        overrides: {
          allowInEditable: false,
        },
      },
    ])
  )

  return (
    <>
      <aside
        ref={panelRef}
        className='panel-container fixed inset-y-0 right-0 z-10 overflow-hidden bg-[var(--surface-1)] dark:bg-[var(--surface-1)]'
        aria-label='Workflow panel'
      >
        <div className='flex h-full flex-col border-[var(--border)] border-l pt-[14px] dark:border-[var(--border)]'>
          {/* Header */}
          <div className='flex flex-shrink-0 items-center justify-between px-[8px]'>
            {/* More and Chat */}
            <div className='flex gap-[4px]'>
              <Popover open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                <PopoverTrigger asChild>
                  <Button className='h-[32px] w-[32px]'>
                    <MoreHorizontal />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align='start' side='bottom' sideOffset={8}>
                  <PopoverItem
                    onClick={handleAutoLayout}
                    disabled={isExecuting || !userPermissions.canEdit || isAutoLayouting}
                  >
                    <Layout className='h-3 w-3' animate={isAutoLayouting} variant='clockwise' />
                    <span>Auto layout</span>
                  </PopoverItem>
                  {
                    <PopoverItem
                      onClick={() => {
                        setVariablesOpen(!isVariablesOpen)
                        workflowClickMoreOptionsEvent({
                          Options: 'Variables',
                        })
                      }}
                    >
                      <VariableIcon className='h-3 w-3' />
                      <span>Variables</span>
                    </PopoverItem>
                  }
                  {/* <PopoverItem>
                    <Bug className='h-3 w-3' />
                    <span>Debug</span>
                  </PopoverItem> */}
                  {/* <PopoverItem onClick={() => setIsMenuOpen(false)}>
                    <Webhook className='h-3 w-3' />
                    <span>Log webhook</span>
                  </PopoverItem> */}
                  <PopoverItem
                    onClick={handleExportJson}
                    disabled={!userPermissions.canEdit || isExporting || !currentWorkflow}
                  >
                    <ArrowUp className='h-3 w-3' />
                    <span>Export workflow</span>
                  </PopoverItem>
                  <PopoverItem
                    onClick={handleDuplicateWorkflow}
                    disabled={!userPermissions.canEdit || isDuplicating}
                  >
                    <Copy className='h-3 w-3' animate={isDuplicating} />
                    <span>Duplicate workflow</span>
                  </PopoverItem>
                  <PopoverItem
                    onClick={() => {
                      setIsMenuOpen(false)
                      setIsDeleteModalOpen(true)
                      workflowClickMoreOptionsEvent({
                        Options: 'Delete Workflow',
                      })
                    }}
                    disabled={!userPermissions.canEdit || Object.keys(workflows).length <= 1}
                  >
                    <Trash className='h-3 w-3' />
                    <span>Delete workflow</span>
                  </PopoverItem>
                </PopoverContent>
              </Popover>
              <Button
                className='h-[32px] w-[32px]'
                variant={isChatOpen ? 'active' : 'default'}
                onClick={() => {
                  setIsChatOpen(!isChatOpen)
                  openWorkflowChatEvent({
                    'Workspace Name': workspaceName,
                    'Workspace ID': workspaceId,
                  })
                }}
              >
                <BubbleChatPreview />
              </Button>
            </div>

            {/* Deploy and Run */}
            <div className='flex gap-[4px]'>
              <Deploy activeWorkflowId={activeWorkflowId} userPermissions={userPermissions} />
              <Button
                className='h-[32px] w-[61.5px] gap-[8px]'
                variant={isExecuting ? 'active' : 'primary'}
                onClick={isExecuting ? cancelWorkflow : () => runWorkflow()}
                disabled={!isExecuting && isButtonDisabled}
              >
                {isExecuting ? (
                  <Square className='h-[11.5px] w-[11.5px] fill-current' />
                ) : (
                  <Play className='h-[11.5px] w-[11.5px]' />
                )}
                Test
              </Button>
              <RunAgentExternalChat
                workflowId={activeWorkflowId || ''}
                workspaceId={workspaceId}
                workspaceName={workspaceName}
              />
            </div>
          </div>

          {/* Tabs */}
          <div className='flex flex-shrink-0 items-center justify-between px-[8px] pt-[14px]'>
            <div className='flex gap-[4px]'>
              <Button
                className='h-[28px] truncate px-[8px] py-[5px] text-[12.5px] hover:bg-[var(--surface-9)] hover:text-[var(--text-primary)]'
                variant={_hasHydrated && activeTab === 'copilot' ? 'active' : 'ghost'}
                onClick={() => handleTabClick('copilot')}
                data-tab-button='copilot'
              >
                Copilot
              </Button>
              <Button
                className='h-[28px] px-[8px] py-[5px] text-[12.5px] hover:bg-[var(--surface-9)] hover:text-[var(--text-primary)]'
                variant={_hasHydrated && activeTab === 'toolbar' ? 'active' : 'ghost'}
                onClick={() => handleTabClick('toolbar')}
                data-tab-button='toolbar'
              >
                Toolbar
              </Button>
              <Button
                className='h-[28px] px-[8px] py-[5px] text-[12.5px] hover:bg-[var(--surface-9)] hover:text-[var(--text-primary)]'
                variant={_hasHydrated && activeTab === 'editor' ? 'active' : 'ghost'}
                onClick={() => handleTabClick('editor')}
                data-tab-button='editor'
              >
                Editor
              </Button>
            </div>

            {/* Workflow Controls (Undo/Redo and Zoom) */}
            {/* <WorkflowControls /> */}
          </div>

          {/* Tab Content - Keep all tabs mounted but hidden to preserve state */}
          <div className='flex-1 overflow-hidden pt-[12px]'>
            <div
              className={
                _hasHydrated && activeTab === 'copilot'
                  ? 'h-full'
                  : _hasHydrated
                    ? 'hidden'
                    : 'h-full'
              }
              data-tab-content='copilot'
            >
              <Copilot ref={copilotRef} panelWidth={panelWidth} />
            </div>
            <div
              className={
                _hasHydrated && activeTab === 'editor'
                  ? 'h-full'
                  : _hasHydrated
                    ? 'hidden'
                    : 'h-full'
              }
              data-tab-content='editor'
            >
              <Editor />
            </div>
            <div
              className={
                _hasHydrated && activeTab === 'toolbar'
                  ? 'h-full'
                  : _hasHydrated
                    ? 'hidden'
                    : 'h-full'
              }
              data-tab-content='toolbar'
            >
              <Toolbar ref={toolbarRef} isActive={activeTab === 'toolbar'} />
            </div>
          </div>
        </div>
      </aside>

      {/* Resize Handle */}
      <div
        className='fixed top-0 right-[calc(var(--panel-width)-4px)] bottom-0 z-20 w-[8px] cursor-ew-resize'
        onMouseDown={handleMouseDown}
        role='separator'
        aria-orientation='vertical'
        aria-label='Resize panel'
      />

      {/* Delete Confirmation Modal */}
      <Modal open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <ModalContent size='sm'>
          <ModalHeader>Delete Workflow</ModalHeader>
          <ModalBody>
            <p className='text-[12px] text-[var(--text-tertiary)]'>
              Deleting this workflow will permanently remove all associated blocks, executions, and
              configuration.{' '}
              <span className='text-[var(--text-error)]'>This action cannot be undone.</span>
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant='active'
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant='primary'
              onClick={handleDeleteWorkflow}
              disabled={isDeleting}
              className='!bg-[var(--text-error)] !text-white hover:!bg-[var(--text-error)]/90'
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Floating Variables Modal */}
      <Variables />
    </>
  )
}
