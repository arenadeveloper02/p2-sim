import { NextResponse } from 'next/server'

/**
 * Health check endpoint for load balancers and monitoring systems
 * This endpoint bypasses all middleware and authentication
 * Returns 200 OK if the server is running
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'simstudio',
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  )
}
