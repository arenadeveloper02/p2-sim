'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChipConfirmModal,
  ChipInput,
  cn,
  Input,
  Label,
  Loader,
  Skeleton,
  TagInput,
  type TagItem,
  Textarea,
  Tooltip,
} from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { normalizeEmail } from '@sim/utils/string'
import { AlertTriangle, Check } from 'lucide-react'
import { GeneratedPasswordInput } from '@/components/ui'
import { CustomSelect } from '@/components/ui/native-select'
import { useSession } from '@/lib/auth/auth-client'
import { AGENT_DEPARTMENTS } from '@/lib/chat/arena-departments'
import { getEnv, isTruthy } from '@/lib/core/config/env'
import { getBaseUrl, getEmailDomain } from '@/lib/core/utils/urls'
import { quickValidateEmail } from '@/lib/messaging/email/validation'
import { OutputSelect } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/chat/components/output-select/output-select'
import {
  type AuthType,
  type ChatFormData,
  useCreateChat,
  useDeleteChat,
  useUpdateChat,
} from '@/hooks/queries/chats'
import type { ChatDetail } from '@/hooks/queries/deployments'
import { useWorkflowStore } from '@/stores/workflows/workflow/store'
import { useIdentifierValidation } from './hooks'
import {
  getPasswordHelperText,
  getPasswordPlaceholder,
  hasExistingPassword,
  isPasswordRequired,
} from './utils'

const logger = createLogger('ChatDeploy')

function dedupeStrings(values: readonly string[]): string[] {
  const seen: Record<string, true> = {}
  const result: string[] = []
  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (!seen[value]) {
      seen[value] = true
      result.push(value)
    }
  }
  return result
}

function stringLookup(values: readonly string[]): Record<string, true> {
  const lookup: Record<string, true> = {}
  for (let i = 0; i < values.length; i++) {
    lookup[values[i]] = true
  }
  return lookup
}

const IDENTIFIER_PATTERN = /^[a-z0-9-]+$/

interface ChatDeployProps {
  workflowId: string
  workflowWorkspaceId?: string
  deploymentInfo: {
    apiKey: string
  } | null
  existingChat: ExistingChat | null
  isLoadingChat: boolean
  onRefetchChat: () => Promise<void>
  chatSubmitting: boolean
  setChatSubmitting: (submitting: boolean) => void
  onValidationChange?: (isValid: boolean) => void
  showDeleteConfirmation?: boolean
  setShowDeleteConfirmation?: (show: boolean) => void
  onDeploymentComplete?: () => void
  onDeployed?: () => void
  onVersionActivated?: () => void
  chatAlreadyExists?: boolean | any
  /** Chat tab vs App tab — controls which fields are shown and which deploymentType is saved */
  mode?: 'chat' | 'app'
}

export type ExistingChat = ChatDetail

interface FormErrors {
  identifier?: string
  title?: string
  department?: string
  description?: string
  password?: string
  emails?: string
  outputBlocks?: string
  redirectUrl?: string
  general?: string
}

function isValidRedirectUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function createInitialFormData(mode: 'chat' | 'app'): ChatFormData {
  return {
    identifier: '',
    title: '',
    description: '',
    department: '',
    authType: 'email',
    password: '',
    emails: [],
    welcomeMessage:
      "How can I help you today? I'm here to answer your questions and assist you with anything you need.",
    goldenQueries: [],
    selectedOutputBlocks: [],
    deploymentType: mode,
    redirectUrl: '',
  }
}

