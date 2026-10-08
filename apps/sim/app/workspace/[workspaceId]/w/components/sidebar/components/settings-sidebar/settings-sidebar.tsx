'use client'

import { useCallback, useMemo, useRef } from 'react'
import {
  Chip,
  ChipConfirmModal,
  ChipTag,
  chipContentIconClass,
  chipVariants,
  cn,
  OverflowText,
  scrollFadeAttributes,
  scrollFadeClass,
  useScrollEdges,
} from '@sim/emcn'
import { ArrowUpRight, Building, ChevronLeft, Lock } from '@sim/emcn/icons'
import { useQueryClient } from '@tanstack/react-query'
import { useParams, usePathname, useRouter } from 'next/navigation'
import {
  getOrganizationSettingsHref,
  getSettingsPermissionConfigKey,
  isSelfHostedOverrideEnabled,
  ORGANIZATION_PLANE_UNIFIED_SECTIONS,
} from '@/components/settings/navigation'
import { SettingsIntentLink } from '@/components/settings/settings-intent-link'
import { useSettingsNavigationState } from '@/components/settings/settings-navigation-provider'
import { getSubscriptionAccessState } from '@/lib/billing/client'
import { useDeploymentShape } from '@/lib/core/config/deployment-shape'
import { useWorkspaceHostContext } from '@/app/workspace/[workspaceId]/providers/workspace-host-provider'
import type { SettingsSection } from '@/app/workspace/[workspaceId]/settings/navigation'
import { sectionConfig } from '@/app/workspace/[workspaceId]/settings/navigation'
import { warmSettingsSection } from '@/app/workspace/[workspaceId]/settings/section-warmers'
import { useVisibleSettingsNavigation } from '@/app/workspace/[workspaceId]/w/components/sidebar/components/settings-sidebar/use-visible-settings-navigation'
import { SidebarSection } from '@/app/workspace/[workspaceId]/w/components/sidebar/components/sidebar-section'
import { SidebarTooltip } from '@/app/workspace/[workspaceId]/w/components/sidebar/components/sidebar-tooltip'
import {
  SIDEBAR_DIVIDER_PAD_ABOVE_CLASS,
  SIDEBAR_DIVIDER_PAD_BELOW_CLASS,
  SIDEBAR_ITEM_GAP_CLASS,
  SIDEBAR_RAIL_CHIP_CLASS,
  SIDEBAR_SECTION_GAP_CLASS,
} from '@/app/workspace/[workspaceId]/w/components/sidebar/constants'
import { useInboxConfig } from '@/hooks/queries/inbox'
import { usePermissionConfig } from '@/hooks/use-permission-config'
import { useSettingsNavigation } from '@/hooks/use-settings-navigation'
import { useSettingsDirtyStore } from '@/stores/settings/dirty/store'

interface SettingsSidebarProps {
  isCollapsed?: boolean
  showCollapsedTooltips?: boolean
  /**
   * When set, Back closes the settings list without leaving the current page.
   * Used when More opens the list before any settings route is selected.
   */
  onClose?: () => void
}

function warmArenaSettingsSection(section: SettingsSection) {
  if (section === 'general') {
    void import('@/app/workspace/[workspaceId]/settings/components/general/general')
    return
  }
  if (section === 'arena-billing') {
    void import('@/app/workspace/[workspaceId]/settings/components/billing-usage')
    return
  }
  if (section === 'usage') {
    void import('@/app/workspace/[workspaceId]/settings/components/usage/usage')
  }
}

