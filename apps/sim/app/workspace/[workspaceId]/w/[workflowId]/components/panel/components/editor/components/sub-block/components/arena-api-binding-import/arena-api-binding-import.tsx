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
  applyInputSourceOverrides,
  briefHasEmailFormField,
  inputFieldRowNeedsValue,
  inputSourceOverridesForSave,
  isEmailLikeApiInputName,
  resolveInputFieldEditorRow,
} from '@/lib/arena-generative-ui/input-schema'
import { outputSchemaRootName } from '@/lib/arena-generative-ui/output-schema'
import { parseApiBindings } from '@/lib/arena-generative-ui/parse-inputs'
import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeInputSchemaField,
  ArenaGenerativeInputSource,
} from '@/lib/arena-generative-ui/types'
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

function outputPreviewTags(fields: Array<{ name: string; type: string }>): Array<{
  name: string
  type: string
}> {
  const seen = new Set<string>()
  const tags: Array<{ name: string; type: string }> = []
  for (const field of fields) {
    const root = outputSchemaRootName(field.name)
    if (!root || seen.has(root)) continue
    seen.add(root)
    tags.push({ name: root, type: field.type })
  }
  return tags
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
        ? 'Optional override. Paste JSON only if the live response differs from the declared schema, or markdown if you want streamed text to match a specific shape.'
        : 'Optional override. Paste a sample only if the live response differs from the declared schema. Only field names and types are saved.'
    }
    return stream
      ? 'This workflow has no declared output format. Leave blank to show streamed text, or paste an example of the tokens so the generator can match that shape.'
      : 'This workflow has no declared output format. Paste a sample JSON so the generator can lay out tables and stats instead of a single text blob. Only field names and types are saved — values are discarded.'
  }
  return stream
    ? 'Leave blank, or paste an example of the tokens (markdown is fine) so the generator can match that shape. Paste JSON only if the API also returns a structured object at the end.'
    : 'Paste a sample response so the generator can lay out the result. Only field names and types are saved — values are discarded.'
}

