import { Suspense } from 'react'
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ToastProvider } from '@/components/emcn'
import { getSession } from '@/lib/auth'
import { getQueryClient } from '@/app/_shell/providers/get-query-client'
import { AppBanner } from '@/app/workspace/[workspaceId]/app-banner'
import { ImpersonationBanner } from '@/app/workspace/[workspaceId]/components/impersonation-banner'
import { WorkspaceChrome } from '@/app/workspace/[workspaceId]/components/workspace-chrome'
import { prefetchWorkspaceSidebar } from '@/app/workspace/[workspaceId]/prefetch'
import { GlobalCommandsProvider } from '@/app/workspace/[workspaceId]/providers/global-commands-provider'
import { ProviderModelsLoader } from '@/app/workspace/[workspaceId]/providers/provider-models-loader'
import { SettingsLoader } from '@/app/workspace/[workspaceId]/providers/settings-loader'
import { WorkspacePermissionsProvider } from '@/app/workspace/[workspaceId]/providers/workspace-permissions-provider'
import { WorkspaceScopeSync } from '@/app/workspace/[workspaceId]/providers/workspace-scope-sync'
import { WorkspaceRouteLoading } from '@/app/workspace/workspace-route-loading'
import { BrandingProvider } from '@/ee/whitelabeling/components/branding-provider'
import { getOrgWhitelabelSettings } from '@/ee/whitelabeling/org-branding'

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
    //this logic is for doing auto login
    const cookieStore = await cookies()
    const hasEmailCookie = !!cookieStore.get('email')?.value
    if (!hasEmailCookie) {
      redirect('/login')
    }
    //--------------
  }

  const { workspaceId } = await params
  const queryClient = getQueryClient()
  const sidebarPrefetch = prefetchWorkspaceSidebar(queryClient, workspaceId, session.user.id)

  // The organization plugin is conditionally spread so TS can't infer activeOrganizationId on the base session type.
  const orgId = (session?.session as { activeOrganizationId?: string } | null)?.activeOrganizationId
  const initialOrgSettings = orgId ? await getOrgWhitelabelSettings(orgId) : null

  await sidebarPrefetch

  return (
    <BrandingProvider initialOrgSettings={initialOrgSettings}>
      <ToastProvider>
        <SettingsLoader />
        <ProviderModelsLoader />
        <GlobalCommandsProvider>
          <div className='flex h-screen w-full flex-col overflow-hidden bg-[var(--surface-1)]'>
            <AppBanner />
            <ImpersonationBanner />
            <WorkspacePermissionsProvider>
              <WorkspaceScopeSync />
              <HydrationBoundary state={dehydrate(queryClient)}>
                <WorkspaceChrome>{children}</WorkspaceChrome>
              </HydrationBoundary>
            </WorkspacePermissionsProvider>
          </div>
        </GlobalCommandsProvider>
      </ToastProvider>
    </BrandingProvider>
  )
}
