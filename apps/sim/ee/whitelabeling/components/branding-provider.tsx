'use client'

import { createContext, useContext, useEffect, useMemo } from 'react'
import type { BrandConfig, OrganizationWhitelabelSettings } from '@/lib/branding/types'
import { getBrandConfig } from '@/ee/whitelabeling/branding'
import { useWhitelabelSettings } from '@/ee/whitelabeling/hooks/whitelabel'
import { generateOrgThemeCSS, mergeOrgBrandConfig } from '@/ee/whitelabeling/org-branding-utils'
import { syncDocumentFavicon } from '@/ee/whitelabeling/sync-document-favicon'
import { useOrganizations } from '@/hooks/queries/organization'

interface BrandingContextValue {
  config: BrandConfig
}

const BrandingContext = createContext<BrandingContextValue>({
  config: getBrandConfig(),
})

interface BrandingProviderProps {
  children: React.ReactNode
  /** Organization that owns the routed workspace, never the viewer's active organization. */
  hostOrganizationId?: string | null
  /** External collaborators use the access-authorized server snapshot instead of the member-only org API. */
  viewerIsHostOrganizationMember?: boolean
  /**
   * Org whitelabel settings fetched server-side from the DB by the workspace layout.
   * Used as the source of truth until the React Query result becomes available,
   * ensuring the correct org logo appears in the initial server HTML — no flash.
   */
  initialOrgSettings?: OrganizationWhitelabelSettings | null
}

interface BrandingProviderContentProps {
  children: React.ReactNode
  orgSettings: OrganizationWhitelabelSettings | undefined
  initialOrgSettings?: OrganizationWhitelabelSettings | null
}

function BrandingProviderContent({
  children,
  orgSettings,
  initialOrgSettings,
}: BrandingProviderContentProps) {
  const effectiveOrgSettings =
    orgSettings !== undefined ? orgSettings : (initialOrgSettings ?? null)

  const brandConfig = useMemo(
    () => mergeOrgBrandConfig(effectiveOrgSettings, getBrandConfig()),
    [effectiveOrgSettings]
  )

  const themeCSS = useMemo(
    () => (effectiveOrgSettings ? generateOrgThemeCSS(effectiveOrgSettings) : ''),
    [effectiveOrgSettings]
  )

  useEffect(() => {
    syncDocumentFavicon(brandConfig.faviconUrl)
  }, [brandConfig.faviconUrl])

  useEffect(() => {
    const instanceFaviconUrl = getBrandConfig().faviconUrl
    return () => {
      syncDocumentFavicon(instanceFaviconUrl)
    }
  }, [])

  return (
    <BrandingContext.Provider value={{ config: brandConfig }}>
      {themeCSS && <style>{themeCSS}</style>}
      {children}
    </BrandingContext.Provider>
  )
}

function LegacyBrandingProvider({ children, initialOrgSettings }: BrandingProviderProps) {
  const { data: orgsData } = useOrganizations()
  const orgId = orgsData?.activeOrganization?.id
  const { data: orgSettings } = useWhitelabelSettings(orgId)

  return (
    <BrandingProviderContent orgSettings={orgSettings} initialOrgSettings={initialOrgSettings}>
      {children}
    </BrandingProviderContent>
  )
}

function RoutedBrandingProvider({
  children,
  hostOrganizationId,
  viewerIsHostOrganizationMember,
  initialOrgSettings,
}: BrandingProviderProps) {
  const { data: orgSettings } = useWhitelabelSettings(
    viewerIsHostOrganizationMember ? (hostOrganizationId ?? undefined) : undefined
  )

  return (
    <BrandingProviderContent orgSettings={orgSettings} initialOrgSettings={initialOrgSettings}>
      {children}
    </BrandingProviderContent>
  )
}

/**
 * Provides merged branding (instance env vars + org DB settings) to the workspace.
 * Injects a `<style>` tag with CSS variable overrides when org colors are configured.
 */
export function BrandingProvider(props: BrandingProviderProps) {
  const { hostOrganizationId, viewerIsHostOrganizationMember } = props
  const usesRoutedWorkspaceContext =
    hostOrganizationId !== undefined || viewerIsHostOrganizationMember !== undefined

  if (usesRoutedWorkspaceContext) {
    return <RoutedBrandingProvider {...props} />
  }

  return <LegacyBrandingProvider {...props} />
}

/**
 * Returns the merged brand config (org settings overlaid on instance defaults).
 * Use this inside the workspace instead of `getBrandConfig()`.
 */
export function useOrgBrandConfig(): BrandConfig {
  return useContext(BrandingContext).config
}
