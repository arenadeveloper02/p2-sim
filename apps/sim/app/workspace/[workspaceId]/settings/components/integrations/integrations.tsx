import { IntegrationsManager } from '@/app/workspace/[workspaceId]/settings/components/integrations/integrations-manager'
import { SettingsIntegrationsAutoLogin } from '@/app/workspace/[workspaceId]/settings/components/integrations/settings-integrations-auto-login'

export function Integrations() {
  return (
    <div className='h-full min-h-0'>
      <SettingsIntegrationsAutoLogin />
      <IntegrationsManager />
    </div>
  )
}
