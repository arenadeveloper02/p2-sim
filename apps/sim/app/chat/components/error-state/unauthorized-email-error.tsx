'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useBrandConfig } from '@/lib/branding/branding'
import { inter } from '@/app/_styles/fonts/inter/inter'
import { soehne } from '@/app/_styles/fonts/soehne/soehne'

interface UnauthorizedEmailErrorProps {
  message?: string
}

/**
 * Error component displayed when user's email is not authorized for the chat
 */
export function UnauthorizedEmailError({
  message = 'Email is not authorized for this chat',
}: UnauthorizedEmailErrorProps) {
  const router = useRouter()
  const [buttonClass, setButtonClass] = useState('auth-button-gradient')
  const brandConfig = useBrandConfig()

  useEffect(() => {
    // Check if CSS variable has been customized
    const checkCustomBrand = () => {
      const computedStyle = getComputedStyle(document.documentElement)
      const brandAccent = computedStyle.getPropertyValue('--brand-accent-hex').trim()

      // Check if the CSS variable exists and is different from the default
      if (brandAccent && brandAccent !== '#6f3dfa') {
        setButtonClass('auth-button-custom')
      } else {
        setButtonClass('auth-button-gradient')
      }
    }

    checkCustomBrand()

    // Also check on window resize or theme changes
    window.addEventListener('resize', checkCustomBrand)
    const observer = new MutationObserver(checkCustomBrand)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    })

    return () => {
      window.removeEventListener('resize', checkCustomBrand)
      observer.disconnect()
    }
  }, [])

  const handleExit = () => {
    router.push('/workspace')
  }

  return (
    <div className='min-h-screen bg-white'>
      <div className='flex min-h-screen items-center justify-center px-4'>
        <div className='w-full max-w-[410px]'>
          <div className='flex flex-col items-center justify-center'>
            {/* Brand logo */}
            <div className='mb-6 flex items-center justify-center'>
              {brandConfig.logoUrlBlacktext && (
                <Image
                  src={brandConfig.logoUrlBlacktext}
                  alt={`${brandConfig.name} Logo`}
                  width={68}
                  height={70}
                />
              )}
            </div>

            {/* Error content */}
            <div className='space-y-1 text-center'>
              <h1
                className={`${soehne.className} font-medium text-[32px] text-black tracking-tight`}
              >
                Access Denied
              </h1>
              <p className={`${inter.className} font-[380] text-[16px] text-muted-foreground`}>
                {message}
              </p>
            </div>

            {/* Action button with exit icon */}
            <div className='mt-8 w-full'>
              <Button
                type='button'
                onClick={handleExit}
                className={`${buttonClass} flex w-full items-center justify-center gap-2 rounded-[10px] border font-medium text-[15px] text-white transition-all duration-200`}
              >
                <X className='h-4 w-4' />
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div
        className={`${inter.className} auth-text-muted fixed right-0 bottom-0 left-0 z-50 pb-8 text-center font-[340] text-[13px] leading-relaxed`}
      >
        Need help?{' '}
        <a
          href={`mailto:${brandConfig.supportEmail}`}
          className='auth-link underline-offset-4 transition hover:underline'
        >
          Contact support
        </a>
      </div>
    </div>
  )
}
