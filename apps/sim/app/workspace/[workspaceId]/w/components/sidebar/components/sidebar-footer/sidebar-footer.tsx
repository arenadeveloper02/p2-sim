'use client'

import type { SVGProps } from 'react'
import { chipContentLabelClass, chipVariants, cn } from '@sim/emcn'
// import type { ComponentType } from 'react'
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuTrigger,
//   Skeleton,
// } from '@sim/emcn'
// import { Credit, Settings, Trash, Users } from '@sim/emcn/icons'
// Help menu (commented out — Docs lives under Settings → Help):
// import { BookOpen, Download, HelpCircle } from '@sim/emcn/icons'
// import { Chip, chipPrimaryFillTokens, DropdownMenuSeparator } from '@sim/emcn'
// import type { DesktopUpdateState } from '@sim/desktop-bridge'
// import { SlackIcon } from '@/components/icons'
// import { getDesktopUpdates } from '@/lib/desktop'
// import { useSession } from '@/lib/auth/auth-client'
// import { canViewWorkspaceBillingSettings } from '@/lib/billing/workspace-permissions'
// import { isBillingEnabled } from '@/lib/core/config/env-flags'
// import { getUserColor } from '@/lib/workspaces/colors'
// import { useWorkspaceHostContext } from '@/app/workspace/[workspaceId]/providers/workspace-host-provider'
import type { SettingsSection } from '@/app/workspace/[workspaceId]/settings/navigation'
// import {
//   firstAccessibleSettingsSection,
//   useVisibleSettingsNavigation,
// } from '@/app/workspace/[workspaceId]/w/components/sidebar/components/settings-sidebar/use-visible-settings-navigation'
import {
  // SIDEBAR_ITEM_GAP_CLASS,
  SIDEBAR_RAIL_CHIP_CLASS,
} from '@/app/workspace/[workspaceId]/w/components/sidebar/constants'
import { SidebarTooltip } from '@/app/workspace/[workspaceId]/w/components/sidebar/sidebar'

// import { useUserProfile } from '@/hooks/queries/user-profile'
// import { useWorkspaceInvitePolicy } from '@/hooks/use-workspace-invite-policy'

// /**
//  * Settings destinations reachable from the profile menu, in display order. Labels
//  * and icons mirror the settings navigation entries they open, so the menu and the
//  * settings sidebar never disagree about what a section is called.
//  *
//  * Which of them a given viewer actually gets is decided in {@link SidebarFooter} —
//  * the same gates the settings sidebar and the section route apply, so the menu
//  * never lists a page the server would refuse.
//  */
// const PROFILE_MENU_ITEMS: readonly {
//   section: SettingsSection
//   label: string
//   icon: ComponentType<{ className?: string }>
// }[] = [
//   { section: 'general', label: 'Settings', icon: Settings },
//   { section: 'billing', label: 'Subscription', icon: Credit },
//   { section: 'teammates', label: 'Teammates', icon: Users },
//   { section: 'recently-deleted', label: 'Recently deleted', icon: Trash },
// ]

// function hasAvailableDesktopUpdate(state: DesktopUpdateState): boolean {
//   return state.status === 'available' || state.status === 'downloading' || state.status === 'ready'
// }
//
// function desktopUpdateActionLabel(state: DesktopUpdateState): string {
//   if (state.status === 'downloading') {
//     return state.percent === undefined
//       ? 'Downloading update…'
//       : `Downloading update ${state.percent}%`
//   }
//   return 'Update'
// }
//
// /** Compact primary update circle using the same footprint as the surrounding sidebar icons. */
// function DesktopUpdateIcon({ className }: { className?: string }) {
//   return (
//     <span
//       className={cn(
//         className,
//         'flex size-[17px] flex-shrink-0 items-center justify-center rounded-full',
//         chipPrimaryFillTokens
//       )}
//     >
//       <Download className='size-[11px]' viewBox='-1.75 -1.75 24 24' />
//     </span>
//   )
// }

/**
 * Circle with three horizontal dots — matches HelpCircle stroke geometry so it
 * sits flush with the other sidebar rail icons.
 */
function MoreCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width='24'
      height='24'
      viewBox='-1 -2 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.55'
      strokeLinecap='round'
      strokeLinejoin='round'
      xmlns='http://www.w3.org/2000/svg'
      aria-hidden='true'
      {...props}
    >
      <circle cx='10.25' cy='9.75' r='9' />
      <circle cx='6.25' cy='9.75' r='0.75' />
      <circle cx='10.25' cy='9.75' r='0.75' />
      <circle cx='14.25' cy='9.75' r='0.75' />
    </svg>
  )
}

