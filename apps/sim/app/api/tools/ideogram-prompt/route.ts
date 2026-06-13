import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { type NextRequest, NextResponse } from 'next/server'
import { ideogramPromptBuildContract } from '@/lib/api/contracts/tools/ideogram-prompt'
import { parseRequest } from '@/lib/api/server'
import {
  buildIdeogramJsonPrompt,
  parseIdeogramPromptBuilderValue,
} from '@/lib/ideogram/build-json-prompt'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'

const logger = createLogger('IdeogramPromptAPI')

export const dynamic = 'force-dynamic'

export const POST = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()

  try {
    const parsed = await parseRequest(ideogramPromptBuildContract, request, {})
    if (!parsed.success) return parsed.response

    const builderValue = parseIdeogramPromptBuilderValue(parsed.data.body.builderValue)
    const built = buildIdeogramJsonPrompt(builderValue)

    logger.info(`[${requestId}] Ideogram prompt built`, {
      elementCount: built.metadata.elementCount,
    })

    return NextResponse.json({
      success: true,
      output: {
        jsonPrompt: built.jsonPrompt,
        promptPreview: built.promptPreview,
        magicPrompt: built.magicPrompt,
        elements: built.elements,
        metadata: built.metadata,
      },
    })
  } catch (error) {
    logger.error(`[${requestId}] Ideogram prompt build failed`, error)
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, 'Failed to build Ideogram prompt'),
      },
      { status: 400 }
    )
  }
})
