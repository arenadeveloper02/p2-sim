/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest'
import {
  DelegatedWorkspaceAuthorizationError,
  NoWorkspaceAccessError,
  PersonalApiKeysDisabledError,
  PrincipalKindAuthorizationError,
  WorkspaceApiKeyAuthorizationError,
  WorkspaceApiKeyScopeAuthorizationError,
} from '@/lib/core/application'
import { OrchestrationError } from '@/lib/core/orchestration/types'
import { EmbeddingAPIError, EmbeddingOutputLimitError } from '@/lib/embeddings/client'
import {
  internalKnowledgeErrorPolicies,
  v2KnowledgeErrorPolicies,
} from '@/lib/knowledge/api/route-policies'

describe('v2 knowledge error policies', () => {
  it.each([
    new NoWorkspaceAccessError(),
    new WorkspaceApiKeyScopeAuthorizationError(),
    new DelegatedWorkspaceAuthorizationError(),
  ])('conceals cross-tenant knowledge authorization failures', async (error) => {
    const response = v2KnowledgeErrorPolicies.concealKnowledgeBaseAuthorization.render(error)
    expect(response?.status).toBe(404)
    expect(await response?.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Knowledge base not found' },
    })
  })

  it.each([
    new WorkspaceApiKeyAuthorizationError(),
    new PrincipalKindAuthorizationError('workspace_api_key', 'knowledge.read'),
  ])('preserves same-workspace principal policy failures as forbidden', async (error) => {
    const response = v2KnowledgeErrorPolicies.concealKnowledgeBaseAuthorization.render(error)
    expect(response?.status).toBe(403)
    expect(await response?.json()).toMatchObject({ error: { code: 'FORBIDDEN' } })
  })

  it('preserves the personal-api-key policy failure as forbidden', async () => {
    const response = v2KnowledgeErrorPolicies.concealKnowledgeBaseAuthorization.render(
      new PersonalApiKeysDisabledError()
    )
    expect(response?.status).toBe(403)
    expect(await response?.json()).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'Personal API keys are not allowed for this workspace',
        details: { code: 'PERSONAL_API_KEYS_DISABLED' },
      },
    })
  })

  it('does not conceal unrelated forbidden business errors', async () => {
    const response = v2KnowledgeErrorPolicies.concealKnowledgeBaseAuthorization.render(
      new OrchestrationError('forbidden', 'Knowledge base transition is forbidden')
    )
    expect(response?.status).toBe(403)
    expect(await response?.json()).toEqual({
      error: { code: 'FORBIDDEN', message: 'Knowledge base transition is forbidden' },
    })
  })

  it('preserves genuine not-found failures', async () => {
    const response = v2KnowledgeErrorPolicies.concealKnowledgeBaseAuthorization.render(
      new OrchestrationError('not_found', 'Knowledge base not found')
    )
    expect(response?.status).toBe(404)
    expect(await response?.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Knowledge base not found' },
    })
  })
})

describe('internal knowledge search error policy', () => {
  it('returns the embedding API message instead of a generic vector-search failure', () => {
    const projected = internalKnowledgeErrorPolicies.search.project(
      new EmbeddingAPIError('The configured embedding API key was rejected.', 401)
    )
    expect(projected).toEqual({
      status: 401,
      body: { error: 'The configured embedding API key was rejected.' },
    })
  })

  it('returns the embedding output-limit message as payload too large', () => {
    const projected = internalKnowledgeErrorPolicies.search.project(
      new EmbeddingOutputLimitError(1, 1536, 9_000_000)
    )
    expect(projected).toMatchObject({
      status: 413,
      body: { error: expect.stringContaining('exceeding the safe aggregate limit') },
    })
  })
})
