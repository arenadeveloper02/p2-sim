export const CHAT_ERROR_MESSAGES = {
  GENERIC_ERROR: 'Sorry, there was an error processing your message. Please try again.',
  CHAT_UNAVAILABLE: 'This chat is currently unavailable. Please try again later.',
} as const

// Timeout for initial connection - once SSE stream starts, it continues until completion
// Increased to 30 minutes to accommodate long-running workflows (some can take 15+ minutes)
export const CHAT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000

/** Thread / message column max width */
export const DEPLOYED_CHAT_CONTENT_MAX_WIDTH_CLASS = 'max-w-3xl md:max-w-[768px]' as const

/** Landing hero column max width */
export const DEPLOYED_CHAT_LANDING_MAX_WIDTH_CLASS = 'max-w-[640px]' as const