export function ChatDeploy({
  workflowId,
  workflowWorkspaceId,
  deploymentInfo,
  existingChat,
  isLoadingChat,
  onRefetchChat,
  chatSubmitting,
  setChatSubmitting,
  onValidationChange,
  showDeleteConfirmation: externalShowDeleteConfirmation,
  setShowDeleteConfirmation: externalSetShowDeleteConfirmation,
  onDeploymentComplete,
  onDeployed,
  onVersionActivated,
  chatAlreadyExists,
  mode = 'chat',
}: ChatDeployProps) {
  const isAppMode = mode === 'app'
  const formId = isAppMode ? 'app-deploy-form' : 'chat-deploy-form'
  const initialFormData = createInitialFormData(mode)

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [internalShowDeleteConfirmation, setInternalShowDeleteConfirmation] = useState(false)

  const showDeleteConfirmation =
    externalShowDeleteConfirmation !== undefined
      ? externalShowDeleteConfirmation
      : internalShowDeleteConfirmation

  const setShowDeleteConfirmation =
    externalSetShowDeleteConfirmation || setInternalShowDeleteConfirmation

  const [formData, setFormData] = useState<ChatFormData>(initialFormData)
  const [errors, setErrors] = useState<FormErrors>({})
  const formRef = useRef<HTMLFormElement>(null)
  const hasSetDefaultKnowledgeOutputs = useRef(false)

  const blocks = useWorkflowStore((state) => state.blocks)
  const knowledgeResultOutputIds = useMemo(() => {
    return Object.values(blocks)
      .filter((block: { type?: string }) => block?.type === 'knowledge')
      .map((block: { id: string }) => `${block.id}_results`)
  }, [blocks])

  const [showUnselectKnowledgeConfirm, setShowUnselectKnowledgeConfirm] = useState(false)
  const [pendingOutputSelection, setPendingOutputSelection] = useState<string[] | null>(null)
  const [formInitCounter, setFormInitCounter] = useState(0)

  const createChatMutation = useCreateChat()
  const updateChatMutation = useUpdateChat()
  const deleteChatMutation = useDeleteChat()
  const [isIdentifierValid, setIsIdentifierValid] = useState(false)
  const [hasInvalidEmails, setHasInvalidEmails] = useState(false)
  const hasInitializedFormRef = useRef(false)
  const existingPassword = hasExistingPassword(existingChat)

  /** When switching workflows, clear form + init flags so we never show the previous workflow's chat/API-derived fields. */
  const prevWorkflowIdForFormRef = useRef<string | null>(null)
  useEffect(() => {
    if (
      prevWorkflowIdForFormRef.current !== null &&
      prevWorkflowIdForFormRef.current !== workflowId
    ) {
      setFormData({ ...createInitialFormData(mode), identifier: workflowId || '' })
      setImageUrl(null)
      hasInitializedFormRef.current = false
      hasSetDefaultKnowledgeOutputs.current = false
      setErrors({})
    }
    prevWorkflowIdForFormRef.current = workflowId
  }, [workflowId, mode])

  const updateField = <K extends keyof ChatFormData>(field: K, value: ChatFormData[K]) => {
    setFormData((prev) => ({
      ...prev,
      identifier: workflowId,
      deploymentType: mode,
      [field]: value,
    }))
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const setError = (field: keyof FormErrors, message: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }))
  }

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required'
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    }

    if (isPasswordRequired(formData.authType, formData.password, existingPassword)) {
      newErrors.password = 'Password is required when using password protection'
    }

    if (
      (formData.authType === 'email' || formData.authType === 'sso') &&
      formData.emails.length === 0
    ) {
      newErrors.emails = `At least one email or domain is required when using ${formData.authType === 'sso' ? 'SSO' : 'email'} access control`
    }

    if (!isAppMode && formData.selectedOutputBlocks.length === 0) {
      newErrors.outputBlocks = 'Please select at least one output block'
    }

    if (isAppMode) {
      if (!formData.redirectUrl.trim()) {
        newErrors.redirectUrl = 'Redirection URL is required when deploying as an app'
      } else if (!isValidRedirectUrl(formData.redirectUrl.trim())) {
        newErrors.redirectUrl = 'Enter a valid URL starting with http:// or https://'
      }
    }

    if (!formData.department?.trim()) {
      newErrors.general = 'Category is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const isFormValid =
    isIdentifierValid &&
    Boolean(formData.title.trim()) &&
    (isAppMode || formData.selectedOutputBlocks.length > 0) &&
    (formData.authType !== 'password' ||
      Boolean(formData.password.trim()) ||
      Boolean(existingChat)) &&
    ((formData.authType !== 'email' && formData.authType !== 'sso') ||
      formData.emails.length > 0) &&
    (!isAppMode || isValidRedirectUrl(formData.redirectUrl.trim())) &&
    !hasInvalidEmails

  useEffect(() => {
    onValidationChange?.(isFormValid)
  }, [isFormValid, onValidationChange])

  useEffect(() => {
    if (workflowId) {
      setIsIdentifierValid(true)
    }
  }, [workflowId])

  useEffect(() => {
    if (existingChat && !hasInitializedFormRef.current) {
      const allowedEmails = Array.isArray(existingChat.allowedEmails)
        ? existingChat.allowedEmails
        : []
      const normalizedEmails = allowedEmails.map((e) => e.toLowerCase().trim())
      const uniqueEmails = dedupeStrings(normalizedEmails)
      setFormData({
        identifier: existingChat.identifier || workflowId || '',
        title: existingChat.title || '',
        description: existingChat.description || '',
        department: existingChat.department || '',
        authType: existingChat.authType || 'public',
        password: '',
        emails: uniqueEmails,
        welcomeMessage:
          existingChat.customizations?.welcomeMessage !== undefined &&
          existingChat.customizations?.welcomeMessage !== null
            ? existingChat.customizations.welcomeMessage
            : "How can I help you today? I'm here to answer your questions and assist you with anything you need.",
        goldenQueries: existingChat.customizations?.goldenQueries ?? [],
        selectedOutputBlocks: Array.isArray(existingChat.outputConfigs)
          ? existingChat.outputConfigs.map(
              (config: { blockId: string; path: string }) => `${config.blockId}_${config.path}`
            )
          : [],
        deploymentType: mode,
        redirectUrl: isAppMode ? existingChat.redirectUrl || '' : '',
      })

      if (existingChat.customizations?.imageUrl) {
        setImageUrl(existingChat.customizations.imageUrl)
      }

      hasInitializedFormRef.current = true
    } else if (!existingChat && !isLoadingChat) {
      setFormData(createInitialFormData(mode))
      setImageUrl(null)
      hasInitializedFormRef.current = false
      hasSetDefaultKnowledgeOutputs.current = false
    }
  }, [existingChat, isLoadingChat, mode, isAppMode, workflowId])

  useEffect(() => {
    if (
      !isAppMode &&
      !existingChat &&
      !isLoadingChat &&
      workflowId &&
      knowledgeResultOutputIds.length > 0 &&
      !hasSetDefaultKnowledgeOutputs.current
    ) {
      hasSetDefaultKnowledgeOutputs.current = true
      setFormData((prev) => ({
        ...prev,
        selectedOutputBlocks: [
          ...new Set([...prev.selectedOutputBlocks, ...knowledgeResultOutputIds]),
        ],
      }))
    }
  }, [existingChat, isLoadingChat, workflowId, knowledgeResultOutputIds, isAppMode])

  const handleOutputSelect = useCallback(
    (newValues: string[]) => {
      const removed = formData.selectedOutputBlocks.filter((id) => !newValues.includes(id))
      const removedKnowledge = removed.filter((id) => knowledgeResultOutputIds.includes(id))
      if (removedKnowledge.length > 0) {
        setPendingOutputSelection(newValues)
        setShowUnselectKnowledgeConfirm(true)
      } else {
        updateField('selectedOutputBlocks', newValues)
      }
    },
    [formData.selectedOutputBlocks, knowledgeResultOutputIds, updateField]
  )

  const handleConfirmUnselectKnowledge = useCallback(() => {
    if (pendingOutputSelection !== null) {
      updateField('selectedOutputBlocks', pendingOutputSelection)
      setPendingOutputSelection(null)
    }
    setShowUnselectKnowledgeConfirm(false)
  }, [pendingOutputSelection, updateField])

  const handleCancelUnselectKnowledge = useCallback(() => {
    setPendingOutputSelection(null)
    setShowUnselectKnowledgeConfirm(false)
  }, [])

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    if (chatSubmitting) return

    setChatSubmitting(true)

    const isNewChat = !existingChat?.id

    try {
      if (!validateForm()) {
        setChatSubmitting(false)
        return
      }

      if (!isIdentifierValid && formData.identifier !== existingChat?.identifier) {
        setError('identifier', 'Please wait for identifier validation to complete')
        setChatSubmitting(false)
        return
      }

      let chatUrl: string
      const submitFormData: ChatFormData = {
        ...formData,
        deploymentType: mode,
        redirectUrl: isAppMode ? formData.redirectUrl : '',
        selectedOutputBlocks: isAppMode ? [] : formData.selectedOutputBlocks,
      }

      if (existingChat?.id) {
        const result = await updateChatMutation.mutateAsync({
          chatId: existingChat.id,
          workflowId,
          formData: submitFormData,
          imageUrl,
        })
        chatUrl = result.chatUrl
      } else {
        const result = await createChatMutation.mutateAsync({
          workflowId,
          formData: submitFormData,
          imageUrl,
        })
        chatUrl = result.chatUrl
      }

      onDeployed?.()
      onVersionActivated?.()

      if (isNewChat) {
        if (isAppMode && submitFormData.redirectUrl.trim()) {
          window.open(submitFormData.redirectUrl.trim(), '_blank', 'noopener,noreferrer')
        } else if (chatUrl) {
          const url = `${chatUrl}?workspaceId=${workflowWorkspaceId}&fromControlBar=true`
          window.open(url, '_blank', 'noopener,noreferrer')
        }
      }

      hasInitializedFormRef.current = false
      await onRefetchChat()
      setFormInitCounter((c) => c + 1)
    } catch (error: unknown) {
      const message = getErrorMessage(error)
      if (message.includes('identifier')) {
        setError('identifier', message)
      } else {
        setError('general', message)
      }
    } finally {
      setChatSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!existingChat || !existingChat.id) return

    try {
      await deleteChatMutation.mutateAsync({
        chatId: existingChat.id,
        workflowId,
      })

      setImageUrl(null)
      hasInitializedFormRef.current = false
      setFormInitCounter((c) => c + 1)
      await onRefetchChat()

      onDeploymentComplete?.()
    } catch (error: unknown) {
      logger.error('Failed to delete chat:', error)
      setError('general', getErrorMessage(error) || 'An unexpected error occurred while deleting')
    } finally {
      setShowDeleteConfirmation(false)
    }
  }

  if (isLoadingChat) {
    return <LoadingSkeleton />
  }

  return (
    <>
      <form
        id={formId}
        ref={formRef}
        onSubmit={handleSubmit}
        className='-mx-1 space-y-4 overflow-y-auto px-1'
      >
        {errors.general && (
          <div className='flex items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--text-error)_20%,transparent)] bg-[color-mix(in_srgb,var(--text-error)_10%,transparent)] px-3 py-2 text-[var(--text-error)] text-small'>
            <AlertTriangle className='size-4 flex-shrink-0' />
            <span>{errors.general}</span>
          </div>
        )}

        <div>
          <Label
            htmlFor={`${formId}-title`}
            className='mb-[6.5px] block pl-[2px] font-medium text-[13px] text-[var(--text-primary)]'
          >
            Title
          </Label>
          <ChipInput
            id={`${formId}-title`}
            placeholder='Customer Support Assistant'
            value={formData.title}
            onChange={(e) => updateField('title', e.target.value)}
            required
            disabled={chatSubmitting}
          />
          {errors.title && <p className='mt-1 text-destructive text-sm'>{errors.title}</p>}
        </div>

        <div className='space-y-[12px]'>
          <div>
            <Label className='mb-[6.5px] block pl-[2px] font-medium text-[13px] text-[var(--text-primary)]'>
              Category
            </Label>
            <CustomSelect
              value={formData.department || ''}
              onChange={(value) => updateField('department', value)}
              disabled={chatSubmitting}
              placeholder='Select category'
              options={AGENT_DEPARTMENTS.map((cat) => ({ value: cat.value, label: cat.label }))}
            />
          </div>
          {errors.department && (
            <p className='mt-1 text-destructive text-sm'>{errors.department}</p>
          )}
          <div>
            <Label className='mb-[6.5px] block pl-[2px] font-medium text-[13px] text-[var(--text-primary)]'>
              Description
            </Label>
            <Textarea
              id={`${formId}-description`}
              placeholder={
                isAppMode
                  ? 'A brief description of what this app does'
                  : 'A brief description of what this chat does'
              }
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={3}
              disabled={chatSubmitting}
              className='min-h-[80px] resize-none'
            />
            {errors.description && (
              <p className='mt-1 text-destructive text-sm'>{errors.description}</p>
            )}
          </div>

          {isAppMode ? (
            <div>
              <Label
                htmlFor={`${formId}-redirectUrl`}
                className='mb-[6.5px] block pl-[2px] font-medium text-[13px] text-[var(--text-primary)]'
              >
                Redirection URL
              </Label>
              <ChipInput
                id={`${formId}-redirectUrl`}
                placeholder='https://company-research-agent-app.vercel.app/'
                value={formData.redirectUrl}
                onChange={(e) => updateField('redirectUrl', e.target.value)}
                required
                disabled={chatSubmitting}
              />
              {errors.redirectUrl && (
                <p className='mt-1 text-destructive text-sm'>{errors.redirectUrl}</p>
              )}
            </div>
          ) : (
            <div>
              <Label className='mb-[6.5px] block pl-0.5 font-medium text-[var(--text-primary)] text-small'>
                Output
              </Label>
              <OutputSelect
                workflowId={workflowId}
                selectedOutputs={formData.selectedOutputBlocks}
                onOutputSelect={handleOutputSelect}
                placeholder='Select which block outputs to use'
                disabled={chatSubmitting}
                className='w-full'
              />
              {errors.outputBlocks && (
                <p className='mt-[6.5px] text-[var(--text-error)] text-caption'>
                  {errors.outputBlocks}
                </p>
              )}
            </div>
          )}

          <AuthSelector
            isExistingChat={!!existingChat}
            key={`${mode}-${existingChat?.id ?? 'new'}-${formInitCounter}`}
            authType={formData.authType}
            password={formData.password}
            emails={formData.emails}
            onAuthTypeChange={(type) => updateField('authType', type)}
            onPasswordChange={(password) => updateField('password', password)}
            onEmailsChange={(emails) => updateField('emails', emails)}
            onInvalidEmailsChange={setHasInvalidEmails}
            disabled={chatSubmitting}
            hasExistingPassword={existingPassword}
            error={errors.password || errors.emails}
          />
          <div>
            <Label
              htmlFor={`${formId}-welcomeMessage`}
              className='mb-[6.5px] block pl-0.5 font-medium text-[var(--text-primary)] text-small'
            >
              Welcome message
            </Label>
            <Textarea
              id={`${formId}-welcomeMessage`}
              placeholder='Enter a welcome message for your chat'
              value={formData.welcomeMessage}
              onChange={(e) => updateField('welcomeMessage', e.target.value)}
              rows={3}
              disabled={chatSubmitting}
              className='min-h-[80px] resize-none'
            />
            <p className='mt-[6.5px] text-[var(--text-secondary)] text-xs'>
              This message will be displayed when users first open the chat
            </p>
          </div>

          <button
            type='button'
            data-delete-trigger
            onClick={() => setShowDeleteConfirmation(true)}
            className='hidden'
          />
        </div>
      </form>

      <ChipConfirmModal
        open={showDeleteConfirmation}
        onOpenChange={setShowDeleteConfirmation}
        srTitle={isAppMode ? 'Delete App' : 'Delete Chat'}
        title={isAppMode ? 'Delete App' : 'Delete Chat'}
        text={[
          'Are you sure you want to delete ',
          { text: existingChat?.title || (isAppMode ? 'this app' : 'this chat'), bold: true },
          '? ',
          {
            text: isAppMode
              ? 'This will remove the app deployment and make it unavailable to all users.'
              : `This will remove the chat at "${getEmailDomain()}/chat/${existingChat?.identifier ?? ''}" and make it unavailable to all users.`,
            error: true,
          },
          ' This action cannot be undone.',
        ]}
        confirm={{
          label: 'Delete',
          onClick: handleDelete,
          pending: deleteChatMutation.isPending,
          pendingLabel: 'Deleting...',
        }}
      />
      <ChipConfirmModal
        open={showUnselectKnowledgeConfirm}
        onOpenChange={(open) => {
          if (!open) handleCancelUnselectKnowledge()
        }}
        srTitle='Unselect knowledge base results'
        title='Unselect knowledge base results'
        confirm={{
          label: 'Continue',
          variant: 'primary',
          onClick: handleConfirmUnselectKnowledge,
        }}
      />
    </>
  )
}

