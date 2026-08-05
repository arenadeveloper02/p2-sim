import { describe, expect, it, vi } from 'vitest'

/**
 * The Sandboxes section is dropped when no sandbox provider is configured, and
 * `allNavigationItems` is built once at module load — so this has to be set before
 * the module graph is imported, where a `beforeEach` would run too late. Pinning it
 * also keeps the catalog assertions off the developer's untracked `apps/sim/.env`,
 * which CI does not have.
 */
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SANDBOX_ENABLED = 'true'
})

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
      { key: 'account', title: 'Account' },
      { key: 'workspace', title: 'Workspace' },
      { key: 'organization', title: 'Organization' },
      { key: 'platform', title: 'Platform' },
    ])
  })

  it('keeps account, workspace, organization, and platform settings in one catalog', () => {
    expect(allNavigationItems.map(({ id, label, section }) => ({ id, label, section }))).toEqual([
      { id: 'general', label: 'General', section: 'account' },
      { id: 'desktop', label: 'Desktop', section: 'account' },
      { id: 'browser', label: 'Browser', section: 'account' },
      { id: 'terminal', label: 'Terminal', section: 'account' },
      { id: 'access-control', label: 'Permission groups', section: 'organization' },
      { id: 'audit-logs', label: 'Audit logs', section: 'organization' },
      { id: 'billing', label: 'Subscription', section: 'account' },
      { id: 'usage', label: 'Usage', section: 'account' },
      { id: 'teammates', label: 'Teammates', section: 'workspace' },
      { id: 'organization', label: 'Members', section: 'organization' },
      { id: 'oauth-apps', label: 'Custom OAuth Apps', section: 'organization' },
      { id: 'secrets', label: 'Secrets', section: 'workspace' },
      { id: 'custom-tools', label: 'Custom tools', section: 'workspace' },
      { id: 'mcp', label: 'MCP tools', section: 'workspace' },
      { id: 'apikeys', label: 'Sim API keys', section: 'workspace' },
      { id: 'workflow-mcp-servers', label: 'MCP servers', section: 'workspace' },
      { id: 'sandboxes', label: 'Sandboxes', section: 'workspace' },
      { id: 'recently-deleted', label: 'Recently deleted', section: 'workspace' },
      { id: 'self-host', label: 'Self hosting', section: 'platform' },
      { id: 'sessions', label: 'Session policies', section: 'organization' },
      { id: 'data-retention', label: 'Data retention', section: 'organization' },
      { id: 'whitelabeling', label: 'White-labeling', section: 'organization' },
      { id: 'admin', label: 'Admin', section: 'platform' },
    ])
  })

  it('orders each scope around its primary settings', () => {
    const idsForSection = (section: (typeof sectionConfig)[number]['key']) =>
      allNavigationItems
        .filter((item) => item.section === section)
        .sort((left, right) => left.order - right.order)
        .map(({ id }) => id)

    expect(idsForSection('account')).toEqual([
      'general',
      'billing',
      'usage',
      'desktop',
      'browser',
      'terminal',
    ])
    expect(idsForSection('workspace')).toEqual([
      'teammates',
      'secrets',
      'mcp',
      'custom-tools',
      'workflow-mcp-servers',
      'apikeys',
      'sandboxes',
      'recently-deleted',
    ])
    expect(idsForSection('organization')).toEqual([
      'organization',
      'oauth-apps',
      'access-control',
      'audit-logs',
      'whitelabeling',
      'sessions',
      'data-retention',
    ])
    expect(idsForSection('platform')).toEqual(['admin', 'self-host'])
  })

  it('only places unified items in sidebar sections that are rendered', () => {
    const sectionKeys = new Set(sectionConfig.map(({ key }) => key))
    for (const item of allNavigationItems) {
      expect(sectionKeys.has(item.section)).toBe(true)
    }
  })

  it('keeps Usage visible to every workspace member', () => {
    const usage = allNavigationItems.find(({ id }) => id === 'usage')
    expect(usage?.section).toBe('account')
    expect(usage).not.toHaveProperty('requiresWorkspaceAdmin')
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
