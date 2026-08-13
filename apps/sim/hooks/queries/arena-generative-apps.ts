import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiClientError } from '@/lib/api/client/errors'
import { requestJson } from '@/lib/api/client/request'
import {
  authenticateDeployedAppContract,
  type CreateDeployedAppBody,
  createDeployedAppContract,
  type DeployedAppConfig,
  deleteDeployedAppContract,
  getDeployedAppConfigContract,
  getDeployedAppPageContract,
  getGenerativeAppDraftContract,
  getGenerativeAppStatusContract,
  listGenerativeAppDraftsContract,
  requestGenerativeAppEmailOtpContract,
  runDeployedAppActionContract,
  runGenerativeAppDraftActionContract,
  type UpdateDeployedAppBody,
  updateDeployedAppContract,
  verifyGenerativeAppEmailOtpContract,
} from '@/lib/api/contracts/arena-generative-apps'

export const arenaGenerativeAppKeys = {
  all: ['arena-generative-apps'] as const,
  drafts: () => [...arenaGenerativeAppKeys.all, 'draft'] as const,
  draftList: (workflowId?: string) =>
    [...arenaGenerativeAppKeys.drafts(), workflowId ?? ''] as const,
  draft: (id?: string) => [...arenaGenerativeAppKeys.drafts(), 'detail', id ?? ''] as const,
  draftActions: () => [...arenaGenerativeAppKeys.drafts(), 'action'] as const,
  draftAction: (id?: string) => [...arenaGenerativeAppKeys.draftActions(), id ?? ''] as const,
  status: (workflowId?: string) =>
    [...arenaGenerativeAppKeys.all, 'status', workflowId ?? ''] as const,
  configs: () => [...arenaGenerativeAppKeys.all, 'config'] as const,
  config: (identifier?: string) => [...arenaGenerativeAppKeys.configs(), identifier ?? ''] as const,
  pages: () => [...arenaGenerativeAppKeys.all, 'page'] as const,
  page: (identifier?: string, path?: string) =>
    [...arenaGenerativeAppKeys.pages(), identifier ?? '', path ?? ''] as const,
}

export const GENERATIVE_APP_DRAFTS_STALE_TIME = 30 * 1000
export const GENERATIVE_APP_STATUS_STALE_TIME = 30 * 1000
export const DEPLOYED_APP_CONFIG_STALE_TIME = 60 * 1000
export const DEPLOYED_APP_PAGE_STALE_TIME = 30 * 1000

const AUTH_ERROR_MAP: Record<string, 'password' | 'email' | 'sso'> = {
  auth_required_password: 'password',
  auth_required_email: 'email',
  auth_required_sso: 'sso',
}

export type DeployedAppConfigResult =
  | { kind: 'config'; config: DeployedAppConfig }
  | { kind: 'auth'; authType: 'password' | 'email' | 'sso' }

export function useGenerativeAppDrafts(workflowId?: string) {
  return useQuery({
    queryKey: arenaGenerativeAppKeys.draftList(workflowId),
    queryFn: ({ signal }) =>
      requestJson(listGenerativeAppDraftsContract, {
        query: workflowId ? { workflowId } : {},
        signal,
      }),
    enabled: Boolean(workflowId),
    staleTime: GENERATIVE_APP_DRAFTS_STALE_TIME,
    placeholderData: keepPreviousData,
  })
}

export function useGenerativeAppDraft(id?: string) {
  return useQuery({
    queryKey: arenaGenerativeAppKeys.draft(id),
    queryFn: ({ signal }) =>
      requestJson(getGenerativeAppDraftContract, {
        params: { id: id as string },
        signal,
      }),
    enabled: Boolean(id),
    staleTime: GENERATIVE_APP_DRAFTS_STALE_TIME,
  })
}

export function useGenerativeAppStatus(workflowId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: arenaGenerativeAppKeys.status(workflowId),
    queryFn: ({ signal }) =>
      requestJson(getGenerativeAppStatusContract, {
        query: { workflowId: workflowId as string },
        signal,
      }),
    enabled: Boolean(workflowId) && (options?.enabled ?? true),
    staleTime: GENERATIVE_APP_STATUS_STALE_TIME,
  })
}

