'use client'

import { useCallback, useMemo, useState } from 'react'
import { Button, Combobox, type ComboboxOptionGroup } from '@sim/emcn'
import { ExternalLink, KeyRound } from 'lucide-react'
import { useParams } from 'next/navigation'
import { consumeOAuthReturnContext, writeOAuthReturnContext } from '@/lib/credentials/client-state'
import {
  getCanonicalScopesForProvider,
  getProviderIdFromServiceId,
  getServiceConfigByProviderId,
  OAUTH_PROVIDERS,
  type OAuthProvider,
  parseProvider,
} from '@/lib/oauth'
import {
  getMissingRequiredScopes,
  getRequiredScopesForCredential,
  getServiceConfigByServiceId,
} from '@/lib/oauth/utils'
import { isAdminWorkspace } from '@/lib/workspaces/is-admin-workspace'
import { ConnectOAuthModal } from '@/app/workspace/[workspaceId]/components/connect-oauth-modal'
import {
  ConnectServiceAccountModal,
  type ServiceAccountProviderId,
} from '@/app/workspace/[workspaceId]/integrations/components/connect-service-account-modal'
import { formatDisplayText } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/formatted-text'
import { getWorkflowSearchLabelHighlight } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/workflow-search-highlight'
import { useDependsOnGate } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-depends-on-gate'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-value'
import { useActiveSearchTarget } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/providers/active-search-target-provider'
import { getBareIconStyle, type StyleableIcon } from '@/blocks/icon-color'
import type { SubBlockConfig } from '@/blocks/types'
import { useWorkspaceCredential, useWorkspaceCredentials } from '@/hooks/queries/credentials'
import { useHubSpotAccountOptions } from '@/hooks/queries/hubspot-accounts'
import { useConnectOAuthService } from '@/hooks/queries/oauth/oauth-connections'
import { useOAuthCredentials } from '@/hooks/queries/oauth/oauth-credentials'
import { useUnipileAccountOptions } from '@/hooks/queries/unipile'
import { useCanUseZoomAdmin } from '@/hooks/queries/workspace'
import { useCredentialRefreshTriggers } from '@/hooks/use-credential-refresh-triggers'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'

const UNIPILE_LINKEDIN_PROVIDER_ID = 'unipile_linkedin' as const
const UNIPILE_RECONNECT_PREFIX = '__reconnect__:' as const

interface CredentialSelectorProps {
  blockId: string
  subBlock: SubBlockConfig
  disabled?: boolean
  isPreview?: boolean
  previewValue?: any | null
  previewContextValues?: Record<string, unknown>
}

