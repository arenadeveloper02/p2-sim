'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Chip,
  ChipModalField,
  InfoCard,
  InfoCardItem,
  InfoCardList,
} from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { ZoomIcon } from '@/components/icons'
import { useSession } from '@/lib/auth/auth-client'
import { getCustomOAuthAppConfig, listCustomOAuthAppKeys } from '@/lib/oauth/custom-apps'
import { isAdminOrOwner } from '@/lib/workspaces/organization'
import { SettingsPanel } from '@/app/workspace/[workspaceId]/settings/components/settings-panel'
import {
  useDeleteOrganizationOAuthApp,
  useOrganizationOAuthApps,
  useUpsertOrganizationOAuthApp,
} from '@/hooks/queries/organization-oauth-apps'
import { useOrganization, useOrganizations } from '@/hooks/queries/organization'

const logger = createLogger('OAuthAppsSettings')

const CUSTOM_APP_LABELS: Record<string, { name: string; description: string }> = {
  zoom: {
    name: 'Zoom',
    description:
      'Register your organization\'s Zoom Marketplace app so teammates can connect Zoom using your client credentials instead of a shared Sim app.',
  },
}

/**
 * Organization settings for bringing your own OAuth app credentials.
 * Currently supports Zoom; additional providers can be added via
 * `CUSTOM_OAUTH_APP_PROVIDERS` without new UI routes.
 */