function LoadingSkeleton() {
  return (
    <div className='-mx-1 space-y-4 px-1'>
      <div className='space-y-3'>
        <div>
          <Skeleton className='mb-[6.5px] h-[16px] w-[26px]' />
          <Skeleton className='h-[34px] w-full rounded-sm' />
          <Skeleton className='mt-[6.5px] h-[14px] w-[320px]' />
        </div>
        <div>
          <Skeleton className='mb-[6.5px] h-[16px] w-[30px]' />
          <Skeleton className='h-[34px] w-full rounded-sm' />
        </div>
        <div>
          <Skeleton className='mb-[6.5px] h-[16px] w-[46px]' />
          <Skeleton className='h-[34px] w-full rounded-sm' />
        </div>
        <div>
          <Skeleton className='mb-[6.5px] h-[16px] w-[95px]' />
          <Skeleton className='h-[28px] w-[170px] rounded-sm' />
        </div>
        <div>
          <Skeleton className='mb-[6.5px] h-[16px] w-[115px]' />
          <Skeleton className='h-[80px] w-full rounded-sm' />
          <Skeleton className='mt-[6.5px] h-[14px] w-[340px]' />
        </div>
      </div>
    </div>
  )
}

interface IdentifierInputProps {
  value: string
  onChange: (value: string) => void
  originalIdentifier?: string
  disabled?: boolean
  onValidationChange?: (isValid: boolean) => void
  isEditingExisting?: boolean
}

