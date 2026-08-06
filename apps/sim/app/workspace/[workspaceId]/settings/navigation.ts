import { Credit, Key } from '@sim/emcn/icons'
import {
  buildUnifiedSettingsNavigation,
  SETTINGS_NAVIGATION_BILLING_ENABLED,
  type UnifiedNavigationSection,
  type UnifiedSettingsNavigationItem,
  type UnifiedSettingsSection,
} from '@/components/settings/navigation'

export type SettingsSection = UnifiedSettingsSection | 'usage' | 'oauth-apps'

export type NavigationSection = UnifiedNavigationSection

export type NavigationItem = Omit<UnifiedSettingsNavigationItem, 'id'> & {
  id: SettingsSection
  /** Visible only to workspace admins (viewer.isAdmin). */
  requiresWorkspaceAdmin?: boolean
}

export const isBillingEnabled = SETTINGS_NAVIGATION_BILLING_ENABLED

export const sectionConfig: { key: NavigationSection; title: string }[] = [
  { key: 'account', title: 'Account' },
  { key: 'tools', title: 'Tools' },
  { key: 'subscription', title: 'Subscription' },
  { key: 'system', title: 'System' },
  { key: 'enterprise', title: 'Enterprise' },
  { key: 'superuser', title: 'Superuser' },
]

/**
 * The upstream catalog is the canonical unified settings registry. Fork-only
 * entries are kept additive so consumers of the upstream catalog retain its
 * complete set of registered sections.
 */
export const allNavigationItems: NavigationItem[] = buildUnifiedSettingsNavigation()

export const forkOnlyNavigationItems: NavigationItem[] = [
  {
    id: 'usage',
    label: 'Usage',
    description: 'View token and cost analytics for your activity, workspace, or organization.',
    icon: Credit,
    section: 'subscription',
  },
  {
    id: 'oauth-apps',
    label: 'Custom OAuth Apps',
    description: "Register your organization's OAuth app credentials for integrations like Zoom.",
    icon: Key,
    section: 'subscription',
    hideWhenBillingDisabled: true,
    requiresHosted: true,
    requiresTeam: true,
  },
]

/** Sections implemented by the fork but absent from the upstream registry. */
export const FORK_ONLY_SETTINGS_SECTIONS: ReadonlySet<string> = new Set(
  forkOnlyNavigationItems.map((item) => item.id)
)

/** Sections intentionally hidden from the fork's workspace settings navigation. */
export const FORK_SUPPRESSED_SETTINGS_SECTIONS: ReadonlySet<string> = new Set([
  'sso',
  'forks',
  'data-drains',
  'credential-sets',
])

const FORK_SECTION_METADATA: Partial<
  Record<SettingsSection, { label: string; description: string }>
> = {
  apikeys: {
    label: 'Arena API keys',
    description: 'Create and manage API keys for the Arena API.',
  },
  usage: {
    label: 'Usage',
    description: 'View token and cost analytics for your activity, workspace, or organization.',
  },
  'oauth-apps': {
    label: 'Custom OAuth Apps',
    description: "Register your organization's OAuth app credentials for integrations like Zoom.",
  },
}

/**
 * Title and description for a settings section, including fork-specific Arena
 * copy and renderer-only sections.
 */
export function getSettingsSectionMeta(
  section: SettingsSection
): { label: string; description: string; docsLink?: string } | null {
  const forkMetadata = FORK_SECTION_METADATA[section]
  const item =
    allNavigationItems.find((navItem) => navItem.id === section) ??
    forkOnlyNavigationItems.find((navItem) => navItem.id === section)
  if (!item) return null

  return {
    label: forkMetadata?.label ?? item.label,
    description: forkMetadata?.description ?? item.description,
    docsLink: item.docsLink,
  }
}
