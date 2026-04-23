import { NextResponse } from 'next/server'
import { createLogger } from '@sim/logger'
import { env } from '@/lib/core/config/env'
import { generateRequestId } from '@/lib/core/utils/request'

const logger = createLogger('AppBannerAPI')

/**
 * Returns the platform banner message shown at the top of the workspace shell.
 * The backing store can move from env to the database without changing this contract.
 */
export async function GET() {
  const requestId = generateRequestId()

  try {
    const raw = env.APP_BANNER_MESSAGE?.trim() ?? ''
    const message = raw.length > 0 ? raw : null

    return NextResponse.json({ data: { message } }, { status: 200 })
  } catch (error) {
    logger.error(`[${requestId}] App banner fetch failed`, error)
    return NextResponse.json({ data: { message: null } }, { status: 200 })
  }
}
