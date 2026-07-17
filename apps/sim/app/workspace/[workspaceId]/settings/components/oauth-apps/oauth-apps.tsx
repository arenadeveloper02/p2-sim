'use client'

import { useEffect, useMemo, useState } from 'react'
import { Chip, ChipModalField, InfoCard, InfoCardItem, InfoCardList } from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { ZoomIcon } from '@/components/icons'
import type { OrganizationOAuthAppSummary } from '@/lib/api/contracts/organization-oauth-apps'
import { useSession } from '@/lib/auth/auth-client'
import { getCustomOAuthAppConfig, listCustomOAuthAppKeys } from '@/lib/oauth/custom-app-config'
import { isAdminOrOwner } from '@/lib/workspaces/organization'
import { SettingsPanel } from '@/app/workspace/[workspaceId]/settings/components/settings-panel'
import { useOrganization, useOrganizations } from '@/hooks/queries/organization'
import {
  useDeleteOrganizationOAuthApp,
  useOrganizationOAuthApps,
  useUpsertOrganizationOAuthApp,
} from '@/hooks/queries/organization-oauth-apps'

const logger = createLogger('OAuthAppsSettings')

const CUSTOM_APP_LABELS: Record<string, { name: string; description: string }> = {
  zoom: {
    name: 'Zoom',
    description:
      "Register your organization's Zoom Marketplace user app so teammates can connect Zoom using your client credentials.",
  },
  'zoom-admin': {
    name: 'Zoom Admin',
    description:
      "Register your organization's Zoom Marketplace admin app (separate client ID/secret from the user app) for account-wide admin scopes.",
  },
}

interface AppFormState {
  clientId: string
  clientSecret: string
  saveError: string | null
}

const EMPTY_FORM: AppFormState = {
  clientId: '',
  clientSecret: '',
  saveError: null,
}

