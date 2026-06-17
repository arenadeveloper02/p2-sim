import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Integrations } from '@/app/workspace/[workspaceId]/settings/components/integrations/integrations'

export const metadata: Metadata = {
  title: 'Integrations',
}

export default function IntegrationsSettingsPage() {
  return (
    <Suspense fallback={null}>
      <Integrations />
    </Suspense>
  )
}
