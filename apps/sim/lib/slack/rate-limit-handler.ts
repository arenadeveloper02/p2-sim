import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('SlackRateLimitHandler')

export interface SlackRateLimitHeaders {
  'x-rate-limit-remaining'?: string
  'x-rate-limit-reset'?: string
  'retry-after'?: string
}

export interface RetryOptions {
  maxRetries?: number
  baseDelay?: number
  maxDelay?: number
  backoffMultiplier?: number
}

/**
 * Handles Slack API rate limiting with exponential backoff
 */
export class SlackRateLimitHandler {
  private static readonly DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxRetries: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 60000, // 60 seconds
    backoffMultiplier: 2,
  }

  /**
   * Execute a Slack API request with automatic retry on rate limits
   */
  static async executeWithRetry<T>(
    apiCall: () => Promise<Response>,
    options: RetryOptions = {}
  ): Promise<Response> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options }
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        const response = await apiCall()

        // If successful or non-rate-limit error, return immediately
        if (response.ok || response.status !== 429) {
          return response
        }

        // Handle rate limit
        if (attempt === opts.maxRetries) {
          // Last attempt, throw error
          const errorData = await this.extractErrorFromResponse(response.clone())
          throw new Error(`Slack API rate limit exceeded: ${errorData.message}`)
        }

        // Calculate delay for next retry
        const delay = this.calculateRetryDelay(response, attempt, opts)

        logger.warn(
          `Slack API rate limit hit (attempt ${attempt + 1}/${opts.maxRetries + 1}), retrying in ${delay}ms`,
          {
            status: response.status,
            attempt: attempt + 1,
            maxRetries: opts.maxRetries + 1,
          }
        )

        await this.sleep(delay)
      } catch (error) {
        const err = error as Error & { status?: number }
        lastError = err

        // If it's not a rate limit error, don't retry
        if (!err.status || err.status !== 429) {
          throw error
        }

        if (attempt === opts.maxRetries) {
          throw error
        }

        // Calculate delay for network/other errors
        const delay = Math.min(
          opts.baseDelay * Math.pow(opts.backoffMultiplier, attempt),
          opts.maxDelay
        )

        logger.warn(
          `Slack API error (attempt ${attempt + 1}/${opts.maxRetries + 1}), retrying in ${delay}ms`,
          {
            error: err.message,
            attempt: attempt + 1,
            maxRetries: opts.maxRetries + 1,
          }
        )

        await this.sleep(delay)
      }
    }

    throw lastError || new Error('Max retries exceeded')
  }

  /**
   * Calculate retry delay based on Slack's rate limit headers or exponential backoff
   */
  private static calculateRetryDelay(
    response: Response,
    attempt: number,
    options: Required<RetryOptions>
  ): number {
    // Check for Retry-After header (in seconds)
    const retryAfter = response.headers.get('retry-after')
    if (retryAfter) {
      const retryAfterMs = parseInt(retryAfter, 10) * 1000
      return Math.min(retryAfterMs, options.maxDelay)
    }

    // Check for X-Rate-Limit-Reset header (Unix timestamp)
    const rateLimitReset = response.headers.get('x-rate-limit-reset')
    if (rateLimitReset) {
      const resetTime = parseInt(rateLimitReset, 10) * 1000 // Convert to milliseconds
      const now = Date.now()
      const delay = Math.max(resetTime - now, 0)
      return Math.min(delay, options.maxDelay)
    }

    // Fallback to exponential backoff
    const exponentialDelay = options.baseDelay * Math.pow(options.backoffMultiplier, attempt)
    return Math.min(exponentialDelay, options.maxDelay)
  }

  /**
   * Extract error information from Slack API response
   */
  private static async extractErrorFromResponse(response: Response): Promise<{
    message: string
    details?: any
  }> {
    try {
      const data = await response.json()

      if (data.error) {
        return {
          message: data.error,
          details: data,
        }
      }

      return {
        message: `${response.status} ${response.statusText}`,
        details: data,
      }
    } catch {
      return {
        message: `${response.status} ${response.statusText}`,
      }
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Check if an error is a rate limit error
   */
  static isRateLimitError(error: any): boolean {
    return (
      error?.status === 429 ||
      error?.message?.includes('rate limit') ||
      error?.message?.includes('Too Many Requests') ||
      error?.message?.includes('429')
    )
  }

  /**
   * Extract rate limit information from response headers
   */
  static extractRateLimitInfo(response: Response): {
    remaining?: number
    reset?: Date
    retryAfter?: number
  } {
    const remaining = response.headers.get('x-rate-limit-remaining')
    const reset = response.headers.get('x-rate-limit-reset')
    const retryAfter = response.headers.get('retry-after')

    return {
      remaining: remaining ? parseInt(remaining, 10) : undefined,
      reset: reset ? new Date(parseInt(reset, 10) * 1000) : undefined,
      retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
    }
  }
}
