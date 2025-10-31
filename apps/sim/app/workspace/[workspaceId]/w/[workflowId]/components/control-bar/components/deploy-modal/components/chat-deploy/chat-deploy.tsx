'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Card,
  CardContent,
  ImageUpload,
  Input,
  Label,
  Skeleton,
  Textarea,
} from '@/components/ui'
import { useSession } from '@/lib/auth-client'
import { createLogger } from '@/lib/logs/console/logger'
import { getEmailDomain } from '@/lib/urls/utils'
import { AuthSelector } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/control-bar/components/deploy-modal/components/chat-deploy/components/auth-selector'
import { useChatDeployment } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/control-bar/components/deploy-modal/components/chat-deploy/hooks/use-chat-deployment'
import { useChatForm } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/control-bar/components/deploy-modal/components/chat-deploy/hooks/use-chat-form'
import { OutputSelect } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/chat/components/output-select/output-select'

const logger = createLogger('ChatDeploy')

interface ChatDeployProps {
  workflowId: string
  deploymentInfo: {
    apiKey: string
  } | null
  onChatExistsChange?: (exists: boolean) => void
  chatSubmitting: boolean
  setChatSubmitting: (submitting: boolean) => void
  onValidationChange?: (isValid: boolean) => void
  /** Callback for initial workflow deployment (new chats) */
  onPreDeployWorkflow?: () => Promise<void>
  /** Callback for workflow redeployment (existing chats with changes) */
  onRedeployWorkflow?: () => Promise<void>
  showDeleteConfirmation?: boolean
  setShowDeleteConfirmation?: (show: boolean) => void
  onDeploymentComplete?: () => void
  /** Indicates if workflow has changes requiring redeployment */
  needsRedeployment?: boolean
  /** Callback fired after successful redeployment */
  onRedeploymentComplete?: () => void
  isSidebar?: boolean
  workspaceId?: string
  onOpenChange?: any
  approvalStatus?: any
}

interface ExistingChat {
  id: string
  subdomain: string
  title: string
  description: string
  authType: 'public' | 'password' | 'email'
  allowedEmails: string[]
  outputConfigs: Array<{ blockId: string; path: string }>
  customizations?: {
    welcomeMessage?: string
  }
  isActive: boolean
}