/**
 * Organization settings for bringing your own OAuth app credentials.
 * Providers come from `CUSTOM_OAUTH_APP_PROVIDERS` / `listCustomOAuthAppKeys()`.
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
  const appsByKey = useMemo(() => {
    const map = new Map<string, OrganizationOAuthAppSummary>()
    for (const app of apps) {
      map.set(app.appKey, app)
    }
    return map
  }, [apps])

  const [forms, setForms] = useState<Record<string, AppFormState>>({})

  useEffect(() => {
    setForms((prev) => {
      const next: Record<string, AppFormState> = { ...prev }
      for (const appKey of supportedAppKeys) {
        const saved = appsByKey.get(appKey)
        const existing = next[appKey] ?? EMPTY_FORM
        next[appKey] = {
          ...existing,
          clientId: saved?.clientId ?? '',
          // Never refill secret from the server — it is write-only after save.
          clientSecret: saved ? '' : existing.clientSecret,
        }
      }
      return next
    })
  }, [appsByKey, supportedAppKeys])

  const adminOrOwner = isAdminOrOwner(organization, session?.user?.email)

  const providerMeta = useMemo(() => {
    return supportedAppKeys.map((appKey) => {
      const config = getCustomOAuthAppConfig(appKey)
      const labels = CUSTOM_APP_LABELS[appKey] ?? {
        name: appKey,
        description: 'Custom OAuth app credentials for this provider.',
      }
      return { appKey, config, ...labels }
    })
  }, [supportedAppKeys])

  const updateForm = (appKey: string, patch: Partial<AppFormState>) => {
    setForms((prev) => ({
      ...prev,
      [appKey]: { ...(prev[appKey] ?? EMPTY_FORM), ...patch },
    }))
  }

  const handleSave = async (appKey: string) => {
    if (!organizationId) return

    const form = forms[appKey] ?? EMPTY_FORM
    const saved = appsByKey.get(appKey)
    const isConfigured = Boolean(saved?.hasClientSecret && saved.clientId)
    const trimmedClientId = form.clientId.trim()
    const trimmedSecret = form.clientSecret.trim()

    updateForm(appKey, { saveError: null })

    if (!trimmedClientId) {
      updateForm(appKey, { saveError: 'Client ID is required.' })
      return
    }
    if (!isConfigured && !trimmedSecret) {
      updateForm(appKey, { saveError: 'Client secret is required.' })
      return
    }
    if (isConfigured && !trimmedSecret) {
      updateForm(appKey, { saveError: 'Enter the client secret to update credentials.' })
      return
    }

    try {
      await upsertApp.mutateAsync({
        appKey,
        clientId: trimmedClientId,
        clientSecret: trimmedSecret,
      })
      updateForm(appKey, { clientSecret: '', saveError: null })
    } catch (error) {
      const message = getErrorMessage(error, `Failed to save ${appKey} OAuth app`)
      updateForm(appKey, { saveError: message })
      logger.error('Failed to save organization OAuth app', error)
    }
  }

  const handleClear = async (appKey: string) => {
    if (!organizationId) return
    const saved = appsByKey.get(appKey)
    if (!saved?.hasClientSecret) return

    updateForm(appKey, { saveError: null })
    try {
      await deleteApp.mutateAsync(appKey)
      updateForm(appKey, { clientId: '', clientSecret: '', saveError: null })
    } catch (error) {
      const message = getErrorMessage(error, `Failed to remove ${appKey} OAuth app`)
      updateForm(appKey, { saveError: message })
      logger.error('Failed to delete organization OAuth app', error)
    }
  }

  if (!organizationId) {
    return (
      <SettingsPanel>
        <InfoCard>
          <InfoCardList>
            <InfoCardItem>
              Custom OAuth apps are only available for organization workspaces. Create or join an
              organization to configure Zoom Marketplace apps for your team.
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

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <SettingsPanel>
      <InfoCard>
        <InfoCardList>
          <InfoCardItem>
            To keep existing Zoom connections working without reconnecting, paste the exact client
            ID and secret from the Marketplace apps that originally issued those tokens (the former
            ZOOM_* / ZOOM_ADMIN_* env values). Saving a different Marketplace app will require
            teammates to reconnect.
          </InfoCardItem>
        </InfoCardList>
      </InfoCard>

      {providerMeta.map(({ appKey, name, description }) => {
        const saved = appsByKey.get(appKey)
        const form = forms[appKey] ?? EMPTY_FORM
        const rowConfigured = Boolean(saved?.hasClientSecret && saved.clientId)
        const callbackPath = `/api/auth/oauth2/custom/${appKey}/callback`
        const callbackUrl = origin ? `${origin}${callbackPath}` : callbackPath

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
              value={form.clientId}
              onChange={(value) => updateForm(appKey, { clientId: value })}
              placeholder={`${name} OAuth Client ID`}
              autoComplete='off'
              disabled={appsLoading || upsertApp.isPending}
            />

            <ChipModalField
              type='input'
              title='Client Secret'
              value={form.clientSecret}
              onChange={(value) => updateForm(appKey, { clientSecret: value })}
              placeholder={
                rowConfigured ? 'Enter a new secret to update' : `${name} OAuth Client Secret`
              }
              autoComplete='off'
              hint={
                rowConfigured
                  ? 'Secret is stored encrypted and never shown again after saving.'
                  : undefined
              }
              disabled={appsLoading || upsertApp.isPending}
            />

            {form.saveError && (
              <p className='text-[var(--text-error)] text-caption'>{form.saveError}</p>
            )}

            <div className='flex flex-wrap items-center gap-2'>
              <Chip
                variant='primary'
                onClick={() => void handleSave(appKey)}
                disabled={upsertApp.isPending || deleteApp.isPending}
              >
                {upsertApp.isPending ? 'Saving...' : rowConfigured ? 'Update' : 'Save'}
              </Chip>
              {rowConfigured && (
                <Chip
                  variant='ghost'
                  onClick={() => void handleClear(appKey)}
                  disabled={upsertApp.isPending || deleteApp.isPending}
                >
                  {deleteApp.isPending ? 'Removing...' : 'Remove'}
                </Chip>
              )}
            </div>

            <p className='text-[var(--text-muted)] text-caption'>
              Redirect URI for this Marketplace app:{' '}
              <code className='text-[var(--text-body)]'>{callbackUrl}</code>
            </p>
          </div>
        )
      })}
    </SettingsPanel>
  )
}
