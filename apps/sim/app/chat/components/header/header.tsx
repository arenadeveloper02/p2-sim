'use client'

import Image from 'next/image'
import Link from 'next/link'
import { GithubIcon } from '@/components/icons'
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
  workflowId?: string
}

export function ChatHeader({ chatConfig, starCount, workflowId }: ChatHeaderProps) {
  const brand = useBrandConfig()
  const primaryColor = chatConfig?.customizations?.primaryColor || 'var(--brand)'
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
      if (hostname.includes('sandbox-agent')) {
        return 'https://sandbox.thearena.ai/hub/agents'
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
      className={`flex w-full items-center justify-between px-4 pt-3 pb-[21px] sm:px-8 sm:pt-[8.5px] md:px-[44px] md:pt-4`}
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
              className='h-6 w-6 rounded-md object-cover'
            />
          )}
          <h2 className='font-medium text-[var(--landing-text)] text-lg'>
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
            className='flex items-center gap-2 text-[var(--landing-text-muted)] text-md transition-colors hover:text-[var(--landing-text)]'
            aria-label={`GitHub repository - ${starCount} stars`}
          >
            <GithubIcon className='h-[16px] w-[16px]' aria-hidden='true' />
            <span aria-live='polite'>{starCount}</span>
          </a>
          {/* Only show Sim logo if no custom branding is set */}

          <Link
            href='https://sim.ai'
            target='_blank'
            rel='noopener noreferrer'
            aria-label='Sim home'
          >
            <Image
              src='/logo/sim-landing.svg'
              alt='Sim'
              width={71}
              height={22}
              className='h-[22px] w-auto'
              priority
            />
          </Link>
        </div>
      )}
    </nav>
  )
}
