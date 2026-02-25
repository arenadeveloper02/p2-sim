import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import {
  buildEmailToUserMap,
  fetchArenaUsersList,
  parseCommaSeparated,
} from '@/lib/arena-utils/users-list'
import { env } from '@/lib/core/config/env'
import { getArenaToken } from '@/app/api/tools/arena/utils/get-token'

const logger = createLogger('ArenaCommentsUpdatedAPI')

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function toMentionTag(sysId: string, displayName: string): string {
  const atName = `@${displayName}`
  const attrSafe = escapeHtmlAttr(atName)
  const contentSafe = atName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<a class="mention" data-mention="${attrSafe}" data-user-id="${escapeHtmlAttr(sysId)}">${contentSafe}</a>`
}

export async function POST(req: NextRequest) {
  const data = await req.json()
  const { workflowId, ...restData } = data
  const tokenObject = await getArenaToken(req, workflowId)
  if (tokenObject.found === false) {
    logger.error('Add comment (updated) failed: Arena token not resolved', {
      reason: tokenObject.reason,
      workflowId,
    })
    return NextResponse.json(
      { error: 'Failed to add comment', details: tokenObject.reason },
      { status: 400 }
    )
  }
  const { arenaToken, email: userEmail } = tokenObject

  const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL || ''
  let comment = restData.comment ?? ''
  let userMentionedIds: string[] = Array.isArray(restData.userMentionedIds)
    ? restData.userMentionedIds
    : []

  const toRaw = typeof restData.to === 'string' ? restData.to.trim() : ''
  const ccRaw = typeof restData.cc === 'string' ? restData.cc.trim() : ''

  if (toRaw || ccRaw) {
    const users = await fetchArenaUsersList(arenaToken, arenaBackendBaseUrl)
    const emailToUser = buildEmailToUserMap(users)

    const toEmails = parseCommaSeparated(toRaw)
    const ccEmails = parseCommaSeparated(ccRaw)

    const toIds: string[] = []
    const toNames: string[] = []
    for (const e of toEmails) {
      const u = emailToUser.get(e.toLowerCase())
      if (u) {
        toIds.push(u.sysId)
        toNames.push(u.name || e)
      }
    }

    const ccIds: string[] = []
    const ccNames: string[] = []
    for (const e of ccEmails) {
      const u = emailToUser.get(e.toLowerCase())
      if (u) {
        ccIds.push(u.sysId)
        ccNames.push(u.name || e)
      }
    }

    userMentionedIds = [...toIds, ...ccIds]

    if (toNames.length) {
      const toMentions = toNames.map((name, i) => toMentionTag(toIds[i]!, name))
      comment = `<p>${toMentions.join(' ')}</p>\n\n${comment}`
    }
    if (ccNames.length) {
      const ccMentions = ccNames.map((name, i) => toMentionTag(ccIds[i]!, name))
      comment = `${comment}\n\n<p>CC: ${ccMentions.join(' ')}</p>`
    }
  }

  const { to: _to, cc: _cc, ...restPayload } = restData
  const payload = {
    ...restPayload,
    comment,
    userMentionedIds,
    createdBy: userEmail,
  }

  try {
    const res = await fetch(
      `${arenaBackendBaseUrl}/project/commentattachmentservice/addcomment-updated`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: '*/*',
          authorisation: arenaToken || '',
        },
        body: JSON.stringify(payload),
      }
    )

    const responseData = await res.json()

    if (!res.ok) {
      logger.error('Add comment (updated) failed: Arena API returned error', {
        status: res.status,
        statusText: res.statusText,
        responseData,
        workflowId,
      })
      return NextResponse.json(
        { error: 'Failed to add comment', details: responseData },
        { status: res.status }
      )
    }

    return NextResponse.json(responseData, { status: res.status })
  } catch (error) {
    logger.error('Add comment (updated) failed: unexpected error', { error, workflowId })
    return NextResponse.json({ error: 'Failed to add comment', details: error }, { status: 500 })
  }
}