function bindingWithInputOverrides(
  binding: ArenaGenerativeApiBinding,
  overrides: Record<string, ArenaGenerativeInputSourceOverride>
): ArenaGenerativeApiBinding {
  if (!binding.inputSchema?.length) {
    return binding
  }
  return {
    ...binding,
    inputSchema: applyInputSourceOverrides(binding.inputSchema, overrides),
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
              error={inputFieldRowNeedsValue(row) ? 'Enter a value for this constant.' : undefined}
              mono
            />
          ) : null}
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
  const curlInputSchema = useMemo((): ArenaGenerativeInputSchemaField[] => {
    if (source !== 'http' || !curl.trim()) return []
    try {
      return httpBindingFromCurl({ key: key.trim() || 'preview', curl }).inputSchema ?? []
    } catch {
      return []
    }
  }, [source, curl, key])

  const editorInputSchema = source === 'workflow' ? inputSchema : curlInputSchema
  const autoBindVisitorEmail = !briefHasEmail
  const editorRows = editorInputSchema.map((field) =>
    resolveInputFieldEditorRow(field, inputSourceOverrides[field.name])
  )
  const pickerRows = editorRows.filter((row) => briefHasEmail || !isEmailLikeApiInputName(row.name))
  const autoBoundEmailFields = editorInputSchema.filter(
    (field) => autoBindVisitorEmail && isEmailLikeApiInputName(field.name)
  )
  const constantsMissingValue = pickerRows.some((row) => inputFieldRowNeedsValue(row))

  const launcherDisabled = isPreview || disabled
  const canSave =
    key.trim().length > 0 &&
    !constantsMissingValue &&
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
    setInputSourceOverrides({})
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      resetForm()
    }
  }

  function handleInputSourceChange(name: string, nextSource: ArenaGenerativeInputSource) {
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
      const binding =
        source === 'workflow'
          ? workflowBindingFromSelection({
              key,
              workflowId,
              label: selectedWorkflow?.name,
              inputFields,
              outputFields,
              outputSample,
              stream: streamMode === 'on',
            })
          : buildHttpBinding()
      const brief = briefFromSubBlocks(userInput, editInstructions)
      const overrides = inputSourceOverridesForSave(editorInputSchema, brief, inputSourceOverrides)
      setStoreValue(
        appendApiBinding(storeValue ?? '', bindingWithInputOverrides(binding, overrides))
      )
      handleOpenChange(false)
    } catch (caught) {
      setError(getErrorMessage(caught, 'Could not add API binding'))
    }
  }

  function handleRemove(bindingKey: string) {
    try {
      setStoreValue(removeApiBinding(storeValue ?? '', bindingKey))
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

  const outputTags = outputPreviewTags(outputFields)
  const showWorkflowInputs = source === 'workflow' && Boolean(workflowId)
  const showHttpInputs = source === 'http' && curlInputSchema.length > 0
  const savedBindings = storedBindings(storeValue)

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-center gap-1'>
        <Chip onClick={() => setOpen(true)} disabled={launcherDisabled}>
          Add an API
        </Chip>
        {savedBindings.map((binding) => (
          <ChipTag
            key={binding.key}
            variant='invite'
            rightIcon={X}
            rightIconLabel={`Remove ${binding.key}`}
            rightIconDisabled={launcherDisabled}
            onRightIconClick={() => handleRemove(binding.key)}
          >
            {binding.key}
          </ChipTag>
        ))}
      </div>
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
              {showWorkflowInputs && !deployedLoading && inputSchema.length === 0 ? (
                <ChipModalField
                  type='custom'
                  title='Inputs'
                  hint='Read from the deployed start block. Form values are still sent as-is.'
                >
                  <p className='text-[var(--text-secondary)] text-caption'>
                    This workflow declares no start inputs. Form values are still sent as-is.
                  </p>
                </ChipModalField>
              ) : null}
              {showWorkflowInputs && !deployedLoading && inputSchema.length > 0 ? (
                <ChipModalField
                  type='custom'
                  title='Inputs'
                  hint={
                    autoBoundEmailFields.length > 0
                      ? 'Read from the deployed start block. Filled with the signed-in address because User Input has no email field.'
                      : 'Read from the deployed start block. Choose how each param is filled.'
                  }
                >
                  <SchemaFieldTags fields={inputSchema} />
                </ChipModalField>
              ) : null}
              {showWorkflowInputs && !deployedLoading && pickerRows.length > 0 ? (
                <InputSourceFields
                  rows={pickerRows}
                  onSourceChange={handleInputSourceChange}
                  onConstantValueChange={handleConstantValueChange}
                />
              ) : null}
              {source === 'workflow' && workflowId ? (
                <ChipModalField
                  type='custom'
                  title='Outputs'
                  hint={
                    deployedLoading
                      ? 'Read from the deployed Response block or Agent structured output.'
                      : outputTags.length > 0
                        ? 'Read from the deployed Response block or Agent structured output. Saved as outputSchema so the generator can lay out the result.'
                        : 'This workflow does not declare an output format. For better results, paste a sample JSON in Sample response below.'
                  }
                >
                  {deployedLoading ? (
                    <p className='text-[var(--text-secondary)] text-caption'>
                      Reading the deployed workflow…
                    </p>
                  ) : outputTags.length > 0 ? (
                    <SchemaFieldTags fields={outputTags} />
                  ) : (
                    <p className='text-[var(--text-secondary)] text-caption'>
                      {streamMode === 'on'
                        ? 'No output format is available for this workflow. Leave blank to show streamed text, or paste an example below.'
                        : 'No output format is available for this workflow. Paste a sample JSON below so the generator can lay out tables and stats instead of a single text blob.'}
                    </p>
                  )}
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
              outputFields.length > 0,
              streamMode === 'on'
            )}
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
