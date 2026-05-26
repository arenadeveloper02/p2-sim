'use client'

import { useMemo } from 'react'
import { useSession } from '@/lib/auth/auth-client'
import { isClientUser } from '@/lib/users/is-client-user'
import { useUserProfile } from '@/hooks/queries/user-profile'

/**
 * Whether the signed-in user is a client (external) user vs internal employee.
 */
export function useIsClientUser(): boolean {
  const { data: session } = useSession()
  const { data: profile } = useUserProfile()

  return useMemo(() => {
    const email = profile?.email ?? session?.user?.email
    if (!email) return false
    return isClientUser(email, { userType: profile?.userType ?? null })
  }, [profile?.email, profile?.userType, session?.user?.email])
}
