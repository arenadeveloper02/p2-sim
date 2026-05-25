'use client'

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useParams } from 'next/navigation'
import { Button, Combobox } from '@/components/emcn/components'
import { consumeOAuthReturnContext, writeOAuthReturnContext } from '@/lib/credentials/client-state'
import {
  getCanonicalScopesForProvider,
  getProviderIdFromServiceId,
  OAUTH_PROVIDERS,
  type OAuthProvider,
  parseProvider,
} from '@/lib/oauth'
import { getMissingRequiredScopes } from '@/lib/oauth/utils'
import { OAuthModal } from '@/app/workspace/[workspaceId]/components/oauth-modal'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-value'
import type { SubBlockConfig } from '@/blocks/types'
import { useOAuthCredentials } from '@/hooks/queries/oauth/oauth-credentials'
import { useCredentialRefreshTriggers } from '@/hooks/use-credential-refresh-triggers'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'

const GOOGLE_ADS_SERVICE_ID = 'google-ads'
const CONNECT_ACCOUNT_VALUE = '__connect_account__'
const OAUTH_CREDENTIAL_SUB_BLOCK_ID = 'oauthCredential'
const CUSTOMER_ID_SUB_BLOCK_ID = 'customerId'
const DEVELOPER_TOKEN_SUB_BLOCK_ID = 'developerToken'
const LEGACY_ACCOUNTS_SUB_BLOCK_ID = 'accounts'

interface GoogleAdsV1AccountInputProps {
  blockId: string
  subBlock: SubBlockConfig
  disabled?: boolean
  isPreview?: boolean
  previewValue?: string | null
}

/**
 * Admin-workspace Google Ads account picker (matches oauth-input / CredentialSelector UX).
 */
