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
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-value'
import { useAvailableEnvVarKeys } from '@/hooks/use-available-env-vars'

const STREAM_SWITCH_OPTIONS = [
  { value: 'off', label: 'JSON' },
  { value: 'on', label: 'Stream' },
] as const

interface ArenaApiBindingImportHelperProps {
  blockId: string
  subBlockId: string
  isPreview?: boolean
  disabled?: boolean
  children: ReactNode
}

/**
 * Canvas-only helper that turns a curl command into API Bindings JSON.
 * Writes the existing `apiBindings` code field; does not persist extra sub-block state.
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
  const [key, setKey] = useState('')
  const [secretVar, setSecretVar] = useState('')
  const [curl, setCurl] = useState('')
  const [streamMode, setStreamMode] = useState<'off' | 'on'>('off')
  const [error, setError] = useState<string | null>(null)

  const envOptions = useMemo(() => {
    if (!envVarKeys) return []
    return [...envVarKeys]
      .sort((left, right) => left.localeCompare(right))
      .map((name) => ({ label: name, value: name }))
  }, [envVarKeys])

  const launcherDisabled = isPreview || disabled
  const canSave = key.trim().length > 0 && curl.trim().length > 0

  function resetForm() {
    setKey('')
    setSecretVar('')
    setCurl('')
    setStreamMode('off')
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
      if (curlHasAuthHeader(curl) && !secretVar.trim()) {
        setError('This curl sets an auth header. Select a Secret var — do not paste the key.')
        return
      }
      const binding = httpBindingFromCurl({
        key,
        curl,
        headersSecretName: secretVar,
        stream: streamMode === 'on',
      })
      setStoreValue(appendApiBinding(storeValue ?? '', binding))
      handleOpenChange(false)
    } catch (caught) {
      setError(getErrorMessage(caught, 'Could not add API binding'))
    }
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
            type='input'
            title='Key'
            value={key}
            onChange={setKey}
            required
            placeholder='recommend_articles'
            hint='Use this same key in User Input for the CTA.'
            mono
          />
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
