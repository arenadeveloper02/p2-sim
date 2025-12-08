'use client'

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  RotateCcw,
  ShieldX,
  UserPlus,
  Users2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useBrandConfig } from '@/lib/branding/branding'
import { inter } from '@/app/_styles/fonts/inter/inter'
import { soehne } from '@/app/_styles/fonts/soehne/soehne'

interface InviteStatusCardProps {
  type: 'login' | 'loading' | 'error' | 'success' | 'invitation' | 'warning'
  title: string
  description: string | React.ReactNode
  icon?: 'userPlus' | 'mail' | 'users' | 'error' | 'success' | 'warning'
  logoUrl?: string
  actions?: Array<{
    label: string
    onClick: () => void
    variant?: 'default' | 'outline' | 'ghost'
    disabled?: boolean
    loading?: boolean
  }>
  isExpiredError?: boolean
}

const iconMap = {
  userPlus: UserPlus,
  mail: Mail,
  users: Users2,
  error: ShieldX,
  success: CheckCircle2,
  warning: AlertCircle,
}

const iconColorMap = {
  userPlus: 'text-[var(--brand-primary-hex)]',
  mail: 'text-[var(--brand-primary-hex)]',
  users: 'text-[var(--brand-primary-hex)]',
  error: 'text-red-500 dark:text-red-400',
  success: 'text-green-500 dark:text-green-400',
  warning: 'text-yellow-600 dark:text-yellow-500',
}

const iconBgMap = {
  userPlus: 'bg-[var(--brand-primary-hex)]/10',
  mail: 'bg-[var(--brand-primary-hex)]/10',
  users: 'bg-[var(--brand-primary-hex)]/10',
  error: 'bg-red-50 dark:bg-red-950/20',
  success: 'bg-green-50 dark:bg-green-950/20',
  warning: 'bg-yellow-50 dark:bg-yellow-950/20',
}

export function InviteStatusCard({
  type,
  title,
  description,
  icon,
  logoUrl,
  actions = [],
  isExpiredError = false,
}: InviteStatusCardProps) {
  const router = useRouter()
  const brandConfig = useBrandConfig()

  if (type === 'loading') {
    return (
      <div className={`${soehne.className} space-y-6`}>
        <div className='space-y-1 text-center'>
          <h1 className='font-medium text-[32px] text-black tracking-tight'>Loading</h1>
          <p className={`${inter.className} font-[380] text-[16px] text-muted-foreground`}>
            {description}
          </p>
        </div>
        <div className='flex w-full items-center justify-center py-8'>
          <Loader2 className='h-8 w-8 animate-spin text-[var(--brand-primary-hex)]' />
        </div>

        <div
          className={`${inter.className} auth-text-muted fixed right-0 bottom-0 left-0 z-50 pb-8 text-center font-[340] text-[13px] leading-relaxed`}
        >
          Need help?{' '}
          <a
            href='mailto:help@sim.ai'
            className='auth-link underline-offset-4 transition hover:underline'
          >
            Contact support
          </a>
        </div>
      </div>
    )
  }

  const IconComponent = icon ? iconMap[icon] : null
  const iconColor = icon ? iconColorMap[icon] : ''
  const iconBg = icon ? iconBgMap[icon] : ''

  // Helper function to convert hex to rgba with opacity
  const hexToRgba = (hex: string, opacity: number): string => {
    const r = Number.parseInt(hex.slice(1, 3), 16)
    const g = Number.parseInt(hex.slice(3, 5), 16)
    const b = Number.parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }

  return (
    <div className={`${soehne.className} space-y-6`}>
      {(logoUrl || IconComponent) && (
        <div className='flex w-full items-center justify-center'>
          {logoUrl ? (
            <div className='flex h-16 w-16 items-center justify-center'>
              <img src={logoUrl} alt='Logo' className='h-full w-full object-contain' />
            </div>
          ) : IconComponent ? (
            <div className={`flex h-16 w-16 items-center justify-center rounded-full ${iconBg}`}>
              <IconComponent className={`h-8 w-8 ${iconColor}`} />
            </div>
          ) : null}
        </div>
      )}
      <div className='space-y-1 text-center'>
        <h1 className='font-medium text-[32px] text-black tracking-tight'>{title}</h1>
        <p className={`${inter.className} font-[380] text-[16px] text-muted-foreground`}>
          {description}
        </p>
      </div>

      <div className={`${inter.className} mt-8 space-y-8`}>
        <div className='flex w-full flex-col gap-3'>
          {isExpiredError && (
            <Button
              variant='outline'
              className='w-full rounded-[10px] border-[var(--brand-primary-hex)] font-medium text-[15px] text-[var(--brand-primary-hex)] transition-colors duration-200 hover:bg-[var(--brand-primary-hex)] hover:text-white'
              onClick={() => router.push('/')}
            >
              <RotateCcw className='mr-2 h-4 w-4' />
              Request New Invitation
            </Button>
          )}

          {actions.map((action, index) => {
            const isDefaultVariant = (action.variant || 'default') === 'default'
            const primaryColor = brandConfig.theme?.primaryColor || '#701ffc'
            const primaryHoverColor = brandConfig.theme?.primaryHoverColor || '#802fff'
            const shadowColor = hexToRgba(primaryColor, 0.2)

            return (
              <Button
                key={index}
                variant={action.variant || 'default'}
                className={
                  isDefaultVariant
                    ? `flex w-full items-center justify-center gap-2 rounded-[10px] border font-medium text-[15px] text-white transition-all duration-200`
                    : action.variant === 'outline'
                      ? 'w-full rounded-[10px] border-[var(--brand-primary-hex)] font-medium text-[15px] text-[var(--brand-primary-hex)] transition-colors duration-200 hover:bg-[var(--brand-primary-hex)] hover:text-white'
                      : 'w-full rounded-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground'
                }
                style={
                  isDefaultVariant
                    ? {
                        backgroundColor: primaryColor,
                        borderColor: primaryColor,
                        boxShadow: `0 10px 15px -3px ${shadowColor}, 0 4px 6px -2px ${shadowColor}`,
                      }
                    : undefined
                }
                onMouseEnter={(e) => {
                  if (isDefaultVariant) {
                    e.currentTarget.style.backgroundColor = primaryHoverColor
                    e.currentTarget.style.borderColor = primaryHoverColor
                  }
                }}
                onMouseLeave={(e) => {
                  if (isDefaultVariant) {
                    e.currentTarget.style.backgroundColor = primaryColor
                    e.currentTarget.style.borderColor = primaryColor
                  }
                }}
                onClick={action.onClick}
                disabled={action.disabled || action.loading}
              >
                {action.loading ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    {action.label}...
                  </>
                ) : (
                  action.label
                )}
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
