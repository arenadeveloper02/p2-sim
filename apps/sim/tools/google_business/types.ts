/**
 * Google Business Profile Tool Types
 */

export interface GoogleBusinessCreatePostParams {
  location?: string // Selected location from dropdown (format: accountKey_locationKey)
  accountId?: string // Can be auto-filled from location
  locationId?: string // Can be auto-filled from location
  summary: string
  topicType: 'STANDARD' | 'EVENT' | 'OFFER'
  languageCode?: string
  callToActionType?: 'BOOK' | 'ORDER' | 'SHOP' | 'LEARN_MORE' | 'SIGN_UP' | 'CALL' | 'GET_OFFER'
  callToActionUrl?: string
  mediaUrls?: string[]
  mediaFormat?: 'PHOTO' | 'VIDEO'
  // Event fields
  eventTitle?: string
  eventStartDate?: string // ISO format YYYY-MM-DD
  eventEndDate?: string
  eventStartTime?: string // HH:MM format
  eventEndTime?: string
  // Offer fields
  offerCouponCode?: string
  offerRedeemUrl?: string
  offerTerms?: string
  // Context (provided by workflow execution)
  _context?: {
    workflowId?: string
    workspaceId?: string
  }
}

export interface GoogleBusinessCreatePostResponse {
  success: boolean
  postId?: string
  name?: string
  error?: string
  details?: any
}
