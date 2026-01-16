'use client'

import { useEffect, useRef, useState } from 'react'
import { createLogger } from '@sim/logger'
import { AlertTriangle, Check, Clipboard, Eye, EyeOff, Loader2, RefreshCw } from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  TagInput,
  type TagItem,
  Textarea,
  Tooltip,
} from '@/components/emcn'
import { Alert, AlertDescription, Skeleton } from '@/components/ui'
import { CustomSelect } from '@/components/ui/native-select'
import { useSession } from '@/lib/auth/auth-client'
import { getEnv, isTruthy } from '@/lib/core/config/env'
import { generatePassword } from '@/lib/core/security/encryption'
import { cn } from '@/lib/core/utils/cn'
import { getBaseUrl, getEmailDomain } from '@/lib/core/utils/urls'
import { quickValidateEmail } from '@/lib/messaging/email/validation'
import { OutputSelect } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/chat/components/output-select/output-select'
import {
  type AuthType,
  type ChatFormData,
  useChatDeployment,
  useIdentifierValidation,
} from './hooks'

const logger = createLogger('ChatDeploy')

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
  onChatExistsChange?: (exists: boolean) => void
  chatSubmitting: boolean
  setChatSubmitting: (submitting: boolean) => void
  onValidationChange?: (isValid: boolean) => void
  showDeleteConfirmation?: boolean
  setShowDeleteConfirmation?: (show: boolean) => void
  onDeploymentComplete?: () => void
  onDeployed?: () => void
  onVersionActivated?: () => void
  chatAlreadyExists?: boolean | any
}

export interface ExistingChat {
  id: string
  identifier: string
  title: string
  description: string
  department?: string
  authType: 'public' | 'password' | 'email' | 'sso'
  allowedEmails: string[]
  outputConfigs: Array<{ blockId: string; path: string }>
  customizations?: {
    welcomeMessage?: string
    imageUrl?: string
  }
  isActive: boolean
}

interface FormErrors {
  identifier?: string
  title?: string
  department?: string
  description?: string
  password?: string
  emails?: string
  outputBlocks?: string
  general?: string
}

const CATEGORIES = [
  { value: 'creative', label: 'Creative' },
  { value: 'ma', label: 'MA' },
  { value: 'ppc', label: 'PPC' },
  { value: 'sales', label: 'Sales' },
  { value: 'seo', label: 'SEO' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'waas', label: 'WAAS' },
] as const

const initialFormData: ChatFormData = {
  identifier: '',
  title: '',
  description: '',
  department: '',
  authType: 'email',
  password: '',
  emails: [],
  welcomeMessage: 'Hi there! How can I help you today?',
  selectedOutputBlocks: [],
}

