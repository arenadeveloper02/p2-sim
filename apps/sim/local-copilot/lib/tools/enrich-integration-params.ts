import { createLogger } from '@sim/logger'
import { resolveGoogleSheetsV2RangeParams } from '@/tools/google_sheets/range'
import { getTool, resolveToolId, stripVersionSuffix } from '@/tools/utils'
import type { LocalCopilotConnectedIntegration } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotIntegrationParams')

/**
 * Google Workspace OAuth providers that share Drive scopes. A connected Docs
 * account can authorize Drive list/search (and vice versa), which local copilot
 * needs when resolving a document by name before google_docs_read/write.
 */
const GOOGLE_DRIVE_SCOPE_PROVIDERS = new Set([
  'google-drive',
  'google-docs',
  'google-sheets',
  'google-slides',
  'google-forms',
])

function hasExplicitCredentialSelector(params: Record<string, unknown>): boolean {
  for (const key of ['credentialId', 'oauthCredential', 'credential'] as const) {
    const value = params[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return true
    }
  }
  return false
}

function isUsableOAuthCredential(integration: LocalCopilotConnectedIntegration): boolean {
  return (
    !integration.credentialId.startsWith('__env__') &&
    !integration.credentialId.startsWith('__hubspot_')
  )
}

function findMatchingCredential(
  connectedIntegrations: LocalCopilotConnectedIntegration[],
  provider: string
): LocalCopilotConnectedIntegration | undefined {
  const usable = connectedIntegrations.filter(isUsableOAuthCredential)
  const exact = usable.find((integration) => integration.providerId === provider)
  if (exact) return exact

  if (!GOOGLE_DRIVE_SCOPE_PROVIDERS.has(provider)) return undefined
  return usable.find((integration) => GOOGLE_DRIVE_SCOPE_PROVIDERS.has(integration.providerId))
}

/** Internal marker: fan out one Gmail/Outlook draft per recipient. */
export const SEPARATE_DRAFT_RECIPIENTS_KEY = '_localCopilotSeparateDraftRecipients'

function collectEmailStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
  }
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => collectEmailStrings(item))
      .filter(Boolean)
  }
  return []
}

/**
 * Normalizes Gmail/Outlook draft/send recipient fields. Models often pass
 * `to` as an array or use aliases (`recipient`). Multiple `to` values are
 * marked for separate draft fan-out instead of one multi-recipient draft.
 */
function normalizeEmailToolParams(
  baseName: string,
  params: Record<string, unknown>
): Record<string, unknown> {
  const isEmailDraftOrSend =
    baseName.startsWith('gmail_draft') ||
    baseName.startsWith('gmail_send') ||
    baseName.startsWith('outlook_draft') ||
    baseName.startsWith('outlook_send')
  if (!isEmailDraftOrSend) return params

  const next: Record<string, unknown> = { ...params }

  if (!next.to || (typeof next.to === 'string' && !next.to.trim())) {
    for (const alias of ['recipient', 'recipients', 'email'] as const) {
      const emails = collectEmailStrings(next[alias])
      if (emails.length > 0) {
        next.to = emails.length === 1 ? emails[0] : emails
        break
      }
    }
  }

  for (const key of ['to', 'cc', 'bcc'] as const) {
    const emails = collectEmailStrings(next[key])
    if (emails.length === 0) continue

    if (key === 'to' && emails.length > 1 && baseName.includes('draft')) {
      next[SEPARATE_DRAFT_RECIPIENTS_KEY] = emails
      next.to = emails[0]
      logger.info('Marked multi-recipient Gmail/Outlook draft for separate fan-out', {
        toolId: baseName,
        recipientCount: emails.length,
      })
      continue
    }

    next[key] = emails.join(', ')
  }

  return next
}

/**
 * Enriches Arena Copilot `invoke_integration_tool` params before execution:
 * - Injects OAuth credentialId from connectedIntegrations when missing
 * - Maps legacy Google Sheets `range` into v2 `sheetName`/`cellRange`
 * - Normalizes Gmail/Outlook recipient fields for drafts/sends
 */
export function enrichLocalIntegrationToolParams(
  toolId: string,
  params: Record<string, unknown>,
  connectedIntegrations: LocalCopilotConnectedIntegration[]
): Record<string, unknown> {
  const registryToolId = resolveToolId(toolId)
  const tool = getTool(registryToolId)
  let next: Record<string, unknown> = { ...params }

  if (tool?.oauth?.required && tool.oauth.provider && !hasExplicitCredentialSelector(next)) {
    const match = findMatchingCredential(connectedIntegrations, tool.oauth.provider)
    if (match) {
      next.credentialId = match.credentialId
      logger.info('Injected OAuth credentialId for integration tool', {
        toolId: registryToolId,
        provider: tool.oauth.provider,
        credentialProvider: match.providerId,
        credentialId: match.credentialId,
      })
    }
  }

  const baseName = stripVersionSuffix(registryToolId)
  if (baseName.startsWith('google_sheets_')) {
    const resolved = resolveGoogleSheetsV2RangeParams(next)
    next = {
      ...next,
      sheetName: resolved.sheetName || 'Sheet1',
      ...(resolved.cellRange !== undefined ? { cellRange: resolved.cellRange } : {}),
    }
    if (
      typeof params.range === 'string' &&
      params.range.trim() &&
      (!params.sheetName || typeof params.sheetName !== 'string' || !params.sheetName.trim())
    ) {
      logger.info('Normalized legacy Google Sheets range for integration tool', {
        toolId: registryToolId,
        sheetName: next.sheetName,
        cellRange: next.cellRange ?? null,
      })
    }
  }

  next = normalizeEmailToolParams(baseName, next)

  return next
}