async function fetchDeployedAppConfig(
  identifier: string,
  signal?: AbortSignal
): Promise<DeployedAppConfigResult> {
  try {
    const config = await requestJson(getDeployedAppConfigContract, {
      params: { identifier },
      signal,
    })
    return { kind: 'config', config }
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      const authType = AUTH_ERROR_MAP[error.message]
      if (authType) {
        return { kind: 'auth', authType }
      }
    }
    throw error
  }
}

export function useDeployedAppConfig(identifier: string) {
  return useQuery({
    queryKey: arenaGenerativeAppKeys.config(identifier),
    queryFn: ({ signal }) => fetchDeployedAppConfig(identifier, signal),
    enabled: Boolean(identifier),
    staleTime: DEPLOYED_APP_CONFIG_STALE_TIME,
    retry: false,
  })
}

export function useDeployedAppPage(identifier: string, path: string, enabled: boolean) {
  return useQuery({
    queryKey: arenaGenerativeAppKeys.page(identifier, path),
    queryFn: ({ signal }) =>
      requestJson(getDeployedAppPageContract, {
        params: { identifier, path },
        signal,
      }),
    enabled: Boolean(identifier && path && enabled),
    staleTime: DEPLOYED_APP_PAGE_STALE_TIME,
  })
}

export function useDeployedAppPasswordAuth(identifier: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ password }: { password: string }) =>
      requestJson(authenticateDeployedAppContract, {
        params: { identifier },
        body: { password },
      }),
    onSuccess: (config) => {
      queryClient.setQueryData<DeployedAppConfigResult>(arenaGenerativeAppKeys.config(identifier), {
        kind: 'config',
        config,
      })
    },
  })
}

export function useDeployedAppEmailOtpRequest(identifier: string) {
  return useMutation({
    mutationFn: ({ email }: { email: string }) =>
      requestJson(requestGenerativeAppEmailOtpContract, {
        params: { identifier },
        body: { email },
      }),
  })
}

export function useDeployedAppEmailOtpVerify(identifier: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ email, otp }: { email: string; otp: string }) =>
      requestJson(verifyGenerativeAppEmailOtpContract, {
        params: { identifier },
        body: { email, otp },
      }),
    onSuccess: (config) => {
      queryClient.setQueryData<DeployedAppConfigResult>(arenaGenerativeAppKeys.config(identifier), {
        kind: 'config',
        config,
      })
    },
  })
}

export function useRunDeployedAppAction(identifier: string) {
  return useMutation({
    mutationFn: ({
      actionId,
      values,
      emailId,
    }: {
      actionId: string
      values: Record<string, unknown>
      emailId?: string
    }) =>
      requestJson(runDeployedAppActionContract, {
        params: { identifier, actionId },
        body: { values, emailId },
      }),
  })
}

export function useRunGenerativeAppDraftAction(draftId: string) {
  return useMutation({
    mutationFn: ({ actionId, values }: { actionId: string; values: Record<string, unknown> }) =>
      requestJson(runGenerativeAppDraftActionContract, {
        params: { id: draftId, actionId },
        body: { values },
      }),
  })
}

export function useCreateDeployedApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateDeployedAppBody) => requestJson(createDeployedAppContract, { body }),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: arenaGenerativeAppKeys.status(variables.workflowId),
      })
      queryClient.invalidateQueries({ queryKey: arenaGenerativeAppKeys.drafts() })
    },
  })
}

export function useUpdateDeployedApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateDeployedAppBody }) =>
      requestJson(updateDeployedAppContract, { params: { id }, body }),
    onSettled: (_data, _error, variables) => {
      if (variables.body.workflowId) {
        queryClient.invalidateQueries({
          queryKey: arenaGenerativeAppKeys.status(variables.body.workflowId),
        })
      }
      queryClient.invalidateQueries({ queryKey: arenaGenerativeAppKeys.drafts() })
    },
  })
}

export function useDeleteDeployedApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; workflowId: string }) =>
      requestJson(deleteDeployedAppContract, { params: { id } }),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: arenaGenerativeAppKeys.status(variables.workflowId),
      })
    },
  })
}
