'use client'

import { type ReactNode, useMemo, useState } from 'react'
import {
  Chip,
  ChipCombobox,
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  ChipSwitch,
} from '@sim/emcn'
import { getErrorMessage } from '@sim/utils/errors'
import { useParams } from 'next/navigation'
import { appendApiBinding } from '@/lib/arena-generative-ui/append-api-binding'
import {
  curlHasAuthHeader,
  curlLooksLikeStream,
  httpBindingFromCurl,
} from '@/lib/arena-generative-ui/from-curl'
import {
  inputSchemaFromWorkflowFields,
  workflowBindingFromSelection,
} from '@/lib/arena-generative-ui/from-workflow'
import { extractInputFieldsFromBlocks } from '@/lib/workflows/input-format'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-value'
import { useDeployedWorkflowState } from '@/hooks/queries/deployments'
import { useWorkflows } from '@/hooks/queries/workflows'
import { useAvailableEnvVarKeys } from '@/hooks/use-available-env-vars'

const STREAM_SWITCH_OPTIONS = [
  { value: 'off', label: 'JSON' },
  { value: 'on', label: 'Stream' },
] as const

const SOURCE_SWITCH_OPTIONS = [
  { value: 'http', label: 'HTTP (curl)' },
  { value: 'workflow', label: 'Workflow' },
] as const

const FORWARD_EMAIL_SWITCH_OPTIONS = [
  { value: 'off', label: "Don't send" },
  { value: 'on', label: 'Send' },
] as const

interface ArenaApiBindingImportHelperProps {
  blockId: string
  subBlockId: string
  isPreview?: boolean
  disabled?: boolean
  children: ReactNode
}

/**
 * Canvas-only helper that turns a curl command or a deployed workflow into API
 * Bindings JSON. Writes the existing `apiBindings` code field; does not persist
 * extra sub-block state.
 */
