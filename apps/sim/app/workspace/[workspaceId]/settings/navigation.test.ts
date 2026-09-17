import { describe, expect, it } from 'vitest'
import {
  ORGANIZATION_SETTINGS_ITEMS,
  SETTINGS_SECTION_REGISTRY,
} from '@/components/settings/navigation'
import {
  allNavigationItems,
  sectionConfig,
} from '@/app/workspace/[workspaceId]/settings/navigation'

describe('unified settings navigation', () => {
  it('groups settings by the scope they affect', () => {
    expect(sectionConfig).toEqual([
      { key: 'account', title: 'General' },
      { key: 'subscription', title: 'Subscription' },
      { key: 'help', title: 'Help' },
      { key: 'workspace', title: 'Configuration' },
      { key: 'organization', title: 'Organization' },
      { key: 'platform', title: 'Platform' },
    ])
  })

  it('exposes Docs under Help as an external link', () => {
    const docs = allNavigationItems.find((item) => item.id === 'docs')
    expect(docs).toMatchObject({
      id: 'docs',
      label: 'Docs',
      section: 'help',
      externalUrl: '/arena-ai-docs',
    })
  })

  it('keeps account, workspace, organization, and platform settings in one catalog', () => {
    expect(allNavigationItems.map(({ id, label, section }) => ({ id, label, section }))).toEqual(
      expect.arrayContaining([{ id: 'docs', label: 'Docs', section: 'help' }])
    )
    expect(
      allNavigationItems.some(({ id, section }) => id === 'general' && section === 'account')
    ).toBe(false)
  })

  it('orders each scope around its primary settings', () => {
    const idsForSection = (section: (typeof sectionConfig)[number]['key']) =>
      allNavigationItems
        .filter((item) => item.section === section)
        .sort((left, right) => left.order - right.order)
        .map(({ id }) => id)

    expect(idsForSection('account')).toEqual(
      expect.arrayContaining(['teammates', 'recently-deleted'])
    )
    expect(idsForSection('account')).not.toContain('general')
    expect(idsForSection('help')).toEqual(['docs'])
    expect(idsForSection('platform')).toEqual(expect.arrayContaining(['admin', 'skill-share']))
  })

  it('derives every unified item from exactly one registry entry', () => {
    expect(allNavigationItems).toHaveLength(
      SETTINGS_SECTION_REGISTRY.filter(({ unified }) => unified).length
    )
    for (const item of allNavigationItems) {
      expect(
        SETTINGS_SECTION_REGISTRY.filter(({ unified }) => unified?.id === item.id)
      ).toHaveLength(1)
    }
  })

  it('shares labels, icons, and docs links with plane projections', () => {
    const unifiedAuditLogs = allNavigationItems.find(({ id }) => id === 'audit-logs')
    const organizationAuditLogs = ORGANIZATION_SETTINGS_ITEMS.find(({ id }) => id === 'audit-logs')

    expect(unifiedAuditLogs?.docsLink).toBeDefined()
    expect(organizationAuditLogs?.label).toBe(unifiedAuditLogs?.label)
    expect(organizationAuditLogs?.icon).toBe(unifiedAuditLogs?.icon)
    expect(organizationAuditLogs?.docsLink).toBe(unifiedAuditLogs?.docsLink)
  })
})
