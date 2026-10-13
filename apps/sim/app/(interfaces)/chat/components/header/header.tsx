'use client'

import Image from 'next/image'
import { GithubIcon } from '@/components/icons'
import { getArenaHubAgentsUrl } from '@/lib/core/utils/urls'
import arenaLogo from '@/app/(interfaces)/chat/components/message/components/ArenaLogo.svg'
import { useBrandConfig } from '@/ee/whitelabeling'

interface ChatHeaderProps {
  chatConfig: {
    title?: string
    customizations?: {
      headerText?: string
      logoUrl?: string
      imageUrl?: string
      primaryColor?: string
    }
  } | null
  starCount: string
}

export function ChatHeader({ chatConfig, starCount }: ChatHeaderProps) {
  const brand = useBrandConfig()
  const customImage = chatConfig?.customizations?.imageUrl || chatConfig?.customizations?.logoUrl
  // Hard link to Arena — Next <Link href="/"> prefetches RSC for `/`, and the
  // proxy's unauthenticated Arena bounce then fails CORS on that fetch.
  const arenaHomeUrl =
    getArenaHubAgentsUrl(
      typeof window !== 'undefined' ? window.location.hostname : undefined
    ) ?? undefined

  return (
    <nav
      aria-label='Chat navigation'
      className='flex w-full items-center justify-between px-4 pt-3 pb-[21px] sm:px-8 sm:pt-[8.5px] md:px-[44px] md:pt-4'
    >
      <div className='flex items-center gap-[34px]'>
        <div className='flex items-center gap-3'>
          {customImage && (
            <Image
              src={customImage}
              alt={`${chatConfig?.title || 'Chat'} logo`}
              width={24}
              height={24}
              unoptimized
              className='size-6 rounded-md object-cover'
            />
          )}
          <h2 className='text-[var(--text-primary)] text-lg'>
            {chatConfig?.customizations?.headerText || chatConfig?.title || 'Chat'}
          </h2>
        </div>
      </div>

      {!brand.logoUrl && (
        <div className='flex items-center gap-4'>
          <a
            href='https://github.com/simstudioai/sim'
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center gap-2 text-[var(--text-muted)] transition-colors hover-hover:text-[var(--text-primary)]'
            aria-label={`GitHub repository - ${starCount} stars`}
          >
            <GithubIcon className='size-[16px]' aria-hidden='true' />
            <span aria-live='polite'>{starCount}</span>
          </a>
          {arenaHomeUrl ? (
            <a href={arenaHomeUrl} aria-label='Arena home' className='flex items-center'>
              <Image src={arenaLogo} alt='Arena' width={30} height={30} />
            </a>
          ) : (
            <span aria-label='Arena home' className='flex items-center'>
              <Image src={arenaLogo} alt='Arena' width={30} height={30} />
            </span>
          )}
        </div>
      )}
    </nav>
  )
}
