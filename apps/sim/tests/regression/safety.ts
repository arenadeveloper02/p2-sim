import { REGRESSION_CONFIG } from '@/tests/regression/config'

export interface SlackDestinationInput {
  channel?: string
  channelId?: string
}

export interface EmailDestinationInput {
  to?: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
}

function normalizeEmails(value: string | string[] | undefined): string[] {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  return list.map((entry) => entry.trim().toLowerCase()).filter(Boolean)
}

/**
 * Ensures Slack test traffic only targets the approved QA channel.
 */
export function assertAllowedSlackDestination(input: SlackDestinationInput): void {
  const channel = input.channel?.trim()
  const channelId = input.channelId?.trim()
  const { allowedChannelIds, allowedChannelNames } = REGRESSION_CONFIG.safety.slack

  const idAllowed = channelId ? allowedChannelIds.includes(channelId as 'C0BDTEZPF7C') : false
  const nameAllowed = channel
    ? allowedChannelNames.some(
        (allowed) => allowed.toLowerCase() === channel.toLowerCase() || channel === 'C0BDTEZPF7C'
      )
    : false

  if (!idAllowed && !nameAllowed) {
    throw new Error(
      `Slack destination not allowed. Use #slack-testing (C0BDTEZPF7C). Got channel="${channel ?? ''}" channelId="${channelId ?? ''}"`
    )
  }
}

/**
 * Ensures email test traffic only targets the approved QA recipient.
 */
export function assertAllowedEmailDestinations(input: EmailDestinationInput): void {
  const allowed = new Set(
    REGRESSION_CONFIG.safety.email.allowedRecipients.map((email) => email.toLowerCase())
  )
  const recipients = [
    ...normalizeEmails(input.to),
    ...normalizeEmails(input.cc),
    ...normalizeEmails(input.bcc),
  ]

  for (const recipient of recipients) {
    if (!allowed.has(recipient)) {
      throw new Error(
        `Email recipient not allowed. Use akshay.v@position2.com only. Got "${recipient}"`
      )
    }
  }
}

/**
 * Returns true when an integration id should be excluded from live/UI regression.
 */
export function isExcludedIntegration(integrationId: string): boolean {
  const normalized = integrationId.trim().toLowerCase()
  return REGRESSION_CONFIG.excludedIntegrations.some(
    (excluded) => excluded === normalized || normalized.startsWith(`${excluded}_`)
  )
}
