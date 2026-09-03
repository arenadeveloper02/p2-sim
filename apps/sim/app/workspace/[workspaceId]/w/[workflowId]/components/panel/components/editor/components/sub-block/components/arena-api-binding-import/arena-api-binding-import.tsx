'use client'

import { Fragment, type ReactNode, useMemo, useState } from 'react'
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
  ChipTag,
} from '@sim/emcn'
import { X } from '@sim/emcn/icons'
import { getErrorMessage } from '@sim/utils/errors'
import { useParams } from 'next/navigation'
import { appendApiBinding, removeApiBinding } from '@/lib/arena-generative-ui/append-api-binding'
import {
  applyUnchangedOutputLayout,
  displayedBindingOutputSchema,
  emptyBindingFormState,
  formStateFromBinding,
} from '@/lib/arena-generative-ui/binding-form'
import { chatProtocolFromWorkflowFields } from '@/lib/arena-generative-ui/chat-protocol'
import {
  curlHasAuthHeader,
  curlLooksLikeStream,
  httpBindingFromCurl,
} from '@/lib/arena-generative-ui/from-curl'
import {
  extractOutputSchemaFromBlocks,
  inputSchemaFromWorkflowFields,
  workflowBindingFromSelection,
} from '@/lib/arena-generative-ui/from-workflow'
import {
  type ArenaGenerativeInputSourceOverride,
  bindingWithInputOverrides,
  briefHasEmailFormField,
  inputFieldRowNeedsValue,
  inputSourceOverridesForSave,
  isChatInputPrefixName,
  isEmailLikeApiInputName,
  isFormFacingInputSchemaField,
  resolveInputFieldEditorRow,
} from '@/lib/arena-generative-ui/input-schema'
import { outputSchemaFromSample } from '@/lib/arena-generative-ui/output-schema'
import { parseApiBindings } from '@/lib/arena-generative-ui/parse-inputs'
import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeInputSchemaField,
  ArenaGenerativeInputSource,
} from '@/lib/arena-generative-ui/types'
import { extractInputFieldsFromBlocks } from '@/lib/workflows/input-format'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-value'
import { useDeployedWorkflowState } from '@/hooks/queries/deployments'
import { useLastSuccessfulWorkflowOutputSchema } from '@/hooks/queries/workflow-last-run-output-schema'
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

const INPUT_SOURCE_OPTIONS = [
  { value: 'form', label: 'Form field' },
  { value: 'visitorEmail', label: 'Logged-in email' },
  { value: 'constant', label: 'Constant' },
] as const

function storedBindings(raw: unknown): ArenaGenerativeApiBinding[] {
  try {
    return parseApiBindings(raw)
  } catch {
    return []
  }
}

function sampleResponseHint(
  source: 'http' | 'workflow',
  workflowId: string,
  hasDeclaredOutput: boolean,
  stream: boolean
): string {
  if (source === 'workflow' && workflowId) {
    if (hasDeclaredOutput) {
      return stream
        ? 'Optional override. Paste the JSON you see in the network tab (ok/data wrappers are stripped), or markdown if you want streamed text to match a specific shape.'
        : 'Optional override. Paste the JSON you see in the network tab — ok/data wrappers are stripped. Field names and types are saved; values are discarded.'
    }
    return stream
      ? 'This workflow has no declared output format. Leave blank to show streamed text, or paste an example of the tokens so the generator can match that shape.'
      : 'This workflow has no declared output format. Paste the JSON you see in the network tab. ok/data wrappers are stripped. Only field names and types are saved.'
  }
  return stream
    ? 'Leave blank, or paste an example of the tokens (markdown is fine) so the generator can match that shape. Paste JSON only if the API also returns a structured object at the end.'
    : 'Paste the JSON you see in the network tab. Wrappers like ok and data are stripped. Only field names and types are saved — values are discarded.'
}