interface SidebarFooterProps {
  workspaceId: string
  isCollapsed: boolean
  showCollapsedTooltips: boolean
  /** Routes to a settings section. Used by callers that already know the destination. */
  onOpenSettings: (section: SettingsSection) => void
  /** Opens the settings left nav without changing the current page. */
  onOpenSettingsMenu: () => void
  /** @deprecated Help moved to Settings → Help; kept for call-site compatibility. */
  onOpenDocs: () => void
  /** @deprecated Help moved to Settings → Help; kept for call-site compatibility. */
  onJoinSlack: () => void
  /** @deprecated Help moved to Settings → Help; kept for call-site compatibility. */
  onContactSupport: () => void
}

/**
 * Pinned bottom bar of the workspace sidebar. More opens the settings list in
 * place; a section is not routed until the user clicks it.
 */
export function SidebarFooter({
  // workspaceId,
  isCollapsed,
  showCollapsedTooltips,
  // onOpenSettings,
  onOpenSettingsMenu,
  // onOpenDocs,
  // onJoinSlack,
  // onContactSupport,
}: SidebarFooterProps) {
  // const { data: profile } = useUserProfile()
  // const { data: session } = useSession()
  // const hostContext = useWorkspaceHostContext()
  // const { isInvitationsDisabled } = useWorkspaceInvitePolicy(workspaceId)
  // const visibleSettings = useVisibleSettingsNavigation(workspaceId)
  // const firstSettingsSection = firstAccessibleSettingsSection(visibleSettings)
  // const [updateState, setUpdateState] = useState<DesktopUpdateState>({ status: 'idle' })
  //
  // useEffect(() => {
  //   const updates = getDesktopUpdates()
  //   if (!updates) return
  //
  //   let stateEventReceived = false
  //   const unsubscribe = updates.onState((state) => {
  //     stateEventReceived = true
  //     setUpdateState(state)
  //   })
  //   void updates
  //     .getState()
  //     .then((state) => {
  //       if (!stateEventReceived) setUpdateState(state)
  //     })
  //     .catch(() => {})
  //   return unsubscribe
  // }, [])
  //
  // const name = profile ? profile.name?.trim() || profile.email : ''
  // const updateAvailable = hasAvailableDesktopUpdate(updateState)
  //
  // const handleUpdateSelect = () => {
  //   const updates = getDesktopUpdates()
  //   if (updateState.status === 'ready') {
  //     updates?.install()
  //   } else if (updateState.status === 'available') {
  //     updates?.check()
  //   }
  // }

  // /**
  //  * Subscription is dropped for viewers the Billing page would turn away — a
  //  * deployment with billing off, or anyone who is not the payer (on an
  //  * organization-hosted workspace, every member who is not an org admin). The
  //  * settings sidebar hides its own Billing entry on exactly this test.
  //  */
  // const menuItems = PROFILE_MENU_ITEMS.filter(
  //   (item) =>
  //     item.section !== 'billing' || canViewWorkspaceBillingSettings(hostContext, session?.user?.id)
  // )

  // /**
  //  * Teammates is a dead end on a plan that cannot invite, so a blocked viewer is
  //  * sent to the plan itself instead — which resolves to the upgrade page for
  //  * anyone who cannot manage the payer. With billing off there is nowhere to send
  //  * them and no upgrade to make, so the row simply does nothing. This is the gate
  //  * the workspace switcher's "Manage workspace" entry carried before this menu
  //  * took the section over.
  //  */
  // const handleSelectSection = (section: SettingsSection) => {
  //   if (section === 'general') {
  //     if (firstSettingsSection) onOpenSettings(firstSettingsSection)
  //     return
  //   }
  //   if (section === 'teammates' && isInvitationsDisabled) {
  //     if (isBillingEnabled) onOpenSettings('billing')
  //     return
  //   }
  //   onOpenSettings(section)
  // }

  // /**
  //  * Built from plain `img`/`div` rather than the emcn `Avatar`, whose Radix root
  //  * renders a `<span>` — and globals fade every `span` in the collapsed rail to
  //  * `opacity: 0`, which blanked the avatar exactly where it is the only thing
  //  * left to see. The workspace header's logo sidesteps the same rule the same way.
  //  */
  // const avatar = !profile ? (
  //   <Skeleton className='size-[16px] flex-shrink-0 rounded-full' />
  // ) : profile.image ? (
  //   <img
  //     src={profile.image}
  //     alt=''
  //     referrerPolicy='no-referrer'
  //     className='size-[16px] flex-shrink-0 rounded-full object-cover'
  //   />
  // ) : (
  //   <div
  //     className='flex size-[16px] flex-shrink-0 items-center justify-center rounded-full text-[9px] text-white leading-none'
  //     style={{ backgroundColor: getUserColor(profile.id) }}
  //   >
  //     {name.charAt(0).toUpperCase()}
  //   </div>
  // )

  // const profileMenu = (
  //   <DropdownMenu>
  //     <SidebarTooltip label='More' enabled={showCollapsedTooltips}>
  //       <DropdownMenuTrigger asChild>
  //         <button
  //           type='button'
  //           data-item-id='profile'
  //           className={cn(
  //             chipVariants({ fullWidth: true }),
  //             isCollapsed ? 'min-w-0' : 'w-full',
  //             SIDEBAR_RAIL_CHIP_CLASS,
  //             'data-[state=open]:bg-[var(--surface-active)] data-[state=open]:hover-hover:bg-[var(--surface-active)]'
  //           )}
  //         >
  //           {avatar}
  //           {profile ? (
  //             <span className={cn('sidebar-collapse-hide', chipContentLabelClass)}>{name}</span>
  //           ) : (
  //             <Skeleton className='sidebar-collapse-hide h-[14px] w-[96px] rounded-sm' />
  //           )}
  //           <MoreCircle className='size-[14px] flex-shrink-0 text-[var(--text-icon)]' />
  //           <span className={cn('sidebar-collapse-hide', chipContentLabelClass)}>More</span>
  //         </button>
  //       </DropdownMenuTrigger>
  //     </SidebarTooltip>
  //     <DropdownMenuContent align='start' side='top' sideOffset={4}>
  //       {menuItems.map(({ section, label, icon: Icon }) => (
  //         <DropdownMenuItem key={section} onSelect={() => handleSelectSection(section)}>
  //           <Icon className='size-[14px]' />
  //           {label}
  //         </DropdownMenuItem>
  //       ))}
  //     </DropdownMenuContent>
  //   </DropdownMenu>
  // )

  // const helpMenu = (
  //   <DropdownMenu>
  //     <SidebarTooltip
  //       label={updateAvailable ? 'Help — update available' : 'Help'}
  //       enabled={showCollapsedTooltips}
  //     >
  //       <DropdownMenuTrigger asChild>
  //         <Chip
  //           data-item-id='help'
  //           aria-label={updateAvailable ? 'Help, update available' : 'Help'}
  //           leftIcon={updateAvailable ? DesktopUpdateIcon : HelpCircle}
  //           fullWidth={isCollapsed}
  //           className={cn('flex-shrink-0', SIDEBAR_RAIL_CHIP_CLASS)}
  //         />
  //       </DropdownMenuTrigger>
  //     </SidebarTooltip>
  //     <DropdownMenuContent align={isCollapsed ? 'start' : 'end'} side='top' sideOffset={4}>
  //       {updateAvailable && (
  //         <>
  //           <DropdownMenuItem
  //             onSelect={handleUpdateSelect}
  //             disabled={updateState.status === 'downloading'}
  //           >
  //             <img src='/favicon/favicon-32x32.png' alt='' className='size-[14px] rounded-[3px]' />
  //             {desktopUpdateActionLabel(updateState)}
  //           </DropdownMenuItem>
  //           <DropdownMenuSeparator />
  //         </>
  //       )}
  //       <DropdownMenuItem onSelect={onOpenDocs}>
  //         <BookOpen className='size-[14px]' />
  //         Docs
  //       </DropdownMenuItem>
  //       <DropdownMenuItem onSelect={onJoinSlack}>
  //         <SlackIcon className='size-[14px]' />
  //         Join Slack
  //       </DropdownMenuItem>
  //       <DropdownMenuItem onSelect={onContactSupport}>
  //         <HelpCircle className='size-[14px]' />
  //         Contact support
  //       </DropdownMenuItem>
  //     </DropdownMenuContent>
  //   </DropdownMenu>
  // )

  return (
    <div className='flex flex-shrink-0 border-t px-2 pt-[9px] pb-2'>
      <div className={cn('flex min-w-0', !isCollapsed && 'w-full flex-1')}>
        <SidebarTooltip label='More' enabled={showCollapsedTooltips}>
          {/* Opens the settings left nav in place. Do not route from this click. */}
          <button
            type='button'
            data-item-id='profile'
            className={cn(
              chipVariants({ fullWidth: true }),
              isCollapsed ? 'min-w-0' : 'w-full',
              SIDEBAR_RAIL_CHIP_CLASS
            )}
            onClick={onOpenSettingsMenu}
          >
            <MoreCircle className='size-[14px] flex-shrink-0 text-[var(--text-icon)]' />
            <span className={cn('sidebar-collapse-hide', chipContentLabelClass)}>More</span>
          </button>
        </SidebarTooltip>
      </div>
      {/* {helpMenu} */}
    </div>
  )
}