const getDomainPrefix = (() => {
  const prefix = `${getEmailDomain()}/chat/`
  return () => prefix
})()

function IdentifierInput({
  value,
  onChange,
  originalIdentifier,
  disabled = false,
  onValidationChange,
  isEditingExisting = false,
}: IdentifierInputProps) {
  const { isChecking, error, isValid } = useIdentifierValidation(
    value,
    originalIdentifier,
    isEditingExisting
  )

  useEffect(() => {
    onValidationChange?.(isValid)
  }, [isValid, onValidationChange])

  const handleChange = (newValue: string) => {
    const lowercaseValue = newValue.toLowerCase()
    onChange(lowercaseValue)
  }

  const fullUrl = `${getBaseUrl()}/chat/${value}`
  const displayUrl = fullUrl.replace(/^https?:\/\//, '')

  return (
    <div>
      <Label
        htmlFor='chat-url'
        className='mb-[6.5px] block pl-0.5 font-medium text-[var(--text-primary)] text-small'
      >
        URL
      </Label>
      <div
        className={cn(
          'relative flex items-stretch overflow-hidden rounded-sm border border-[var(--border-1)] bg-[var(--surface-5)]',
          error && 'border-[var(--text-error)]'
        )}
      >
        <div className='flex items-center whitespace-nowrap bg-[var(--surface-5)] pr-1.5 pl-2 font-medium text-[var(--text-secondary)] text-sm'>
          {getDomainPrefix()}
        </div>
        <div className='relative flex-1'>
          <Input
            id='chat-url'
            placeholder='my-chat'
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            required
            disabled={disabled}
            className={cn(
              'rounded-none border-0 bg-transparent pl-0 shadow-none disabled:bg-transparent disabled:opacity-100',
              (isChecking || (isValid && value)) && 'pr-8'
            )}
          />
          {isChecking ? (
            <div className='-translate-y-1/2 absolute top-1/2 right-2'>
              <Loader className='size-4 text-[var(--text-tertiary)]' animate />
            </div>
          ) : (
            isValid &&
            value &&
            value !== originalIdentifier && (
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <div className='-translate-y-1/2 absolute top-1/2 right-2'>
                    <Check className='size-4 text-[var(--brand-accent)]' />
                  </div>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  <span>Name is available</span>
                </Tooltip.Content>
              </Tooltip.Root>
            )
          )}
        </div>
      </div>
      {error && <p className='mt-[6.5px] text-[var(--text-error)] text-caption'>{error}</p>}
      <p className='mt-[6.5px] truncate text-[var(--text-secondary)] text-xs'>
        {isEditingExisting && value ? (
          <>
            Live at:{' '}
            <a
              href={fullUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='text-[var(--text-primary)] hover-hover:underline'
            >
              {displayUrl}
            </a>
          </>
        ) : (
          'The unique URL path where your chat will be accessible'
        )}
      </p>
    </div>
  )
}

interface AuthSelectorProps {
  authType: AuthType
  password: string
  emails: string[]
  onAuthTypeChange: (type: AuthType) => void
  onPasswordChange: (password: string) => void
  onEmailsChange: (emails: string[]) => void
  onInvalidEmailsChange?: (hasInvalidEmails: boolean) => void
  disabled?: boolean
  hasExistingPassword?: boolean
  error?: string
  isExistingChat?: boolean
}

const AUTH_LABELS: Record<AuthType, string> = {
  public: 'Public',
  password: 'Password',
  email: 'Email',
  sso: 'SSO',
}

function AuthSelector({
  authType,
  password,
  emails,
  onAuthTypeChange,
  onPasswordChange,
  onEmailsChange,
  onInvalidEmailsChange,
  disabled = false,
  hasExistingPassword = false,
  error,
  isExistingChat = false,
}: AuthSelectorProps) {
  const { data: session } = useSession()
  const [emailError, setEmailError] = useState('')
  const [invalidEmailItems, setInvalidEmailItems] = useState<TagItem[]>([])
  const hasPrefilledSessionEmailRef = useRef(false)

  const emailsRef = useRef(emails)
  const invalidEmailItemsRef = useRef(invalidEmailItems)

  useEffect(() => {
    emailsRef.current = emails
  }, [emails])

  useEffect(() => {
    onInvalidEmailsChange?.(invalidEmailItems.length > 0)
  }, [invalidEmailItems, onInvalidEmailsChange])

  const [emailItems, setEmailItems] = useState<TagItem[]>(() =>
    emails.map((email) => ({ value: email, isValid: true }))
  )

  // Sync emailItems with emails prop and deduplicate
  // Keep invalid items in emailItems even if not in emails (to show red badges)
  useEffect(() => {
    const normalizedEmails = emails.map((e) => e.toLowerCase().trim())
    const uniqueEmails = dedupeStrings(normalizedEmails)
    const currentValues = stringLookup(emailItems.map((item) => item.value.toLowerCase().trim()))

    const existingItemsMap: Record<string, TagItem> = {}
    for (let i = 0; i < emailItems.length; i++) {
      const item = emailItems[i]
      existingItemsMap[item.value.toLowerCase().trim()] = item
    }

    const invalidEmailNormalized = invalidEmailItems.map((item) => item.value.toLowerCase().trim())
    const invalidEmailValues = stringLookup(invalidEmailNormalized)
    const allEmailValues = dedupeStrings(uniqueEmails.concat(invalidEmailNormalized))
    const allEmailValuesLookup = stringLookup(allEmailValues)

    const needsUpdate =
      allEmailValues.length !== emailItems.length ||
      !allEmailValues.every((email) => currentValues[email]) ||
      !emailItems.every((item) => allEmailValuesLookup[item.value.toLowerCase().trim()])

    if (needsUpdate) {
      setEmailItems(
        allEmailValues.map((email) => {
          const existing = existingItemsMap[email]
          const isInvalid = Boolean(invalidEmailValues[email])
          return existing
            ? { ...existing, isValid: isInvalid ? false : existing.isValid }
            : { value: email, isValid: !isInvalid }
        })
      )
    }
  }, [emails, invalidEmailItems])

  const addEmail = async (email: string): Promise<boolean> => {
    if (!email.trim()) return false

    const normalized = normalizeEmail(email)
    const isDomainPattern = normalized.startsWith('@')
    const validation = quickValidateEmail(normalized)
    const isValid = validation.isValid || isDomainPattern

    if (
      emailsRef.current.includes(normalized) ||
      invalidEmailItemsRef.current.some((item) => item.value === normalized)
    ) {
      return false
    }

    if (isValid) {
      setEmailError('')
      emailsRef.current = [...emailsRef.current, normalized]
      onEmailsChange(emailsRef.current)
    } else {
      invalidEmailItemsRef.current = [
        ...invalidEmailItemsRef.current,
        { value: normalized, isValid, error: validation.reason ?? 'Invalid email format' },
      ]
      setInvalidEmailItems(invalidEmailItemsRef.current)
    }

    // Skip validation for domain emails (starting with @)
    if (normalized.startsWith('@')) {
      setEmailError('')
      onEmailsChange([...emails, normalized])
      return true
    }

    // Validate email using API
    try {
      const response = await fetch('/api/users/validate-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emails: [normalized] }),
      })

      if (!response.ok) {
        throw new Error('Failed to validate email')
      }

      const data = await response.json()

      // If validation fails, mark email as invalid and show error
      if (data.valid === false) {
        // Remove from emails state
        onEmailsChange(emails.filter((e) => e !== normalized))

        // Update emailItems to mark as invalid (red badge)
        setEmailItems((prev) =>
          prev.map((item) => (item.value === normalized ? { ...item, isValid: false } : item))
        )

        // Show error message with email address
        const errorMessage =
          data.missingEmails?.includes(normalized) ||
          (data.missingEmails && data.missingEmails.length > 0)
            ? `The user "${normalized}" does not exist in the system. Please add a user that exists.`
            : `The user "${normalized}" does not have access to Agentic AI.`

        setEmailError(errorMessage)
        setInvalidEmailItems((prev) => {
          if (prev.some((item) => item.value === normalized)) {
            return prev
          }
          return [...prev, { value: normalized, isValid: false }]
        })
        return false
      }

      // Email is valid and exists
      if (data.valid && data.existingEmails.includes(normalized)) {
        setEmailError('')
        // Remove from invalidEmails if it was there
        setInvalidEmailItems((prev) => prev.filter((item) => item.value !== normalized))
        // Update emailItems to mark as valid
        setEmailItems((prev) =>
          prev.map((item) => (item.value === normalized ? { ...item, isValid: true } : item))
        )
        onEmailsChange([...emails, normalized])
        return true
      }

      // If valid is true but email not in existingEmails, still keep it
      if (data.valid) {
        setEmailError('')
        setInvalidEmailItems((prev) => prev.filter((item) => item.value !== normalized))
        setEmailItems((prev) =>
          prev.map((item) => (item.value === normalized ? { ...item, isValid: true } : item))
        )
        onEmailsChange([...emails, normalized])
        return true
      }

      // Fallback: mark as invalid
      onEmailsChange(emails.filter((e) => e !== normalized))
      setEmailItems((prev) =>
        prev.map((item) => (item.value === normalized ? { ...item, isValid: false } : item))
      )
      setEmailError(
        `The user "${normalized}" does not exist in the system. Please add a user that exists.`
      )
      setInvalidEmailItems((prev) => {
        if (prev.some((item) => item.value === normalized)) {
          return prev
        }
        return [...prev, { value: normalized, isValid: false }]
      })
      return false
    } catch (error) {
      logger.error('Error validating email', { error, email: normalized })
      // On error, remove from emails and mark as invalid
      onEmailsChange(emails.filter((e) => e !== normalized))
      setEmailItems((prev) =>
        prev.map((item) => (item.value === normalized ? { ...item, isValid: false } : item))
      )
      setEmailError(
        `Failed to validate "${normalized}". Please verify the email exists and try again.`
      )
      setInvalidEmailItems((prev) => {
        if (prev.some((item) => item.value === normalized)) {
          return prev
        }
        return [...prev, { value: normalized, isValid: false }]
      })
      return false
    }
  }

  const handleRemoveEmailItem = (_value: string, index: number) => {
    setEmailError('')
    const itemToRemove = emailItems[index]
    if (!itemToRemove) return

    if (itemToRemove.isValid) {
      emailsRef.current = emailsRef.current.filter((e) => e !== itemToRemove.value)
      onEmailsChange(emailsRef.current)
    } else {
      invalidEmailItemsRef.current = invalidEmailItemsRef.current.filter(
        (item) => item.value !== itemToRemove.value
      )
      setInvalidEmailItems(invalidEmailItemsRef.current)
    }
  }

  const handleRemoveEmail = (emailToRemove: string) => {
    // Prevent removing session email
    const sessionEmail = session?.user?.email?.toLowerCase()
    if (sessionEmail && emailToRemove.toLowerCase() === sessionEmail) {
      return
    }
    onEmailsChange(emails.filter((e) => e !== emailToRemove))
  }

  /** Reset prefill ref when in edit mode so create mode can prefill again on next open. */
  useEffect(() => {
    if (isExistingChat) {
      hasPrefilledSessionEmailRef.current = false
    }
  }, [isExistingChat])

  /**
   * Prefill session email once when in create mode and list is empty.
   * Skip re-adding after user has cleared the list (use ref so we only prefill once per create session).
   */
  useEffect(() => {
    if (!session?.user?.email || isExistingChat || hasPrefilledSessionEmailRef.current) return

    const sessionEmail = session.user.email.toLowerCase().trim()
    const normalizedEmails = emails.map((e) => e.toLowerCase().trim())
    const normalizedInvalidEmails = invalidEmailItems.map((item) => item.value.toLowerCase().trim())
    const normalizedEmailItems = emailItems.map((item) => item.value.toLowerCase().trim())

    const alreadyInList =
      normalizedEmails.includes(sessionEmail) ||
      normalizedInvalidEmails.includes(sessionEmail) ||
      normalizedEmailItems.includes(sessionEmail)
    if (alreadyInList) return

    addEmail(sessionEmail)
      .then(() => {
        hasPrefilledSessionEmailRef.current = true
      })
      .catch((error) => {
        logger.error('Error prefilling session email', { error })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email, isExistingChat, emails, emailItems])

  const ssoEnabled = isTruthy(getEnv('NEXT_PUBLIC_SSO_ENABLED'))
  const authOptions = ssoEnabled
    ? (['public', 'password', 'email', 'sso'] as const)
    : (['public', 'password', 'email'] as const)

  return (
    <div className='space-y-[16px]'>
      {/* <div>
        <Label className='mb-[6.5px] block pl-[2px] font-medium text-[13px] text-[var(--text-primary)]'>
          Access control
        </Label>
        <ButtonGroup
          value={authType}
          onValueChange={(val) => onAuthTypeChange(val as AuthType)}
          disabled={disabled}
        >
          {authOptions.map((type) => (
            <ButtonGroupItem key={type} value={type}>
              {AUTH_LABELS[type]}
            </ButtonGroupItem>
          ))}
        </ButtonGroup>
      </div>*/}

      {authType === 'password' && (
        <div>
          <Label className='mb-[6.5px] block pl-0.5 font-medium text-[var(--text-primary)] text-small'>
            Password
          </Label>
          <GeneratedPasswordInput
            value={password}
            onChange={onPasswordChange}
            disabled={disabled}
            placeholder={getPasswordPlaceholder(hasExistingPassword)}
            required={!hasExistingPassword}
          />
          <p className='mt-[6.5px] text-[var(--text-secondary)] text-xs'>
            {getPasswordHelperText(hasExistingPassword)}
          </p>
        </div>
      )}

      {(authType === 'email' || authType === 'sso') && (
        <div>
          <Label className='mb-[6.5px] block pl-0.5 font-medium text-[var(--text-primary)] text-small'>
            {authType === 'email' ? 'Allowed emails' : 'Allowed SSO emails'}
          </Label>
          <TagInput
            items={emailItems}
            onAdd={(value) => {
              void addEmail(value)
              return true
            }}
            onRemove={handleRemoveEmailItem}
            placeholder={
              emails.length > 0 || invalidEmailItems.length > 0
                ? 'Add another email'
                : 'Enter emails or domains (@example.com)'
            }
            placeholderWithTags='Add email'
            disabled={disabled}
          />
          {emailError && (
            <p className='mt-[6.5px] text-[var(--text-error)] text-caption'>{emailError}</p>
          )}
          <p className='mt-[6.5px] text-[var(--text-secondary)] text-xs'>
            {authType === 'email'
              ? 'Add specific emails or entire domains (@example.com)'
              : 'Add emails or domains that can access via SSO'}
          </p>
        </div>
      )}

      {error && <p className='mt-[6.5px] text-[var(--text-error)] text-caption'>{error}</p>}
    </div>
  )
}
