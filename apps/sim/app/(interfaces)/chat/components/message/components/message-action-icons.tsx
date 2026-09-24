import { Check, cn, Duplicate, ThumbsDown, ThumbsUp } from '@sim/emcn'

interface MessageActionIconProps {
  className?: string
}

const ICON_CLASS = 'size-[14px]'

/**
 * Ghost action button matching mothership message actions.
 */
export function messageActionIconButtonClass(active = false) {
  return cn(
    'flex size-[26px] items-center justify-center rounded-[6px] text-[var(--text-icon)] transition-colors hover-hover:bg-[var(--surface-hover)] focus-visible:outline-hidden',
    active && 'text-[var(--text-primary)]'
  )
}

export function CopyMessageIcon({ className }: MessageActionIconProps) {
  return <Duplicate className={cn(ICON_CLASS, className)} />
}

export function CopiedMessageIcon({ className }: MessageActionIconProps) {
  return <Check className={cn(ICON_CLASS, className)} />
}

export function LikeMessageIcon({ className }: MessageActionIconProps) {
  return <ThumbsUp className={cn(ICON_CLASS, className)} />
}

export function DislikeMessageIcon({ className }: MessageActionIconProps) {
  return <ThumbsDown className={cn(ICON_CLASS, className)} />
}
