import { Suspense } from 'react'
import { IntegrationsManager } from '@/app/workspace/[workspaceId]/settings/components/integrations/integrations-manager'

export function Integrations() {
  return (
    <div className='h-full min-h-0'>
      <Suspense fallback={null}>
        <IntegrationsManager />
      </Suspense>
    </div>
  )
}
