import { DEFAULT_PRIVACY_URL, DEFAULT_TERMS_URL } from '@/lib/branding/defaults'
import { AuthTextLink } from '@/app/(auth)/components/auth-text-link'
import { getBrandConfig } from '@/ee/whitelabeling'

interface AuthLegalFooterProps {
  /** The gerund describing the consent action, e.g. "signing in". */
  action: string
}

/**
 * The "By {action}, you agree to our Terms / Privacy" fine print shared by the
 * login and signup pages. Restyled to muted light tokens with the legal links
 * routed through {@link AuthTextLink}, so the consent copy has one source.
 */
export function AuthLegalFooter({ action }: AuthLegalFooterProps) {
  const brand = getBrandConfig()
  const termsUrl = brand.termsUrl ?? DEFAULT_TERMS_URL
  const privacyUrl = brand.privacyUrl ?? DEFAULT_PRIVACY_URL

  return (
    <p className='text-center text-[var(--text-muted)] text-caption leading-relaxed'>
      By {action}, you agree to our{' '}
      <AuthTextLink href={termsUrl} external>
        Terms of Service
      </AuthTextLink>{' '}
      and{' '}
      <AuthTextLink href={privacyUrl} external>
        Privacy Policy
      </AuthTextLink>
    </p>
  )
}
