'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Button, ChipEmailsInput, ChipInput, Label, Loader, Switch, Textarea } from '@sim/emcn'
import { getErrorMessage } from '@sim/utils/errors'
import { Check } from 'lucide-react'
import { GeneratedPasswordInput } from '@/components/ui'
import { CustomSelect } from '@/components/ui/native-select'
import {
  ARENA_GENERATIVE_APP_BASE_PATH,
  ARENA_GENERATIVE_APP_PREVIEW_BASE_PATH,
} from '@/lib/arena-generative-ui/types'
import { useSession } from '@/lib/auth/auth-client'
import { isSsoEnabled } from '@/lib/core/config/env-flags'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { validateAllowlistEntry } from '@/lib/messaging/email/validation'
import { useGenerativeAppIdentifierValidation } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/components/deploy-modal/components/generative-app/hooks/use-identifier-validation'
import {
  useCreateDeployedApp,
  useDeleteDeployedApp,
  useGenerativeAppDraft,
  useGenerativeAppDrafts,
  useGenerativeAppStatus,
  useUpdateDeployedApp,
} from '@/hooks/queries/arena-generative-apps'
import { type AuthType, useAgentDepartments } from '@/hooks/queries/chats'
import { usePermissionConfig } from '@/hooks/use-permission-config'

interface GenerativeAppDeployProps {
  workflowId: string
  submitting: boolean
  setSubmitting: (submitting: boolean) => void
  onValidationChange?: (isValid: boolean) => void
  onSelectedDraftChange?: (draftId: string) => void
  onDeployed?: () => void
}

