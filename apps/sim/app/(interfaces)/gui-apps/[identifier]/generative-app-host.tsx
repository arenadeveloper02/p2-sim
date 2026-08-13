'use client'

import { useEffect, useState } from 'react'
import { Button, Input, InputOTP, InputOTPGroup, InputOTPSlot, Label } from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { useRouter } from 'next/navigation'
import { ARENA_GENERATIVE_APP_BASE_PATH, isJsonRenderSpec } from '@/lib/arena-generative-ui/types'
import { SpecRenderer } from '@/app/(interfaces)/gui-apps/[identifier]/spec-renderer'
import {
  useDeployedAppConfig,
  useDeployedAppEmailOtpRequest,
  useDeployedAppEmailOtpVerify,
  useDeployedAppPage,
  useDeployedAppPasswordAuth,
  useRunDeployedAppAction,
} from '@/hooks/queries/arena-generative-apps'

const logger = createLogger('GenerativeAppHost')

interface GenerativeAppHostProps {
  identifier: string
  pagePath: string
  emailId: string
}

export function GenerativeAppHost({ identifier, pagePath, emailId }: GenerativeAppHostProps) {
  const router = useRouter()
  const configQuery = useDeployedAppConfig(identifier)
  const [state, setState] = useState<Record<string, unknown>>({})
  const pageQuery = useDeployedAppPage(identifier, pagePath, configQuery.data?.kind === 'config')
  const runAction = useRunDeployedAppAction(identifier)

  const navigate = (path: string) => {
    const params = emailId ? `?emailId=${encodeURIComponent(emailId)}` : ''
    router.push(`${ARENA_GENERATIVE_APP_BASE_PATH}/${identifier}/${path}${params}`)
  }

  if (configQuery.isLoading) {
    return <p className='p-8 text-[var(--color-ds-grey-500,#8a8d99)] text-sm'>Loading…</p>
  }

  if (configQuery.data?.kind === 'auth') {
    if (configQuery.data.authType === 'password') {
      return <PasswordGate identifier={identifier} />
    }
    if (configQuery.data.authType === 'email') {
      return <EmailGate identifier={identifier} />
    }
    return (
      <div className='flex min-h-[50vh] items-center justify-center p-8 text-center'>
        <div>
          <h1 className='text-2xl'>Sign in required</h1>
          <p className='mt-2 text-[var(--color-ds-grey-500,#8a8d99)]'>
            This app uses SSO. Sign in and reload this page.
          </p>
        </div>
      </div>
    )
  }

  if (configQuery.isError || !configQuery.data || configQuery.data.kind !== 'config') {
    return (
      <div className='p-8 text-center text-[var(--text-error)]'>
        {toError(configQuery.error).message || 'Unable to load this app'}
      </div>
    )
  }

  if (pageQuery.isLoading) {
    return <p className='p-8 text-[var(--color-ds-grey-500,#8a8d99)] text-sm'>Loading page…</p>
  }

  if (!pageQuery.data || !isJsonRenderSpec(pageQuery.data.spec)) {
    return <div className='p-8 text-center'>Page not found</div>
  }

  return (
    <SpecRenderer
      spec={pageQuery.data.spec}
      state={state}
      pending={runAction.isPending}
      onNavigate={navigate}
      onRunAction={async (actionId, values) => {
        try {
          const result = await runAction.mutateAsync({
            actionId,
            values,
            emailId: emailId || undefined,
          })
          if (result.setState) {
            setState((current) => ({ ...current, ...result.setState }))
          }
          if (result.navigate) {
            navigate(result.navigate)
          }
          if (!result.ok) {
            logger.warn('App action returned an error', { error: result.error })
          }
        } catch (error) {
          logger.error('App action failed', { error: toError(error).message })
        }
      }}
    />
  )
}

function PasswordGate({ identifier }: { identifier: string }) {
  const [password, setPassword] = useState('')
  const authenticate = useDeployedAppPasswordAuth(identifier)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className='mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center gap-4 px-4'
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        authenticate.mutate({ password }, { onError: (err) => setError(toError(err).message) })
      }}
    >
      <h1 className='text-2xl'>Password required</h1>
      <Label htmlFor='app-password'>Password</Label>
      <Input
        id='app-password'
        type='password'
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {error ? <p className='text-[var(--text-error)] text-sm'>{error}</p> : null}
      <Button type='submit' disabled={authenticate.isPending}>
        Continue
      </Button>
    </form>
  )
}

function EmailGate({ identifier }: { identifier: string }) {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestOtp = useDeployedAppEmailOtpRequest(identifier)
  const verifyOtp = useDeployedAppEmailOtpVerify(identifier)

  useEffect(() => {
    if (otp.length === 6) {
      verifyOtp.mutate({ email, otp }, { onError: (err) => setError(toError(err).message) })
    }
  }, [otp, email, verifyOtp])

  return (
    <div className='mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center gap-4 px-4'>
      <h1 className='text-2xl'>Email required</h1>
      <Label htmlFor='app-email'>Email</Label>
      <Input
        id='app-email'
        type='email'
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      {sent ? (
        <>
          <Label>Verification code</Label>
          <InputOTP maxLength={6} value={otp} onChange={setOtp}>
            <InputOTPGroup>
              {Array.from({ length: 6 }).map((_, index) => (
                <InputOTPSlot key={String(index)} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </>
      ) : (
        <Button
          type='button'
          disabled={requestOtp.isPending}
          onClick={() => {
            setError(null)
            requestOtp.mutate(
              { email },
              {
                onSuccess: () => setSent(true),
                onError: (err) => setError(toError(err).message),
              }
            )
          }}
        >
          Send code
        </Button>
      )}
      {error ? <p className='text-[var(--text-error)] text-sm'>{error}</p> : null}
    </div>
  )
}
