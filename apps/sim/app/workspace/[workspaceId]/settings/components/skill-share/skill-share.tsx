'use client'

import { ChipModalTabs } from '@sim/emcn'
import { useQueryStates } from 'nuqs'
import { SettingsPanel } from '@/app/workspace/[workspaceId]/settings/components/settings-panel'
import {
  type SkillShareTab,
  skillShareParsers,
  skillShareUrlKeys,
} from '@/app/workspace/[workspaceId]/settings/components/skill-share/search-params'
import { ShareSkillsPanel } from '@/app/workspace/[workspaceId]/settings/components/skill-share/share-skills-panel'
import { SkillServicesPanel } from '@/app/workspace/[workspaceId]/settings/components/skill-share/skill-services-panel'

const TABS: { id: SkillShareTab; label: string }[] = [
  { id: 'share', label: 'Share skills' },
  { id: 'services', label: 'Skill services' },
]

export function SkillShare() {
  const [{ tab }, setSkillShareParams] = useQueryStates(skillShareParsers, skillShareUrlKeys)

  return (
    <SettingsPanel>
      <div className='flex flex-col gap-6'>
        <ChipModalTabs
          tabs={TABS.map((item) => ({ value: item.id, label: item.label }))}
          value={tab}
          onChange={(value) => setSkillShareParams({ tab: value as SkillShareTab })}
          aria-label='Skill share sections'
        />
        {tab === 'share' ? <ShareSkillsPanel /> : <SkillServicesPanel />}
      </div>
    </SettingsPanel>
  )
}
