import { useQuery } from '@tanstack/react-query'

/**
 * Query key factory for the app-wide header banner message.
 */
export const appBannerKeys = {
  all: ['appBanner'] as const,
  message: () => [...appBannerKeys.all, 'message'] as const,
}

export interface AppBannerPayload {
  message: string | null
}

async function fetchAppBanner(signal?: AbortSignal): Promise<AppBannerPayload> {
  const response = await fetch('/api/app/banner', { signal })

  if (!response.ok) {
    throw new Error('Failed to fetch app banner')
  }

  const json = (await response.json()) as { data?: AppBannerPayload }
  return json.data ?? { message: null }
}

/**
 * Loads the optional platform banner copy shown at the top of the workspace shell.
 */
export function useAppBanner() {
  return useQuery({
    queryKey: appBannerKeys.message(),
    queryFn: ({ signal }) => fetchAppBanner(signal),
    staleTime: 5 * 60 * 1000,
  })
}