function schemaFromSamplePaste(
  sample: string,
  stream: boolean
): { fields: Array<{ name: string; type: string }>; error?: string } {
  const trimmed = sample.trim()
  if (!trimmed) {
    return { fields: [] }
  }
  try {
    return { fields: outputSchemaFromSample(trimmed) }
  } catch (caught) {
    if (stream) {
      return { fields: [] }
    }
    return { fields: [], error: getErrorMessage(caught, 'Output format must be valid JSON') }
  }
}

function briefFromSubBlocks(userInput: unknown, editInstructions: unknown): string {
  return [userInput, editInstructions]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
}

function SchemaFieldTags({ fields }: { fields: Array<{ name: string; type: string }> }) {
  return (
    <div className='flex flex-wrap gap-1'>
      {fields.map((field) => (
        <ChipTag key={field.name} variant='gray'>
          {field.name}: {field.type}
        </ChipTag>
      ))}
    </div>
  )
}

interface InputSourceFieldsProps {
  rows: ReturnType<typeof resolveInputFieldEditorRow>[]
  onSourceChange: (name: string, source: ArenaGenerativeInputSource) => void
  onConstantValueChange: (name: string, value: string) => void
}

function InputSourceFields({
  rows,
  onSourceChange,
  onConstantValueChange,
}: InputSourceFieldsProps) {
  return (
    <>
      {rows.map((row) => (
        <Fragment key={row.name}>
          {isChatInputPrefixName(row.name) ? (
            <ChipModalField
              type='input'
              title='input prefix'
              value={row.value}
              onChange={(value) => onConstantValueChange(row.name, value)}
              placeholder='Do a comprehensive research on '
              hint='Optional first-message prefix. The generated app will not show a field for this. Empty means the first form submit sends only name: value for the other inputs. Chat follow-ups use the composer text as-is.'
              mono
            />
          ) : (
            <>
              <ChipModalField
                type='dropdown'
                title={row.name}
                hint={
                  row.description
                    ? `${row.type} · ${row.description}`
                    : `${row.type}. Form field is typed in the app (including a lead's email). Logged-in email sends the signed-in user's address and is not a form field. Constant always sends the value you type.`
                }
                value={row.source}
                onChange={(value) => onSourceChange(row.name, value as ArenaGenerativeInputSource)}
                options={INPUT_SOURCE_OPTIONS}
              />
              {row.source === 'constant' ? (
                <ChipModalField
                  type='input'
                  title={`${row.name} value`}
                  value={row.value}
                  onChange={(value) => onConstantValueChange(row.name, value)}
                  required
                  placeholder='history'
                  hint='Sent on every CTA. The generated app will not show a field for this.'
                  error={
                    inputFieldRowNeedsValue(row) ? 'Enter a value for this constant.' : undefined
                  }
                  mono
                />
              ) : null}
            </>
          )}
        </Fragment>
      ))}
    </>
  )
}

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
  const [userInput] = useSubBlockValue<string>(blockId, 'userInput')
  const [editInstructions] = useSubBlockValue<string>(blockId, 'editInstructions')
  const briefHasEmail = briefHasEmailFormField(briefFromSubBlocks(userInput, editInstructions))
  const envVarKeys = useAvailableEnvVarKeys(workspaceId)
  const [open, setOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [source, setSource] = useState<'http' | 'workflow'>('http')
  const [key, setKey] = useState('')
  const [secretVar, setSecretVar] = useState('')
  const [curl, setCurl] = useState('')
  const [streamMode, setStreamMode] = useState<'off' | 'on'>('off')
  const [forwardEmail, setForwardEmail] = useState<'off' | 'on'>('off')
  const [outputSample, setOutputSample] = useState('')
  const [workflowId, setWorkflowId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [inputSourceOverrides, setInputSourceOverrides] = useState<
    Record<string, ArenaGenerativeInputSourceOverride>
  >({})

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
  const outputFields = useMemo(
    () => extractOutputSchemaFromBlocks(deployedState?.blocks),
    [deployedState?.blocks]
  )
  const sampleOutput = useMemo(
    () => schemaFromSamplePaste(outputSample, streamMode === 'on'),
    [outputSample, streamMode]
  )
  const savedBindings = storedBindings(storeValue)
  const editingBinding = editingKey
    ? (savedBindings.find((binding) => binding.key === editingKey) ?? null)
    : null
  const outputSchemaFromPaste =
    sampleOutput.fields.length > 0 ||
    Boolean(
      editingBinding && !outputSample.trim() && editingBinding.outputSchemaSource === 'sample'
    )
  const lastRunEnabled =
    open && source === 'workflow' && Boolean(workflowId) && !outputSchemaFromPaste
  const lastRunQuery = useLastSuccessfulWorkflowOutputSchema(workflowId || undefined, {
    enabled: lastRunEnabled,
  })
  const lastRunFields = lastRunQuery.data?.outputSchema ?? []
  const liveFields = lastRunEnabled && lastRunFields.length > 0 ? lastRunFields : outputFields
  const schemaWarnings =
    lastRunEnabled && (lastRunFields.length > 0 || lastRunQuery.data?.found === true)
      ? (lastRunQuery.data?.warnings ?? [])
      : []
  const lastRunLoading = lastRunEnabled && lastRunQuery.isFetching
  const displayedOutputSchema = displayedBindingOutputSchema({
    sampleFields: sampleOutput.fields,
    liveFields,
    savedSchema: editingBinding?.outputSchema,
    savedFromSample: outputSchemaFromPaste && sampleOutput.fields.length === 0,
  })
  const curlInputSchema = useMemo((): ArenaGenerativeInputSchemaField[] => {
    if (source !== 'http' || !curl.trim()) return []
    try {
      return httpBindingFromCurl({ key: key.trim() || 'preview', curl }).inputSchema ?? []
    } catch {
      return []
    }
  }, [source, curl, key])

  const editorInputSchema = source === 'workflow' ? inputSchema : curlInputSchema
  const workflowChatProtocol = useMemo(
    () => (source === 'workflow' ? chatProtocolFromWorkflowFields(inputFields) : undefined),
    [source, inputFields]
  )
  const taggedInputSchema =
    source === 'workflow'
      ? editorInputSchema.filter(isFormFacingInputSchemaField)
      : editorInputSchema
  const autoBindVisitorEmail = !briefHasEmail
  const editorRows = taggedInputSchema.map((field) =>
    resolveInputFieldEditorRow(field, inputSourceOverrides[field.name])
  )
  const prefixRow =
    workflowChatProtocol?.input === true
      ? resolveInputFieldEditorRow(
          { name: 'input', type: 'string', source: 'constant' },
          inputSourceOverrides.input ?? inputSourceOverrides.Input
        )
      : null
  const pickerRows = [
    ...(prefixRow ? [prefixRow] : []),
    ...editorRows.filter((row) => briefHasEmail || !isEmailLikeApiInputName(row.name)),
  ]
  const autoBoundEmailFields = editorInputSchema.filter(
    (field) => autoBindVisitorEmail && isEmailLikeApiInputName(field.name)
  )
  const constantsMissingValue = pickerRows.some((row) => inputFieldRowNeedsValue(row))

  const launcherDisabled = isPreview || disabled
  const canSave =
    key.trim().length > 0 &&
    !constantsMissingValue &&
    !sampleOutput.error &&
    (source === 'http' ? curl.trim().length > 0 : workflowId.trim().length > 0)

  function resetForm() {
    const empty = emptyBindingFormState()
    setEditingKey(null)
    setSource(empty.source)
    setKey(empty.key)
    setSecretVar(empty.secretVar)
    setCurl(empty.curl)
    setStreamMode(empty.streamMode)
    setForwardEmail(empty.forwardEmail)
    setOutputSample(empty.outputSample)
    setWorkflowId(empty.workflowId)
    setError(null)
    setInputSourceOverrides({})
  }

  function applyFormState(form: ReturnType<typeof formStateFromBinding>) {
    setSource(form.source)
    setKey(form.key)
    setSecretVar(form.secretVar)
    setCurl(form.curl)
    setStreamMode(form.streamMode)
    setForwardEmail(form.forwardEmail)
    setOutputSample(form.outputSample)
    setWorkflowId(form.workflowId)
    setError(null)
    setInputSourceOverrides(form.inputSourceOverrides)
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      resetForm()
    }
  }

  function handleEdit(binding: ArenaGenerativeApiBinding) {
    if (launcherDisabled) return
    setEditingKey(binding.key)
    applyFormState(formStateFromBinding(binding))
    setOpen(true)
  }

  function handleAdd() {
    if (launcherDisabled) return
    resetForm()
    setOpen(true)
  }

  function handleInputSourceChange(name: string, nextSource: ArenaGenerativeInputSource) {
    if (isChatInputPrefixName(name)) return
    setInputSourceOverrides((previous) => ({
      ...previous,
      [name]: {
        source: nextSource,
        value: previous[name]?.value,
      },
    }))
  }

  function handleConstantValueChange(name: string, value: string) {
    setInputSourceOverrides((previous) => ({
      ...previous,
      [name]: { source: 'constant', value },
    }))
  }

  function handleSave() {
    try {
      const built =
        source === 'workflow'
          ? workflowBindingFromSelection({
              key,
              workflowId,
              label: selectedWorkflow?.name ?? editingBinding?.label,
              inputFields,
              outputFields: liveFields,
              outputSchemaWarnings: schemaWarnings,
              outputSample,
              stream: streamMode === 'on',
            })
          : buildHttpBinding()
      const brief = briefFromSubBlocks(userInput, editInstructions)
      const overrides = inputSourceOverridesForSave(editorInputSchema, brief, inputSourceOverrides)
      const binding = applyUnchangedOutputLayout(
        bindingWithInputOverrides(built, overrides),
        editingBinding ?? undefined,
        outputSample
      )
      let nextValue = storeValue ?? ''
      if (editingKey && editingKey !== binding.key) {
        nextValue = removeApiBinding(nextValue, editingKey)
      }
      setStoreValue(appendApiBinding(nextValue, binding))
      handleOpenChange(false)
    } catch (caught) {
      setError(getErrorMessage(caught, 'Could not save API binding'))
    }
  }

  function handleRemove(bindingKey: string) {
    try {
      setStoreValue(removeApiBinding(storeValue ?? '', bindingKey))
      if (editingKey === bindingKey) {
        handleOpenChange(false)
      }
    } catch (caught) {
      setError(getErrorMessage(caught, 'Could not remove API binding'))
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

  const showWorkflowInputs = source === 'workflow' && Boolean(workflowId)
  const showHttpInputs = source === 'http' && curlInputSchema.length > 0

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-center gap-1'>
        <Chip onClick={handleAdd} disabled={launcherDisabled}>
          Add an API
        </Chip>
        {savedBindings.map((binding) => (
          <ChipTag
            key={binding.key}
            variant='invite'
            className={launcherDisabled ? undefined : 'cursor-pointer'}
            role={launcherDisabled ? undefined : 'button'}
            tabIndex={launcherDisabled ? undefined : 0}
            title={`Edit ${binding.key}`}
            onClick={launcherDisabled ? undefined : () => handleEdit(binding)}
            onKeyDown={
              launcherDisabled
                ? undefined
                : (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleEdit(binding)
                    }
                  }
            }
            rightIcon={X}
            rightIconLabel={`Remove ${binding.key}`}
            rightIconDisabled={launcherDisabled}
            onRightIconClick={(event) => {
              event.stopPropagation()
              handleRemove(binding.key)
            }}
          >
            {binding.key}
          </ChipTag>
        ))}
      </div>
      {savedBindings.some((binding) => (binding.outputSchema?.length ?? 0) > 0) ? (
        <div className='flex flex-col gap-2'>
          {savedBindings.map((binding) =>
            binding.outputSchema && binding.outputSchema.length > 0 ? (
              <div key={`${binding.key}-output-schema`} className='flex flex-col gap-1'>
                <p className='text-[var(--text-secondary)] text-caption'>
                  {binding.key} output schema
                </p>
                <SchemaFieldTags fields={binding.outputSchema} />
                {binding.outputSchemaWarnings?.map((warning) => (
                  <p key={warning} className='text-[var(--text-secondary)] text-caption'>
                    {warning}
                  </p>
                ))}
              </div>
            ) : null
          )}
        </div>
      ) : null}
      {children}
      <ChipModal
        open={open}
        onOpenChange={handleOpenChange}
        srTitle={editingKey ? `Edit ${editingKey}` : 'Add an API'}
        size='lg'
      >
        <ChipModalHeader onClose={() => handleOpenChange(false)}>
          {editingKey ? `Edit ${editingKey}` : 'Add an API'}
        </ChipModalHeader>
        <ChipModalBody>
          <ChipModalField
            type='custom'
            title='Source'
            hint='Call a deployed workflow in this workspace, or an external HTTP endpoint.'
          >
            <ChipSwitch
              value={source}
              onChange={(value) => {
                setSource(value)
                setInputSourceOverrides({})
              }}
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
                    onChange={(value) => {
                      setWorkflowId(value)
                      setInputSourceOverrides({})
                    }}
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
              {showWorkflowInputs && deployedLoading ? (
                <ChipModalField
                  type='custom'
                  title='Inputs'
                  hint='Read from the deployed start block. Write User Input first if the form collects an email.'
                >
                  <p className='text-[var(--text-secondary)] text-caption'>
                    Reading the deployed start block…
                  </p>
                </ChipModalField>
              ) : null}
              {showWorkflowInputs && !deployedLoading && taggedInputSchema.length === 0 ? (
                <ChipModalField
                  type='custom'
                  title='Inputs'
                  hint={
                    workflowChatProtocol
                      ? 'Reserved Start fields are optional. Chat fills input, conversationId, and files.'
                      : 'Read from the deployed start block. Form values are still sent as-is.'
                  }
                >
                  <p className='text-[var(--text-secondary)] text-caption'>
                    {workflowChatProtocol
                      ? 'This workflow only declares reserved Start fields (input, conversationId, files). They are optional — the Chat composer fills them. Add an optional input prefix below if the first message should start with fixed text.'
                      : 'This workflow declares no start inputs. Form values are still sent as-is.'}
                  </p>
                </ChipModalField>
              ) : null}
              {showWorkflowInputs && !deployedLoading && taggedInputSchema.length > 0 ? (
                <ChipModalField
                  type='custom'
                  title='Inputs'
                  hint={
                    autoBoundEmailFields.length > 0
                      ? 'Read from the deployed start block. Filled with the signed-in address because User Input has no email field.'
                      : 'Read from the deployed start block. Choose how each param is filled.'
                  }
                >
                  <SchemaFieldTags fields={taggedInputSchema} />
                </ChipModalField>
              ) : null}
              {showWorkflowInputs && !deployedLoading && pickerRows.length > 0 ? (
                <InputSourceFields
                  rows={pickerRows}
                  onSourceChange={handleInputSourceChange}
                  onConstantValueChange={handleConstantValueChange}
                />
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
              {showHttpInputs ? (
                <ChipModalField
                  type='custom'
                  title='Inputs'
                  hint={
                    autoBoundEmailFields.length > 0
                      ? 'Read from the curl JSON body. Filled with the signed-in address because User Input has no email field.'
                      : 'Read from the curl JSON body. Choose how each param is filled.'
                  }
                >
                  <SchemaFieldTags fields={curlInputSchema} />
                </ChipModalField>
              ) : null}
              {showHttpInputs && pickerRows.length > 0 ? (
                <InputSourceFields
                  rows={pickerRows}
                  onSourceChange={handleInputSourceChange}
                  onConstantValueChange={handleConstantValueChange}
                />
              ) : null}
              <ChipModalField
                type='custom'
                title='arenaEmailId'
                hint='Adds a separate arenaEmailId key with the signed-in address. Does not fill a form field named email. Off unless this endpoint needs it — it leaves your workspace.'
              >
                <ChipSwitch
                  value={forwardEmail}
                  onChange={setForwardEmail}
                  aria-label='Send arenaEmailId'
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
            title='Sample response (optional)'
            value={outputSample}
            onChange={setOutputSample}
            placeholder={
              streamMode === 'on'
                ? '# Company analysis\n\n## Summary\n...'
                : `{"articles":[{"title":"Example","url":"https://example.com"}]}`
            }
            hint={sampleResponseHint(
              source,
              workflowId,
              liveFields.length > 0,
              streamMode === 'on'
            )}
            error={sampleOutput.error}
            rows={6}
            minHeight={120}
            resizable
            mono
          />
          {(source === 'workflow' && Boolean(workflowId)) ||
          displayedOutputSchema.length > 0 ||
          Boolean(sampleOutput.error) ? (
            <ChipModalField
              type='custom'
              title='Output schema'
              hint={
                outputSchemaFromPaste
                  ? sampleOutput.fields.length > 0
                    ? 'Derived from the JSON you pasted. Wrappers like ok and data are ignored. Generate and edit keep this instead of the deployed workflow schema.'
                    : 'Saved from the JSON you pasted earlier. Leave Sample blank to keep it, or paste a new body to replace it.'
                  : deployedLoading || lastRunLoading
                    ? lastRunLoading
                      ? 'Reading the last successful run…'
                      : 'Fetched from the deployed Response block or Agent structured output.'
                    : lastRunEnabled && lastRunFields.length > 0
                      ? 'From the last successful run. Generate and edit re-read this. Field names and types only — run values are discarded. Paste a Sample to override.'
                      : displayedOutputSchema.length > 0
                        ? 'Fetched from the deployed Response block or Agent structured output. Generate and edit re-read this so a new deploy is picked up without saving again.'
                        : 'Paste a sample JSON above. The tags here should list collection paths such as run_data.history after a successful paste.'
              }
            >
              {deployedLoading && !outputSchemaFromPaste && !lastRunLoading ? (
                <p className='text-[var(--text-secondary)] text-caption'>
                  Reading the deployed workflow…
                </p>
              ) : lastRunLoading && !outputSchemaFromPaste ? (
                <p className='text-[var(--text-secondary)] text-caption'>
                  Reading the last successful run…
                </p>
              ) : displayedOutputSchema.length > 0 ? (
                <div className='flex flex-col gap-1'>
                  <SchemaFieldTags fields={displayedOutputSchema} />
                  {schemaWarnings.map((warning) => (
                    <p key={warning} className='text-[var(--text-secondary)] text-caption'>
                      {warning}
                    </p>
                  ))}
                </div>
              ) : (
                <div className='flex flex-col gap-1'>
                  <p className='text-[var(--text-secondary)] text-caption'>
                    No output schema yet. Paste the network JSON in Sample response — you should see
                    history, keyword, and client as tags.
                  </p>
                  {schemaWarnings.map((warning) => (
                    <p key={warning} className='text-[var(--text-secondary)] text-caption'>
                      {warning}
                    </p>
                  ))}
                </div>
              )}
            </ChipModalField>
          ) : null}
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
