import { useMutation } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  ideogramPostProcessContract,
  type IdeogramPostProcessBody,
  type IdeogramPostProcessResponse,
} from '@/lib/api/contracts/tools/ideogram'

export const ideogramPostProcessKeys = {
  all: ['ideogram-post-process'] as const,
}

/**
 * Runs an Ideogram post-process operation on a stored image URL (session auth).
 */
export function useIdeogramPostProcess() {
  return useMutation({
    mutationFn: async (body: IdeogramPostProcessBody): Promise<IdeogramPostProcessResponse> => {
      return requestJson(ideogramPostProcessContract, { body })
    },
  })
}
