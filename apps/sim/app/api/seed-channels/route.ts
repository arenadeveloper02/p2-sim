import { db } from '@sim/db'
import { clientChannelMapping } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    console.log('🌱 Seeding client channel mappings...')

    // Use the client ID from the logs: "d41f39ef1b41649016423333cc4bcb5a"
    const sampleData = [
      {
        clientId: 'd41f39ef1b41649016423333cc4bcb5a',
        channelId: 'C1234567890',
        channelName: 'general',
      },
      {
        clientId: 'd41f39ef1b41649016423333cc4bcb5a',
        channelId: 'C1234567891',
        channelName: 'random',
      },
      {
        clientId: 'd41f39ef1b41649016423333cc4bcb5a',
        channelId: 'C1234567892',
        channelName: 'engineering',
      },
    ]

    // Insert sample data
    await db.insert(clientChannelMapping).values(sampleData)

    console.log('✅ Successfully seeded client channel mappings!')
    console.log('📊 Sample data inserted:', sampleData.length, 'records')

    // Verify the data was inserted
    const result = await db
      .select()
      .from(clientChannelMapping)
      .where(eq(clientChannelMapping.clientId, 'd41f39ef1b41649016423333cc4bcb5a'))

    console.log('📈 Records for client d41f39ef1b41649016423333cc4bcb5a:', result.length)
    console.log(
      '📋 Channel names:',
      result.map((r) => r.channelName)
    )

    return NextResponse.json({
      success: true,
      message: 'Channels seeded successfully',
      channels: result.map((r) => ({ channelId: r.channelId, channelName: r.channelName })),
    })
  } catch (error) {
    console.error('❌ Error seeding data:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