export function SettingsSidebar({
  isCollapsed = false,
  showCollapsedTooltips = false,
  onClose,
}: SettingsSidebarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollContentRef = useRef<HTMLDivElement>(null)

  const params = useParams()
  const workspaceId = params.workspaceId as string
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()

  const requestLeave = useSettingsDirtyStore((s) => s.requestLeave)
  const confirmLeave = useSettingsDirtyStore((s) => s.confirmLeave)
  const cancelLeave = useSettingsDirtyStore((s) => s.cancelLeave)
  const pendingLeave = useSettingsDirtyStore((s) => s.pendingLeave)
  const showDiscardDialog = pendingLeave !== null

  const scrollEdges = useScrollEdges(scrollContainerRef, {
    contentRef: scrollContentRef,
    enabled: !isCollapsed,
  })

  const hostContext = useWorkspaceHostContext()
  const deployment = useDeploymentShape()
  const { data: inboxConfig } = useInboxConfig(workspaceId)
  const navigationItems = useVisibleSettingsNavigation(workspaceId)
  const { config: permissionConfig } = usePermissionConfig()
  const subscriptionAccess = getSubscriptionAccessState(hostContext.ownerBilling)
  const inboxEntitled = inboxConfig?.entitled ?? false
  const organizationSettingsId =
    hostContext.features?.organizationSearch && hostContext.viewer.isHostOrganizationMember
      ? hostContext.hostOrganizationId
      : null

  const sidebarItems = useMemo(() => {
    if (!organizationSettingsId) return navigationItems
    return navigationItems.filter((item) => !ORGANIZATION_PLANE_UNIFIED_SECTIONS.has(item.id))
  }, [navigationItems, organizationSettingsId])

  const segments = pathname?.split('/') ?? []
  const settingsIndex = segments.indexOf('settings')
  const routeSection: SettingsSection | null =
    settingsIndex !== -1 && segments[settingsIndex + 1]
      ? (segments[settingsIndex + 1] as SettingsSection)
      : null
  const { pendingSection, navigateToSection, signalIntent } = useSettingsNavigationState()
  const activeSection = (pendingSection as SettingsSection | null) ?? routeSection

  const { popSettingsReturnUrl, getSettingsHref } = useSettingsNavigation()

  const handleBack = useCallback(() => {
    if (onClose) {
      onClose()
      return
    }
    requestLeave(() => {
      router.push(popSettingsReturnUrl(`/workspace/${workspaceId}`))
    })
  }, [onClose, requestLeave, router, popSettingsReturnUrl, workspaceId])

  const handleConfirmDiscard = useCallback(() => {
    confirmLeave()
  }, [confirmLeave])

  const handleCancelDiscard = useCallback(() => {
    cancelLeave()
  }, [cancelLeave])

  const warmSection = useCallback(
    (section: SettingsSection) => {
      signalIntent(section)
      warmSettingsSection(
        queryClient,
        { workspaceId, billingOrganizationId: hostContext.hostOrganizationId },
        section
      )
      warmArenaSettingsSection(section)
    },
    [hostContext.hostOrganizationId, queryClient, signalIntent, workspaceId]
  )

  return (
    <>
      {/* The divider is the pinned block's bottom rule, not the scroll region's top one:
          the region's edge fade masks its own first pixels, which would erase a rule
          drawn there exactly when it should show. Same construction as the footer. */}
      <div
        className={cn(
          SIDEBAR_SECTION_GAP_CLASS,
          SIDEBAR_ITEM_GAP_CLASS,
          SIDEBAR_DIVIDER_PAD_ABOVE_CLASS,
          'flex shrink-0 flex-col border-b px-2 transition-colors duration-150',
          !scrollEdges.top && 'border-transparent'
        )}
      >
        <SidebarTooltip label='Back' enabled={showCollapsedTooltips}>
          <Chip
            fullWidth
            leftIcon={ChevronLeft}
            onClick={handleBack}
            className={SIDEBAR_RAIL_CHIP_CLASS}
          >
            <span className='sidebar-collapse-hide'>Back</span>
          </Chip>
        </SidebarTooltip>
      </div>

      <div
        ref={isCollapsed ? undefined : scrollContainerRef}
        className={cn(
          SIDEBAR_DIVIDER_PAD_BELOW_CLASS,
          SIDEBAR_DIVIDER_PAD_ABOVE_CLASS,
          scrollFadeClass,
          'flex flex-1 flex-col overflow-y-auto overflow-x-hidden'
        )}
        {...scrollFadeAttributes(scrollEdges)}
      >
        <div ref={scrollContentRef} className='flex flex-col'>
          {sectionConfig
            .map(({ key, title }) => ({
              key,
              title,
              items: sidebarItems
                .filter((item) => item.section === key)
                .sort((left, right) => left.order - right.order),
            }))
            .filter(
              ({ key, items }) =>
                items.length > 0 || (key === 'organization' && organizationSettingsId)
            )
            .map(({ key, title, items: sectionItems }, index) => (
              <SidebarSection
                key={key}
                title={title}
                railCollapsed={isCollapsed}
                className={cn(index > 0 && SIDEBAR_SECTION_GAP_CLASS, 'shrink-0')}
              >
                <div className={cn(SIDEBAR_ITEM_GAP_CLASS, 'flex flex-col px-2')}>
                  {key === 'organization' && organizationSettingsId && (
                    <SidebarTooltip label='Organization' enabled={showCollapsedTooltips}>
                      <SettingsIntentLink
                        href={getOrganizationSettingsHref(organizationSettingsId, 'members')}
                        className={cn(chipVariants({ fullWidth: true }), SIDEBAR_RAIL_CHIP_CLASS)}
                        onNavigate={(event) => {
                          if (!useSettingsDirtyStore.getState().isDirty) return
                          event.preventDefault()
                          requestLeave(() =>
                            router.push(
                              getOrganizationSettingsHref(organizationSettingsId, 'members')
                            )
                          )
                        }}
                      >
                        <Building className={chipContentIconClass} />
                        <OverflowText
                          label='Organization'
                          className='sidebar-collapse-hide text-[var(--text-body)]'
                        />
                        <ArrowUpRight
                          className={cn('sidebar-collapse-hide ml-auto', chipContentIconClass)}
                        />
                      </SettingsIntentLink>
                    </SidebarTooltip>
                  )}
                  {sectionItems.map((item) => {
                    const Icon = item.icon
                    const active = activeSection === item.id
                    const accessFeature = getSettingsPermissionConfigKey(item.id)
                    const permissionRestricted = accessFeature
                      ? Boolean(permissionConfig[accessFeature])
                      : false
                    const section = item.id
                    const href = getSettingsHref({ section })
                    const selfHostedUnlocked = isSelfHostedOverrideEnabled(
                      item.selfHostedOverride,
                      deployment
                    )
                    const isLocked =
                      !selfHostedUnlocked &&
                      item.requiresMax &&
                      (item.id === 'inbox'
                        ? !inboxEntitled
                        : !subscriptionAccess.hasUsableMaxAccess)
                    const itemClassName = cn(
                      chipVariants({ active, fullWidth: true }),
                      SIDEBAR_RAIL_CHIP_CLASS
                    )
                    const content = (
                      <>
                        <Icon className={chipContentIconClass} />
                        <OverflowText
                          label={item.label}
                          className='sidebar-collapse-hide text-[var(--text-body)]'
                          tooltipEnabled={!showCollapsedTooltips}
                        />
                        {permissionRestricted && (
                          <Lock
                            className={cn('sidebar-collapse-hide ml-auto', chipContentIconClass)}
                            aria-hidden
                          />
                        )}
                        {isLocked && (
                          <ChipTag
                            variant='mono'
                            className='sidebar-collapse-hide ml-auto shrink-0'
                          >
                            Max
                          </ChipTag>
                        )}
                      </>
                    )

                    const element = item.externalUrl ? (
                      <a
                        href={item.externalUrl}
                        target='_blank'
                        rel='noopener noreferrer'
                        className={itemClassName}
                      >
                        {content}
                      </a>
                    ) : (
                      <SettingsIntentLink
                        href={href}
                        replace
                        scroll={false}
                        aria-current={active ? 'page' : undefined}
                        aria-label={
                          permissionRestricted ? `${item.label}: access required` : undefined
                        }
                        className={itemClassName}
                        onIntent={() => {
                          if (permissionRestricted) return
                          warmSection(section)
                        }}
                        onNavigate={(event) => {
                          if (active) {
                            event.preventDefault()
                            return
                          }
                          event.preventDefault()
                          const preview = section === routeSection ? null : section
                          if (!useSettingsDirtyStore.getState().isDirty) {
                            navigateToSection(preview, href)
                            return
                          }
                          requestLeave(() => navigateToSection(preview, href))
                        }}
                      >
                        {content}
                      </SettingsIntentLink>
                    )

                    return (
                      <SidebarTooltip
                        key={item.id}
                        label={item.label}
                        enabled={showCollapsedTooltips}
                      >
                        {element}
                      </SidebarTooltip>
                    )
                  })}
                </div>
              </SidebarSection>
            ))}
        </div>
      </div>

      <ChipConfirmModal
        open={showDiscardDialog}
        onOpenChange={(open) => !open && handleCancelDiscard()}
        srTitle='Unsaved changes'
        title='Unsaved changes'
        text='You have unsaved changes. Are you sure you want to discard them?'
        dismissLabel='Keep editing'
        confirm={{
          label: 'Discard changes',
          onClick: handleConfirmDiscard,
        }}
      />
    </>
  )
}