export function OAuthAppsSettings() {
  const { data: session } = useSession()
  const { data: organizationsData } = useOrganizations()
  const activeOrganization = organizationsData?.activeOrganization
  const organizationId = activeOrganization?.id

  const { data: organization, isLoading: orgLoading } = useOrganization(organizationId || '')
  const { data: apps = [], isLoading: appsLoading } = useOrganizationOAuthApps(
    organizationId,
    Boolean(organizationId) && isAdminOrOwner(organization, session?.user?.email)
  )

  const upsertApp = useUpsertOrganizationOAuthApp(organizationId || '')
  const deleteApp = useDeleteOrganizationOAuthApp(organizationId || '')

  const supportedAppKeys = listCustomOAuthAppKeys()
  const zoomApp = apps.find((app) => app.appKey === 'zoom')

  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)

  const adminOrOwner = isAdminOrOwner(organization, session?.user?.email)

  useEffect(() => {
    if (!zoomApp) return
    setClientId(zoomApp.clientId)
    setClientSecret('')
  }, [zoomApp?.clientId, zoomApp?.id])

  const isConfigured = Boolean(zoomApp?.hasClientSecret && zoomApp.clientId)

  const handleSave = async () => {
    if (!organizationId) return
    setSaveError(null)

    const trimmedClientId = clientId.trim()
    const trimmedSecret = clientSecret.trim()

    if (!trimmedClientId) {
      setSaveError('Client ID is required.')
      return
    }
    if (!isConfigured && !trimmedSecret) {
      setSaveError('Client secret is required.')
      return
    }
    if (isConfigured && !trimmedSecret) {
      setSaveError('Enter the client secret to update credentials.')
      return
    }

    try {
      await upsertApp.mutateAsync({
        appKey: 'zoom',
        clientId: trimmedClientId,
        clientSecret: trimmedSecret,
      })
      setClientSecret('')
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to save Zoom OAuth app')
      setSaveError(message)
      logger.error('Failed to save organization OAuth app', error)
    }
  }

  const handleClear = async () => {
    if (!organizationId || !isConfigured) return
    setSaveError(null)
    try {
      await deleteApp.mutateAsync('zoom')
      setClientId('')
      setClientSecret('')
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to remove Zoom OAuth app')
      setSaveError(message)
      logger.error('Failed to delete organization OAuth app', error)
    }
  }

  const providerMeta = useMemo(() => {
    return supportedAppKeys.map((appKey) => {
      const config = getCustomOAuthAppConfig(appKey === 'zoom' ? 'zoom' : appKey)
      const labels = CUSTOM_APP_LABELS[appKey] ?? {
        name: appKey,
        description: 'Custom OAuth app credentials for this provider.',
      }
      return { appKey, config, ...labels }
    })
  }, [supportedAppKeys])

  if (!organizationId) {
    return (
      <SettingsPanel>
        <InfoCard>
          <InfoCardList>
            <InfoCardItem>
              Custom OAuth apps are only available for organization workspaces. Create or join an
              organization to configure a Zoom Marketplace app for your team.
            </InfoCardItem>
          </InfoCardList>
        </InfoCard>
      </SettingsPanel>
    )
  }

  if (orgLoading) {
    return <SettingsPanel />
  }

  if (!adminOrOwner) {
    return (
      <SettingsPanel>
        <InfoCard>
          <InfoCardList>
            <InfoCardItem>
              Only organization admins and owners can configure custom OAuth apps. Ask your
              organization admin to add your Zoom Marketplace credentials in this settings tab.
            </InfoCardItem>
          </InfoCardList>
        </InfoCard>
      </SettingsPanel>
    )
  }

  return (
    <SettingsPanel>
      <InfoCard>
        <InfoCardList>
          <InfoCardItem>
            After saving or updating credentials, teammates must reconnect any existing Zoom
            integrations — tokens issued against a previous app will not refresh.
          </InfoCardItem>
        </InfoCardList>
      </InfoCard>

      {providerMeta.map(({ appKey, name, description }) => {
        if (appKey !== 'zoom') return null
        const rowConfigured = Boolean(zoomApp?.hasClientSecret && zoomApp.clientId)

        return (
          <div key={appKey} className='flex flex-col gap-4'>
            <div className='flex items-start gap-3'>
              <div className='flex size-9 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--border-1)] bg-[var(--surface-2)]'>
                <ZoomIcon className='size-[18px]' />
              </div>
              <div className='flex min-w-0 flex-col gap-1'>
                <p className='font-medium text-[var(--text-body)]'>{name}</p>
                <p className='text-[var(--text-muted)] text-caption'>{description}</p>
              </div>
            </div>

            <ChipModalField
              type='input'
              title='Client ID'
              value={clientId}
              onChange={setClientId}
              placeholder='Zoom OAuth Client ID'
              autoComplete='off'
              disabled={appsLoading || upsertApp.isPending}
            />

            <ChipModalField
              type='input'
              title='Client Secret'
              value={clientSecret}
              onChange={setClientSecret}
              placeholder={
                rowConfigured ? 'Enter a new secret to update' : 'Zoom OAuth Client Secret'
              }
              autoComplete='off'
              hint={
                rowConfigured
                  ? 'Secret is stored encrypted and never shown again after saving.'
                  : undefined
              }
              disabled={appsLoading || upsertApp.isPending}
            />

            {saveError && <p className='text-[var(--text-error)] text-caption'>{saveError}</p>}

            <div className='flex flex-wrap items-center gap-2'>
              <Chip
                variant='primary'
                onClick={() => void handleSave()}
                disabled={upsertApp.isPending || deleteApp.isPending}
              >
                {upsertApp.isPending ? 'Saving...' : rowConfigured ? 'Update' : 'Save'}
              </Chip>
              {rowConfigured && (
                <Chip
                  variant='ghost'
                  onClick={() => void handleClear()}
                  disabled={upsertApp.isPending || deleteApp.isPending}
                >
                  {deleteApp.isPending ? 'Removing...' : 'Remove'}
                </Chip>
              )}
            </div>
          </div>
        )
      })}

      <p className='text-[var(--text-muted)] text-caption'>
        Redirect URI for your Zoom app:{' '}
        <code className='text-[var(--text-body)]'>
          {typeof window !== 'undefined'
            ? `${window.location.origin}/api/auth/oauth2/custom/zoom/callback`
            : '/api/auth/oauth2/custom/zoom/callback'}
        </code>
      </p>
    </SettingsPanel>
  )
}
