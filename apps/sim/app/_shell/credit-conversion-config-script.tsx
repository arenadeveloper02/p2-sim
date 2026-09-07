import { setCreditsPerDollar } from '@/lib/billing/credits/conversion'

interface CreditConversionConfigScriptProps {
  creditsPerDollar: number
}

/**
 * Publishes the server-resolved credit conversion to browser-side helpers
 * before client components render.
 */
export function CreditConversionConfigScript({
  creditsPerDollar,
}: CreditConversionConfigScriptProps) {
  setCreditsPerDollar(creditsPerDollar)

  return (
    <script
      id='credit-conversion-config'
      dangerouslySetInnerHTML={{
        __html: `globalThis.__SIM_CREDITS_PER_DOLLAR__ = ${JSON.stringify(creditsPerDollar)};`,
      }}
    />
  )
}
