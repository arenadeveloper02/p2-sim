'use client'

import { useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from '@/components/emcn'
import { requestJson } from '@/lib/api/client/request'
import { listWorkspaceCredentialsContract } from '@/lib/api/contracts'
import {
  ADD_CONNECTOR_SEARCH_PARAM,
  consumeOAuthReturnContext,
  type OAuthReturnContext,
  readOAuthReturnContext,
} from '@/lib/credentials/client-state'
import {
  handleUnipileHostedRedirect,
  readAndClearUnipileHostedRedirectParams,
} from '@/lib/unipile/hosted-return-client'

const OAUTH_CREDENTIAL_UPDATED_EVENT = 'oauth-credentials-updated'
const SETTINGS_RETURN_URL_KEY = 'settings-return-url'
const CONTEXT_MAX_AGE_MS = 15 * 60 * 1000

async function resolveOAuthMessage(ctx: OAuthReturnContext): Promise<string> {
  if (ctx.reconnect) {
    return `"${ctx.displayName}" reconnected successfully.`
  }

  try {
    const data = await requestJson(listWorkspaceCredentialsContract, {
      query: { workspaceId: ctx.workspaceId, type: 'oauth' },
    })
    const oauthCredentials = data.credentials ?? []

    const forProvider = oauthCredentials.filter((c) => c.providerId === ctx.providerId)
    if (forProvider.length > ctx.preCount) {
      return `"${ctx.displayName}" credential connected successfully.`
    }

    const existing = forProvider[0]
    return `This account is already connected as "${existing?.displayName || ctx.displayName}".`
  } catch {
    return `"${ctx.displayName}" credential connected successfully.`
  }
}

function dispatchCredentialUpdate(ctx: OAuthReturnContext) {
  window.dispatchEvent(
    new CustomEvent(OAUTH_CREDENTIAL_UPDATED_EVENT, {
      detail: { providerId: ctx.providerId, workspaceId: ctx.workspaceId },
    })
  )
}

/**
 * Post-OAuth router for the integrations page.
 *
 * After OAuth, Better Auth redirects back to `callbackURL` which is the integrations page.
 * This hook reads the stored return context to determine the original initiator:
 *
 * - `integrations`: Stay on this page, show a toast notification.
 * - `workflow`: Redirect to the specific workflow. The workflow page picks up the context.
 * - `kb-connectors`: Redirect to the KB page. The KB page picks up the context.
 */
export function useOAuthReturnRouter() {
  const router = useRouter()
  const params = useParams()
  const workspaceId = params.workspaceId as string
  const handledRef = useRef(false)

  useEffect(() => {
    if (handledRef.current) return

    const redirectParams = readAndClearUnipileHostedRedirectParams()
    if (redirectParams.hosted === 'failure') {
      handledRef.current = true
      toast.error('LinkedIn connection was not completed.', { duration: 5000 })
      consumeOAuthReturnContext()
      return
    }

    if (redirectParams.hosted || redirectParams.accountId) {
      handledRef.current = true
      void (async () => {
        const { ctx } = await handleUnipileHostedRedirect(redirectParams)
        if (redirectParams.hosted === 'success' || redirectParams.accountId) {
          if (ctx) {
            const message = await resolveOAuthMessage(ctx)
            toast.success(message, { duration: 5000 })
            dispatchCredentialUpdate(ctx)
            consumeOAuthReturnContext()
          } else {
            toast.error(
              'Connection session expired. Open Integrations and connect LinkedIn again.',
              { duration: 5000 }
            )
          }
        }
      })()
      return
    }

    const ctx = readOAuthReturnContext()
    if (!ctx) return
    if (Date.now() - ctx.requestedAt > CONTEXT_MAX_AGE_MS) {
      consumeOAuthReturnContext()
      return
    }

    handledRef.current = true

    if (ctx.origin === 'integrations') {
      consumeOAuthReturnContext()
      void (async () => {
        const message = await resolveOAuthMessage(ctx)
        toast.success(message)
        dispatchCredentialUpdate(ctx)
      })()
      return
    }

    if (ctx.origin === 'workflow') {
      try {
        sessionStorage.removeItem(SETTINGS_RETURN_URL_KEY)
      } catch {}
      router.replace(`/workspace/${workspaceId}/w/${ctx.workflowId}`)
      return
    }

    if (ctx.origin === 'kb-connectors') {
      try {
        sessionStorage.removeItem(SETTINGS_RETURN_URL_KEY)
      } catch {}
      const kbUrl = `/workspace/${workspaceId}/knowledge/${ctx.knowledgeBaseId}`
      const connectorParam = ctx.connectorType
        ? `?${ADD_CONNECTOR_SEARCH_PARAM}=${encodeURIComponent(ctx.connectorType)}`
        : ''
      router.replace(`${kbUrl}${connectorParam}`)
      return
    }
  }, [router, workspaceId])
}

/**
 * Post-OAuth handler for workflow pages.
 * Consumes the return context and shows a workflow-scoped notification.
 */
export function useOAuthReturnForWorkflow(workflowId: string) {
  const handledRef = useRef(false)

  useEffect(() => {
    if (handledRef.current) return

    const redirectParams = readAndClearUnipileHostedRedirectParams()

    if (redirectParams.hosted === 'failure') {
      handledRef.current = true
      toast.error('LinkedIn connection was not completed.', { duration: 5000 })
      consumeOAuthReturnContext()
      return
    }

    if (redirectParams.hosted || redirectParams.accountId) {
      handledRef.current = true
      void (async () => {
        const { ctx } = await handleUnipileHostedRedirect(redirectParams)
        if (ctx && ctx.origin === 'workflow' && ctx.workflowId === workflowId) {
          const message = await resolveOAuthMessage(ctx)
          toast.success(message, { duration: 5000 })
          dispatchCredentialUpdate(ctx)
          consumeOAuthReturnContext()
        } else if (redirectParams.hosted === 'success' || redirectParams.accountId) {
          toast.success('LinkedIn account linked. Select it in the block credential picker.', { duration: 5000 })
          consumeOAuthReturnContext()
        }
      })()
      return
    }

    const ctx = readOAuthReturnContext()
    if (!ctx || ctx.origin !== 'workflow') return
    if (ctx.workflowId !== workflowId) return
    consumeOAuthReturnContext()
    if (Date.now() - ctx.requestedAt > CONTEXT_MAX_AGE_MS) return

    handledRef.current = true

    void (async () => {
      const message = await resolveOAuthMessage(ctx)
      toast.success(message)
      dispatchCredentialUpdate(ctx)
    })()
  }, [workflowId])
}

/**
 * Post-OAuth handler for KB connectors pages.
 * Consumes the return context and shows a toast notification.
 */
export function useOAuthReturnForKBConnectors(knowledgeBaseId: string) {
  const handledRef = useRef(false)

  useEffect(() => {
    if (handledRef.current) return

    const redirectParams = readAndClearUnipileHostedRedirectParams()

    if (redirectParams.hosted === 'failure') {
      handledRef.current = true
      toast.error('LinkedIn connection was not completed.', { duration: 5000 })
      consumeOAuthReturnContext()
      return
    }

    if (redirectParams.hosted || redirectParams.accountId) {
      handledRef.current = true
      void (async () => {
        const { ctx } = await handleUnipileHostedRedirect(redirectParams)
        if (ctx && ctx.origin === 'kb-connectors' && ctx.knowledgeBaseId === knowledgeBaseId) {
          const message = await resolveOAuthMessage(ctx)
          toast.success(message, { duration: 5000 })
          dispatchCredentialUpdate(ctx)
          consumeOAuthReturnContext()
        } else if (redirectParams.hosted === 'success' || redirectParams.accountId) {
          toast.success('LinkedIn account linked.', { duration: 5000 })
          consumeOAuthReturnContext()
        }
      })()
      return
    }

    const ctx = readOAuthReturnContext()
    if (!ctx || ctx.origin !== 'kb-connectors') return
    if (ctx.knowledgeBaseId !== knowledgeBaseId) return
    consumeOAuthReturnContext()
    if (Date.now() - ctx.requestedAt > CONTEXT_MAX_AGE_MS) return

    handledRef.current = true

    void (async () => {
      const message = await resolveOAuthMessage(ctx)
      toast.success(message)
      dispatchCredentialUpdate(ctx)
    })()
  }, [knowledgeBaseId])
}
