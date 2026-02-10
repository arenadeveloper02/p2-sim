import { db } from '@sim/db'
import { account, workflow } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import {
  createBadRequestResponse,
  createInternalServerErrorResponse,
  createRequestTracker,
  createUnauthorizedResponse,
} from '@/lib/copilot/request-helpers'
import { generateRequestId } from '@/lib/core/utils/request'
import { getEffectiveDecryptedEnv } from '@/lib/environment/utils'
import { refreshTokenIfNeeded } from '@/app/api/auth/oauth/utils'
import { resolveEnvVarReferences } from '@/executor/utils/reference-validation'
import { executeTool } from '@/tools'
import { getTool, resolveToolId } from '@/tools/utils'

const logger = createLogger('CopilotExecuteToolAPI')

const ExecuteToolSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  arguments: z.record(z.any()).optional().default({}),
  workflowId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const tracker = createRequestTracker()

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return createUnauthorizedResponse()
    }

    const userId = session.user.id
    const body = await req.json()

    try {
      const preview = JSON.stringify(body).slice(0, 300)
      logger.debug(`[${tracker.requestId}] Incoming execute-tool request`, { preview })
    } catch {}

    const { toolCallId, toolName, arguments: toolArgs, workflowId } = ExecuteToolSchema.parse(body)

    const resolvedToolName = resolveToolId(toolName)

    logger.info(`[${tracker.requestId}] Executing tool`, {
      toolCallId,
      toolName,
      resolvedToolName,
      workflowId,
      hasArgs: Object.keys(toolArgs).length > 0,
    })

    const toolConfig = getTool(resolvedToolName)
    if (!toolConfig) {
      // Find similar tool names to help debug
      const { tools: allTools } = await import('@/tools/registry')
      const allToolNames = Object.keys(allTools)
      const prefix = toolName.split('_').slice(0, 2).join('_')
      const similarTools = allToolNames
        .filter((name) => name.startsWith(`${prefix.split('_')[0]}_`))
        .slice(0, 10)

      logger.warn(`[${tracker.requestId}] Tool not found in registry`, {
        toolName,
        prefix,
        similarTools,
        totalToolsInRegistry: allToolNames.length,
      })
      return NextResponse.json(
        {
          success: false,
          error: `Tool not found: ${toolName}. Similar tools: ${similarTools.join(', ')}`,
          toolCallId,
        },
        { status: 404 }
      )
    }

    // Get the workspaceId from the workflow (env vars are stored at workspace level)
    let workspaceId: string | undefined
    if (workflowId) {
      const workflowResult = await db
        .select({ workspaceId: workflow.workspaceId })
        .from(workflow)
        .where(eq(workflow.id, workflowId))
        .limit(1)
      workspaceId = workflowResult[0]?.workspaceId ?? undefined
    }

    // Get decrypted environment variables early so we can resolve all {{VAR}} references
    const decryptedEnvVars = await getEffectiveDecryptedEnv(userId, workspaceId)

    logger.info(`[${tracker.requestId}] Fetched environment variables`, {
      workflowId,
      workspaceId,
      envVarCount: Object.keys(decryptedEnvVars).length,
      envVarKeys: Object.keys(decryptedEnvVars),
    })

    // Build execution params starting with LLM-provided arguments
    // Resolve all {{ENV_VAR}} references in the arguments (deep for nested objects)
    const executionParams: Record<string, any> = resolveEnvVarReferences(
      toolArgs,
      decryptedEnvVars,
      { deep: true }
    ) as Record<string, any>

    logger.info(`[${tracker.requestId}] Resolved env var references in arguments`, {
      toolName,
      originalArgKeys: Object.keys(toolArgs),
      resolvedArgKeys: Object.keys(executionParams),
    })

    // Resolve OAuth access token if required
    if (toolConfig.oauth?.required && toolConfig.oauth.provider) {
      const provider = toolConfig.oauth.provider
      logger.info(`[${tracker.requestId}] Resolving OAuth token`, { provider })

      try {
        // Find the account for this provider and user
        const accounts = await db
          .select()
          .from(account)
          .where(and(eq(account.providerId, provider), eq(account.userId, userId)))
          .limit(1)

        if (accounts.length > 0) {
          const acc = accounts[0]
          logger.info(`[${tracker.requestId}] Found account for ${provider}`, {
            accountId: acc.id,
            hasAccessToken: !!acc.accessToken,
            hasIdToken: !!acc.idToken,
            idTokenLength: acc.idToken ? acc.idToken.length : 0,
            idTokenIsEmpty: acc.idToken === '',
            accessTokenPrefix: acc.accessToken ? `${acc.accessToken.substring(0, 10)}...` : 'none',
            idTokenPrefix: acc.idToken ? `${acc.idToken.substring(0, 10)}...` : 'none',
            idTokenType: acc.idToken
              ? acc.idToken.startsWith('xoxp-')
                ? 'user'
                : acc.idToken.startsWith('xoxb-')
                  ? 'bot'
                  : 'unknown'
              : 'none',
          })
          const requestId = generateRequestId()
          const { accessToken } = await refreshTokenIfNeeded(requestId, acc as any, acc.id)

          // Check if tool requires user token instead of bot token
          const useUserToken = (toolConfig.oauth as any)?.useUserToken
          const hasIdToken = acc.idToken && acc.idToken.trim() !== ''
          const tokenToUse = useUserToken && hasIdToken ? acc.idToken : accessToken

          logger.info(`[${tracker.requestId}] Token resolution details`, {
            provider,
            toolName,
            useUserToken,
            hasIdToken,
            hasAccessToken: !!accessToken,
            usingUserToken: useUserToken && hasIdToken,
            tokenToUseType: useUserToken && hasIdToken ? 'idToken' : 'accessToken',
            selectedTokenPrefix: tokenToUse ? `${tokenToUse.substring(0, 10)}...` : 'none',
            selectedTokenType: tokenToUse
              ? tokenToUse.startsWith('xoxp-')
                ? 'user'
                : tokenToUse.startsWith('xoxb-')
                  ? 'bot'
                  : 'unknown'
              : 'none',
            idTokenPrefix: acc.idToken ? `${acc.idToken.substring(0, 10)}...` : 'none',
            accessTokenPrefix: accessToken ? `${accessToken.substring(0, 10)}...` : 'none',
          })

          if (tokenToUse) {
            executionParams.accessToken = tokenToUse
            if (useUserToken) {
              executionParams.userToken = tokenToUse // Also set userToken for clarity
            }
            logger.info(`[${tracker.requestId}] OAuth token resolved successfully`, {
              provider,
              toolName,
              finalTokenType: useUserToken && hasIdToken ? 'user' : 'bot',
              tokenLength: tokenToUse.length,
              tokenPrefix: tokenToUse.substring(0, 10),
              isBotToken: tokenToUse.startsWith('xoxb-'),
              isUserToken: tokenToUse.startsWith('xoxp-'),
            })
          } else {
            const expectedTokenType = useUserToken ? 'user' : 'bot'
            const errorMessage =
              useUserToken && !hasIdToken && accessToken
                ? `User token not available for ${provider}. This tool requires a user token, but only a bot token is stored. Please re-authenticate your Slack account to grant user token permissions.`
                : `${expectedTokenType === 'user' ? 'User' : 'Bot'} token not available for ${provider}. Please reconnect your account.`

            logger.error(`[${tracker.requestId}] No ${expectedTokenType} token available`, {
              provider,
              toolName,
              useUserToken,
              hasIdToken,
              hasAccessToken: !!accessToken,
              errorMessage,
            })
            return NextResponse.json(
              {
                success: false,
                error: errorMessage,
                toolCallId,
              },
              { status: 400 }
            )
          }
        } else {
          logger.warn(`[${tracker.requestId}] No account found for provider`, { provider })
          return NextResponse.json(
            {
              success: false,
              error: `No ${provider} account connected. Please connect your account first.`,
              toolCallId,
            },
            { status: 400 }
          )
        }
      } catch (error) {
        logger.error(`[${tracker.requestId}] Failed to resolve OAuth token`, {
          provider,
          error: error instanceof Error ? error.message : String(error),
        })
        return NextResponse.json(
          {
            success: false,
            error: `Failed to get OAuth token for ${provider}`,
            toolCallId,
          },
          { status: 500 }
        )
      }
    }

    // Check if tool requires an API key that wasn't resolved via {{ENV_VAR}} reference
    const needsApiKey = toolConfig.params?.apiKey?.required

    if (needsApiKey && !executionParams.apiKey) {
      logger.warn(`[${tracker.requestId}] No API key found for tool`, { toolName })
      return NextResponse.json(
        {
          success: false,
          error: `API key not provided for ${toolName}. Use {{YOUR_API_KEY_ENV_VAR}} to reference your environment variable.`,
          toolCallId,
        },
        { status: 400 }
      )
    }

    // Add execution context
    executionParams._context = {
      workflowId,
      userId,
    }

    // Special handling for function_execute - inject environment variables
    if (toolName === 'function_execute') {
      executionParams.envVars = decryptedEnvVars
      executionParams.workflowVariables = {} // No workflow variables in copilot context
      executionParams.blockData = {} // No block data in copilot context
      executionParams.blockNameMapping = {} // No block mapping in copilot context
      executionParams.language = executionParams.language || 'javascript'
      executionParams.timeout = executionParams.timeout || 30000

      logger.info(`[${tracker.requestId}] Injected env vars for function_execute`, {
        envVarCount: Object.keys(decryptedEnvVars).length,
      })
    }

    // Execute the tool
    logger.info(`[${tracker.requestId}] Executing tool with resolved credentials`, {
      toolName,
      hasAccessToken: !!executionParams.accessToken,
      hasApiKey: !!executionParams.apiKey,
    })

    const result = await executeTool(resolvedToolName, executionParams)

    logger.info(`[${tracker.requestId}] Tool execution complete`, {
      toolName,
      success: result.success,
      hasOutput: !!result.output,
    })

    return NextResponse.json({
      success: true,
      toolCallId,
      result: {
        success: result.success,
        output: result.output,
        error: result.error,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.debug(`[${tracker.requestId}] Zod validation error`, { issues: error.issues })
      return createBadRequestResponse('Invalid request body for execute-tool')
    }
    logger.error(`[${tracker.requestId}] Failed to execute tool:`, error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to execute tool'
    return createInternalServerErrorResponse(errorMessage)
  }
}
