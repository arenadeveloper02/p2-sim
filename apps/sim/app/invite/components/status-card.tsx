'use client'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/core/utils/cn'

interface InviteStatusCardProps {
  type: 'login' | 'loading' | 'error' | 'success' | 'invitation' | 'warning'
  title: string
  description: string | React.ReactNode
  icon?: 'userPlus' | 'mail' | 'users' | 'error' | 'success' | 'warning'
  logoUrl?: string
  actions?: Array<{
    label: string
    onClick: () => void
    disabled?: boolean
    loading?: boolean
  }>
  isExpiredError?: boolean
}

export function InviteStatusCard({
  type,
  title,
  description,
  logoUrl,
  icon: _icon,
  actions = [],
  isExpiredError = false,
}: InviteStatusCardProps) {
  const router = useRouter()

  if (type === 'loading') {
    return (
      <>
        <div className='space-y-1 text-center'>
          <h1 className='font-[500] text-[32px] dark:text-[var(--landing-text)] text-black tracking-tight'>
            Loading
          </h1>
          <p className='font-[380] text-[var(--landing-text-muted)] text-md'>{description}</p>
        </div>
        <div className='mt-8 flex w-full items-center justify-center py-8'>
          <Loader2 className='h-8 w-8 animate-spin text-[var(--landing-text-muted)]' />
        </div>
      </>
    )
  }

  return (
    <>
      <div className='space-y-1 text-center'>
        <h1 className='font-[500] text-[32px] dark:text-[var(--landing-text)] text-black tracking-tight'>
          {title}
        </h1>
        <p className='font-[380] text-[var(--landing-text-muted)] text-md'>{description}</p>
      </div>

      <div className='mt-8 w-full max-w-[410px] space-y-3'>
        {isExpiredError && (
          <button
            onClick={() => router.push('/')}
            className='inline-flex h-[32px] w-full items-center justify-center gap-2 rounded-[5px] bg-[var(--brand-400)] px-2.5 font-[430] font-season text-white text-sm transition-colors hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50'
          >
            Request New Invitation
          </button>
        )}

        {actions.map((action, index) => (
          <button
            key={index}
            onClick={action.onClick}
            disabled={action.disabled || action.loading}
            className={cn(
              'inline-flex h-[32px] w-full items-center justify-center gap-2 rounded-[5px] dark:bg-white bg-[var(--brand-400)] px-2.5 font-[430] font-season text-white text-sm transition-colors hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50',
              index !== 0 &&
                'border-[var(--landing-border-strong)] bg-[var(--brand-400)] text-[var(--landing-text)] hover:bg-[var(--primary-hover)]'
            )}
          >
            {action.loading ? (
              <span className='flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin' />
                {action.label}...
              </span>
            ) : (
              action.label
            )}
          </button>
        ))}
      </div>
    </>
  )
}
