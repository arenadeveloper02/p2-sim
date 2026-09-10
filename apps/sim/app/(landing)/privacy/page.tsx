import { redirect } from 'next/navigation'
import { DEFAULT_PRIVACY_URL } from '@/lib/branding/defaults'
import { getBrandConfig } from '@/ee/whitelabeling'

/**
 * In-app Privacy Policy is disabled until Arena legal copy is finalized.
 */
export default function Page() {
  redirect(getBrandConfig().privacyUrl || DEFAULT_PRIVACY_URL)
}
