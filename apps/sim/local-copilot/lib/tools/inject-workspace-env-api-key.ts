import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { getEffectiveDecryptedEnv } from '@/lib/environment/utils'
import { getTool, resolveToolId } from '@/tools/utils'

const logger = createLogger('LocalCopilotWorkspaceApiKey')

/**
 * When an integration tool expects an API key and none was provided, fill it
 * from workspace env using the tool's hosted-key prefix (e.g. EXA_API_KEY).
 * Hosted/BYOK injection in `executeTool` still runs if this returns no key.
 */
export async function injectWorkspaceEnvApiKeyIfNeeded(
  toolId: string,
  params: Record<string, unknown>,
  options: { userId: string; workspaceId: string }
): Promise<Record<string, unknown>> {
  const registryToolId = resolveToolId(toolId)
  const tool = getTool(registryToolId)
  const hosting = tool?.hosting
  if (!hosting) return params

  const apiKeyParam = hosting.apiKeyParam
  const existing = params[apiKeyParam]
  if (typeof existing === 'string' && existing.trim().length > 0) {
    return params
  }

  const envKeyPrefix =
    typeof hosting.envKeyPrefix === 'function'
      ? hosting.envKeyPrefix(params)
      : hosting.envKeyPrefix
  if (!envKeyPrefix || typeof envKeyPrefix !== 'string') {
    return params
  }

  try {
    const decrypted = await getEffectiveDecryptedEnv(options.userId, options.workspaceId)
    const workspaceKey = decrypted[envKeyPrefix]
    if (typeof workspaceKey === 'string' && workspaceKey.trim().length > 0) {
      logger.info('Injected workspace env API key for integration tool', {
        toolId: registryToolId,
        envKey: envKeyPrefix,
      })
      return { ...params, [apiKeyParam]: workspaceKey.trim() }
    }
  } catch (error) {
    logger.warn('Failed to load workspace env for integration API key', {
      toolId: registryToolId,
      envKey: envKeyPrefix,
      error: getErrorMessage(error),
    })
  }

  return params
}
