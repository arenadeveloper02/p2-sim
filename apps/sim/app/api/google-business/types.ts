/**
 * Google Business Profile API Types
 */

export interface GBPPostRequest {
  accountId: string
  locationId: string
  languageCode?: string
  summary: string
  topicType: 'STANDARD' | 'EVENT' | 'OFFER'
  callToAction?: {
    actionType: 'BOOK' | 'ORDER' | 'SHOP' | 'LEARN_MORE' | 'SIGN_UP' | 'CALL' | 'GET_OFFER'
    url: string
  }
  media?: Array<{
    mediaFormat: 'PHOTO' | 'VIDEO'
    sourceUrl: string
  }>
  event?: {
    title: string
    schedule: {
      startDate: { year: number; month: number; day: number }
      endDate?: { year: number; month: number; day: number }
      startTime?: { hours: number; minutes: number }
      endTime?: { hours: number; minutes: number }
    }
  }
  offer?: {
    couponCode?: string
    redeemOnlineUrl?: string
    termsConditions?: string
  }
  searchUrl?: string
}

export interface GBPPostResponse {
  success: boolean
  postId?: string
  name?: string
  error?: string
  details?: any
}

export interface GBPLocation {
  name: string
  locationId: string
  title: string
  address?: string
}

export interface GBPAccount {
  name: string
  accountId: string
  type: string
}