export function ArenaApiBindingImportHelper({
  blockId,
  subBlockId,
  isPreview = false,
  disabled = false,
  children,
}: ArenaApiBindingImportHelperProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [storeValue, setStoreValue] = useSubBlockValue<string>(blockId, subBlockId)
  const envVarKeys = useAvailableEnvVarKeys(workspaceId)
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<'http' | 'workflow'>('http')
  const [key, setKey] = useState('')
  const [secretVar, setSecretVar] = useState('')
  const [curl, setCurl] = useState('')
  const [streamMode, setStreamMode] = useState<'off' | 'on'>('off')
  const [forwardEmail, setForwardEmail] = useState<'off' | 'on'>('off')
  const [outputSample, setOutputSample] = useState('')
  const [workflowId, setWorkflowId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: workflows, isLoading: workflowsLoading } = useWorkflows(workspaceId, {
    enabled: open && source === 'workflow',
  })
  /**
   * The deployed snapshot, not the draft: a CTA executes the deployed version, so the
   * draft's start block could advertise inputs the running workflow does not accept.
   */
  const { data: deployedState, isLoading: deployedLoading } = useDeployedWorkflowState(
    workflowId || null,
    { enabled: open && source === 'workflow' && Boolean(workflowId) }
  )

  const envOptions = useMemo(() => {
    if (!envVarKeys) return []
    return [...envVarKeys]
      .sort((left, right) => left.localeCompare(right))
      .map((name) => ({ label: name, value: name }))
  }, [envVarKeys])

  const workflowOptions = useMemo(
    () =>
      [...(workflows ?? [])]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((workflow) => ({
          value: workflow.id,
          label: workflow.isDeployed ? workflow.name : `${workflow.name} — not deployed`,
        })),
    [workflows]
  )

  const selectedWorkflow = useMemo(
    () => (workflows ?? []).find((workflow) => workflow.id === workflowId),
    [workflows, workflowId]
  )
  const inputFields = useMemo(
    () => extractInputFieldsFromBlocks(deployedState?.blocks),
    [deployedState?.blocks]
  )
  const inputSchema = useMemo(() => inputSchemaFromWorkflowFields(inputFields), [inputFields])

  const launcherDisabled = isPreview || disabled
  const canSave =
    key.trim().length > 0 &&
    (source === 'http' ? curl.trim().length > 0 : workflowId.trim().length > 0)

  function resetForm() {
    setSource('http')
    setKey('')
    setSecretVar('')
    setCurl('')
    setStreamMode('off')
    setForwardEmail('off')
    setOutputSample('')
    setWorkflowId('')
    setError(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      resetForm()
    }
  }

  function handleSave() {
    try {
      const binding =
        source === 'workflow'
          ? workflowBindingFromSelection({
              key,
              workflowId,
              label: selectedWorkflow?.name,
              inputFields,
              outputSample,
              stream: streamMode === 'on',
            })
          : buildHttpBinding()
      setStoreValue(appendApiBinding(storeValue ?? '', binding))
      handleOpenChange(false)
    } catch (caught) {
      setError(getErrorMessage(caught, 'Could not add API binding'))
    }
  }

  function buildHttpBinding() {
    if (curlHasAuthHeader(curl) && !secretVar.trim()) {
      throw new Error('This curl sets an auth header. Select a Secret var — do not paste the key.')
    }
    const binding = httpBindingFromCurl({
      key,
      curl,
      headersSecretName: secretVar,
      stream: streamMode === 'on',
      outputSample,
    })
    return forwardEmail === 'on' ? { ...binding, forwardEmailId: true } : binding
  }

  return (
    <div className='flex flex-col gap-2'>
      <Chip onClick={() => setOpen(true)} disabled={launcherDisabled}>
        Add an API
      </Chip>
      {children}
      <ChipModal open={open} onOpenChange={handleOpenChange} srTitle='Add an API' size='lg'>
        <ChipModalHeader onClose={() => handleOpenChange(false)}>Add an API</ChipModalHeader>
        <ChipModalBody>
          <ChipModalField
            type='custom'
            title='Source'
            hint='Call a deployed workflow in this workspace, or an external HTTP endpoint.'
          >
            <ChipSwitch
              value={source}
              onChange={setSource}
              aria-label='Binding source'
              options={SOURCE_SWITCH_OPTIONS}
            />
          </ChipModalField>
          <ChipModalField
            type='input'
            title='Key'
            value={key}
            onChange={setKey}
            required
            placeholder='recommend_articles'
            hint='Use this same key in User Input for the CTA.'
            mono
          />
          {source === 'workflow' ? (
            <>
              <ChipModalField
                type='custom'
                title='Workflow'
                required
                hint='The CTA runs the deployed version of this workflow.'
              >
                {(aria) => (
                  <ChipCombobox
                    value={workflowId}
                    onChange={setWorkflowId}
                    options={workflowOptions}
                    placeholder='Select a workflow'
                    isLoading={workflowsLoading}
                    inputProps={aria}
                  />
                )}
              </ChipModalField>
              {selectedWorkflow && selectedWorkflow.isDeployed === false ? (
                <ChipModalField
                  type='custom'
                  title='Not deployed'
                  hint='Deploy this workflow before launching the app. The CTA fails until you do, and Launch GUI App will block.'
                >
                  <p className='text-[var(--text-secondary)] text-caption'>
                    {selectedWorkflow.name} has no active deployment.
                  </p>
                </ChipModalField>
              ) : null}
              {workflowId ? (
                <ChipModalField
                  type='custom'
                  title='Inputs'
                  hint='Read from the deployed start block. Saved as inputSchema so the generator knows which fields to collect.'
                >
                  <p className='text-[var(--text-secondary)] text-caption'>
                    {deployedLoading
                      ? 'Reading the deployed start block…'
                      : inputSchema.length > 0
                        ? inputSchema.map((field) => `${field.name}: ${field.type}`).join(', ')
                        : 'This workflow declares no start inputs. Form values are still sent as-is.'}
                  </p>
                </ChipModalField>
              ) : null}
            </>
          ) : (
            <>
              <ChipModalField
                type='custom'
                title='Secret var'
                hint='Workspace or personal env var name. Do not paste the secret.'
              >
                {(aria) => (
                  <ChipCombobox
                    value={secretVar}
                    onChange={setSecretVar}
                    options={envOptions}
                    placeholder='Select or type an env var name'
                    editable
                    isLoading={envVarKeys === undefined}
                    inputProps={aria}
                  />
                )}
              </ChipModalField>
              <ChipModalField
                type='textarea'
                title='Curl'
                value={curl}
                onChange={(value) => {
                  setCurl(value)
                  if (curlLooksLikeStream(value)) {
                    setStreamMode('on')
                  }
                }}
                required
                placeholder={`curl -X POST -d '{"input":"example"}' https://example.com/execute`}
                hint='Paste a curl command. Auth headers are ignored; use Secret var instead.'
                rows={8}
                minHeight={160}
                resizable
                mono
              />
              <ChipModalField
                type='custom'
                title="Visitor's email"
                hint='Sends the unverified Arena emailId as arenaEmailId. Off unless this endpoint needs it — it leaves your workspace.'
              >
                <ChipSwitch
                  value={forwardEmail}
                  onChange={setForwardEmail}
                  aria-label="Forward the visitor's email"
                  options={FORWARD_EMAIL_SWITCH_OPTIONS}
                />
              </ChipModalField>
            </>
          )}
          <ChipModalField
            type='custom'
            title='Response'
            hint='Stream shows live tokens. JSON waits for the full body.'
          >
            <ChipSwitch
              value={streamMode}
              onChange={setStreamMode}
              aria-label='Response mode'
              options={STREAM_SWITCH_OPTIONS}
            />
          </ChipModalField>
          <ChipModalField
            type='textarea'
            title='Output format'
            value={outputSample}
            onChange={setOutputSample}
            placeholder={`{"articles":[{"title":"Example","url":"https://example.com"}]}`}
            hint='Paste a sample response so the generator can lay out the result. Only field names and types are saved — values are discarded.'
            rows={6}
            minHeight={120}
            resizable
            mono
          />
          <ChipModalError>{error}</ChipModalError>
        </ChipModalBody>
        <ChipModalFooter
          onCancel={() => handleOpenChange(false)}
          primaryAction={{
            label: 'Save',
            onClick: handleSave,
            disabled: !canSave,
          }}
        />
      </ChipModal>
    </div>
  )
}
