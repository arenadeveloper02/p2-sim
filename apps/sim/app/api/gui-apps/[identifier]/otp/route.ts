import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { renderOTPEmail } from '@/components/emails'
import {
  requestGenerativeAppEmailOtpContract,
  verifyGenerativeAppEmailOtpContract,
} from '@/lib/api/contracts/arena-generative-apps'
import { getValidationErrorMessage, parseRequest } from '@/lib/api/server'
import {
  findDeployedAppByIdentifier,
  setAppAuthCookie,
  toDeployedAppConfig,
} from '@/lib/arena-generative-ui/deployment'
import { RateLimiter } from '@/lib/core/rate-limiter'
import { isEmailAllowed } from '@/lib/core/security/deployment'
import {
  decodeOTPValue,
  deleteOTP,
  generateOTP,
  getOTP,
  incrementOTPAttempts,
  MAX_OTP_ATTEMPTS,
  OTP_EMAIL_RATE_LIMIT,
  OTP_IP_RATE_LIMIT,
  storeOTP,
} from '@/lib/core/security/otp'
import { generateRequestId, getClientIp } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { sendEmail } from '@/lib/messaging/email/mailer'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

const logger = createLogger('DeployedAppOtpAPI')
const rateLimiter = new RateLimiter()

export const POST = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ identifier: string }> }) => {
    const requestId = generateRequestId()
    const ip = getClientIp(request)
    const ipRateLimit = await rateLimiter.checkRateLimitDirect(
      `app-otp:ip:${ip}`,
      OTP_IP_RATE_LIMIT
    )
    if (!ipRateLimit.allowed) {
      const retryAfter = Math.ceil(
        (ipRateLimit.retryAfterMs ?? OTP_IP_RATE_LIMIT.refillIntervalMs) / 1000
      )
      const response = createErrorResponse('Too many requests. Please try again later.', 429)
      response.headers.set('Retry-After', String(retryAfter))
      return response
    }

    const parsed = await parseRequest(requestGenerativeAppEmailOtpContract, request, context, {
      validationErrorResponse: (error) =>
        createErrorResponse(getValidationErrorMessage(error, 'Invalid request'), 400),
    })
    if (!parsed.success) return parsed.response

    const deployment = await findDeployedAppByIdentifier(parsed.data.params.identifier)
    if (!deployment || !deployment.isActive) {
      return createErrorResponse('App not found', 404)
    }
    if (deployment.authType !== 'email') {
      return createErrorResponse('This app does not use email authentication', 400)
    }

    const { email } = parsed.data.body
    const allowedEmails = Array.isArray(deployment.allowedEmails)
      ? (deployment.allowedEmails as string[])
      : []
    if (!isEmailAllowed(email, allowedEmails)) {
      return createErrorResponse('Email not authorized for this app', 403)
    }

    const emailRateLimit = await rateLimiter.checkRateLimitDirect(
      `app-otp:email:${deployment.id}:${email.toLowerCase()}`,
      OTP_EMAIL_RATE_LIMIT
    )
    if (!emailRateLimit.allowed) {
      const retryAfter = Math.ceil(
        (emailRateLimit.retryAfterMs ?? OTP_EMAIL_RATE_LIMIT.refillIntervalMs) / 1000
      )
      const response = createErrorResponse(
        'Too many verification code requests. Please try again later.',
        429
      )
      response.headers.set('Retry-After', String(retryAfter))
      return response
    }

    const otp = generateOTP()
    await storeOTP('app', deployment.id, email, otp)
    const emailHtml = await renderOTPEmail(otp, email, 'email-verification', deployment.title)
    const emailResult = await sendEmail({
      to: email,
      subject: `Verification code for ${deployment.title}`,
      html: emailHtml,
    })
    if (!emailResult.success) {
      logger.error(`[${requestId}] Failed to send OTP email`, { message: emailResult.message })
      return createErrorResponse('Failed to send verification email', 500)
    }

    return createSuccessResponse({ message: 'Verification code sent' })
  }
)

export const PUT = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ identifier: string }> }) => {
    const parsed = await parseRequest(verifyGenerativeAppEmailOtpContract, request, context, {
      validationErrorResponse: (error) =>
        createErrorResponse(getValidationErrorMessage(error, 'Invalid request'), 400),
    })
    if (!parsed.success) return parsed.response

    const deployment = await findDeployedAppByIdentifier(parsed.data.params.identifier)
    if (!deployment || !deployment.isActive) {
      return createErrorResponse('App not found', 404)
    }
    if (deployment.authType !== 'email') {
      return createErrorResponse('This app does not use email authentication', 400)
    }

    const { email, otp } = parsed.data.body
    const storedValue = await getOTP('app', deployment.id, email)
    if (!storedValue) {
      return createErrorResponse('No verification code found, request a new one', 400)
    }

    const { otp: storedOTP, attempts } = decodeOTPValue(storedValue)
    if (attempts >= MAX_OTP_ATTEMPTS) {
      await deleteOTP('app', deployment.id, email)
      return createErrorResponse('Too many failed attempts. Please request a new code.', 429)
    }
    if (storedOTP !== otp) {
      const result = await incrementOTPAttempts('app', deployment.id, email, storedValue)
      if (result === 'locked') {
        return createErrorResponse('Too many failed attempts. Please request a new code.', 429)
      }
      return createErrorResponse('Invalid verification code', 400)
    }

    await deleteOTP('app', deployment.id, email)
    const response = createSuccessResponse(toDeployedAppConfig(deployment))
    setAppAuthCookie(response, deployment.id, deployment.authType ?? 'email', deployment.password)
    return response
  }
)