export function GenerativeAppDeploy({
  workflowId,
  submitting,
  setSubmitting,
  onValidationChange,
  onSelectedDraftChange,
  onDeployed,
}: GenerativeAppDeployProps) {
  const { data: session } = useSession()
  const { config: permissionConfig } = usePermissionConfig()
  const { data: draftsData, isLoading: draftsLoading } = useGenerativeAppDrafts(workflowId)
  const { data: statusData } = useGenerativeAppStatus(workflowId)
  const createMutation = useCreateDeployedApp()
  const updateMutation = useUpdateDeployedApp()
  const deleteMutation = useDeleteDeployedApp()
  const { data: departmentsData } = useAgentDepartments()

  const existing = statusData?.deployment
  const drafts = draftsData?.drafts ?? []
  const [draftId, setDraftId] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [department, setDepartment] = useState('')
  const [authType, setAuthType] = useState<AuthType>('public')
  const [password, setPassword] = useState('')
  const [emails, setEmails] = useState<string[]>([])
  const [requireArenaEmailId, setRequireArenaEmailId] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedDraftQuery = useGenerativeAppDraft(draftId || undefined)
  const identifierCheck = useGenerativeAppIdentifierValidation(
    identifier,
    existing?.identifier,
    Boolean(existing)
  )

  useEffect(() => {
    if (drafts.length > 0 && !draftId) {
      setDraftId(drafts[0].id)
    }
  }, [drafts, draftId])

  useEffect(() => {
    onSelectedDraftChange?.(draftId)
  }, [draftId, onSelectedDraftChange])

  useEffect(() => {
    if (existing && !identifier) {
      setIdentifier(existing.identifier)
      setTitle(existing.title)
      setAuthType((existing.authType as AuthType) || 'public')
      setRequireArenaEmailId(existing.requireArenaEmailId)
    }
  }, [existing, identifier])

  useEffect(() => {
    const draftTitle = selectedDraftQuery.data?.title
    if (draftTitle && !title) {
      setTitle(draftTitle)
    }
  }, [selectedDraftQuery.data?.title, title])

  useEffect(() => {
    if (!session?.user?.email || emails.length > 0) return
    const sessionEmail = session.user.email.toLowerCase().trim()
    if (!validateAllowlistEntry(sessionEmail)) {
      setEmails([sessionEmail])
    }
  }, [session?.user?.email, emails.length])

  const allowedAuthTypes = permissionConfig.allowedChatDeployAuthTypes
  const authOptions = (
    isSsoEnabled
      ? (['public', 'password', 'email', 'sso'] as const)
      : (['public', 'password', 'email'] as const)
  ).filter(
    (type) =>
      allowedAuthTypes === null || allowedAuthTypes.includes(type) || type === existing?.authType
  )

  const departmentOptions = useMemo(
    () =>
      (departmentsData?.departments ?? []).map((item) => ({
        value: item.value,
        label: item.label,
      })),
    [departmentsData?.departments]
  )

  const apiBindings = selectedDraftQuery.data?.apiBindings ?? []
  const isFormValid =
    Boolean(draftId) &&
    identifierCheck.isValid &&
    Boolean(title.trim()) &&
    Boolean(department.trim()) &&
    (authType !== 'password' || Boolean(password.trim()) || Boolean(existing)) &&
    ((authType !== 'email' && authType !== 'sso') || emails.length > 0)

  useEffect(() => {
    onValidationChange?.(isFormValid)
  }, [isFormValid, onValidationChange])

  const appUrl = identifier ? `${getBaseUrl()}${ARENA_GENERATIVE_APP_BASE_PATH}/${identifier}` : ''

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isFormValid || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const body = {
        workflowId,
        draftId,
        revisionId: selectedDraftQuery.data?.latestRevisionId ?? undefined,
        identifier,
        title,
        description,
        department,
        authType,
        password: authType === 'password' ? password : undefined,
        allowedEmails: authType === 'email' || authType === 'sso' ? emails : [],
        requireArenaEmailId,
      }
      const result = existing
        ? await updateMutation.mutateAsync({ id: existing.id, body })
        : await createMutation.mutateAsync(body)
      onDeployed?.()
      if (result.appUrl) {
        window.open(result.appUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to deploy generative app'))
    } finally {
      setSubmitting(false)
    }
  }

  if (draftsLoading) {
    return (
      <div className='flex h-40 items-center justify-center'>
        <Loader className='size-5' animate />
      </div>
    )
  }

  if (drafts.length === 0) {
    return (
      <p className='text-[var(--text-secondary)] text-sm'>
        Run the Arena Generative UI block first to create a draft, then publish it here.
      </p>
    )
  }

  return (
    <form id='generative-app-deploy-form' className='space-y-4' onSubmit={handleSubmit}>
      {error ? <p className='text-[var(--text-error)] text-sm'>{error}</p> : null}

      <div>
        <div className='mb-[6.5px] flex items-center justify-between gap-2'>
          <Label className='font-medium text-[var(--text-primary)] text-small'>Draft</Label>
          <Button
            type='button'
            variant='tertiary'
            disabled={!draftId}
            onClick={() => {
              window.open(
                `${ARENA_GENERATIVE_APP_PREVIEW_BASE_PATH}/${draftId}`,
                '_blank',
                'noopener,noreferrer'
              )
            }}
          >
            Preview draft
          </Button>
        </div>
        <CustomSelect
          value={draftId}
          onChange={setDraftId}
          options={drafts.map((draft) => ({
            value: draft.id,
            label: `${draft.title} (r${draft.revision})`,
          }))}
        />
      </div>

      <div>
        <Label className='mb-[6.5px] block font-medium text-[var(--text-primary)] text-small'>
          Identifier
        </Label>
        <div className='relative'>
          <ChipInput
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value.toLowerCase())}
            placeholder='lead-score'
          />
          {identifierCheck.isChecking ? (
            <Loader className='absolute top-2.5 right-2 size-4' animate />
          ) : identifierCheck.isValid ? (
            <Check className='absolute top-2.5 right-2 size-4 text-[var(--brand-accent)]' />
          ) : null}
        </div>
        {identifierCheck.error ? (
          <p className='mt-1 text-[var(--text-error)] text-caption'>{identifierCheck.error}</p>
        ) : (
          <p className='mt-1 text-[var(--text-secondary)] text-xs'>
            Live at {appUrl || `${ARENA_GENERATIVE_APP_BASE_PATH}/{identifier}`}
          </p>
        )}
      </div>

      <div>
        <Label className='mb-[6.5px] block font-medium text-[var(--text-primary)] text-small'>
          Title
        </Label>
        <ChipInput value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>

      <div>
        <Label className='mb-[6.5px] block font-medium text-[var(--text-primary)] text-small'>
          Category
        </Label>
        <CustomSelect
          value={department}
          onChange={setDepartment}
          placeholder='Select category'
          options={departmentOptions}
        />
      </div>

      <div>
        <Label className='mb-[6.5px] block font-medium text-[var(--text-primary)] text-small'>
          Description
        </Label>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
        />
      </div>

      <div className='flex items-center justify-between gap-3'>
        <div>
          <Label className='font-medium text-[var(--text-primary)] text-small'>
            Require Arena emailId
          </Label>
          <p className='mt-1 text-[var(--text-secondary)] text-xs'>
            Off: open as a Sim page like /chat. On: Arena embeds must pass ?emailId=.
          </p>
        </div>
        <Switch checked={requireArenaEmailId} onCheckedChange={setRequireArenaEmailId} />
      </div>

      <div>
        <Label className='mb-[6.5px] block font-medium text-[var(--text-primary)] text-small'>
          Access control
        </Label>
        <CustomSelect
          value={authType}
          onChange={(value) => setAuthType(value as AuthType)}
          options={authOptions.map((type) => ({ value: type, label: type }))}
        />
      </div>

      {authType === 'password' ? (
        <div>
          <Label className='mb-[6.5px] block font-medium text-[var(--text-primary)] text-small'>
            Password
          </Label>
          <GeneratedPasswordInput value={password} onChange={setPassword} />
        </div>
      ) : null}

      {authType === 'email' || authType === 'sso' ? (
        <div>
          <Label className='mb-[6.5px] block font-medium text-[var(--text-primary)] text-small'>
            Allowed emails
          </Label>
          <ChipEmailsInput
            value={emails}
            onChange={setEmails}
            validate={validateAllowlistEntry}
            allowDomains
            placeholder='Enter emails or domains (@example.com)'
          />
        </div>
      ) : null}

      {apiBindings.length > 0 ? (
        <div>
          <Label className='mb-[6.5px] block font-medium text-[var(--text-primary)] text-small'>
            API bindings
          </Label>
          <ul className='space-y-1 text-[var(--text-secondary)] text-xs'>
            {apiBindings.map((binding) => (
              <li key={binding.key}>
                {binding.label || binding.key} — {binding.kind}
                {binding.kind === 'workflow'
                  ? ` (${binding.workflowId})`
                  : ` (${binding.http?.method} ${binding.http?.url})`}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className='text-[var(--text-secondary)] text-xs'>Navigation-only app (no CTA APIs).</p>
      )}

      {existing ? (
        <button
          type='button'
          className='text-[var(--text-error)] text-sm'
          onClick={() => deleteMutation.mutate({ id: existing.id, workflowId })}
        >
          Archive deployment
        </button>
      ) : null}
    </form>
  )
}
