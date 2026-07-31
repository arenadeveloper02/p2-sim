import { getErrorMessage } from '@sim/utils/errors'
import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  deleteDeployedChatThreadContract,
  type DeployedChatThreadRecord,
  listDeployedChatThreadsContract,
  updateDeployedChatThreadContract,
} from '@/lib/api/contracts/deployed-chat-threads'

const DEPLOYED_CHAT_THREADS_STALE_TIME = 30 * 1000

export const deployedChatThreadKeys = {
  all: ['deployed-chat-threads'] as const,
  lists: () => [...deployedChatThreadKeys.all, 'list'] as const,
  list: (identifier?: string) => [...deployedChatThreadKeys.lists(), identifier ?? ''] as const,
}

export async function fetchDeployedChatThreads(
  identifier: string,
  signal?: AbortSignal
): Promise<DeployedChatThreadRecord[]> {
  try {
    const data = await requestJson(listDeployedChatThreadsContract, {
      params: { identifier },
      signal,
    })
    return data.records
  } catch (error) {
    // boundary-raw-fetch: fallback when contract validation fails on legacy thread payloads
    const response = await fetch(`/api/chat/${encodeURIComponent(identifier)}/all-history`, {
      signal,
    })
    if (!response.ok) {
      throw error instanceof Error ? error : new Error(getErrorMessage(error, 'Failed to load threads'))
    }
    const data = (await response.json()) as { records?: DeployedChatThreadRecord[] }
    return data.records ?? []
  }
}

export function useDeployedChatThreads(identifier?: string, enabled = true) {
  return useQuery({
    queryKey: deployedChatThreadKeys.list(identifier),
    queryFn: identifier
      ? ({ signal }) => fetchDeployedChatThreads(identifier, signal)
      : skipToken,
    enabled: Boolean(identifier) && enabled,
    placeholderData: keepPreviousData,
    staleTime: DEPLOYED_CHAT_THREADS_STALE_TIME,
  })
}

async function renameDeployedChatThread(params: {
  identifier: string
  chatId: string
  title: string
}): Promise<void> {
  await requestJson(updateDeployedChatThreadContract, {
    params: { identifier: params.identifier, chatId: params.chatId },
    body: { title: params.title },
  })
}

export function useRenameDeployedChatThread(identifier?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: renameDeployedChatThread,
    onMutate: async ({ chatId, title }) => {
      if (!identifier) return
      await queryClient.cancelQueries({ queryKey: deployedChatThreadKeys.list(identifier) })

      const previous = queryClient.getQueryData<DeployedChatThreadRecord[]>(
        deployedChatThreadKeys.list(identifier)
      )

      queryClient.setQueryData<DeployedChatThreadRecord[]>(
        deployedChatThreadKeys.list(identifier),
        (old) =>
          old?.map((thread) => (thread.chatId === chatId ? { ...thread, title } : thread))
      )

      return { previous }
    },
    onError: (_err, _variables, context) => {
      if (identifier && context?.previous) {
        queryClient.setQueryData(deployedChatThreadKeys.list(identifier), context.previous)
      }
    },
    onSettled: () => {
      if (identifier) {
        queryClient.invalidateQueries({ queryKey: deployedChatThreadKeys.list(identifier) })
      }
    },
  })
}

async function deleteDeployedChatThread(params: {
  identifier: string
  chatId: string
}): Promise<void> {
  await requestJson(deleteDeployedChatThreadContract, {
    params: { identifier: params.identifier, chatId: params.chatId },
  })
}

export function useDeleteDeployedChatThread(identifier?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteDeployedChatThread,
    onMutate: async ({ chatId }) => {
      if (!identifier) return
      await queryClient.cancelQueries({ queryKey: deployedChatThreadKeys.list(identifier) })

      const previous = queryClient.getQueryData<DeployedChatThreadRecord[]>(
        deployedChatThreadKeys.list(identifier)
      )

      queryClient.setQueryData<DeployedChatThreadRecord[]>(
        deployedChatThreadKeys.list(identifier),
        (old) => old?.filter((thread) => thread.chatId !== chatId)
      )

      return { previous }
    },
    onError: (_err, _variables, context) => {
      if (identifier && context?.previous) {
        queryClient.setQueryData(deployedChatThreadKeys.list(identifier), context.previous)
      }
    },
    onSettled: () => {
      if (identifier) {
        queryClient.invalidateQueries({ queryKey: deployedChatThreadKeys.list(identifier) })
      }
    },
  })
}

async function setDeployedChatThreadPinned(params: {
  identifier: string
  chatId: string
  pinned: boolean
}): Promise<void> {
  await requestJson(updateDeployedChatThreadContract, {
    params: { identifier: params.identifier, chatId: params.chatId },
    body: { pinned: params.pinned },
  })
}

export function useSetDeployedChatThreadPinned(identifier?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: setDeployedChatThreadPinned,
    onSettled: () => {
      if (identifier) {
        queryClient.invalidateQueries({ queryKey: deployedChatThreadKeys.list(identifier) })
      }
    },
  })
}
