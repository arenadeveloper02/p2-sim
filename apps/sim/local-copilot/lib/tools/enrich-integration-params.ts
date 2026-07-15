import { createLogger } from '@sim/logger'
import { withResolvedGoogleSheetsV2RangeParams } from '@/tools/google_sheets/range'
import { getTool, resolveToolId, stripVersionSuffix } from '@/tools/utils'
import type { LocalCopilotConnectedIntegration } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotIntegrationParams')

function hasExplicitCredentialSelector(params: Record<string, unknown>): boolean {
  for (const key of ['credentialId', 'oauthCredential', 'credential'] as const) {
    const value = params[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return true
    }
  }
  return false
}

/**
 * Enriches Arena Copilot `invoke_integration_tool` params before execution:
 * - Injects OAuth credentialId from connectedIntegrations when missing
 * - Maps legacy Google Sheets `range` into v2 `sheetName`/`cellRange`
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
    const match = connectedIntegrations.find(
      (integration) =>
        integration.providerId === tool.oauth?.provider &&
        !integration.credentialId.startsWith('__env__') &&
        !integration.credentialId.startsWith('__hubspot_')
    )
    if (match) {
      next.credentialId = match.credentialId
      logger.info('Injected OAuth credentialId for integration tool', {
        toolId: registryToolId,
        provider: tool.oauth.provider,
        credentialId: match.credentialId,
      })
    }
  }

  const baseName = stripVersionSuffix(registryToolId)
  if (baseName.startsWith('google_sheets_')) {
    next = withResolvedGoogleSheetsV2RangeParams(next, { defaultSheetName: 'Sheet1' })
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

  return next
}
