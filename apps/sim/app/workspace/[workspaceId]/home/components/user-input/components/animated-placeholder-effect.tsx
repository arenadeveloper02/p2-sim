'use client'

import { useEffect } from 'react'
import { useAnimatedPlaceholder } from '@/hooks/use-animated-placeholder'

const STATIC_CHAT_PLACEHOLDER = 'Send message to Vimi'

interface AnimatedPlaceholderEffectProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  isInitialView: boolean
  isSending?: boolean
}

export function AnimatedPlaceholderEffect({
  textareaRef,
  isInitialView,
  isSending = false,
}: AnimatedPlaceholderEffectProps) {
  const useAnimated = isInitialView && !isSending
  const animatedPlaceholder = useAnimatedPlaceholder(useAnimated)
  const placeholder = useAnimated ? animatedPlaceholder : STATIC_CHAT_PLACEHOLDER

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.placeholder = placeholder
    }
  }, [placeholder, textareaRef])

  return null
}
