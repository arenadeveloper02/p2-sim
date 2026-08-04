import {
  buildUnifiedSettingsNavigation,
  SETTINGS_NAVIGATION_BILLING_ENABLED,
  type UnifiedNavigationSection,
  type UnifiedSettingsNavigationItem,
  type UnifiedSettingsSection,
} from '@/components/settings/navigation'
import { Credit, Key } from '@sim/emcn'

/** Fork-specific sections that extend the upstream's unified navigation. */
type ForkSettingsSection = 'usage' | 'oauth-apps' | 'copilot'

export type SettingsSection = UnifiedSettingsSection | ForkSettingsSection

export type NavigationSection = UnifiedNavigationSection

export type NavigationItem = UnifiedSettingsNavigationItem

export const isBillingEnabled = SETTINGS_NAVIGATION_BILLING_ENABLED

export const sectionConfig: { key: NavigationSection; title: string }[] = [
  { key: 'account', title: 'Account' },
  { key: 'workspace', title: 'Workspace' },
  { key: 'organization', title: 'Organization' },
  { key: 'platform', title: 'Platform' },
]

// double-cast-allowed: fork-specific sections extend the upstream type; the runtime ids are valid route segments
export const allNavigationItems: NavigationItem[] = [
  ...(buildUnifiedSettingsNavigation() as NavigationItem[]),
  {
    id: 'usage' as unknown as UnifiedSettingsSection,
    label: 'Usage',
    description: 'Review your credit usage and history.',
    icon: Credit,
    section: 'workspace',
    order: 99,
    hideWhenBillingDisabled: true,
  } as NavigationItem,
  {
    id: 'oauth-apps' as unknown as UnifiedSettingsSection,
    label: 'Custom OAuth Apps',
    description: "Register your organization's OAuth app credentials for integrations like Zoom.",
    icon: Key,
    section: 'organization',
    order: 100,
    hideWhenBillingDisabled: true,
    requiresHosted: true,
    requiresTeam: true,
  } as NavigationItem,
]

/**
 * Title + description for a settings section, the single source of truth used by
 * `SettingsPanel` to render the page header. Falls back to `null` for sections
 * that are gated off (callers render no title in that case).
 */
export function getSettingsSectionMeta(
  section: SettingsSection
): { label: string; description: string; docsLink?: string } | null {
  const item = allNavigationItems.find((navItem) => navItem.id === section)
  return item ? { label: item.label, description: item.description, docsLink: item.docsLink } : null
}
