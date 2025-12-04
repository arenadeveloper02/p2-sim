'use client'

import Image from 'next/image'
import Link from 'next/link'
import { GithubIcon } from '@/components/icons'
import { useBrandConfig } from '@/lib/branding/branding'
import { inter } from '@/app/_styles/fonts/inter/inter'

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
  workflowId?: string
}

export function ChatHeader({ chatConfig, starCount, workflowId }: ChatHeaderProps) {
  const brand = useBrandConfig()
  const primaryColor = chatConfig?.customizations?.primaryColor || 'var(--brand-primary-hex)'
  const customImage = chatConfig?.customizations?.imageUrl || chatConfig?.customizations?.logoUrl

  const params = new URLSearchParams(window.location.search)
  const workspaceId = params.get('workspaceId')
  const isFromControlBar = params.get('fromControlBar') === 'true'

  // Determine environment and construct exit URL
  const getExitUrl = () => {
    // If opened from control bar, redirect to workspace
    if (isFromControlBar && workspaceId && workflowId) {
      return `/workspace/${workspaceId}/w/${workflowId}`
    }

    // Otherwise redirect based on environment
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname

      if (hostname.includes('localhost')) {
        return 'http://localhost:3001/hub/agents'
      }
      if (hostname.includes('dev-agent')) {
        return 'https://dev.thearena.ai/hub/agents'
      }
      if (hostname.includes('test-agent')) {
        return 'https://test.thearena.ai/hub/agents'
      }
      // prod - agent.thearena.ai
      return 'https://app.thearena.ai/hub/agents'
    }

    return '/'
  }

  const exitUrl = getExitUrl()

  return (
    <nav
      aria-label='Chat navigation'
      className={`flex w-full items-center justify-between px-4 pt-[12px] pb-[21px] sm:px-8 sm:pt-[8.5px] md:px-[44px] md:pt-[16px]`}
    >
      <div className='flex items-center gap-[34px]'>
        <div className='flex items-center gap-3'>
          {customImage && (
            <Image
              src={customImage}
              alt={`${chatConfig?.title || 'Chat'} logo`}
              width={24}
              height={24}
              className='h-6 w-6 rounded-md object-cover'
            />
          )}
          <h2 className={`${inter.className} font-medium text-[18px] text-foreground`}>
            {chatConfig?.customizations?.headerText || chatConfig?.title || 'Chat'}
          </h2>
        </div>
      </div>

      {!brand.logoUrl && (
        <div className='flex items-center gap-[16px]'>
          <a
            href='https://github.com/simstudioai/sim'
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center gap-2 text-[16px] text-muted-foreground transition-colors hover:text-foreground'
            aria-label={`GitHub repository - ${starCount} stars`}
          >
            <GithubIcon className='h-[16px] w-[16px]' aria-hidden='true' />
            <span className={`${inter.className}`} aria-live='polite'>
              {starCount}
            </span>
          </a>
          {/* Only show Sim logo if no custom branding is set */}

          <Link
            href='https://sim.ai'
            target='_blank'
            rel='noopener noreferrer'
            aria-label='Sim home'
          >
            <Image
              src='/logo/b&w/text/small.png'
              alt='Sim - Workflows for LLMs'
              width={29.869884}
              height={14.5656}
              className='h-[14.5656px] w-auto pb-[1px]'
              priority
              loading='eager'
              quality={100}
            />
          </Link>
        </div>
      )}
    </nav>
  )
}