export function ChatDeploy({
  workflowId,
  workflowWorkspaceId,
  deploymentInfo,
  existingChat,
  isLoadingChat,
  onRefetchChat,
  onChatExistsChange,
  chatSubmitting,
  setChatSubmitting,
  onValidationChange,
  showDeleteConfirmation: externalShowDeleteConfirmation,
  setShowDeleteConfirmation: externalSetShowDeleteConfirmation,
  onDeploymentComplete,
  onDeployed,
  onVersionActivated,
  chatAlreadyExists,
}: ChatDeployProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [internalShowDeleteConfirmation, setInternalShowDeleteConfirmation] = useState(false)

  const showDeleteConfirmation =
    externalShowDeleteConfirmation !== undefined
      ? externalShowDeleteConfirmation
      : internalShowDeleteConfirmation

  const setShowDeleteConfirmation =
    externalSetShowDeleteConfirmation || setInternalShowDeleteConfirmation

  const [formData, setFormData] = useState<ChatFormData>(initialFormData)
  const [errors, setErrors] = useState<FormErrors>({})
  const { deployChat } = useChatDeployment()
  const formRef = useRef<HTMLFormElement>(null)
  const [isIdentifierValid, setIsIdentifierValid] = useState(false)
  const [hasInvalidEmails, setHasInvalidEmails] = useState(false)
  const [hasInitializedForm, setHasInitializedForm] = useState(false)

  const updateField = <K extends keyof ChatFormData>(field: K, value: ChatFormData[K]) => {
    setFormData((prev) => ({ ...prev, identifier: workflowId, [field]: value }))
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const setError = (field: keyof FormErrors, message: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }))
  }

  const validateForm = (isExistingChat: boolean): boolean => {
    const newErrors: FormErrors = {}

    // if (!formData.identifier.trim()) {
    //   newErrors.identifier = 'Identifier is required'
    // } else if (!IDENTIFIER_PATTERN.test(formData.identifier)) {
    //   newErrors.identifier = 'Identifier can only contain lowercase letters, numbers, and hyphens'
    // }

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required'
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    }

    if (formData.authType === 'password' && !isExistingChat && !formData.password.trim()) {
      newErrors.password = 'Password is required when using password protection'
    }

    if (
      (formData.authType === 'email' || formData.authType === 'sso') &&
      formData.emails.length === 0
    ) {
      newErrors.emails = `At least one email or domain is required when using ${formData.authType === 'sso' ? 'SSO' : 'email'} access control`
    }

    if (formData.selectedOutputBlocks.length === 0) {
      newErrors.outputBlocks = 'Please select at least one output block'
    }

    if (!formData.department?.trim()) {
      newErrors.general = 'Department is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const isFormValid =
    isIdentifierValid &&
    Boolean(formData.title.trim()) &&
    formData.selectedOutputBlocks.length > 0 &&
    (formData.authType !== 'password' ||
      Boolean(formData.password.trim()) ||
      Boolean(existingChat)) &&
    ((formData.authType !== 'email' && formData.authType !== 'sso') ||
      formData.emails.length > 0) &&
    !hasInvalidEmails

  useEffect(() => {
    onValidationChange?.(isFormValid)
  }, [isFormValid, onValidationChange])

  useEffect(() => {
    if (workflowId) {
      //set the identifier to the workflow id valid true
      setIsIdentifierValid(true)
    }
  }, [workflowId])

  useEffect(() => {
    if (existingChat && !hasInitializedForm) {
      // Deduplicate emails when initializing from existingChat
      const allowedEmails = Array.isArray(existingChat.allowedEmails)
        ? existingChat.allowedEmails
        : []
      const normalizedEmails = allowedEmails.map((e) => e.toLowerCase().trim())
      const uniqueEmails = Array.from(new Set(normalizedEmails))

      setFormData({
        identifier: existingChat.identifier || workflowId || '',
        title: existingChat.title || '',
        description: existingChat.description || '',
        department: existingChat.department || '',
        authType: existingChat.authType || 'public',
        password: '',
        emails: uniqueEmails,
        welcomeMessage:
          existingChat.customizations?.welcomeMessage || 'Hi there! How can I help you today?',
        selectedOutputBlocks: Array.isArray(existingChat.outputConfigs)
          ? existingChat.outputConfigs.map(
              (config: { blockId: string; path: string }) => `${config.blockId}_${config.path}`
            )
          : [],
      })

      if (existingChat.customizations?.imageUrl) {
        setImageUrl(existingChat.customizations.imageUrl)
      }

      setHasInitializedForm(true)
    } else if (!existingChat && !isLoadingChat) {
      setFormData(initialFormData)
      setImageUrl(null)
      setHasInitializedForm(false)
    }
  }, [existingChat, isLoadingChat, hasInitializedForm])

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    if (chatSubmitting) return

    setChatSubmitting(true)

    try {
      if (!validateForm(!!existingChat)) {
        setChatSubmitting(false)
        return
      }

      if (!isIdentifierValid && formData.identifier !== existingChat?.identifier) {
        setError('identifier', 'Please wait for identifier validation to complete')
        setChatSubmitting(false)
        return
      }

      const chatUrl = await deployChat(
        workflowId,
        formData,
        deploymentInfo,
        existingChat?.id,
        imageUrl
      )

      onChatExistsChange?.(true)
      onDeployed?.()
      onVersionActivated?.()

      if (chatUrl && !chatAlreadyExists) {
        window.open(`${chatUrl}?workspaceId=${workflowWorkspaceId}&fromControlBar=true`, '_blank')
      }

      await onRefetchChat()
      setHasInitializedForm(false)
    } catch (error: any) {
      if (error.message?.includes('identifier')) {
        setError('identifier', error.message)
      } else {
        setError('general', error.message)
      }
    } finally {
      setChatSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!existingChat || !existingChat.id) return

    try {
      setIsDeleting(true)

      const response = await fetch(`/api/chat/manage/${existingChat.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete chat')
      }

      setImageUrl(null)
      setHasInitializedForm(false)
      onChatExistsChange?.(false)
      await onRefetchChat()

      onDeploymentComplete?.()
    } catch (error: any) {
      logger.error('Failed to delete chat:', error)
      setError('general', error.message || 'An unexpected error occurred while deleting')
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirmation(false)
    }
  }

  if (isLoadingChat) {
    return <LoadingSkeleton />
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

        {/* <IdentifierInput
            value={formData.identifier}
            onChange={(value) => updateField('identifier', value)}
            originalIdentifier={existingChat?.identifier || undefined}
            disabled={chatSubmitting}
            onValidationChange={setIsIdentifierValid}
            isEditingExisting={!!existingChat}
          /> */}

        <div>
          <Label
            htmlFor='title'
            className='mb-[6.5px] block pl-[2px] font-medium text-[13px] text-[var(--text-primary)]'
          >
            Title
          </Label>
          <Input
            id='title'
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
              Department
            </Label>
            <CustomSelect
              value={formData.department || ''}
              onChange={(value) => updateField('department', value)}
              disabled={chatSubmitting}
              placeholder='Select department'
              options={CATEGORIES.map((cat) => ({ value: cat.value, label: cat.label }))}
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
              id='description'
              placeholder='A brief description of what this chat does'
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

          <div>
            <Label className='mb-[6.5px] block pl-[2px] font-medium text-[13px] text-[var(--text-primary)]'>
              Output
            </Label>
            <OutputSelect
              workflowId={workflowId}
              selectedOutputs={formData.selectedOutputBlocks}
              onOutputSelect={(values) => updateField('selectedOutputBlocks', values)}
              placeholder='Select which block outputs to use'
              disabled={chatSubmitting}
            />
            {errors.outputBlocks && (
              <p className='mt-1 text-destructive text-sm'>{errors.outputBlocks}</p>
            )}
          </div>

          <AuthSelector
            key={existingChat?.id ?? 'new'}
            authType={formData.authType}
            password={formData.password}
            emails={formData.emails}
            onAuthTypeChange={(type) => updateField('authType', type)}
            onPasswordChange={(password) => updateField('password', password)}
            onEmailsChange={(emails) => updateField('emails', emails)}
            onInvalidEmailsChange={setHasInvalidEmails}
            disabled={chatSubmitting}
            isExistingChat={!!existingChat}
            error={errors.password || errors.emails}
          />
          <div>
            <Label
              htmlFor='welcomeMessage'
              className='mb-[6.5px] block pl-[2px] font-medium text-[13px] text-[var(--text-primary)]'
            >
              Welcome message
            </Label>
            <Textarea
              id='welcomeMessage'
              placeholder='Enter a welcome message for your chat'
              value={formData.welcomeMessage}
              onChange={(e) => updateField('welcomeMessage', e.target.value)}
              rows={3}
              disabled={chatSubmitting}
              className='min-h-[80px] resize-none'
            />
            <p className='mt-[6.5px] text-[11px] text-[var(--text-secondary)]'>
              This message will be displayed when users first open the chat
            </p>
          </div>

          <button
            type='button'
            data-delete-trigger
            onClick={() => setShowDeleteConfirmation(true)}
            style={{ display: 'none' }}
          />
        </div>
      </form>

      <Modal open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <ModalContent size='sm'>
          <ModalHeader>Delete Chat</ModalHeader>
          <ModalBody>
            <p className='text-[12px] text-[var(--text-secondary)]'>
              Are you sure you want to delete this chat?{' '}
              <span className='text-[var(--text-error)]'>
                This will remove the chat at "{getEmailDomain()}/chat/{existingChat?.identifier}"
                and make it unavailable to all users.
              </span>
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant='default'
              onClick={() => setShowDeleteConfirmation(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant='default' onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}

function LoadingSkeleton() {
  return (
    <div className='-mx-1 space-y-4 px-1'>
      <div className='space-y-[12px]'>
        <div>
          <Skeleton className='mb-[6.5px] h-[16px] w-[26px]' />
          <Skeleton className='h-[34px] w-full rounded-[4px]' />
          <Skeleton className='mt-[6.5px] h-[14px] w-[320px]' />
        </div>
        <div>
          <Skeleton className='mb-[6.5px] h-[16px] w-[30px]' />
          <Skeleton className='h-[34px] w-full rounded-[4px]' />
        </div>
        <div>
          <Skeleton className='mb-[6.5px] h-[16px] w-[46px]' />
          <Skeleton className='h-[34px] w-full rounded-[4px]' />
        </div>
        <div>
          <Skeleton className='mb-[6.5px] h-[16px] w-[95px]' />
          <Skeleton className='h-[28px] w-[170px] rounded-[4px]' />
        </div>
        <div>
          <Skeleton className='mb-[6.5px] h-[16px] w-[115px]' />
          <Skeleton className='h-[80px] w-full rounded-[4px]' />
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
        className='mb-[6.5px] block pl-[2px] font-medium text-[13px] text-[var(--text-primary)]'
      >
        URL
      </Label>
      <div
        className={cn(
          'relative flex items-stretch overflow-hidden rounded-[4px] border border-[var(--border-1)]',
          error && 'border-[var(--text-error)]'
        )}
      >
        <div className='flex items-center whitespace-nowrap bg-[var(--surface-5)] pr-[6px] pl-[8px] font-medium text-[var(--text-secondary)] text-sm dark:bg-[var(--surface-5)]'>
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
              'rounded-none border-0 pl-0 shadow-none disabled:bg-transparent disabled:opacity-100',
              (isChecking || (isValid && value)) && 'pr-[32px]'
            )}
          />
          {isChecking ? (
            <div className='-translate-y-1/2 absolute top-1/2 right-2'>
              <Loader2 className='h-4 w-4 animate-spin text-[var(--text-tertiary)]' />
            </div>
          ) : (
            isValid &&
            value &&
            value !== originalIdentifier && (
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <div className='-translate-y-1/2 absolute top-1/2 right-2'>
                    <Check className='h-4 w-4 text-[var(--brand-tertiary-2)]' />
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
      {error && <p className='mt-[6.5px] text-[11px] text-[var(--text-error)]'>{error}</p>}
      <p className='mt-[6.5px] truncate text-[11px] text-[var(--text-secondary)]'>
        {isEditingExisting && value ? (
          <>
            Live at:{' '}
            <a
              href={fullUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='text-[var(--text-primary)] hover:underline'
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
  isExistingChat?: boolean
  error?: string
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
  isExistingChat = false,
  error,
}: AuthSelectorProps) {
  const { data: session } = useSession()
  const [showPassword, setShowPassword] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)
  const [invalidEmails, setInvalidEmails] = useState<string[]>([])
  const [emailValidationErrors, setEmailValidationErrors] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    onInvalidEmailsChange?.(invalidEmails.length > 0)
  }, [invalidEmails, onInvalidEmailsChange])
  const [emailItems, setEmailItems] = useState<TagItem[]>(() =>
    emails.map((email) => ({ value: email, isValid: true }))
  )

  // Sync emailItems with emails prop and deduplicate
  // Keep invalid items in emailItems even if not in emails (to show red badges)
  useEffect(() => {
    const normalizedEmails = emails.map((e) => e.toLowerCase().trim())
    const uniqueEmails = Array.from(new Set(normalizedEmails))
    const currentValues = new Set(emailItems.map((item) => item.value.toLowerCase().trim()))

    // Create a map of existing items to preserve isValid state
    const existingItemsMap = new Map(
      emailItems.map((item) => [item.value.toLowerCase().trim(), item])
    )

    // Include invalid emails in the items to display (for red badges)
    const invalidEmailValues = new Set(invalidEmails.map((e) => e.toLowerCase().trim()))
    const allEmailValues = new Set([...uniqueEmails, ...invalidEmailValues])

    // Only update if there's a mismatch
    const needsUpdate =
      allEmailValues.size !== emailItems.length ||
      !Array.from(allEmailValues).every((email) => currentValues.has(email)) ||
      !emailItems.every((item) => allEmailValues.has(item.value.toLowerCase().trim()))

    if (needsUpdate) {
      setEmailItems(
        Array.from(allEmailValues).map((email) => {
          const existing = existingItemsMap.get(email)
          // If email is in invalidEmails, mark as invalid
          const isInvalid = invalidEmailValues.has(email)
          return existing
            ? { ...existing, isValid: isInvalid ? false : existing.isValid }
            : { value: email, isValid: !isInvalid }
        })
      )
    }
  }, [emails, invalidEmails])

  const handleGeneratePassword = () => {
    const newPassword = generatePassword(24)
    onPasswordChange(newPassword)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  const addEmail = async (email: string): Promise<boolean> => {
    if (!email.trim()) return false

    const normalized = email.trim().toLowerCase()
    const isDomainPattern = normalized.startsWith('@')
    const validation = quickValidateEmail(normalized)
    const isValid = validation.isValid || isDomainPattern

    if (emailItems.some((item) => item.value === normalized)) {
      return false
    }

    setEmailItems((prev) => [...prev, { value: normalized, isValid }])

    if (isValid) {
      setEmailError('')
      onEmailsChange([...emails, normalized])
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
          prev.map((item) =>
            item.value === normalized ? { ...item, isValid: false } : item
          )
        )

        // Show error message with email address
        const errorMessage = data.missingEmails?.includes(normalized) ||
          (data.missingEmails && data.missingEmails.length > 0)
          ? `The user "${normalized}" does not exist in the system. Please add a user that exists.`
          : `The user "${normalized}" does not have access to Agentic AI.`

        setEmailError(errorMessage)
        setEmailValidationErrors((prev) => {
          const next = new Map(prev)
          next.set(normalized, errorMessage)
          return next
        })
        setInvalidEmails((prev) => {
          if (!prev.includes(normalized)) {
            return [...prev, normalized]
          }
          return prev
        })
        return false
      }

      // Email is valid and exists
      if (data.valid && data.existingEmails.includes(normalized)) {
        setEmailError('')
        setEmailValidationErrors((prev) => {
          const next = new Map(prev)
          next.delete(normalized)
          return next
        })
        // Remove from invalidEmails if it was there
        setInvalidEmails((prev) => prev.filter((e) => e !== normalized))
        // Update emailItems to mark as valid
        setEmailItems((prev) =>
          prev.map((item) =>
            item.value === normalized ? { ...item, isValid: true } : item
          )
        )
        onEmailsChange([...emails, normalized])
        return true
      }

      // If valid is true but email not in existingEmails, still keep it
      if (data.valid) {
        setEmailError('')
        setEmailValidationErrors((prev) => {
          const next = new Map(prev)
          next.delete(normalized)
          return next
        })
        setInvalidEmails((prev) => prev.filter((e) => e !== normalized))
        setEmailItems((prev) =>
          prev.map((item) =>
            item.value === normalized ? { ...item, isValid: true } : item
          )
        )
        onEmailsChange([...emails, normalized])
        return true
      }

      // Fallback: mark as invalid
      onEmailsChange(emails.filter((e) => e !== normalized))
      setEmailItems((prev) =>
        prev.map((item) =>
          item.value === normalized ? { ...item, isValid: false } : item
        )
      )
      setEmailError(`The user "${normalized}" does not exist in the system. Please add a user that exists.`)
      setInvalidEmails((prev) => {
        if (!prev.includes(normalized)) {
          return [...prev, normalized]
        }
        return prev
      })
      return false
    } catch (error) {
      logger.error('Error validating email', { error, email: normalized })
      // On error, remove from emails and mark as invalid
      onEmailsChange(emails.filter((e) => e !== normalized))
      setEmailItems((prev) =>
        prev.map((item) =>
          item.value === normalized ? { ...item, isValid: false } : item
        )
      )
      setEmailError(`Failed to validate "${normalized}". Please verify the email exists and try again.`)
      setInvalidEmails((prev) => {
        if (!prev.includes(normalized)) {
          return [...prev, normalized]
        }
        return prev
      })
      return false
    }
  }

  const handleRemoveEmailItem = (_value: string, index: number, isValid: boolean) => {
    const itemToRemove = emailItems[index]
    setEmailItems((prev) => prev.filter((_, i) => i !== index))
    if (isValid && itemToRemove) {
      onEmailsChange(emails.filter((e) => e !== itemToRemove.value))
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

  const handleRemoveInvalidEmail = (index: number) => {
    const emailToRemove = invalidEmails[index]
    setInvalidEmails((prev) => prev.filter((_, i) => i !== index))
    setEmailValidationErrors((prev) => {
      const next = new Map(prev)
      next.delete(emailToRemove)
      return next
    })
  }

  // Prefill session.email on mount
  useEffect(() => {
    if (session?.user?.email && !isExistingChat) {
      const sessionEmail = session.user.email.toLowerCase().trim()
      const normalizedEmails = emails.map((e) => e.toLowerCase().trim())
      const normalizedInvalidEmails = invalidEmails.map((e) => e.toLowerCase().trim())
      const normalizedEmailItems = emailItems.map((item) => item.value.toLowerCase().trim())

      if (
        !normalizedEmails.includes(sessionEmail) &&
        !normalizedInvalidEmails.includes(sessionEmail) &&
        !normalizedEmailItems.includes(sessionEmail)
      ) {
        addEmail(sessionEmail).catch((error) => {
          logger.error('Error prefilling session email', { error })
        })
      }
    }
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
          <Label className='mb-[6.5px] block pl-[2px] font-medium text-[13px] text-[var(--text-primary)]'>
            Password
          </Label>
          <div className='relative'>
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder={isExistingChat ? 'Enter new password to change' : 'Enter password'}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              disabled={disabled}
              className='pr-[88px]'
              required={!isExistingChat}
              autoComplete='new-password'
            />
            <div className='-translate-y-1/2 absolute top-1/2 right-[4px] flex items-center'>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <Button
                    type='button'
                    variant='ghost'
                    onClick={handleGeneratePassword}
                    disabled={disabled}
                    aria-label='Generate password'
                    className='!p-1.5'
                  >
                    <RefreshCw className='h-3 w-3' />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  <span>Generate</span>
                </Tooltip.Content>
              </Tooltip.Root>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <Button
                    type='button'
                    variant='ghost'
                    onClick={() => copyToClipboard(password)}
                    disabled={!password || disabled}
                    aria-label='Copy password'
                    className='!p-1.5'
                  >
                    {copySuccess ? (
                      <Check className='h-3 w-3' />
                    ) : (
                      <Clipboard className='h-3 w-3' />
                    )}
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  <span>{copySuccess ? 'Copied' : 'Copy'}</span>
                </Tooltip.Content>
              </Tooltip.Root>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <Button
                    type='button'
                    variant='ghost'
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={disabled}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className='!p-1.5'
                  >
                    {showPassword ? <EyeOff className='h-3 w-3' /> : <Eye className='h-3 w-3' />}
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  <span>{showPassword ? 'Hide' : 'Show'}</span>
                </Tooltip.Content>
              </Tooltip.Root>
            </div>
          </div>
          <p className='mt-[6.5px] text-[11px] text-[var(--text-secondary)]'>
            {isExistingChat
              ? 'Leave empty to keep the current password'
              : 'This password will be required to access your chat'}
          </p>
        </div>
      )}

      {(authType === 'email' || authType === 'sso') && (
        <div>
          <Label className='mb-[6.5px] block pl-[2px] font-medium text-[13px] text-[var(--text-primary)]'>
            {authType === 'email' ? 'Allowed emails' : 'Allowed SSO emails'}
          </Label>
          <TagInput
            items={emailItems}
            onAdd={(value) => addEmail(value)}
            onRemove={handleRemoveEmailItem}
            placeholder={
              emails.length > 0 || invalidEmails.length > 0
                ? 'Add another email'
                : 'Enter emails or domains (@example.com)'
            }
            placeholderWithTags='Add email'
            disabled={disabled}
          />
          {emailError && (
            <p className='mt-[6.5px] text-[11px] text-[var(--text-error)]'>{emailError}</p>
          )}
          <p className='mt-[6.5px] text-[11px] text-[var(--text-secondary)]'>
            {authType === 'email'
              ? 'Add specific emails or entire domains (@example.com)'
              : 'Add emails or domains that can access via SSO'}
          </p>
        </div>
      )}

      {error && <p className='mt-[6.5px] text-[11px] text-[var(--text-error)]'>{error}</p>}
    </div>
  )
}
