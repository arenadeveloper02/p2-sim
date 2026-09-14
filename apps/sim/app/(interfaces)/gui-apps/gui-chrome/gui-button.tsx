'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@sim/emcn'
import {
  GUI_BUTTON_BASE_CLASS,
  GUI_BUTTON_PILL_CLASS,
  GUI_BUTTON_SIZE_CLASSES,
  GUI_BUTTON_VARIANT_CLASSES,
  type GuiButtonSize,
  type GuiButtonVariant,
} from '@/app/(interfaces)/gui-apps/gui-chrome/gui-tokens'

export function guiButtonClass(
  props: { variant?: unknown; size?: unknown; shape?: unknown },
  fallbackVariant: GuiButtonVariant = 'secondary'
): string {
  const variant =
    typeof props.variant === 'string' && props.variant in GUI_BUTTON_VARIANT_CLASSES
      ? (props.variant as GuiButtonVariant)
      : fallbackVariant
  const size =
    typeof props.size === 'string' && props.size in GUI_BUTTON_SIZE_CLASSES
      ? (props.size as GuiButtonSize)
      : 'md'
  return cn(
    GUI_BUTTON_BASE_CLASS,
    GUI_BUTTON_VARIANT_CLASSES[variant],
    GUI_BUTTON_SIZE_CLASSES[size],
    props.shape === 'pill' && GUI_BUTTON_PILL_CLASS
  )
}

interface GuiButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: GuiButtonVariant
  size?: GuiButtonSize
  shape?: 'default' | 'pill'
  children: ReactNode
}

export function GuiButton({
  variant = 'secondary',
  size = 'md',
  shape = 'default',
  className,
  type = 'button',
  children,
  ...props
}: GuiButtonProps) {
  return (
    <button
      type={type}
      className={cn(guiButtonClass({ variant, size, shape }, variant), className)}
      {...props}
    >
      {children}
    </button>
  )
}
