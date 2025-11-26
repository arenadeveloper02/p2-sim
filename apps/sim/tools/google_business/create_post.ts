import type { ToolConfig } from '@/tools/types'
import type {
  GoogleBusinessCreatePostParams,
  GoogleBusinessCreatePostResponse,
} from './types'
import { GOOGLE_BUSINESS_ACCOUNTS } from '@/app/api/google-business/constants'

function parseDate(dateStr: string): { year: number; month: number; day: number } | undefined {
  if (!dateStr) return undefined
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return undefined
  return {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10),
    day: parseInt(match[3], 10),
  }
}

function parseTime(timeStr: string): { hours: number; minutes: number } | undefined {
  if (!timeStr) return undefined
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return undefined
  return {
    hours: parseInt(match[1], 10),
    minutes: parseInt(match[2], 10),
  }
}

export const googleBusinessCreatePostTool: ToolConfig<
  GoogleBusinessCreatePostParams,
  GoogleBusinessCreatePostResponse
> = {
  id: 'google_business_create_post',
  name: 'Create Google Business Profile Post',
  description: 'Create a post on Google Business Profile. Supports standard posts, event posts, and offer posts with images, CTAs, and rich content.',
  version: '1.0',
  params: {
    location: { type: 'string', description: 'Selected business location (format: accountKey_locationKey)', required: true },
    summary: { type: 'string', description: 'Main text content of the post (up to 1500 characters)', required: true },
    topicType: { type: 'string', description: 'Type of post: STANDARD (regular), EVENT (with dates), or OFFER (promotion)', required: true },
    languageCode: { type: 'string', description: 'Language code (e.g., en, en-US, hi-IN)', required: false },
    callToActionType: { type: 'string', description: 'Type of CTA button to display', required: false },
    callToActionUrl: { type: 'string', description: 'Landing page URL for the call-to-action button', required: false },
    eventTitle: { type: 'string', description: 'Title of the event', required: false },
    eventStartDate: { type: 'string', description: 'Event start date in YYYY-MM-DD format', required: false },
    eventEndDate: { type: 'string', description: 'Event end date in YYYY-MM-DD format', required: false },
    eventStartTime: { type: 'string', description: 'Event start time in HH:MM format', required: false },
    eventEndTime: { type: 'string', description: 'Event end time in HH:MM format', required: false },
    offerCouponCode: { type: 'string', description: 'Promotional code for the offer', required: false },
    offerRedeemUrl: { type: 'string', description: 'URL where the offer can be redeemed', required: false },
    offerTerms: { type: 'string', description: 'Terms and conditions for the offer', required: false },
  },
  request: {
    url: '/api/google-business/posts/create',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => {
      // Map location selection to accountId and locationId
      let accountId = ''
      let locationId = ''
      
      if (params.location) {
        const [accountKey, locationKey] = params.location.split('_')
        const account = GOOGLE_BUSINESS_ACCOUNTS[accountKey]
        if (account && account.locations[locationKey]) {
          accountId = account.accountId
          locationId = account.locations[locationKey].locationId
        }
      }
      
      // Get workflowId from context (set by workflow execution)
      const workflowId = params._context?.workflowId
      
      const payload: any = {
        accountId,
        locationId,
        summary: params.summary,
        topicType: params.topicType,
      }
      
      // Add workflowId if available (for server-side workflow execution)
      if (workflowId) {
        payload.workflowId = workflowId
      }
      if (params.languageCode) payload.languageCode = params.languageCode
      if (params.callToActionType && params.callToActionUrl) {
        payload.callToAction = { actionType: params.callToActionType, url: params.callToActionUrl }
      }
      if (params.topicType === 'EVENT' && params.eventTitle && params.eventStartDate) {
        const startDate = parseDate(params.eventStartDate)
        if (startDate) {
          payload.event = { title: params.eventTitle, schedule: { startDate } }
          if (params.eventEndDate) {
            const endDate = parseDate(params.eventEndDate)
            if (endDate) payload.event.schedule.endDate = endDate
          }
          if (params.eventStartTime) {
            const startTime = parseTime(params.eventStartTime)
            if (startTime) payload.event.schedule.startTime = startTime
          }
          if (params.eventEndTime) {
            const endTime = parseTime(params.eventEndTime)
            if (endTime) payload.event.schedule.endTime = endTime
          }
        }
      }
      if (params.topicType === 'OFFER') {
        payload.offer = {}
        if (params.offerCouponCode) payload.offer.couponCode = params.offerCouponCode
        if (params.offerRedeemUrl) payload.offer.redeemOnlineUrl = params.offerRedeemUrl
        if (params.offerTerms) payload.offer.termsConditions = params.offerTerms
      }
      return payload
    },
  },
  transformResponse: async (response: Response) => {
    const data = await response.json()
    if (!response.ok) {
      return { success: false, error: data.error || `API error: ${response.status}`, details: data }
    }
    return { success: true, postId: data.postId, name: data.name, details: data.details }
  },
  outputs: {
    postId: { type: 'string', description: 'The ID of the created Google Business Profile post' },
    success: { type: 'boolean', description: 'Whether the post was created successfully' },
  },
}
