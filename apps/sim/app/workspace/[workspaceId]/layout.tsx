import { Suspense } from 'react'
import { ToastProvider } from '@sim/emcn'
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getActiveOrganizationId } from '@/lib/auth/session-response'
import { getQueryClient } from '@/app/_shell/providers/get-query-client'
import { AppBanner } from '@/app/workspace/[workspaceId]/app-banner'
import {
  ImpersonationBanner,
  ImpersonationExpired,
} from '@/app/workspace/[workspaceId]/components/impersonation-banner'
import { WorkspaceAccessDenied } from '@/app/workspace/[workspaceId]/components/workspace-access-denied'
import { WorkspaceChrome } from '@/app/workspace/[workspaceId]/components/workspace-chrome'
import {
  prefetchWorkspaceHostContext,
  prefetchWorkspaceSidebar,
} from '@/app/workspace/[workspaceId]/prefetch'
import { BlockVisibilityLoader } from '@/app/workspace/[workspaceId]/providers/block-visibility-loader'
import { CustomBlocksLoader } from '@/app/workspace/[workspaceId]/providers/custom-blocks-loader'
import { GlobalCommandsProvider } from '@/app/workspace/[workspaceId]/providers/global-commands-provider'
import { ProviderModelsLoader } from '@/app/workspace/[workspaceId]/providers/provider-models-loader'
import { SettingsLoader } from '@/app/workspace/[workspaceId]/providers/settings-loader'
import { WorkspaceHostProvider } from '@/app/workspace/[workspaceId]/providers/workspace-host-provider'
import { WorkspacePermissionsProvider } from '@/app/workspace/[workspaceId]/providers/workspace-permissions-provider'
import { WorkspaceScopeSync } from '@/app/workspace/[workspaceId]/providers/workspace-scope-sync'
import { WorkspaceRouteLoading } from '@/app/workspace/workspace-route-loading'
import { getBrandConfig } from '@/ee/whitelabeling/branding'
import { BrandingProvider } from '@/ee/whitelabeling/components/branding-provider'
import {
  getActiveOrgWhitelabelSettings,
  getOrgWhitelabelSettings,
} from '@/ee/whitelabeling/org-branding'
import { resolveOrgFaviconUrl } from '@/ee/whitelabeling/org-branding-utils'

export async function generateMetadata(): Promise<Metadata> {
  const orgSettings = await getActiveOrgWhitelabelSettings()
  const faviconUrl = resolveOrgFaviconUrl(orgSettings, getBrandConfig().faviconUrl)

  if (!faviconUrl) {
    return {}
  }

  return {
    icons: {
      icon: [{ url: faviconUrl, sizes: 'any' }],
      shortcut: faviconUrl,
    },
  }
}

export default function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  return (
    <Suspense fallback={<WorkspaceRouteLoading />}>
      <WorkspaceLayoutInner params={params}>{children}</WorkspaceLayoutInner>
    </Suspense>
  )
}

async function WorkspaceLayoutInner({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  const session = await getSession()
  if (!session?.user) {
    // Allow render when an email cookie is present so AutoLoginProvider can establish a session
    // (Arena iframe embeds rely on the shared `email` cookie across *.thearena.ai).
    const cookieStore = await cookies()
    const hasEmailCookie = !!cookieStore.get('email')?.value
    if (!hasEmailCookie) {
      redirect('/login')
    }
  }

  const { workspaceId } = await params
  const queryClient = getQueryClient()
  const hostContext = await prefetchWorkspaceHostContext(queryClient, workspaceId, session.user.id)
  if (!hostContext) {
    return <WorkspaceAccessDenied />
  }

  const activeOrganizationId = getActiveOrganizationId(session)
  const [cookieStore, initialOrgSettings] = await Promise.all([
    cookies(),
    hostContext.hostOrganizationId
      ? getOrgWhitelabelSettings(hostContext.hostOrganizationId)
      : Promise.resolve(null),
    prefetchWorkspaceSidebar(
      queryClient,
      workspaceId,
      session.user.id,
      hostContext,
      activeOrganizationId
    ),
  ])
  const initialSidebarCollapsed = cookieStore.get('sidebar_collapsed')?.value === '1'

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <WorkspaceHostProvider workspaceId={workspaceId} initialContext={hostContext}>
        <BrandingProvider
          hostOrganizationId={hostContext.hostOrganizationId}
          viewerIsHostOrganizationMember={hostContext.viewer.isHostOrganizationMember}
          initialOrgSettings={initialOrgSettings}
        >
          <ToastProvider>
            <SettingsLoader />
            <ProviderModelsLoader />
            <CustomBlocksLoader />
            <BlockVisibilityLoader />
            <GlobalCommandsProvider>
              <div className='flex h-screen w-full flex-col overflow-hidden bg-[var(--surface-1)]'>
                <AppBanner />
                <ImpersonationBanner />
                <ImpersonationExpired />
                <WorkspacePermissionsProvider>
                  <WorkspaceScopeSync />
                  <WorkspaceChrome initialSidebarCollapsed={initialSidebarCollapsed}>
                    {children}
                  </WorkspaceChrome>
                </WorkspacePermissionsProvider>
              </div>
            </GlobalCommandsProvider>
          </ToastProvider>
        </BrandingProvider>
      </WorkspaceHostProvider>
    </HydrationBoundary>
  )
}
