import { Suspense } from 'react'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ToastProvider } from '@/components/emcn'
import { getSession } from '@/lib/auth'
import { AppBanner } from '@/app/workspace/[workspaceId]/app-banner'
import { ImpersonationBanner } from '@/app/workspace/[workspaceId]/components/impersonation-banner'
import { WorkspaceChrome } from '@/app/workspace/[workspaceId]/components/workspace-chrome'
import { GlobalCommandsProvider } from '@/app/workspace/[workspaceId]/providers/global-commands-provider'
import { ProviderModelsLoader } from '@/app/workspace/[workspaceId]/providers/provider-models-loader'
import { SettingsLoader } from '@/app/workspace/[workspaceId]/providers/settings-loader'
import { WorkspacePermissionsProvider } from '@/app/workspace/[workspaceId]/providers/workspace-permissions-provider'
import { WorkspaceScopeSync } from '@/app/workspace/[workspaceId]/providers/workspace-scope-sync'
import { WorkspaceRouteLoading } from '@/app/workspace/workspace-route-loading'
import { getBrandConfig } from '@/ee/whitelabeling/branding'
import { BrandingProvider } from '@/ee/whitelabeling/components/branding-provider'
import { getActiveOrgWhitelabelSettings } from '@/ee/whitelabeling/org-branding'
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

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<WorkspaceRouteLoading />}>
      <WorkspaceLayoutInner>{children}</WorkspaceLayoutInner>
    </Suspense>
  )
}

async function WorkspaceLayoutInner({ children }: { children: React.ReactNode }) {
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
  const initialOrgSettings = await getActiveOrgWhitelabelSettings()

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
              <WorkspaceChrome>{children}</WorkspaceChrome>
            </WorkspacePermissionsProvider>
          </div>
        </GlobalCommandsProvider>
      </ToastProvider>
    </BrandingProvider>
  )
}
