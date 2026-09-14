/**
 * Arena DS class tokens for generative UI hosts. Consume `--gui-*`; do not invent hex.
 */

export const GUI_CHIP_TONE_CLASSES = {
  muted:
    'bg-[var(--gui-canvas,#f7f8f9)] text-[var(--gui-text-muted,#575a66)] hover:bg-[var(--gui-border,#e2e3e5)]',
  brand:
    'bg-[var(--gui-brand-surface,#f3f8fe)] text-[var(--gui-brand,#1a73e8)] hover:bg-[var(--gui-info-border,#a3c7f6)]',
  info: 'bg-[var(--gui-info-surface,#f3f8fe)] text-[var(--gui-info-text,#10458b)] hover:bg-[var(--gui-info-border,#a3c7f6)]',
} as const

export const GUI_TEXT_TONE_CLASSES = {
  default: 'text-[var(--gui-text,#2c2d33)]',
  muted: 'text-[var(--gui-text-muted,#575a66)]',
  tertiary: 'text-[var(--gui-text-tertiary,#8a8d99)]',
  brand: 'text-[var(--gui-brand,#1a73e8)]',
} as const

export const GUI_TONE_CLASSES = {
  info: 'border border-[var(--gui-info-border,#a3c7f6)] bg-[var(--gui-info-surface,#f3f8fe)] text-[var(--gui-info-text,#10458b)]',
  success:
    'border border-[var(--gui-success-border,#b1e9ce)] bg-[var(--gui-success-surface,#f5fcf9)] text-[var(--gui-success-text,#23784f)]',
  warning:
    'border border-[var(--gui-warning-border,#fdcdb5)] bg-[var(--gui-warning-surface,#fff9f5)] text-[var(--gui-warning-text,#974d29)]',
  error:
    'border border-[var(--gui-error-border,#faa3a3)] bg-[var(--gui-error-surface,#fff3f3)] text-[var(--gui-error-text,#921010)]',
} as const

export const GUI_BUTTON_BASE_CLASS =
  'inline-flex items-center justify-center rounded-[var(--gui-radius,12px)] font-medium transition-[background-color,color,border-color,transform,box-shadow] duration-100 ease-[cubic-bezier(0.4,0,0.2,1)] disabled:cursor-not-allowed disabled:opacity-[var(--gui-opacity-disabled,0.38)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gui-brand,#1a73e8)]'

export const GUI_BUTTON_VARIANT_CLASSES = {
  primary:
    'bg-[var(--gui-brand,#1a73e8)] text-[var(--gui-text-on-brand,#ffffff)] hover:bg-[var(--gui-brand-hover,#155cba)] active:bg-[var(--gui-brand-pressed,#10458b)]',
  secondary:
    'border border-[var(--gui-border,#e2e3e5)] bg-[var(--gui-surface,#ffffff)] text-[var(--gui-text,#2c2d33)] hover:bg-[var(--gui-canvas,#f7f8f9)]',
  ghost: 'text-[var(--gui-text,#2c2d33)] hover:bg-[var(--gui-canvas,#f7f8f9)]',
  outline:
    'border border-[var(--gui-brand,#1a73e8)] bg-transparent text-[var(--gui-brand,#1a73e8)] hover:bg-[var(--gui-brand-surface,#f3f8fe)]',
  destructive:
    'border border-[var(--gui-danger,#f31a1a)] bg-transparent text-[var(--gui-danger,#f31a1a)] hover:bg-[var(--gui-error-surface,#fff3f3)]',
} as const

export const GUI_BUTTON_SIZE_CLASSES = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-[var(--gui-control-height,40px)] px-[var(--gui-control-px,16px)] text-[length:var(--gui-body-size,16px)]',
} as const

export const GUI_BUTTON_PILL_CLASS = 'rounded-[var(--gui-radius-pill)]'

export const GUI_BUTTON_FILLED_DANGER_CLASS =
  'bg-[var(--gui-danger,#f31a1a)] text-[var(--gui-text-on-brand,#ffffff)] hover:bg-[var(--gui-danger-hover,#c21515)]'

export const GUI_SURFACE_CARD =
  'rounded-[var(--gui-radius,12px)] border border-[var(--gui-border,#e2e3e5)] bg-[var(--gui-surface,#ffffff)] p-[var(--gui-pad,16px)] shadow-[var(--gui-shadow-card,0px_2px_8px_rgba(44,45,51,0.1))]'

export const GUI_SURFACE_CARD_MUTED =
  'rounded-[var(--gui-radius,12px)] border border-[var(--gui-border,#e2e3e5)] bg-[var(--gui-surface-muted,#f7f8f9)] p-[var(--gui-pad,16px)] shadow-[var(--gui-shadow-card,0px_2px_8px_rgba(44,45,51,0.1))]'

export const GUI_SURFACE_STAT = GUI_SURFACE_CARD

export const GUI_WIDGET_SURFACE_CLASS =
  'flex w-full flex-col gap-3 rounded-[var(--gui-radius,12px)] border border-[var(--gui-border,#e2e3e5)] bg-[var(--gui-surface,#ffffff)] p-4 shadow-[var(--gui-shadow-card,0px_2px_8px_rgba(44,45,51,0.1))]'

