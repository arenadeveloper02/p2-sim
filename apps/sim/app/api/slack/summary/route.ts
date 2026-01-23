import { db } from '@sim/db'
import { slackSummary } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { generateRequestId } from '@/lib/core/utils/request'

const logger = createLogger('slack-summary-api')

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    // Test database connection with raw SQL
    const { sql } = await import('drizzle-orm')
    const result = await db.execute(sql`SELECT 1 as test`)
    console.log('Database connection test successful:', result)

    // Check if slack_summary table exists
    const tableCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'slack_summary'
      ) as table_exists
    `)
    console.log('Table exists check:', tableCheck)

    const tableExists = (tableCheck as any)[0]?.table_exists === true

    if (tableExists) {
      // Try to select from the table
      const testQuery = await db.select().from(slackSummary).limit(1)
      console.log('Table query successful, found', testQuery.length, 'records')

      return NextResponse.json(
        {
          success: true,
          data: {
            message: 'Database connection and table access successful',
            tableExists: true,
            recordCount: testQuery.length,
            schema: 'matches'
          },
        },
        { status: 200 }
      )
    } else {
      return NextResponse.json(
        {
          success: false,
          data: {
            message: 'Database connection works but table does not exist',
            tableExists: false,
            schema: 'table missing'
          },
        },
        { status: 200 }
      )
    }
  } catch (error: any) {
    logger.error(`[${requestId}] Database connection test failed`, {
      error: error.message || String(error),
      errorCode: error.code,
      errorDetails: error,
    })

    console.error('Full error details:', error)

    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Database connection or table access failed',
          details: error.message,
          code: error.code
        },
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const body = await request.json()
    const {
      client_id,
      client_name,
      channel_id,
      channel_name,
      channel_type,
      one_day_summary,
      seven_day_summary,
      fourteen_day_summary,
    } = body

    // Validate required fields
    if (!client_id) {
      return NextResponse.json(
        { success: false, error: { message: 'client_id is required' } },
        { status: 400 }
      )
    }

    if (!channel_id) {
      return NextResponse.json(
        { success: false, error: { message: 'channel_id is required' } },
        { status: 400 }
      )
    }

    if (!one_day_summary && !seven_day_summary && !fourteen_day_summary) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'At least one summary field is required (one_day_summary, seven_day_summary, or fourteen_day_summary)' }
        },
        { status: 400 }
      )
    }

    logger.info(`[${requestId}] Saving slack summary`, {
      client_id,
      client_name,
      channel_id,
      channel_name,
      channel_type,
      hasOneDay: !!one_day_summary,
      hasSevenDay: !!seven_day_summary,
      hasFourteenDay: !!fourteen_day_summary,
    })

    const now = new Date()
    const todayDate = now.toISOString().split('T')[0] // YYYY-MM-DD format
    // Generate unique ID - just a UUID
    const id = crypto.randomUUID()

    // Use UPSERT (INSERT ... ON CONFLICT) to handle both create and update
    const { sql } = await import('drizzle-orm')

    try {
      console.log('Performing UPSERT for slack summary')

      // Check if record exists first, then insert or update manually
      try {
        console.log('Checking existing record...')

        // First, check if record exists for today (same client, channel, date)
        const existingRecord = await db
          .select()
          .from(slackSummary)
          .where(sql`${slackSummary.clientIdRef} = ${client_id} AND ${slackSummary.channelIdRef} = ${channel_id} AND ${slackSummary.runDate} = ${todayDate}`)
          .limit(1)

        const recordExists = existingRecord.length > 0

        if (recordExists) {
          // Update existing record for today
          console.log('Updating existing record for today')

          await db
            .update(slackSummary)
            .set({
              clientName: client_name || 'Unknown Client',
              channelName: channel_name || 'Unknown Channel',
              channelType: channel_type || 'internal',
              oneDaySummary: one_day_summary || undefined,
              sevenDaySummary: seven_day_summary || undefined,
              fourteenDaySummary: fourteen_day_summary || undefined,
              updatedDate: now,
              status: 'STARTED',
            })
            .where(sql`${slackSummary.clientIdRef} = ${client_id} AND ${slackSummary.channelIdRef} = ${channel_id} AND ${slackSummary.runDate} = ${todayDate}`)

          console.log('Record update successful for today')
        } else {
          // Insert new record for today
          console.log('Inserting new record for today')

          await db.insert(slackSummary).values({
            id,
            clientIdRef: client_id,
            clientName: client_name || 'Unknown Client',
            channelIdRef: channel_id,
            channelName: channel_name || 'Unknown Channel',
            channelType: channel_type || 'internal',
            oneDaySummary: one_day_summary || undefined,
            sevenDaySummary: seven_day_summary || undefined,
            fourteenDaySummary: fourteen_day_summary || undefined,
            createdDate: now,
            updatedDate: now,
            startTime: undefined,
            endTime: undefined,
            status: 'STARTED',
            retryCount: 0,
            runDate: todayDate,
          })

          console.log('Record insert successful for today')
        }
      } catch (sqlError: any) {
        console.log('Raw SQL failed, trying Drizzle...', sqlError.message)
        console.error('Full SQL error details:', sqlError)

        // Fallback to Drizzle
        try {
          const upsertResult = await db
            .insert(slackSummary)
            .values({
              id,
              clientIdRef: client_id,
              clientName: client_name || 'Unknown Client',
              channelIdRef: channel_id,
              channelName: channel_name || 'Unknown Channel',
              channelType: channel_type || 'internal',
              oneDaySummary: one_day_summary || undefined,
              sevenDaySummary: seven_day_summary || undefined,
              fourteenDaySummary: fourteen_day_summary || undefined,
              createdDate: now,
              updatedDate: now,
              startTime: undefined,
              endTime: undefined,
              status: 'STARTED',
              retryCount: 0,
              runDate: todayDate,
            })
            .onConflictDoUpdate({
              target: [slackSummary.clientIdRef, slackSummary.channelIdRef],
              set: {
                clientName: client_name || 'Unknown Client',
                channelName: channel_name || 'Unknown Channel',
                channelType: channel_type || 'internal',
                oneDaySummary: one_day_summary || undefined,
                sevenDaySummary: seven_day_summary || undefined,
                fourteenDaySummary: fourteen_day_summary || undefined,
                updatedDate: now,
                status: 'STARTED',
                runDate: todayDate,
              },
            })

          console.log('Drizzle upsert successful after raw SQL failed:', upsertResult)
        } catch (drizzleError: any) {
          console.log('Both raw SQL and Drizzle failed')
          console.error('Drizzle error details:', drizzleError)
          throw drizzleError
        }
      }

      // Check if this was an insert or update by querying the record
      const record = await db
        .select()
        .from(slackSummary)
        .where(sql`${slackSummary.clientIdRef} = ${client_id} AND ${slackSummary.channelIdRef} = ${channel_id}`)
        .limit(1)

      const action = record.length > 0 ? 'updated' : 'created'

      logger.info(`[${requestId}] Successfully ${action} slack summary`, {
        id,
        client_id,
        channel_id,
        run_date: todayDate,
        action,
      })

      return NextResponse.json(
        {
          success: true,
          data: {
            id,
            message: `Slack summary ${action} successfully for today`,
            action,
          },
        },
        { status: action === 'created' ? 201 : 200 }
      )
    } catch (error: any) {
      console.log('Database operation failed:', error)
      throw error
    }
  } catch (error: any) {
    logger.error(`[${requestId}] Error saving slack summary`, {
      error: error.message || String(error),
      errorCode: error.code,
      errorDetails: error,
    })

    // Log more details for debugging
    console.error('Full error details:', error)

    return NextResponse.json(
      {
        success: false,
        error: {
          message: error.message || 'Failed to save slack summary',
          code: error.code
        },
      },
      { status: 500 }
    )
  }
}