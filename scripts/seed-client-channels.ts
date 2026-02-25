import { db } from '@sim/db'
import { clientChannelMapping } from '@sim/db/schema'
import { eq } from 'drizzle-orm'

async function seedClientChannels() {
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

  try {
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
  } catch (error) {
    console.error('❌ Error seeding data:', error)
  } finally {
    process.exit(0)
  }
}

seedClientChannels()