export function CredentialSelector({
  blockId,
  subBlock,
  disabled = false,
  isPreview = false,
  previewValue,
  previewContextValues,
}: CredentialSelectorProps) {
  const activeSearchTarget = useActiveSearchTarget()
  const params = useParams()
  const workspaceId = (params?.workspaceId as string) || ''
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [showOAuthModal, setShowOAuthModal] = useState(false)
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [editingValue, setEditingValue] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const activeWorkflowId = useWorkflowRegistry((state) => state.activeWorkflowId)
  const [storeValue, setStoreValue] = useSubBlockValue<string | null>(blockId, subBlock.id)

  const requiredScopes = subBlock.requiredScopes || []
  const label = subBlock.placeholder || 'Select credential'
  const serviceId = subBlock.serviceId || ''
  const { canUseZoomAdmin } = useCanUseZoomAdmin(workspaceId)
  const additionalConnectOptions = useMemo(() => {
    const options = subBlock.additionalConnectOptions || []
    if (options.length === 0) return options
    // Zoom Admin connect: org allowlist or env ADMIN_WORKSPACE_IDS (same as authorize).
    return canUseZoomAdmin ? options : []
  }, [subBlock.additionalConnectOptions, canUseZoomAdmin])
  const isAllCredentials = !serviceId

  const { depsSatisfied, dependsOn } = useDependsOnGate(blockId, subBlock, {
    disabled,
    isPreview,
    previewContextValues,
  })
  const hasDependencies = dependsOn.length > 0

  const effectiveDisabled = disabled || (hasDependencies && !depsSatisfied)

  const effectiveValue = isPreview && previewValue !== undefined ? previewValue : storeValue
  const selectedId = typeof effectiveValue === 'string' ? effectiveValue : ''

  const effectiveProviderId = useMemo(
    () => getProviderIdFromServiceId(serviceId) as OAuthProvider,
    [serviceId]
  )
  const provider = effectiveProviderId
  const isSharedUnipileWorkspace =
    effectiveProviderId === UNIPILE_LINKEDIN_PROVIDER_ID && isAdminWorkspace(workspaceId)

  const isTriggerMode = subBlock.mode === 'trigger' || subBlock.mode === 'trigger-advanced'
  const isSharedHubspotWorkspace =
    isAdminWorkspace(workspaceId) && effectiveProviderId === 'hubspot'

  const {
    data: rawCredentials = [],
    isFetching: oauthCredentialsLoading,
    refetch: refetchCredentials,
  } = useOAuthCredentials(effectiveProviderId, {
    enabled: !isAllCredentials && Boolean(effectiveProviderId),
    workspaceId,
    workflowId: activeWorkflowId || undefined,
  })

  const {
    data: unipileAccountOptions = [],
    isFetching: unipileAccountOptionsLoading,
    refetch: refetchUnipileAccountOptions,
  } = useUnipileAccountOptions(isSharedUnipileWorkspace ? workspaceId : undefined)

  const connectOAuthService = useConnectOAuthService()

  const {
    data: allWorkspaceCredentials = [],
    isFetching: allCredentialsLoading,
    refetch: refetchAllCredentials,
  } = useWorkspaceCredentials({ workspaceId, enabled: isAllCredentials })

  const { data: additionalWorkspaceCredentials = [] } = useWorkspaceCredentials({
    workspaceId,
    type: 'oauth',
    enabled: additionalConnectOptions.length > 0,
  })

  const {
    data: hubspotAccountOptions = [],
    isFetching: hubspotAccountOptionsLoading,
    refetch: refetchHubspotAccounts,
  } = useHubSpotAccountOptions(isSharedHubspotWorkspace ? workspaceId : undefined)

  const credentialsLoading = isAllCredentials
    ? allCredentialsLoading
    : oauthCredentialsLoading ||
      (isSharedHubspotWorkspace && hubspotAccountOptionsLoading) ||
      (isSharedUnipileWorkspace && unipileAccountOptionsLoading)

  const selectionPool = useMemo(
    () =>
      isTriggerMode
        ? rawCredentials.filter((cred) => cred.type !== 'service_account')
        : rawCredentials,
    [rawCredentials, isTriggerMode]
  )
  const credentialKind = subBlock.credentialKind
  const isMergedKinds = credentialKind === 'any'

  const credentials = useMemo(() => {
    // A service-account picker lists only the reusable service-account
    // credentials, including in trigger mode. A merged ('any') picker lists
    // OAuth accounts and service accounts together.
    if (credentialKind === 'service-account') {
      return rawCredentials.filter((cred) => cred.type === 'service_account')
    }
    if (isMergedKinds) {
      return rawCredentials
    }
    return isTriggerMode && !subBlock.allowServiceAccounts
      ? rawCredentials.filter((cred) => cred.type !== 'service_account')
      : rawCredentials
  }, [rawCredentials, isTriggerMode, credentialKind, isMergedKinds, subBlock.allowServiceAccounts])

  // Resolved service-account provider metadata for the setup modal. Gated on
  // `credentialKind` and using the non-throwing lookup so it never runs (or
  // throws) for plain OAuth pickers.
  const serviceAccountService = useMemo(
    () =>
      credentialKind === 'service-account' || isMergedKinds
        ? getServiceConfigByServiceId(serviceId)
        : null,
    [credentialKind, isMergedKinds, serviceId]
  )

  const selectedCredential = useMemo(
    () => selectionPool.find((cred) => cred.id === selectedId),
    [selectionPool, selectedId]
  )

  const selectedAllCredential = useMemo(
    () =>
      isAllCredentials ? (allWorkspaceCredentials.find((c) => c.id === selectedId) ?? null) : null,
    [isAllCredentials, allWorkspaceCredentials, selectedId]
  )

  const isServiceAccount = useMemo(
    () =>
      selectedCredential?.type === 'service_account' ||
      selectedAllCredential?.type === 'service_account',
    [selectedCredential, selectedAllCredential]
  )

  const matchedHubspotOption = useMemo(
    () => hubspotAccountOptions.find((option) => option.id === selectedId) ?? null,
    [hubspotAccountOptions, selectedId]
  )

  const selectedUnipileAccountOption = useMemo(
    () => unipileAccountOptions.find((option) => option.id === selectedId) ?? null,
    [unipileAccountOptions, selectedId]
  )

  const { data: inaccessibleCredential } = useWorkspaceCredential(
    selectedId || undefined,
    Boolean(selectedId) &&
      !selectedCredential &&
      !selectedAllCredential &&
      !matchedHubspotOption &&
      !selectedUnipileAccountOption &&
      !credentialsLoading &&
      Boolean(workspaceId)
  )
  const inaccessibleCredentialName = inaccessibleCredential?.displayName ?? null

  const resolvedLabel = useMemo(() => {
    if (selectedAllCredential) return selectedAllCredential.displayName
    if (selectedCredential) return selectedCredential.name
    if (matchedHubspotOption) return matchedHubspotOption.label
    if (selectedUnipileAccountOption) return selectedUnipileAccountOption.label
    if (inaccessibleCredentialName) return inaccessibleCredentialName
    return ''
  }, [
    selectedAllCredential,
    selectedCredential,
    matchedHubspotOption,
    selectedUnipileAccountOption,
    inaccessibleCredentialName,
  ])

  const displayValue = isEditing ? editingValue : resolvedLabel

  const refetch = useCallback(async () => {
    if (isAllCredentials) {
      await refetchAllCredentials()
      return
    }
    await refetchCredentials()
    if (isSharedUnipileWorkspace) {
      await refetchUnipileAccountOptions()
    }
  }, [
    isAllCredentials,
    isSharedUnipileWorkspace,
    refetchAllCredentials,
    refetchCredentials,
    refetchUnipileAccountOptions,
  ])

  useCredentialRefreshTriggers(refetch, effectiveProviderId, workspaceId)

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) return
      void refetch()
      if (isSharedHubspotWorkspace) void refetchHubspotAccounts()
    },
    [refetch, isSharedHubspotWorkspace, refetchHubspotAccounts]
  )

  const hasOAuthSelection = Boolean(selectedCredential)
  const scopesForValidation = useMemo(
    () => getRequiredScopesForCredential(selectedCredential, requiredScopes),
    [selectedCredential, requiredScopes]
  )
  const missingRequiredScopes = hasOAuthSelection
    ? getMissingRequiredScopes(selectedCredential!, scopesForValidation)
    : []

  const needsUpdate =
    hasOAuthSelection &&
    !isServiceAccount &&
    missingRequiredScopes.length > 0 &&
    !effectiveDisabled &&
    !isPreview &&
    !credentialsLoading

  const handleSelect = useCallback(
    (credentialId: string) => {
      if (isPreview) return
      setStoreValue(credentialId)
      setIsEditing(false)
    },
    [isPreview, setStoreValue]
  )

  const handleAddCredential = useCallback(() => {
    if (credentialKind === 'service-account') {
      setShowSetupModal(true)
      return
    }
    setShowConnectModal(true)
  }, [credentialKind])

  const handleUnipileReconnect = useCallback(
    async (credentialId: string) => {
      if (isPreview) return

      const matchedUnipileOption = unipileAccountOptions.find(
        (option) => option.credentialId === credentialId
      )
      const matchedCredential = credentials.find((cred) => cred.id === credentialId)

      writeOAuthReturnContext({
        origin: 'workflow',
        workflowId: activeWorkflowId || '',
        displayName: matchedUnipileOption?.label ?? matchedCredential?.name ?? 'LinkedIn account',
        providerId: UNIPILE_LINKEDIN_PROVIDER_ID,
        preCount: credentials.length,
        workspaceId,
        reconnect: true,
        credentialId,
        requestedAt: Date.now(),
      })

      await connectOAuthService.mutateAsync({
        providerId: UNIPILE_LINKEDIN_PROVIDER_ID,
        callbackURL: window.location.href,
      })
    },
    [
      activeWorkflowId,
      connectOAuthService,
      credentials,
      isPreview,
      unipileAccountOptions,
      workspaceId,
    ]
  )

  const getProviderIcon = useCallback((providerName: OAuthProvider) => {
    const { baseProvider } = parseProvider(providerName)
    const baseProviderConfig = OAUTH_PROVIDERS[baseProvider]

    if (!baseProviderConfig) {
      return <ExternalLink className='size-3' />
    }
    const Icon: StyleableIcon = baseProviderConfig.icon
    return <Icon className='size-3 text-[var(--text-icon)]' style={getBareIconStyle(Icon)} />
  }, [])

  const getProviderName = useCallback((providerName: OAuthProvider) => {
    const serviceConfig = getServiceConfigByProviderId(providerName)
    if (serviceConfig) {
      return serviceConfig.name
    }

    const { baseProvider } = parseProvider(providerName)
    const baseProviderConfig = OAUTH_PROVIDERS[baseProvider]

    if (baseProviderConfig) {
      return baseProviderConfig.name
    }

    return providerName
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }, [])

  const additionalConnectItems = useMemo(
    () =>
      additionalConnectOptions.map((option) => {
        const optionProvider = getProviderIdFromServiceId(option.serviceId) as OAuthProvider
        const credentialCount = additionalWorkspaceCredentials.filter(
          (cred) => cred.providerId === optionProvider
        ).length

        return {
          label: option.label,
          value: `__connect_account__:${option.serviceId}`,
          iconElement: <ExternalLink className='size-3' />,
          serviceId: option.serviceId,
          provider: optionProvider,
          credentialCount,
        }
      }),
    [additionalConnectOptions, additionalWorkspaceCredentials]
  )

  const comboboxOptions = useMemo(() => {
    if (isAllCredentials) {
      const oauthCredentials = allWorkspaceCredentials.filter((c) => c.type === 'oauth')
      return oauthCredentials.map((cred) => ({ label: cred.displayName, value: cred.id }))
    }
    if (isMergedKinds) return []

    if (isSharedHubspotWorkspace) {
      const personalAccountCount = hubspotAccountOptions.filter(
        (option) => option.source === 'personal'
      ).length

      const options = hubspotAccountOptions.map((option) => ({
        label: option.label,
        value: option.id,
        iconElement: getProviderIcon(provider),
      }))

      options.push({
        label:
          personalAccountCount > 0 ? 'Connect another HubSpot account' : 'Connect HubSpot account',
        value: '__connect_account__',
        iconElement: <ExternalLink className='size-3' />,
      })
      options.push(...additionalConnectItems)

      return options
    }

    if (isSharedUnipileWorkspace) {
      const personalAccountCount = unipileAccountOptions.filter(
        (option) => option.source === 'personal'
      ).length

      const options = unipileAccountOptions.map((option) => ({
        label: option.label,
        value: option.id,
        iconElement: getProviderIcon(provider),
      }))

      options.push({
        label:
          personalAccountCount > 0
            ? 'Connect another LinkedIn account'
            : 'Connect LinkedIn account',
        value: '__connect_account__',
        iconElement: <ExternalLink className='size-3' />,
      })

      for (const option of unipileAccountOptions) {
        if (!option.credentialId || !option.canReconnect) continue
        options.push({
          label: `Reconnect ${option.label}`,
          value: `${UNIPILE_RECONNECT_PREFIX}${option.credentialId}`,
          iconElement: <ExternalLink className='size-3' />,
        })
      }

      options.push(...additionalConnectItems)

      return options
    }

    const options = credentials.map((cred) => ({
      label: cred.name,
      value: cred.id,
      iconElement: getProviderIcon((cred.provider ?? provider) as OAuthProvider),
    }))

    options.push({
      label:
        credentialKind === 'service-account'
          ? (subBlock.credentialLabels?.serviceAccountConnect ??
            (credentials.length > 0
              ? `Add another ${getProviderName(provider)} key`
              : `Add ${getProviderName(provider)} key`))
          : credentials.length > 0
            ? `Connect another ${getProviderName(provider)} account`
            : `Connect ${getProviderName(provider)} account`,
      value: '__connect_account__',
      iconElement: <ExternalLink className='size-3' />,
    })
    options.push(...additionalConnectItems)

    return options
  }, [
    isAllCredentials,
    isSharedUnipileWorkspace,
    unipileAccountOptions,
    isMergedKinds,
    allWorkspaceCredentials,
    isSharedHubspotWorkspace,
    hubspotAccountOptions,
    credentials,
    credentialKind,
    subBlock.credentialLabels,
    provider,
    getProviderIcon,
    getProviderName,
  ])

  const comboboxGroups = useMemo<ComboboxOptionGroup[] | undefined>(() => {
    if (!isMergedKinds) return undefined

    const labels = subBlock.credentialLabels
    const toOption = (cred: (typeof credentials)[number]) => ({
      label: cred.name,
      value: cred.id,
      iconElement: getProviderIcon((cred.provider ?? provider) as OAuthProvider),
    })

    return [
      {
        section: labels?.oauthGroup ?? `${getProviderName(provider)} accounts`,
        items: [
          ...credentials.filter((c) => c.type !== 'service_account').map(toOption),
          {
            label: labels?.oauthConnect ?? `Connect ${getProviderName(provider)} account`,
            value: '__connect_account__',
            iconElement: <ExternalLink className='size-3' />,
          },
        ],
      },
      {
        section: labels?.serviceAccountGroup ?? 'Service accounts',
        items: [
          ...credentials.filter((c) => c.type === 'service_account').map(toOption),
          {
            label: labels?.serviceAccountConnect ?? `Add ${getProviderName(provider)} key`,
            value: '__connect_service_account__',
            iconElement: <ExternalLink className='size-3' />,
          },
        ],
      },
    ]
  }, [
    isMergedKinds,
    subBlock.credentialLabels,
    credentials,
    provider,
    getProviderIcon,
    getProviderName,
    additionalConnectItems,
  ])

  const selectedCredentialProvider = selectedCredential?.provider ?? provider
  const reauthorizeProvider = selectedCredentialProvider
  const reauthorizeServiceId = selectedCredential?.provider ?? serviceId
  const reauthorizeRequiredScopes = getCanonicalScopesForProvider(reauthorizeProvider)

  const workflowSearchHighlight = getWorkflowSearchLabelHighlight({
    activeSearchTarget,
    subBlockId: subBlock.id,
    valuePath: [],
    label: displayValue,
  })

  const overlayContent = useMemo(() => {
    if (!displayValue) return null

    if (isAllCredentials && selectedAllCredential) {
      return (
        <div className='flex w-full items-center truncate'>
          <div className='mr-2 flex-shrink-0 opacity-90'>
            <KeyRound className='size-3' />
          </div>
          <span className='truncate'>
            {formatDisplayText(displayValue, { workflowSearchHighlight })}
          </span>
        </div>
      )
    }

    return (
      <div className='flex w-full items-center truncate'>
        <div className='mr-2 flex-shrink-0 opacity-90'>
          {getProviderIcon(selectedCredentialProvider)}
        </div>
        <span className='truncate'>
          {formatDisplayText(displayValue, { workflowSearchHighlight })}
        </span>
      </div>
    )
  }, [
    getProviderIcon,
    displayValue,
    selectedCredentialProvider,
    isAllCredentials,
    selectedAllCredential,
    workflowSearchHighlight,
  ])

  const [connectModalConfig, setConnectModalConfig] = useState<{
    provider: OAuthProvider
    serviceId: string
    credentialCount: number
  } | null>(null)

  const connectServiceId = connectModalConfig?.serviceId ?? serviceId
  const connectProviderId = useMemo(
    () => getProviderIdFromServiceId(connectServiceId),
    [connectServiceId]
  )
  const connectRequiredScopes = useMemo(
    () => getCanonicalScopesForProvider(connectProviderId),
    [connectProviderId]
  )

  const handleComboboxChange = useCallback(
    (value: string) => {
      if (value.startsWith(UNIPILE_RECONNECT_PREFIX)) {
        const credentialId = value.slice(UNIPILE_RECONNECT_PREFIX.length)
        if (credentialId) {
          void handleUnipileReconnect(credentialId)
        }
        return
      }

      if (value === '__connect_account__') {
        setConnectModalConfig(null)
        if (isMergedKinds) {
          setShowConnectModal(true)
          return
        }
        handleAddCredential()
        return
      }
      if (value === '__connect_service_account__') {
        setShowSetupModal(true)
        return
      }

      if (value.startsWith('__connect_account__:')) {
        const targetServiceId = value.replace('__connect_account__:', '')
        const targetOption = additionalConnectItems.find(
          (option) => option.serviceId === targetServiceId
        )

        if (targetOption) {
          setConnectModalConfig({
            provider: targetOption.provider,
            serviceId: targetOption.serviceId,
            credentialCount: targetOption.credentialCount,
          })
          setShowConnectModal(true)
          return
        }
      }

      const matchedUnipileOption = unipileAccountOptions.find((option) => option.id === value)
      if (matchedUnipileOption) {
        handleSelect(value)
        return
      }

      const matchedCred = (
        isAllCredentials ? allWorkspaceCredentials.filter((c) => c.type === 'oauth') : credentials
      ).find((c) => c.id === value)
      if (matchedCred) {
        handleSelect(value)
        return
      }

      const matchedHubspotOption = hubspotAccountOptions.find((option) => option.id === value)
      if (matchedHubspotOption) {
        handleSelect(value)
        return
      }

      setIsEditing(true)
      setEditingValue(value)
    },
    [
      isAllCredentials,
      isMergedKinds,
      allWorkspaceCredentials,
      credentials,
      handleAddCredential,
      handleSelect,
      hubspotAccountOptions,
      unipileAccountOptions,
      handleUnipileReconnect,
      additionalConnectItems,
    ]
  )

  return (
    <div>
      <Combobox
        options={comboboxOptions}
        groups={comboboxGroups}
        value={displayValue}
        selectedValue={selectedId}
        onChange={handleComboboxChange}
        onOpenChange={handleOpenChange}
        placeholder={
          hasDependencies && !depsSatisfied ? 'Fill in required fields above first' : label
        }
        disabled={effectiveDisabled}
        editable={!isMergedKinds}
        filterOptions={!isMergedKinds}
        searchable={isMergedKinds}
        searchPlaceholder='Search credentials...'
        isLoading={credentialsLoading}
        overlayContent={overlayContent}
        className={overlayContent ? 'pl-7' : ''}
      />

      {needsUpdate && (
        <div className='mt-2 flex flex-col gap-1 rounded-sm border bg-[var(--surface-2)] px-2 py-1.5'>
          <div className='flex items-center font-medium text-caption'>
            <span className='mr-1.5 inline-block size-[6px] rounded-xs bg-amber-500' />
            Additional permissions required
          </div>
          <Button
            variant='active'
            onClick={() => {
              writeOAuthReturnContext({
                origin: 'workflow',
                workflowId: activeWorkflowId || '',
                displayName: selectedCredential?.name ?? getProviderName(reauthorizeProvider),
                providerId: reauthorizeProvider,
                preCount: credentials.filter((c) => c.type !== 'service_account').length,
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
        <ConnectOAuthModal
          mode='connect'
          origin='workflow'
          open={showConnectModal}
          onOpenChange={(open) => {
            if (!open) {
              setShowConnectModal(false)
              setConnectModalConfig(null)
            }
          }}
          provider={connectModalConfig?.provider ?? provider}
          serviceId={connectServiceId}
          providerId={connectProviderId}
          requiredScopes={connectRequiredScopes}
          workspaceId={workspaceId}
          workflowId={activeWorkflowId || ''}
        />
      )}

      {showOAuthModal && (
        <ConnectOAuthModal
          mode='reauthorize'
          open={showOAuthModal}
          onOpenChange={(open) => {
            if (!open) {
              consumeOAuthReturnContext()
              setShowOAuthModal(false)
            }
          }}
          provider={reauthorizeProvider}
          toolName={getProviderName(reauthorizeProvider)}
          requiredScopes={reauthorizeRequiredScopes}
          newScopes={missingRequiredScopes}
          serviceId={reauthorizeServiceId}
        />
      )}

      {showSetupModal && serviceAccountService?.serviceAccountProviderId && (
        <ConnectServiceAccountModal
          open={showSetupModal}
          onOpenChange={setShowSetupModal}
          workspaceId={workspaceId}
          serviceAccountProviderId={
            serviceAccountService.serviceAccountProviderId as ServiceAccountProviderId
          }
          serviceName={serviceAccountService.name}
          serviceIcon={serviceAccountService.icon}
          onCreated={(newCredentialId) => {
            setStoreValue(newCredentialId)
            refetchCredentials()
          }}
        />
      )}
    </div>
  )
}
