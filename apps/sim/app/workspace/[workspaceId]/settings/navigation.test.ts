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
  it('preserves the original settings groups', () => {
    expect(sectionConfig).toEqual([
      { key: 'account', title: 'Account' },
      { key: 'tools', title: 'Tools' },
      { key: 'subscription', title: 'Subscription' },
      { key: 'system', title: 'System' },
      { key: 'desktop', title: 'Desktop' },
      { key: 'enterprise', title: 'Enterprise' },
      { key: 'superuser', title: 'Superuser' },
    ])
  })

  it('keeps account, workspace, organization, and platform settings in one catalog', () => {
    expect(allNavigationItems.map(({ id, label, section }) => ({ id, label, section }))).toEqual([
      { id: 'general', label: 'General', section: 'account' },
      { id: 'desktop', label: 'Desktop', section: 'desktop' },
      { id: 'browser', label: 'Browser', section: 'desktop' },
      { id: 'terminal', label: 'Terminal', section: 'desktop' },
      { id: 'access-control', label: 'Access control', section: 'enterprise' },
      { id: 'audit-logs', label: 'Audit logs', section: 'enterprise' },
      { id: 'billing', label: 'Billing', section: 'subscription' },
      { id: 'usage', label: 'Usage', section: 'subscription' },
      { id: 'teammates', label: 'Teammates', section: 'subscription' },
      { id: 'organization', label: 'Organization', section: 'subscription' },
      { id: 'oauth-apps', label: 'Custom OAuth Apps', section: 'subscription' },
      { id: 'secrets', label: 'Secrets', section: 'account' },
      { id: 'custom-tools', label: 'Custom tools', section: 'tools' },
      { id: 'mcp', label: 'MCP tools', section: 'tools' },
      { id: 'apikeys', label: 'Sim API keys', section: 'system' },
      { id: 'workflow-mcp-servers', label: 'MCP servers', section: 'system' },
      { id: 'recently-deleted', label: 'Recently deleted', section: 'system' },
      { id: 'sessions', label: 'Session policies', section: 'enterprise' },
      { id: 'data-retention', label: 'Data retention', section: 'enterprise' },
      { id: 'whitelabeling', label: 'Whitelabeling', section: 'enterprise' },
      { id: 'admin', label: 'Admin', section: 'superuser' },
    ])
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