export function ChatDeploy({
  workflowId,
  deploymentInfo,
  onChatExistsChange,
  chatSubmitting,
  setChatSubmitting,
  onValidationChange,
  onPreDeployWorkflow,
  onRedeployWorkflow,
  showDeleteConfirmation: externalShowDeleteConfirmation,
  setShowDeleteConfirmation: externalSetShowDeleteConfirmation,
  onDeploymentComplete,
  needsRedeployment = false,
  onRedeploymentComplete,
  isSidebar,
  workspaceId,
  onOpenChange,
  approvalStatus,
}: ChatDeployProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [existingChat, setExistingChat] = useState<ExistingChat | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isImageUploading, setIsImageUploading] = useState(false)
  const [internalShowDeleteConfirmation, setInternalShowDeleteConfirmation] = useState(false)
  const [showSuccessView, setShowSuccessView] = useState(false)

  // Use external state for delete confirmation if provided
  const showDeleteConfirmation =
    externalShowDeleteConfirmation !== undefined
      ? externalShowDeleteConfirmation
      : internalShowDeleteConfirmation

  const setShowDeleteConfirmation =
    externalSetShowDeleteConfirmation || setInternalShowDeleteConfirmation

  const { formData, errors, updateField, setError, validateForm, setFormData } = useChatForm()
  const { deployedUrl, deployChat } = useChatDeployment()
  const formRef = useRef<HTMLFormElement>(null)
  const [isSubdomainValid, setIsSubdomainValid] = useState(true)

  // Get session for userId
  const { data: session } = useSession()
  const userId = session?.user?.id || 'unknown'

  // State for approved template comparison
  const [approvedTemplateState, setApprovedTemplateState] = useState<any>(null)
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false)
  const [hasChangesFromApproved, setHasChangesFromApproved] = useState(false)

  // Fetch approved template and compare with current workflow
  useEffect(() => {
    const checkChangesFromApproved = async () => {
      if (!workflowId || approvalStatus?.status !== 'APPROVED') {
        setHasChangesFromApproved(false)
        return
      }

      try {
        setIsLoadingTemplate(true)
        // Fetch approved template
        const templateResponse = await fetch(`/api/templates?workflowId=${workflowId}&limit=1`)
        if (!templateResponse.ok) {
          setHasChangesFromApproved(false)
          return
        }

        const templateData = await templateResponse.json()
        const template = templateData.data?.[0]
        if (!template?.state) {
          // No approved template found, no changes to detect
          setHasChangesFromApproved(false)
          return
        }

        const approvedState = template.state
        setApprovedTemplateState(approvedState)

        // Fetch current workflow state from normalized tables
        const workflowResponse = await fetch(`/api/workflows/${workflowId}`)
        if (!workflowResponse.ok) {
          setHasChangesFromApproved(false)
          return
        }

        const workflowData = await workflowResponse.json()
        const currentState = workflowData.data?.state

        if (!currentState || !approvedState) {
          setHasChangesFromApproved(false)
          return
        }

        // Import hasWorkflowChanged for comparison
        const { hasWorkflowChanged } = await import('@/lib/workflows/comparison')
        const hasChanges = hasWorkflowChanged(currentState, approvedState)
        setHasChangesFromApproved(hasChanges)
      } catch (error) {
        logger.error('Error checking changes from approved template:', error)
        setHasChangesFromApproved(false)
      } finally {
        setIsLoadingTemplate(false)
      }
    }

    void checkChangesFromApproved()
  }, [workflowId, approvalStatus?.status])

  // Use changes from approved template
  const hasWorkflowChanges = hasChangesFromApproved
  const isFormValid =
    isSubdomainValid &&
    Boolean(formData.title.trim()) &&
    formData.selectedOutputBlocks.length > 0 &&
    (formData.authType !== 'password' ||
      Boolean(formData.password.trim()) ||
      Boolean(existingChat)) &&
    (formData.authType !== 'email' || formData.emails.length > 0)
  const route = useRouter()

  useEffect(() => {
    onValidationChange?.(isFormValid)
  }, [isFormValid, onValidationChange])

  // Update emails when approval status changes for new chats and existing chats
  useEffect(() => {
    const currentUserEmail = session?.user?.email

    if (!existingChat) {
      let updatedEmails = [...formData.emails]

      // If NOT approved, add current user email to the list if not present
      if (
        approvalStatus?.status !== 'APPROVED' &&
        currentUserEmail &&
        !formData.emails.includes(currentUserEmail)
      ) {
        updatedEmails = [...formData.emails, currentUserEmail]
      }

      // If approved, add @position2.com if not already present
      if (approvalStatus?.status === 'APPROVED' && !updatedEmails.includes('@position2.com')) {
        updatedEmails = [...updatedEmails, '@position2.com']
      }

      // Only update if emails actually changed
      if (JSON.stringify(updatedEmails) !== JSON.stringify(formData.emails)) {
        updateField('emails', updatedEmails)
      }
    } else {
      // For existing chats, if status becomes APPROVED, add @position2.com
      let updatedEmails = [...formData.emails]

      if (approvalStatus?.status === 'APPROVED' && !updatedEmails.includes('@position2.com')) {
        updatedEmails = [...updatedEmails, '@position2.com']

        // Only update if emails actually changed
        if (JSON.stringify(updatedEmails) !== JSON.stringify(formData.emails)) {
          updateField('emails', updatedEmails)
        }
      }
    }
  }, [approvalStatus, existingChat, formData.emails, updateField, session?.user?.email])

  useEffect(() => {
    if (workflowId) {
      fetchExistingChat()
    }
  }, [workflowId])

  const fetchExistingChat = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/workflows/${workflowId}/chat/status`)

      if (response.ok) {
        const data = await response.json()

        if (data.isDeployed && data.deployment) {
          const detailResponse = await fetch(`/api/chat/edit/${data.deployment.id}`)

          if (detailResponse.ok) {
            const chatDetail = await detailResponse.json()
            setExistingChat(chatDetail)

            setFormData({
              subdomain: chatDetail.subdomain || '',
              title: chatDetail.title || '',
              description: chatDetail.description || '',
              authType: chatDetail.authType || 'email',
              password: '',
              emails: Array.isArray(chatDetail.allowedEmails) ? [...chatDetail.allowedEmails] : [],
              welcomeMessage:
                chatDetail.customizations?.welcomeMessage || 'Hi there! How can I help you today?',
              selectedOutputBlocks: Array.isArray(chatDetail.outputConfigs)
                ? chatDetail.outputConfigs.map(
                    (config: { blockId: string; path: string }) =>
                      `${config.blockId}_${config.path}`
                  )
                : [],
            })

            // Set image URL if it exists
            if (chatDetail.customizations?.imageUrl) {
              setImageUrl(chatDetail.customizations.imageUrl)
            }
            setImageUploadError(null)

            onChatExistsChange?.(true)
          }
        } else {
          setExistingChat(null)
          setImageUrl(null)
          setImageUploadError(null)
          onChatExistsChange?.(false)

          // Initialize form with default values for new chat deployment
          const defaultEmails = approvalStatus?.status === 'APPROVED' ? ['@position2.com'] : []
          setFormData({
            subdomain: workflowId,
            title: formData.title || 'Chat Assistant', // Keep existing title or use default
            description: formData.description || '',
            authType: 'email',
            password: '',
            emails: defaultEmails,
            welcomeMessage: formData.welcomeMessage || 'Hi there! How can I help you today?',
            selectedOutputBlocks: formData.selectedOutputBlocks || [], // Keep existing selections
          })
        }
      }
    } catch (error) {
      logger.error('Error fetching chat status:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    if (chatSubmitting) return

    setChatSubmitting(true)

    try {
      updateField('subdomain', workflowId)
      if (needsRedeployment && existingChat) {
        await onRedeployWorkflow?.()
      } else {
        await onPreDeployWorkflow?.()
      }

      // Validate form data before proceeding with chat deployment
      if (!validateForm()) {
        setChatSubmitting(false)
        return
      }

      // Check subdomain validation status
      if (!isSubdomainValid && formData.subdomain !== existingChat?.subdomain) {
        setError('subdomain', 'Please wait for subdomain validation to complete')
        setChatSubmitting(false)
        return
      }

      // Deploy or update the chat interface
      // Pass needsRedeployment flag to ensure API is redeployed if needed
      await deployChat(
        workflowId,
        formData,
        deploymentInfo,
        existingChat?.id,
        imageUrl,
        needsRedeployment
      )

      // Update parent component state
      onChatExistsChange?.(true)
      setShowSuccessView(true)

      // If this was a redeployment, notify parent to clear the needsRedeployment flag
      if (needsRedeployment && existingChat) {
        onRedeploymentComplete?.()
      }

      // Fetch the updated chat data immediately after deployment
      // This ensures existingChat is available when switching back to edit mode
      await fetchExistingChat()
    } catch (error: any) {
      if (error.message?.includes('subdomain')) {
        setError('subdomain', error.message)
      } else {
        setError('general', error.message)
      }
    } finally {
      setChatSubmitting(false)
      if (isSidebar) {
        route.push(`/chat/${workflowId}`)
      }
    }
  }

  const handleDelete = async () => {
    if (!existingChat || !existingChat.id) return

    try {
      setIsDeleting(true)

      const response = await fetch(`/api/chat/edit/${existingChat.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete chat')
      }

      // Update state
      setExistingChat(null)
      setImageUrl(null)
      setImageUploadError(null)
      onChatExistsChange?.(false)

      // Notify parent of successful deletion
      onDeploymentComplete?.()
    } catch (error: any) {
      logger.error('Failed to delete chat:', error)
      setError('general', error.message || 'An unexpected error occurred while deleting')
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirmation(false)
    }
  }

  if (isLoading) {
    return <LoadingSkeleton />
  }

  if (deployedUrl && showSuccessView && !isSidebar) {
    onOpenChange?.(false)
    // return (
    //   <>
    //     <div id='chat-deploy-form'>
    //       <SuccessView
    //         workflowId={workflowId}
    //         deployedUrl={deployedUrl}
    //         existingChat={existingChat}
    //         onDelete={() => setShowDeleteConfirmation(true)}
    //         onUpdate={() => setShowSuccessView(false)}
    //         workspaceId={workspaceId}
    //       />
    //     </div>

    //     {/* Delete Confirmation Dialog */}
    //     <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
    //       <AlertDialogContent>
    //         <AlertDialogHeader>
    //           <AlertDialogTitle>Delete Chat?</AlertDialogTitle>
    //           <AlertDialogDescription>
    //             This will permanently delete your chat deployment at{' '}
    //             <span className='font-mono text-destructive'>
    //               {existingChat?.subdomain}.{getEmailDomain()}
    //             </span>
    //             .
    //             <span className='mt-2 block'>
    //               All users will lose access immediately, and this action cannot be undone.
    //             </span>
    //           </AlertDialogDescription>
    //         </AlertDialogHeader>
    //         <AlertDialogFooter className='flex'>
    //           <AlertDialogCancel className='h-9 w-full rounded-[8px]' disabled={isDeleting}>
    //             Cancel
    //           </AlertDialogCancel>
    //           <AlertDialogAction
    //             onClick={handleDelete}
    //             disabled={isDeleting}
    //             className='h-9 w-full rounded-[8px] bg-red-500 text-white transition-all duration-200 hover:bg-red-600 dark:bg-red-500 dark:hover:bg-red-600'
    //           >
    //             {isDeleting ? (
    //               <span className='flex items-center'>
    //                 <Loader2 className='mr-2 h-4 w-4 animate-spin' />
    //                 Deleting...
    //               </span>
    //             ) : (
    //               'Delete'
    //             )}
    //           </AlertDialogAction>
    //         </AlertDialogFooter>
    //       </AlertDialogContent>
    //     </AlertDialog>
    //   </>
    // )
  }

  return (
    <>
      <form
        id='chat-deploy-form'
        ref={formRef}
        onSubmit={handleSubmit}
        className='-mx-1 space-y-4 overflow-y-auto px-1'
      >
        {errors.general && (
          <Alert variant='destructive'>
            <AlertTriangle className='h-4 w-4' />
            <AlertDescription>{errors.general}</AlertDescription>
          </Alert>
        )}

        {/* Show alert for redeployment of existing chat */}
        {approvalStatus?.status === 'APPROVED' &&
          needsRedeployment &&
          existingChat &&
          hasWorkflowChanges && (
            <Alert variant='destructive'>
              <AlertTriangle className='h-4 w-4' />
              <AlertDescription>
                This agent has new changes after approval. Please send for approval before
                redeploying.
              </AlertDescription>
            </Alert>
          )}

        {/* Show alert for first-time deployment with changes */}
        {approvalStatus?.status === 'APPROVED' && !existingChat && hasWorkflowChanges && (
          <Alert variant='destructive'>
            <AlertTriangle className='h-4 w-4' />
            <AlertDescription>
              This agent has new changes. Please send for approval before deploying
            </AlertDescription>
          </Alert>
        )}

        <div className='space-y-4'>
          {/* <SubdomainInput
            value={formData.subdomain}
            onChange={(value) => updateField('subdomain', value)}
            originalSubdomain={existingChat?.subdomain || undefined}
            disabled={chatSubmitting}
            onValidationChange={setIsSubdomainValid}
            isEditingExisting={!!existingChat}
          /> */}
          <div className='space-y-2'>
            <Label htmlFor='title' className='font-medium text-sm'>
              Chat Title
            </Label>
            <Input
              id='title'
              placeholder='Customer Support Assistant'
              value={formData.title}
              onChange={(e) => updateField('title', e.target.value)}
              required
              disabled={chatSubmitting}
              className='h-10 rounded-[8px]'
            />
            {errors.title && <p className='text-destructive text-sm'>{errors.title}</p>}
          </div>
          {false && (
            <div className='space-y-2'>
              <Label htmlFor='description' className='font-medium text-sm'>
                Description (Optional)
              </Label>
              <Textarea
                id='description'
                placeholder='A brief description of what this chat does'
                value={formData.description}
                onChange={(e) => updateField('description', e.target.value)}
                rows={3}
                disabled={chatSubmitting}
                className='min-h-[80px] resize-none rounded-[8px]'
              />
            </div>
          )}
          <div className='space-y-2'>
            <Label className='font-medium text-sm'>Chat Output</Label>
            <Card className='rounded-[8px] border-input shadow-none'>
              <CardContent className='p-1'>
                <OutputSelect
                  workflowId={workflowId}
                  selectedOutputs={formData.selectedOutputBlocks}
                  onOutputSelect={(values) => updateField('selectedOutputBlocks', values)}
                  placeholder='Select which block outputs to use'
                  disabled={chatSubmitting}
                />
              </CardContent>
            </Card>
            {errors.outputBlocks && (
              <p className='text-destructive text-sm'>{errors.outputBlocks}</p>
            )}
            <p className='mt-2 text-muted-foreground text-xs'>
              Select which block's output to return to the user in the chat interface
            </p>
          </div>
          <AuthSelector
            authType={formData.authType}
            password={formData.password}
            emails={formData.emails}
            onAuthTypeChange={(type) => updateField('authType', type)}
            onPasswordChange={(password) => updateField('password', password)}
            onEmailsChange={(emails) => updateField('emails', emails)}
            disabled={chatSubmitting}
            isExistingChat={!!existingChat}
            error={errors.password || errors.emails}
            approvalStatus={approvalStatus}
          />
          <div className='space-y-2'>
            <Label htmlFor='welcomeMessage' className='font-medium text-sm'>
              Welcome Message
            </Label>
            <Textarea
              id='welcomeMessage'
              placeholder='Enter a welcome message for your chat'
              value={formData.welcomeMessage}
              onChange={(e) => updateField('welcomeMessage', e.target.value)}
              rows={3}
              disabled={chatSubmitting}
              className='min-h-[80px] resize-none rounded-[8px]'
            />
            <p className='text-muted-foreground text-xs'>
              This message will be displayed when users first open the chat
            </p>
          </div>

          {/* Image Upload Section */}
          {false && (
            <div className='space-y-2'>
              <Label className='font-medium text-sm'>Chat Logo</Label>
              <ImageUpload
                value={imageUrl}
                onUpload={(url) => {
                  setImageUrl(url)
                  setImageUploadError(null) // Clear error on successful upload
                }}
                onError={setImageUploadError}
                onUploadStart={setIsImageUploading}
                disabled={chatSubmitting}
                uploadToServer={true}
                height='h-32'
                hideHeader={true}
              />
              {imageUploadError && <p className='text-destructive text-sm'>{imageUploadError}</p>}
              {!imageUrl && !isImageUploading && (
                <p className='text-muted-foreground text-xs'>
                  Upload a logo for your chat (PNG, JPEG - max 5MB)
                </p>
              )}
            </div>
          )}

          {/* Hidden delete trigger button for modal footer */}
          <button
            type='button'
            data-delete-trigger
            onClick={() => setShowDeleteConfirmation(true)}
            style={{ display: 'none' }}
          />
        </div>
      </form>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your chat deployment at{' '}
              <span className='font-mono text-destructive'>
                {existingChat?.subdomain}.{getEmailDomain()}
              </span>
              .
              <span className='mt-2 block'>
                All users will lose access immediately, and this action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className='flex'>
            <AlertDialogCancel className='h-9 w-full rounded-[8px]' disabled={isDeleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className='h-9 w-full rounded-[8px] bg-red-500 text-white transition-all duration-200 hover:bg-red-600 dark:bg-red-500 dark:hover:bg-red-600'
            >
              {isDeleting ? (
                <span className='flex items-center'>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Deleting...
                </span>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function LoadingSkeleton() {
  return (
    <div className='space-y-4 py-3'>
      <div className='space-y-2'>
        <Skeleton className='h-5 w-24' />
        <Skeleton className='h-10 w-full' />
      </div>
      <div className='space-y-2'>
        <Skeleton className='h-5 w-20' />
        <Skeleton className='h-10 w-full' />
      </div>
      <div className='space-y-2'>
        <Skeleton className='h-5 w-32' />
        <Skeleton className='h-24 w-full' />
      </div>
      <div className='space-y-2'>
        <Skeleton className='h-5 w-40' />
        <Skeleton className='h-32 w-full rounded-lg' />
      </div>
    </div>
  )
}
