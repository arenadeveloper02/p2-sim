import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { db } from '@/db'
import { deployedChat } from '@/db/schema'

export async function GET() {
  try {
    console.log('Testing database connection and deployed_chat table...')

    // Test 1: Check if deployed_chat table exists by trying to select from it
    console.log('Test 1: Checking if deployed_chat table exists...')
    try {
      const result = await db.select().from(deployedChat).limit(1)
      console.log('✅ deployed_chat table exists and is accessible')
      console.log('Current records:', result.length)

      return NextResponse.json({
        success: true,
        message: 'deployed_chat table exists and is accessible',
        recordCount: result.length,
      })
    } catch (error: any) {
      console.log('❌ deployed_chat table does not exist or is not accessible:', error.message)

      return NextResponse.json({
        success: false,
        message: 'deployed_chat table does not exist or is not accessible',
        error: error.message,
      })
    }
  } catch (error: any) {
    console.log('❌ Database connection test failed:', error.message)

    return NextResponse.json({
      success: false,
      message: 'Database connection test failed',
      error: error.message,
    })
  }
}

export async function POST() {
  try {
    console.log('Testing deployed_chat table insert...')

    // Test insert
    const testId = uuidv4()
    const testChatId = `test_chat_${Date.now()}`

    try {
      await db.insert(deployedChat).values({
        id: testId,
        chatId: testChatId,
        title: 'Test Chat Title',
        workflowId: 'test-workflow',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      console.log('✅ Successfully inserted test record')

      // Try to select the record we just inserted
      const insertedRecord = await db
        .select()
        .from(deployedChat)
        .where(eq(deployedChat.chatId, testChatId))
        .limit(1)

      if (insertedRecord.length > 0) {
        console.log('✅ Successfully retrieved inserted record:', insertedRecord[0])

        // Clean up: Delete the test record
        await db.delete(deployedChat).where(eq(deployedChat.id, testId))
        console.log('✅ Test record cleaned up')

        return NextResponse.json({
          success: true,
          message: 'Successfully inserted and retrieved test record',
          record: insertedRecord[0],
        })
      }
      console.log('❌ Could not retrieve inserted record')
      return NextResponse.json({
        success: false,
        message: 'Could not retrieve inserted record',
      })
    } catch (error: any) {
      console.log('❌ Failed to insert test record:', error.message)
      return NextResponse.json({
        success: false,
        message: 'Failed to insert test record',
        error: error.message,
      })
    }
  } catch (error: any) {
    console.log('❌ Database test failed:', error.message)

    return NextResponse.json({
      success: false,
      message: 'Database test failed',
      error: error.message,
    })
  }
}
