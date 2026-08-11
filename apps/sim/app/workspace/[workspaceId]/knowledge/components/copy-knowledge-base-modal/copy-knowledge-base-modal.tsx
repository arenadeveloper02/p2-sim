'use client'

import { memo, useMemo, useRef, useState } from 'react'
import {
  ChipCombobox,
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  toast,
} from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { useParams } from 'next/navigation'
import { useCopyKnowledgeBase } from '@/hooks/queries/kb/knowledge'
import { useWorkspacesQuery } from '@/hooks/queries/workspace'

const logger = createLogger('CopyKnowledgeBaseModal')

interface CopyKnowledgeBaseModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  knowledgeBaseId: string
  initialName: string
}

/**
 * Modal for copying a knowledge base into another workspace.
 */
export const CopyKnowledgeBaseModal = memo(function CopyKnowledgeBaseModal({
  open,
  onOpenChange,
  knowledgeBaseId,
  initialName,
}: CopyKnowledgeBaseModalProps) {
  const params = useParams()
  const currentWorkspaceId = params.workspaceId as string
  const { data: workspaces, isLoading: isWorkspacesLoading } = useWorkspacesQuery(open)
  const copyMutation = useCopyKnowledgeBase()

  const [targetWorkspaceId, setTargetWorkspaceId] = useState('')
  const [name, setName] = useState(initialName)
  const [nameError, setNameError] = useState<string | null>(null)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const prevOpenRef = useRef(open)
  if (prevOpenRef.current !== open) {
    prevOpenRef.current = open
    if (open) {
      setTargetWorkspaceId('')
      setName(initialName)
      setNameError(null)
      setWorkspaceError(null)
      setError(null)
    }
  }

  const workspaceOptions = useMemo(() => {
    return (workspaces ?? [])
      .filter(
        (workspace) =>
          workspace.id !== currentWorkspaceId &&
          (workspace.permissions === 'admin' || workspace.permissions === 'write')
      )
      .map((workspace) => ({
        value: workspace.id,
        label: workspace.name,
      }))
  }, [workspaces, currentWorkspaceId])

  const validate = (): string | null => {
    let firstError: string | null = null

    if (!targetWorkspaceId) {
      setWorkspaceError('Workspace is required')
      firstError ??= 'Workspace is required'
    } else {
      setWorkspaceError(null)
    }

    if (!name.trim()) {
      setNameError('Name is required')
      firstError ??= 'Name is required'
    } else if (name.trim().length > 100) {
      setNameError('Name must be less than 100 characters')
      firstError ??= 'Name must be less than 100 characters'
    } else {
      setNameError(null)
    }

    return firstError
  }

  const handleSubmit = async () => {
    const validationError = validate()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setError(null)

    try {
      const copied = await copyMutation.mutateAsync({
        knowledgeBaseId,
        targetWorkspaceId,
        name: name.trim(),
      })
      toast.success(`Copied "${copied.name}" to workspace`)
      onOpenChange(false)
    } catch (err) {
      logger.error('Error copying knowledge base:', err)
      setError(getErrorMessage(err, 'Failed to copy knowledge base'))
    }
  }

  const isSubmitting = copyMutation.isPending
  const isValid = Boolean(targetWorkspaceId) && name.trim().length > 0

  return (
    <ChipModal open={open} onOpenChange={onOpenChange} srTitle='Copy Knowledge Base'>
      <ChipModalHeader onClose={() => onOpenChange(false)}>Copy to workspace</ChipModalHeader>
      <ChipModalBody>
        <ChipModalField
          type='custom'
          title='Workspace'
          required
          error={workspaceError ?? undefined}
          hint={
            isWorkspacesLoading
              ? 'Loading workspaces…'
              : workspaceOptions.length === 0
                ? 'No other workspaces with write access'
                : undefined
          }
        >
          <ChipCombobox
            options={workspaceOptions}
            value={targetWorkspaceId}
            onChange={setTargetWorkspaceId}
            placeholder='Select workspace'
            dropdownWidth='trigger'
            align='start'
            disabled={isSubmitting || isWorkspacesLoading || workspaceOptions.length === 0}
          />
        </ChipModalField>
        <ChipModalField
          type='input'
          title='Name'
          value={name}
          onChange={setName}
          placeholder='Enter knowledge base name'
          required
          error={nameError ?? undefined}
          autoComplete='off'
        />
        <ChipModalError>{error}</ChipModalError>
      </ChipModalBody>
      <ChipModalFooter
        onCancel={() => onOpenChange(false)}
        cancelDisabled={isSubmitting}
        primaryAction={{
          label: isSubmitting ? 'Copying...' : 'Copy',
          onClick: handleSubmit,
          disabled: !isValid || isSubmitting || workspaceOptions.length === 0,
        }}
      />
    </ChipModal>
  )
})
