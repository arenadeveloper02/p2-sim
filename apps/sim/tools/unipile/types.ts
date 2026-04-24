import type { ToolResponse } from '@/tools/types'

export const UNIPILE_BASE_URL = 'https://api27.unipile.com:15703'

/**
 * LinkedIn company profile lookup (Unipile `GET /api/v1/linkedin/company/{identifier}?account_id=…`).
 */
export interface UnipileRetrieveCompanyDetailsParams {
  identifier: string
  account_id: string
}

export interface UnipileRetrieveCompanyDetailsToolResponse extends ToolResponse {
  output: {
    object: string | null
    id: string | null
    name: string | null
    description: string | null
    public_identifier: string | null
    profile_url: string | null
    followers_count: number | null
    employee_count: number | null
    website: string | null
    logo: string | null
    profile: Record<string, unknown>
  }
}

export interface UnipileStartNewChatParams {
  account_id: string
  text: string
  attachments?: string
  voice_message?: string
  video_message?: string
  attendees_ids?: string
  subject?: string
  api?: string
  topic?: string
  applicant_id?: string
  invitation_id?: string
  inmail?: string
}

export interface UnipileStartNewChatToolResponse extends ToolResponse {
  output: {
    object: string | null
    chat_id: string | null
    message_id: string | null
  }
}

export interface UnipileGetChatParams {
  chat_id: string
}

export interface UnipileGetChatToolResponse extends ToolResponse {
  output: {
    object: string | null
    id: string | null
    account_id: string | null
    account_type: string | null
    provider_id: string | null
    name: string | null
    subject: string | null
    timestamp: string | null
    unread_count: number | null
    content_type: string | null
    last_message_text: string | null
    chat: Record<string, unknown>
  }
}

export interface UnipileListChatMessagesParams {
  chat_id: string
}

export interface UnipileListChatMessagesToolResponse extends ToolResponse {
  output: {
    object: string | null
    item_count: number
    items: unknown[]
  }
}

export interface UnipileSendChatMessageParams {
  chat_id: string
  text: string
  account_id: string
  thread_id?: string
  quote_id?: string
  voice_message?: string
  video_message?: string
  attachments?: string
  typing_duration?: string
}

export interface UnipileSendChatMessageToolResponse extends ToolResponse {
  output: {
    object: string | null
    message_id: string | null
  }
}

export interface UnipileGetMessageAttachmentParams {
  message_id: string
  attachment_id: string
}

export interface UnipileGetMessageAttachmentToolResponse extends ToolResponse {
  output: {
    content: string | null
    content_base64: string | null
    mime_type: string | null
  }
}

export interface UnipileListPagedItemsOutput {
  object: string | null
  item_count: number
  items: unknown[]
  cursor: string | null
  paging: Record<string, unknown> | null
  total_items: number | null
}

export interface UnipileListChatAttendeesParams {
  chat_id: string
}

export type UnipileListChatAttendeesToolResponse = ToolResponse & {
  output: UnipileListPagedItemsOutput
}

export type UnipileListUserRelationsToolResponse = ToolResponse & {
  output: UnipileListPagedItemsOutput
}

export interface UnipileGetUserProfileParams {
  user_identifier: string
}

export interface UnipileGetUserProfileToolResponse extends ToolResponse {
  output: {
    object: string | null
    provider: string | null
    public_identifier: string | null
    first_name: string | null
    last_name: string | null
    headline: string | null
    public_profile_url: string | null
    profile: Record<string, unknown>
  }
}

export interface UnipileListUserPostsParams {
  user_identifier: string
  cursor?: string
}

export type UnipileListUserPostsToolResponse = ToolResponse & {
  output: UnipileListPagedItemsOutput
}

export interface UnipileListUserCommentsParams {
  user_identifier: string
  cursor?: string
}

export type UnipileListUserCommentsToolResponse = ToolResponse & {
  output: UnipileListPagedItemsOutput
}

export interface UnipileListUserReactionsParams {
  user_identifier: string
  cursor?: string
}

export type UnipileListUserReactionsToolResponse = ToolResponse & {
  output: UnipileListPagedItemsOutput
}

export interface UnipileGetPostParams {
  post_id: string
}

export interface UnipileGetPostToolResponse extends ToolResponse {
  output: {
    object: string | null
    id: string | null
    text: string | null
    share_url: string | null
    post: Record<string, unknown>
  }
}

export interface UnipileCreatePostParams {
  account_id: string
  text: string
  attachments?: string
  video_thumbnail?: string
  repost?: string
  include_job_posting?: string
  name?: string
  profile_id?: string
  is_company?: string
  external_link?: string
  as_organization?: string
  location?: string
}

export interface UnipileCreatePostToolResponse extends ToolResponse {
  output: {
    object: string | null
    post_id: string | null
  }
}

export interface UnipileListPostCommentsParams {
  post_id: string
  cursor?: string
}

export type UnipileListPostCommentsToolResponse = ToolResponse & {
  output: UnipileListPagedItemsOutput
}

export interface UnipileCommentPostParams {
  post_id: string
  account_id: string
  text: string
  name?: string
  profile_id?: string
  is_company?: string
  external_link?: string
  as_organization?: string
  comment_id?: string
  attachments?: string
}

export interface UnipileCommentPostToolResponse extends ToolResponse {
  output: {
    object: string | null
    comment_id: string | null
  }
}

export interface UnipileListPostReactionsParams {
  post_id: string
  cursor?: string
}

export type UnipileListPostReactionsToolResponse = ToolResponse & {
  output: UnipileListPagedItemsOutput
}

export interface UnipileLinkedinSearchParams {
  /** JSON object matching Unipile LinkedIn search request body */
  search_body: string
}

export interface UnipileLinkedinSearchToolResponse extends ToolResponse {
  output: {
    object: string | null
    item_count: number
    items: unknown[]
    cursor: string | null
    paging: Record<string, unknown> | null
    config: Record<string, unknown> | null
    metadata: Record<string, unknown> | null
  }
}

export interface UnipileGetLinkedinSearchParametersParams {
  cursor?: string
}

export type UnipileGetLinkedinSearchParametersToolResponse = ToolResponse & {
  output: UnipileListPagedItemsOutput
}

export type UnipileResponse =
  | UnipileRetrieveCompanyDetailsToolResponse
  | UnipileStartNewChatToolResponse
  | UnipileGetChatToolResponse
  | UnipileListChatMessagesToolResponse
  | UnipileSendChatMessageToolResponse
  | UnipileGetMessageAttachmentToolResponse
  | UnipileListChatAttendeesToolResponse
  | UnipileListUserRelationsToolResponse
  | UnipileGetUserProfileToolResponse
  | UnipileListUserPostsToolResponse
  | UnipileListUserCommentsToolResponse
  | UnipileListUserReactionsToolResponse
  | UnipileGetPostToolResponse
  | UnipileCreatePostToolResponse
  | UnipileListPostCommentsToolResponse
  | UnipileCommentPostToolResponse
  | UnipileListPostReactionsToolResponse
  | UnipileLinkedinSearchToolResponse
  | UnipileGetLinkedinSearchParametersToolResponse
