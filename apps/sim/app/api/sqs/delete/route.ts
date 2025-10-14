import { NextRequest, NextResponse } from 'next/server'
import { SQSClient, DeleteMessageCommand } from '@aws-sdk/client-sqs'
import { logger } from '@/lib/logs/console/logger'

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
})

/**
 * Delete message from SQS (for Figma plugin)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { queueUrl, region, receiptHandle } = body

    logger.info('Deleting SQS message for Figma plugin', { queueUrl, receiptHandle })

    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    })

    await sqsClient.send(command)

    logger.info('Successfully deleted SQS message')

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error('Error deleting SQS message:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