export const GUI_BOUND_EMPTY_CLASS =
  'col-span-full py-2 text-[length:var(--gui-body-size,16px)] text-[var(--gui-text-muted,#575a66)]'

export const GUI_FIELD_INPUT_CLASS =
  'h-[var(--gui-control-height,40px)] w-full rounded-[var(--gui-radius,12px)] border border-[var(--gui-border,#e2e3e5)] bg-[var(--gui-surface,#ffffff)] px-[var(--gui-control-px,16px)] text-[length:var(--gui-body-size,16px)] leading-[var(--gui-body-leading,24px)] text-[var(--gui-text,#2c2d33)] outline-none transition-[background-color,border-color,box-shadow] duration-100 placeholder:text-[var(--gui-text-placeholder,#a7aab2)] focus-visible:border-[var(--gui-brand,#1a73e8)] focus-visible:bg-[var(--gui-brand-surface,#f3f8fe)] focus-visible:shadow-[0_0_0_3px_var(--gui-focus,rgb(26_115_232_/_30%))]'

export const GUI_FIELD_TEXTAREA_CLASS =
  'min-h-[96px] w-full rounded-[var(--gui-radius,12px)] border border-[var(--gui-border,#e2e3e5)] bg-[var(--gui-surface,#ffffff)] px-[var(--gui-control-px,16px)] py-2.5 text-[length:var(--gui-body-size,16px)] leading-[var(--gui-body-leading,24px)] text-[var(--gui-text,#2c2d33)] outline-none transition-[background-color,border-color,box-shadow] duration-100 placeholder:text-[var(--gui-text-placeholder,#a7aab2)] focus-visible:border-[var(--gui-brand,#1a73e8)] focus-visible:bg-[var(--gui-brand-surface,#f3f8fe)] focus-visible:shadow-[0_0_0_3px_var(--gui-focus,rgb(26_115_232_/_30%))]'

export const GUI_FIELD_NATIVE_CONTROL_CLASS =
  'size-4 shrink-0 rounded-[var(--gui-radius-sm,8px)] border border-[var(--gui-border-strong,#a7aab2)] accent-[var(--gui-brand,#1a73e8)] outline-none transition-[box-shadow,border-color] duration-100 focus-visible:border-[var(--gui-brand,#1a73e8)] focus-visible:shadow-[0_0_0_3px_var(--gui-focus,rgb(26_115_232_/_30%))]'

export const GUI_FIELD_LABEL_CLASS =
  'font-medium text-[length:var(--gui-label-size,12px)] text-[var(--gui-text-muted,#575a66)] leading-[var(--gui-label-leading,16px)] tracking-[0.25px]'

export const GUI_FIELD_ERROR_CLASS =
  'text-[length:var(--gui-label-size,12px)] text-[var(--gui-danger,#f31a1a)]'

export const GUI_CHIP_CLASS =
  'inline-flex items-center rounded-[var(--gui-radius-pill)] px-3 py-1.5 font-medium text-sm'

export const GUI_OVERLAY_SCRIM_CLASS =
  'fixed inset-0 z-30 flex items-center justify-center bg-[var(--gui-overlay,rgb(44_45_51_/_72%))] p-4'

export const GUI_OVERLAY_DIALOG_CLASS =
  'pointer-events-auto flex max-h-[min(90vh,720px)] flex-col overflow-hidden border border-[var(--gui-border,#e2e3e5)] bg-[var(--gui-surface,#ffffff)] shadow-[var(--gui-shadow-xlg,0px_8px_32px_rgba(44,45,51,0.16))]'

export const GUI_TABLE_HEADER_ROW_CLASS =
  'sticky top-0 z-[1] border-[var(--gui-border,#e2e3e5)] border-b bg-[var(--gui-surface-muted,#f7f8f9)]'

export type GuiButtonVariant = keyof typeof GUI_BUTTON_VARIANT_CLASSES
export type GuiButtonSize = keyof typeof GUI_BUTTON_SIZE_CLASSES
export type GuiChipTone = keyof typeof GUI_CHIP_TONE_CLASSES
export type GuiStatusTone = keyof typeof GUI_TONE_CLASSES
export type GuiTextTone = keyof typeof GUI_TEXT_TONE_CLASSES

export function guiFieldErrorClass(error: string | undefined): string {
  return error
    ? 'border-[var(--gui-danger,#f31a1a)] focus-visible:border-[var(--gui-danger,#f31a1a)]'
    : ''
}

export function guiCardSurfaceClass(variant: unknown): string {
  return variant === 'muted' ? GUI_SURFACE_CARD_MUTED : GUI_SURFACE_CARD
}

export function guiToneClass(
  value: unknown,
  fallback: GuiStatusTone = 'info'
): string {
  const tone = typeof value === 'string' ? value : fallback
  return GUI_TONE_CLASSES[tone as GuiStatusTone] ?? GUI_TONE_CLASSES[fallback]
}

export function guiTextToneClass(value: unknown, fallback: GuiTextTone = 'default'): string {
  const tone = typeof value === 'string' ? value : fallback
  return GUI_TEXT_TONE_CLASSES[tone as GuiTextTone] ?? GUI_TEXT_TONE_CLASSES[fallback]
}
