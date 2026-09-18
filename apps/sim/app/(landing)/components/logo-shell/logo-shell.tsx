import type { ReactNode } from 'react'
import { LogoPage } from '@sim/emcn'
import Image from 'next/image'
import Link from 'next/link'
import { DesktopTitleBarLane } from '@/app/_shell/desktop-title-bar'
import arenaLogo from '@/app/(interfaces)/chat/components/message/components/ArenaLogo.svg'
import { LogoMark } from '@/app/(landing)/components/navbar/components/logo-mark'

/**
 * The canonical light, logo-only page frame — an Arena mark linking home, no
 * marketing menus. The Arena mark has no dark/light variants, so the header
 * always renders that one asset. Status pages can inherit the active theme
 * via `theme="inherit"`; public interfaces stay on light tokens.
 *
 * Children decide their own layout: pass `center` for a single centered column
 * (404 message, simple gates); omit it for full-width content (the live chat
 * overlay, which covers this frame entirely). An optional `footer`
 * slot renders pinned at the bottom.
 */
interface LogoShellProps {
  children: ReactNode
  /** Center content in the viewport (for short messages / forms). Default: full-width. */
  center?: boolean
  /** Optional footer rendered after the content (e.g. a support footer). */
  footer?: ReactNode
  /** Override the default Arena mark. */
  logo?: ReactNode
  /** Home link for the header logo. Defaults to `/`. */
  logoHref?: string
  /** Accessible label for the header logo link. Defaults to `Arena home`. */
  logoLabel?: string
  /** Status pages follow the active theme; public interfaces retain their light appearance. */
  theme?: 'light' | 'inherit'
}

export function LogoShell({
  children,
  center = false,
  footer,
  logo,
  logoHref = '/',
  logoLabel = 'Arena home',
  theme = 'light',
}: LogoShellProps) {
  return (
    <LogoPage
      className='desktop-title-bar-page'
      titleBar={<DesktopTitleBarLane />}
      center={center}
      theme={theme}
      footer={footer}
      logo={
        <Link href={logoHref} aria-label={logoLabel} className='flex h-[30px] items-center'>
          {logo ?? (
            <LogoMark>
              <Image src={arenaLogo} alt='Arena' width={30} height={30} priority />
            </LogoMark>
          )}
        </Link>
      }
    >
      {children}
    </LogoPage>
  )
}