export function GoogleAdsV1AccountInput({
  blockId,
  subBlock,
  disabled = false,
  isPreview = false,
  previewValue,
}: GoogleAdsV1AccountInputProps) {
  const params = useParams()
  const workspaceId = (params?.workspaceId as string) || ''
  const { activeWorkflowId } = useWorkflowRegistry()
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [showOAuthModal, setShowOAuthModal] = useState(false)
  const preConnectCountRef = useRef(0)

  const [oauthCredential, setOauthCredential] = useSubBlockValue<string | null>(
    blockId,
    OAUTH_CREDENTIAL_SUB_BLOCK_ID
  )
  const [customerId, setCustomerId] = useSubBlockValue<string | null>(
    blockId,
    CUSTOMER_ID_SUB_BLOCK_ID
  )
  const [, setLegacyAccounts] = useSubBlockValue<string | null>(
    blockId,
    LEGACY_ACCOUNTS_SUB_BLOCK_ID
  )
  const [developerToken] = useSubBlockValue<string | null>(blockId, DEVELOPER_TOKEN_SUB_BLOCK_ID)

  const effectiveProviderId = getProviderIdFromServiceId(GOOGLE_ADS_SERVICE_ID) as OAuthProvider
  const requiredScopes = subBlock.requiredScopes ?? []
  const placeholder = subBlock.placeholder ?? 'Select Google Ads account'

  const {
    data: credentials = [],
    isFetching: credentialsLoading,
    refetch: refetchCredentials,
  } = useOAuthCredentials(effectiveProviderId, {
    enabled: Boolean(effectiveProviderId),
    workspaceId,
    workflowId: activeWorkflowId || undefined,
  })

  useCredentialRefreshTriggers(refetchCredentials, effectiveProviderId, workspaceId)

  const effectiveValue =
    isPreview && previewValue !== undefined ? previewValue : oauthCredential
  const selectedCredentialId = typeof effectiveValue === 'string' ? effectiveValue : ''

  const selectedCredential = useMemo(
    () => credentials.find((cred) => cred.id === selectedCredentialId),
    [credentials, selectedCredentialId]
  )

  const missingRequiredScopes = selectedCredential
    ? getMissingRequiredScopes(selectedCredential, requiredScopes)
    : []
  const needsUpdate = missingRequiredScopes.length > 0 && !disabled && !credentialsLoading

  const resolvePrimaryCustomerId = useCallback(async (credentialId: string) => {
    const url = new URL('/api/google-ads/customers', window.location.origin)
    url.searchParams.set('credentialId', credentialId)
    const token =
      typeof developerToken === 'string' ? developerToken.trim() : ''
    if (token) {
      url.searchParams.set('developerToken', token)
    }
    const response = await fetch(url.toString())
    const text = await response.text()
    if (!response.ok) {
      return null
    }
    const trimmed = text.trim()
    if (!trimmed || trimmed.startsWith('<')) {
      return null
    }
    try {
      const data = JSON.parse(trimmed) as { customers?: Array<{ id: string }> }
      const customers = data.customers ?? []
      return customers[0]?.id ?? null
    } catch {
      return null
    }
  }, [developerToken])

  const applyCredentialSelection = useCallback(
    async (credentialId: string) => {
      if (isPreview) return
      setOauthCredential(credentialId)
      setLegacyAccounts(null)
      const resolvedCustomerId = await resolvePrimaryCustomerId(credentialId)
      if (resolvedCustomerId) {
        setCustomerId(resolvedCustomerId)
      }
    },
    [
      isPreview,
      resolvePrimaryCustomerId,
      setCustomerId,
      setLegacyAccounts,
      setOauthCredential,
    ]
  )

  useEffect(() => {
    if (!selectedCredentialId || isPreview) return
    const existing =
      typeof customerId === 'string' ? customerId.trim() : ''
    if (existing) return

    void resolvePrimaryCustomerId(selectedCredentialId).then((resolvedCustomerId) => {
      if (resolvedCustomerId) {
        setCustomerId(resolvedCustomerId)
      }
    })
  }, [
    selectedCredentialId,
    isPreview,
    customerId,
    resolvePrimaryCustomerId,
    setCustomerId,
  ])

  useEffect(() => {
    if (credentials.length > preConnectCountRef.current && !selectedCredentialId) {
      const newest = credentials[credentials.length - 1]
      if (newest) {
        void applyCredentialSelection(newest.id)
      }
    }
    preConnectCountRef.current = credentials.length
  }, [applyCredentialSelection, credentials, selectedCredentialId])

  const getProviderIcon = useCallback((provider: OAuthProvider) => {
    const { baseProvider } = parseProvider(provider)
    const baseProviderConfig = OAUTH_PROVIDERS[baseProvider]
    if (!baseProviderConfig) {
      return <ExternalLink className='h-3 w-3' />
    }
    return createElement(baseProviderConfig.icon, { className: 'h-3 w-3' })
  }, [])

  const connectLabel =
    credentials.length > 0 ? 'Connect another Google account' : 'Connect Google account'

  const comboboxOptions = useMemo(() => {
    const options = credentials.map((cred) => ({
      label: cred.name,
      value: cred.id,
      iconElement: getProviderIcon((cred.provider ?? effectiveProviderId) as OAuthProvider),
    }))

    options.push({
      label: connectLabel,
      value: CONNECT_ACCOUNT_VALUE,
      iconElement: <ExternalLink className='h-3 w-3' />,
    })

    return options
  }, [connectLabel, credentials, effectiveProviderId, getProviderIcon])

  const displayLabel = selectedCredential?.name ?? ''

  const overlayContent = useMemo(() => {
    if (!displayLabel) return null
    return (
      <div className='flex w-full items-center truncate'>
        <div className='mr-2 flex-shrink-0 opacity-90'>
          {getProviderIcon((selectedCredential?.provider ?? effectiveProviderId) as OAuthProvider)}
        </div>
        <span className='truncate'>{displayLabel}</span>
      </div>
    )
  }, [displayLabel, effectiveProviderId, getProviderIcon, selectedCredential?.provider])

  const handleAddCredential = useCallback(() => {
    preConnectCountRef.current = credentials.length
    writeOAuthReturnContext({
      origin: 'workflow',
      workflowId: activeWorkflowId || '',
      displayName: 'Google Ads',
      providerId: effectiveProviderId,
      preCount: credentials.length,
      workspaceId,
      requestedAt: Date.now(),
    })
    setShowConnectModal(true)
  }, [activeWorkflowId, credentials.length, effectiveProviderId, workspaceId])

  const handleComboboxChange = useCallback(
    (value: string) => {
      if (value === CONNECT_ACCOUNT_VALUE) {
        handleAddCredential()
        return
      }

      const matched = credentials.find((cred) => cred.id === value)
      if (matched) {
        void applyCredentialSelection(value)
      }
    },
    [applyCredentialSelection, credentials, handleAddCredential]
  )

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        void refetchCredentials()
      }
    },
    [refetchCredentials]
  )

  return (
    <div>
      <Combobox
        options={comboboxOptions}
        value={displayLabel}
        selectedValue={selectedCredentialId}
        onChange={handleComboboxChange}
        onOpenChange={handleOpenChange}
        placeholder={placeholder}
        disabled={disabled}
        editable={true}
        filterOptions={true}
        isLoading={credentialsLoading}
        overlayContent={overlayContent}
        className={overlayContent ? 'pl-7' : ''}
      />

      {needsUpdate && (
        <div className='mt-2 flex flex-col gap-1 rounded-sm border bg-[var(--surface-2)] px-2 py-1.5'>
          <div className='flex items-center font-medium text-caption'>
            <span className='mr-1.5 inline-block h-[6px] w-[6px] rounded-xs bg-amber-500' />
            Additional permissions required
          </div>
          <Button
            variant='active'
            onClick={() => {
              writeOAuthReturnContext({
                origin: 'workflow',
                workflowId: activeWorkflowId || '',
                displayName: selectedCredential?.name ?? 'Google Ads',
                providerId: effectiveProviderId,
                preCount: credentials.length,
                workspaceId,
                requestedAt: Date.now(),
              })
              setShowOAuthModal(true)
            }}
            className='w-full px-2 py-1 font-medium text-caption'
          >
            Update access
          </Button>
        </div>
      )}

      {showConnectModal && (
        <OAuthModal
          mode='connect'
          isOpen={showConnectModal}
          onClose={() => setShowConnectModal(false)}
          provider={effectiveProviderId}
          serviceId={GOOGLE_ADS_SERVICE_ID}
          workspaceId={workspaceId}
          workflowId={activeWorkflowId || ''}
          credentialCount={credentials.length}
        />
      )}

      {showOAuthModal && (
        <OAuthModal
          mode='reauthorize'
          isOpen={showOAuthModal}
          onClose={() => {
            consumeOAuthReturnContext()
            setShowOAuthModal(false)
          }}
          provider={effectiveProviderId}
          toolName='Google Ads'
          requiredScopes={getCanonicalScopesForProvider(effectiveProviderId)}
          newScopes={missingRequiredScopes}
          serviceId={GOOGLE_ADS_SERVICE_ID}
        />
      )}
    </div>
  )
}
