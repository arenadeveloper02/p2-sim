import { Suspense } from 'react'
import { ToastProvider } from '@/components/emcn'
import { getSession } from '@/lib/auth'
import { NavTour } from '@/app/workspace/[workspaceId]/components/product-tour'
import { AppBanner } from '@/app/workspace/[workspaceId]/app-banner'
import { ImpersonationBanner } from '@/app/workspace/[workspaceId]/impersonation-banner'
import { GlobalCommandsProvider } from '@/app/workspace/[workspaceId]/providers/global-commands-provider'
import { ProviderModelsLoader } from '@/app/workspace/[workspaceId]/providers/provider-models-loader'
import { SettingsLoader } from '@/app/workspace/[workspaceId]/providers/settings-loader'
import { WorkspacePermissionsProvider } from '@/app/workspace/[workspaceId]/providers/workspace-permissions-provider'
import { WorkspaceScopeSync } from '@/app/workspace/[workspaceId]/providers/workspace-scope-sync'
import { Sidebar } from '@/app/workspace/[workspaceId]/w/components/sidebar/sidebar'
import { WorkspaceRouteLoading } from '@/app/workspace/workspace-route-loading'
import { BrandingProvider } from '@/ee/whitelabeling/components/branding-provider'
import { getOrgWhitelabelSettings } from '@/ee/whitelabeling/org-branding'

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<WorkspaceRouteLoading />}>
      <WorkspaceLayoutInner>{children}</WorkspaceLayoutInner>
    </Suspense>
  )
}

async function WorkspaceLayoutInner({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  // The organization plugin is conditionally spread so TS can't infer activeOrganizationId on the base session type.
  const orgId = (session?.session as { activeOrganizationId?: string } | null)?.activeOrganizationId
  const initialOrgSettings = orgId ? await getOrgWhitelabelSettings(orgId) : null

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
              <div className='flex min-h-0 flex-1'>
                <div className='shrink-0' suppressHydrationWarning>
                  <Sidebar />
                </div>
                <div className='flex min-w-0 flex-1 flex-col p-[8px] pl-0'>
                  <div className='flex-1 overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--bg)]'>
                    {children}
                  </div>
                </div>
              </div>
              <NavTour />
            </WorkspacePermissionsProvider>
          </div>
        </GlobalCommandsProvider>
      </ToastProvider>
    </BrandingProvider>
  )
}
