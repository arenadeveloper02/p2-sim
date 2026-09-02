import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { AnyApiRouteContract } from '@/lib/api/contracts'
import { parseRequest } from '@/lib/api/server'

/**
 * Parse a generate/edit body and return a tool-shaped 400 that names the failing
 * field. Default `parseRequest` puts Zod issues in `details`, and the tool
 * extractor surfaces only `details[0].message` — hiding the path.
 */
export function parseArenaGenerativeUiRequest<C extends AnyApiRouteContract>(
  contract: C,
  request: NextRequest
) {
  return parseRequest(
    contract,
    request,
    {},
    {
      validationErrorResponse: (error) => {
        const issue = error.issues[0]
        const path = issue?.path.join('.')
        const detail = issue?.message ?? 'Invalid request'
        return NextResponse.json(
          { success: false, error: path ? `${path}: ${detail}` : detail },
          { status: 400 }
        )
      },
    }
  )
}
