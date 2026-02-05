'use client'

import Image from 'next/image'
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
  showFeedbackView?: boolean
}

export function ArenaChatHeader({
  chatConfig,
  starCount,
  showFeedbackView = false,
}: ChatHeaderProps) {
  const brand = useBrandConfig()
  const primaryColor = chatConfig?.customizations?.primaryColor || 'var(--brand-primary-hex)'
  const customImage = chatConfig?.customizations?.imageUrl || chatConfig?.customizations?.logoUrl

  return (
    <nav
      aria-label='Chat navigation'
      className={`mx-6 my-1 flex w-full items-center justify-between sm:mx-6 md:mx-6`}
    >
      <Image
        src='https://arenav2image.s3.us-west-1.amazonaws.com/rt/calibrate/Arena_Logo_WebDashboard.svg'
        alt='Arena Logo'
        width={68}
        height={70}
      />

      <h2 className={`${inter.className} font-semibold text-[#2C2D33] text-[18px]`}>
        {showFeedbackView
          ? 'User Feedback'
          : chatConfig?.customizations?.headerText || chatConfig?.title || 'Chat'}
      </h2>
      <div />
    </nav>
  )
}
