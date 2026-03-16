import { NextResponse } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import {
  secureFetchWithPinnedIP,
  validateUrlWithDNS,
} from '@/lib/core/security/input-validation.server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const authResult = await checkInternalAuth(request as any, { requireWorkflowId: false })
  if (!authResult.success) {
    return NextResponse.json({ error: authResult.error }, { status: 401 })
  }

  let payload: {
    url: string
    method: string
    headers: Record<string, string>
    body?: string
    timeout?: number
  }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { url, method, headers, body, timeout } = payload
  if (!url || typeof url !== 'string' || !method || typeof method !== 'string') {
    return NextResponse.json({ error: 'url and method required' }, { status: 400 })
  }

  const urlValidation = await validateUrlWithDNS(url, 'toolUrl')
  if (!urlValidation.isValid) {
    return NextResponse.json({ error: urlValidation.error || 'Invalid URL' }, { status: 400 })
  }

  const secureResponse = await secureFetchWithPinnedIP(url, urlValidation.resolvedIP!, {
    method,
    headers: headers || {},
    body: body ?? undefined,
    timeout: timeout ?? 300000,
  })

  const buffer = await secureResponse.arrayBuffer()
  const responseHeaders = secureResponse.headers.toRecord()

  return new NextResponse(buffer, {
    status: secureResponse.status,
    statusText: secureResponse.statusText,
    headers: responseHeaders,
  })
}
