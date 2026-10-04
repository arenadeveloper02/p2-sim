import { redirect } from 'next/navigation'
import { DEFAULT_TERMS_URL } from '@/lib/branding/defaults'
import { getBrandConfig } from '@/ee/whitelabeling'

/**
 * In-app Terms of Service is disabled until Arena legal copy is finalized.
 */
export default function Page() {
  redirect(getBrandConfig().termsUrl || DEFAULT_TERMS_URL)
}
