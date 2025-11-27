import { eq } from 'drizzle-orm'
import { env } from '@/lib/env'
import { createLogger } from '@/lib/logs/console/logger'
import { decryptSecret } from '@/lib/utils'
import { db } from '@/db'
import { environment, workspaceEnvironment } from '@/db/schema'

const logger = createLogger('EnvironmentUtils')

/**
 * Get environment variable keys for a user
 * Returns only the variable names, not their values
 */
export async function getEnvironmentVariableKeys(userId: string): Promise<{
  variableNames: string[]
  count: number
}> {
  try {
    const result = await db
      .select()
      .from(environment)
      .where(eq(environment.userId, userId))
      .limit(1)

    if (!result.length || !result[0].variables) {
      return {
        variableNames: [],
        count: 0,
      }
    }

    // Get the keys (variable names) without decrypting values
    const encryptedVariables = result[0].variables as Record<string, string>
    const variableNames = Object.keys(encryptedVariables)

    return {
      variableNames,
      count: variableNames.length,
    }
  } catch (error) {
    logger.error('Error getting environment variable keys:', error)
    throw new Error('Failed to get environment variables')
  }
}

export async function getPersonalAndWorkspaceEnv(
  userId: string,
  workspaceId?: string
): Promise<{
  personalEncrypted: Record<string, string>
  workspaceEncrypted: Record<string, string>
  personalDecrypted: Record<string, string>
  workspaceDecrypted: Record<string, string>
  conflicts: string[]
}> {
  const [personalRows, workspaceRows] = await Promise.all([
    db.select().from(environment).where(eq(environment.userId, userId)).limit(1),
    workspaceId
      ? db
          .select()
          .from(workspaceEnvironment)
          .where(eq(workspaceEnvironment.workspaceId, workspaceId))
          .limit(1)
      : Promise.resolve([] as any[]),
  ])

  const personalEncrypted: Record<string, string> = (personalRows[0]?.variables as any) || {}
  const workspaceEncrypted: Record<string, string> = (workspaceRows[0]?.variables as any) || {}

  const decryptAll = async (src: Record<string, string>) => {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(src)) {
      try {
        const { decrypted } = await decryptSecret(v)
        out[k] = decrypted
      } catch {
        out[k] = ''
      }
    }
    return out
  }

  const [personalDecrypted, workspaceDecrypted] = await Promise.all([
    decryptAll(personalEncrypted),
    decryptAll(workspaceEncrypted),
  ])

  const conflicts = Object.keys(personalEncrypted).filter((k) => k in workspaceEncrypted)

  return {
    personalEncrypted,
    workspaceEncrypted,
    personalDecrypted,
    workspaceDecrypted,
    conflicts,
  }
}

export async function getEffectiveDecryptedEnv(
  userId: string,
  workspaceId?: string
): Promise<Record<string, string>> {
  const { personalDecrypted, workspaceDecrypted } = await getPersonalAndWorkspaceEnv(
    userId,
    workspaceId
  )
  return { ...personalDecrypted, ...workspaceDecrypted }
}

/**
 * Merges system-level environment variables as fallback for user/workspace env vars.
 * System-level vars are only included if they're not already present in user/workspace vars.
 * This ensures system-level API keys are available when user hasn't set them.
 *
 * @param userEnvVars - User/workspace environment variables (decrypted)
 * @returns Merged environment variables with system-level fallbacks
 */
export function mergeSystemEnvironmentVariables(
  userEnvVars: Record<string, string>
): Record<string, string> {
  const systemEnvVars: Record<string, string> = {}

  // Common API keys that should have system-level fallback
  const systemApiKeys = [
    'OPENAI_API_KEY',
    'OPENAI_API_KEY_1',
    'OPENAI_API_KEY_2',
    'OPENAI_API_KEY_3',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_API_KEY_1',
    'ANTHROPIC_API_KEY_2',
    'ANTHROPIC_API_KEY_3',
    'XAI_API_KEY',
    'XAI_API_KEY_1',
    'XAI_API_KEY_2',
    'XAI_API_KEY_3',
    'MISTRAL_API_KEY',
    'GOOGLE_API_KEY',
    'SAMBANOVA_API_KEY',
    'SAMBANOVA_API_KEY_1',
    'SAMBANOVA_API_KEY_2',
    'SAMBANOVA_API_KEY_3',
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_API_VERSION',
    'OLLAMA_URL',
    'ELEVENLABS_API_KEY',
    'SERPER_API_KEY',
    'EXA_API_KEY',
    'SPYFU_API_USERNAME',
    'SPYFU_API_PASSWORD',
  ]

  // Add system-level env vars only if not already in user env vars
  for (const key of systemApiKeys) {
    if (!userEnvVars[key]) {
      const envValue = env[key as keyof typeof env]
      if (envValue && typeof envValue === 'string') {
        systemEnvVars[key] = envValue
        logger.debug(`Merged system-level env var: ${key} (value length: ${envValue.length})`)
      }
    }
  }

  if (Object.keys(systemEnvVars).length > 0) {
    logger.debug(`Merged ${Object.keys(systemEnvVars).length} system-level env vars as fallback`, {
      keys: Object.keys(systemEnvVars),
    })
  }

  // Merge with user/workspace vars taking precedence
  const merged = { ...systemEnvVars, ...userEnvVars }
  logger.debug(
    `Total env vars after merge: ${Object.keys(merged).length} (user: ${Object.keys(userEnvVars).length}, system: ${Object.keys(systemEnvVars).length})`
  )

  return merged
}
