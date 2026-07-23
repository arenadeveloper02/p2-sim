export const CHAT_ERROR_MESSAGES = {
  GENERIC_ERROR: 'Sorry, there was an error processing your message. Please try again.',
  NETWORK_ERROR: 'Unable to connect to the server. Please check your connection and try again.',
  TIMEOUT_ERROR: 'Request timed out. Please try again.',
  AUTH_REQUIRED_PASSWORD: 'This chat requires a password to access.',
  AUTH_REQUIRED_EMAIL: 'Please provide your email to access this chat.',
  CHAT_UNAVAILABLE: 'This chat is currently unavailable. Please try again later.',
  NO_CHAT_TRIGGER:
    'No Chat trigger configured for this workflow. Add a Chat Trigger block to enable chat.',
  USAGE_LIMIT_EXCEEDED: 'Usage limit exceeded. Please upgrade your plan to continue using chat.',
} as const

// Timeout for initial connection - once SSE stream starts, it continues until completion
// Increased to 30 minutes to accommodate long-running workflows (some can take 15+ minutes)
export const CHAT_REQUEST_TIMEOUT_MS = 1800000 // 30 minutes

/** Thread / message column max width (Figma thread frames use 768) */
export const DEPLOYED_CHAT_CONTENT_MAX_WIDTH_CLASS = 'max-w-[768px]' as const

/** Landing hero column max width (Figma `2_Default` content cluster is 640) */
export const DEPLOYED_CHAT_LANDING_MAX_WIDTH_CLASS = 'max-w-[640px]' as const

/** Resting height for the deployed chat input shell */
export const DEPLOYED_CHAT_INPUT_HEIGHT_CLASS = 'h-10' as const

/**
 * Deployed chat canvas / brand surface.
 * Figma: `color/brand/surface` · DS: `--color-ds-blue-50`
 */
export const DEPLOYED_CHAT_CANVAS_BG = '#F3F8FE'

/** Subtle top tint for deployed chat canvas gradient (same as canvas for a flat fill) */
export const DEPLOYED_CHAT_CANVAS_GRADIENT_TOP = DEPLOYED_CHAT_CANVAS_BG

/** Deployed chat canvas background gradient */
export const DEPLOYED_CHAT_CANVAS_GRADIENT = `linear-gradient(180deg, ${DEPLOYED_CHAT_CANVAS_GRADIENT_TOP} 0%, ${DEPLOYED_CHAT_CANVAS_BG} 100%)`

/**
 * Title / prompt text.
 * Figma: `color/text/primary` · DS: `--color-ds-grey-900`
 */
export const DEPLOYED_CHAT_TEXT_DISPLAY = '#2C2D33'

/**
 * Primary body / prompt text (same as display in Arena DS).
 * Figma: `color/text/primary`
 */
export const DEPLOYED_CHAT_TEXT_BODY = '#2C2D33'

/**
 * Description / secondary text.
 * Figma: `color/text/secondary` · DS: `--color-ds-grey-700`
 */
export const DEPLOYED_CHAT_TEXT_MUTED = '#575A66'

/**
 * Tertiary / subtle labels.
 * Figma: `color/text/tertiary` · DS: `--color-ds-grey-500`
 */
export const DEPLOYED_CHAT_TEXT_SUBTLE = '#8A8D99'

/**
 * Dividers and sidebar chrome border.
 * Figma: `color/blue/200` · DS: `--color-ds-blue-200`
 */
export const DEPLOYED_CHAT_DIVIDER = '#D1E3FA'

/** Deployed chat input placeholder */
export const DEPLOYED_CHAT_INPUT_PLACEHOLDER = 'Ask VIMI...'

/**
 * Active thread / link hover.
 * Figma: `color/text/link-hover` · DS: `--color-ds-blue-700`
 */
export const DEPLOYED_CHAT_ACTIVE_THREAD_COLOR = '#155CBA'

/**
 * Active thread / soft icon wash.
 * Figma: `color/brand/surface`
 */
export const DEPLOYED_CHAT_ACTIVE_THREAD_BG = '#F3F8FE'

/**
 * Input outline start (left).
 * Figma: `color/blue/600` · DS: `--color-ds-blue-600`
 */
export const DEPLOYED_CHAT_INPUT_BORDER = '#1A73E8'

/**
 * Input outline end (right) for the pill gradient stroke.
 * Figma Search bar visual · DS: `--color-ds-purple-600`
 */
export const DEPLOYED_CHAT_INPUT_BORDER_END = '#B364D7'

/**
 * Pill shell fill + gradient stroke (works with `border-radius`).
 * Inner white on padding-box; blue→purple on border-box.
 */
export const DEPLOYED_CHAT_INPUT_SHELL_BACKGROUND = [
  'linear-gradient(#FFFFFF, #FFFFFF) padding-box',
  `linear-gradient(90deg, ${DEPLOYED_CHAT_INPUT_BORDER} 0%, ${DEPLOYED_CHAT_INPUT_BORDER_END} 100%) border-box`,
].join(', ')

/**
 * Soft outer glow for deployed chat input.
 * Figma: drop-shadow `0 0 16px` · `color/blue/200`
 */
export const DEPLOYED_CHAT_INPUT_GLOW_SHADOW = '0 0 16px #D1E3FA'

/**
 * Input placeholder color.
 * Figma / DS: `--color-ds-text-placeholder` · grey-400
 */
export const DEPLOYED_CHAT_INPUT_PLACEHOLDER_COLOR = '#A7AAB2'

/**
 * Default icon color.
 * Figma: `color/icon/default` · DS: `--color-ds-grey-700`
 */
export const DEPLOYED_CHAT_ICON_DEFAULT = '#575A66'

/** Deployed chat sidebar border — same as blue-200 divider */
export const DEPLOYED_CHAT_SIDEBAR_BORDER = DEPLOYED_CHAT_DIVIDER

export type ChatErrorType = keyof typeof CHAT_ERROR_MESSAGES
