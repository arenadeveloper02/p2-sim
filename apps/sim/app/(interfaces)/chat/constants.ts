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

/** Shared max content width for deployed chat landing, messages, and input */
export const DEPLOYED_CHAT_CONTENT_MAX_WIDTH_CLASS = 'max-w-[768px]' as const

/** Resting height for the deployed chat input shell */
export const DEPLOYED_CHAT_INPUT_HEIGHT_CLASS = 'h-10' as const

/** Deployed chat main canvas background (pale lavender-white) */
export const DEPLOYED_CHAT_CANVAS_BG = '#FBF7FD'

/** Subtle top tint for deployed chat canvas gradient */
export const DEPLOYED_CHAT_CANVAS_GRADIENT_TOP = '#FDFBFE'

/** Deployed chat canvas background gradient */
export const DEPLOYED_CHAT_CANVAS_GRADIENT = `linear-gradient(180deg, ${DEPLOYED_CHAT_CANVAS_GRADIENT_TOP} 0%, ${DEPLOYED_CHAT_CANVAS_BG} 100%)`

/** Deployed chat typography colors */
export const DEPLOYED_CHAT_TEXT_DISPLAY = '#0F172A'
export const DEPLOYED_CHAT_TEXT_BODY = '#1E293B'
export const DEPLOYED_CHAT_TEXT_MUTED = '#64748B'
export const DEPLOYED_CHAT_TEXT_SUBTLE = '#94A3B8'

/** Deployed chat dividers and borders */
export const DEPLOYED_CHAT_DIVIDER = '#E2EAF4'

/** Deployed chat input placeholder */
export const DEPLOYED_CHAT_INPUT_PLACEHOLDER = 'Ask VIMI'

/** Active thread label color in the deployed chat sidebar */
export const DEPLOYED_CHAT_ACTIVE_THREAD_COLOR = '#155CBA'

/** Active thread background wash in the deployed chat sidebar */
export const DEPLOYED_CHAT_ACTIVE_THREAD_BG = '#E8F0FA'

/** Soft outer glow for deployed chat input gradient border */
export const DEPLOYED_CHAT_INPUT_GLOW_SHADOW =
  '0 0 0 1px rgba(147, 197, 253, 0.2), 0 4px 12px rgba(147, 197, 253, 0.15), 0 2px 8px rgba(147, 197, 253, 0.08)'

/** Deployed chat sidebar border */
export const DEPLOYED_CHAT_SIDEBAR_BORDER = '#C7D9F0'

export type ChatErrorType = keyof typeof CHAT_ERROR_MESSAGES
