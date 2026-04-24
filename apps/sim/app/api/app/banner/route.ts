import { db } from '@sim/db'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'
import { boolean, pgTable, text } from 'drizzle-orm/pg-core'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { bannerMessages } from '@sim/db/schema'

const logger = createLogger('AppBannerAPI')



/**
 * Returns the app-level banner message shown at the top of the workspace shell.
 */
export const GET = withRouteHandler(async (_request: NextRequest) => {
  try {
    const rawRows = await db
      .select()
      .from(bannerMessages)
      .where(and(eq(bannerMessages.type, 'sim'), eq(bannerMessages.isActive, true)))

    const message = rawRows.map((row) => row.message?.trim() ?? '').filter((value) => value.length > 0).join(', ')

    return NextResponse.json({ data: { message } }, { status: 200 })
  } catch (error) {
    logger.error('App banner fetch failed', error)
    return NextResponse.json({ data: { message: null } }, { status: 200 })
  }
})
