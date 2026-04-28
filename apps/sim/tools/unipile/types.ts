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
  /** Comma-separated relation ids; required by Unipile to start a chat. */
  attendees_ids: string
  attachments?: string
  voice_message?: string
  video_message?: string
  subject?: string
  /** Unipile `api` form field: `classic` | `recruiter` | `sales_navigator` */
  api?: string
  topic?: string
  applicant_id?: string
  invitation_id?: string
  inmail?: string
  signature?: string
  hiring_project_id?: string
  job_posting_id?: string
  sourcing_channel?: string
  email_address?: string
  visibility?: string
  /** JSON string of `{ subject, text, scheduled_time }` for Recruiter API */
  follow_up?: string
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

export interface UnipileListUserRelationsParams {
  account_id: string
  /** Optional name filter forwarded to Unipile `filter` query param */
  filter?: string
}

export type UnipileListUserRelationsToolResponse = ToolResponse & {
  output: UnipileListPagedItemsOutput
}

export interface UnipileGetUserProfileParams {
  /** Path `{identifier}`: provider internal id or public id. */
  user_identifier: string
  /** Required Unipile query `account_id`. */
  account_id: string
  /** Optional JSON string array of `linkedin_sections` (throttling risk—see Unipile limits doc). */
  linkedin_sections_json?: string
  /** Optional `linkedin_api`: recruiter | sales_navigator (subscription features). */
  linkedin_api?: 'recruiter' | 'sales_navigator'
  /** Optional `notify`: whether LinkedIn notifies the viewee (default false upstream). */
  notify?: boolean
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
    throttled_sections: string[] | null
    profile: Record<string, unknown>
  }
}

export interface UnipileListUserPostsParams {
  account_id: string
  user_identifier: string
  cursor?: string
  /** 1–100, optional query `limit` */
  limit?: number
  /** LinkedIn: set true for company post lists */
  is_company?: boolean
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
  /** Path: LinkedIn `social_id` from post object; Instagram use `provider_id` (not short code). */
  post_id: string
  account_id: string
  /** Max 1250 chars; LinkedIn: `{{0}}` references index in `mentions` JSON array */
  text: string
  /** JSON string: array of `{ name, profile_id, is_company? }` (LinkedIn mentions) */
  mentions?: string
  name?: string
  profile_id?: string
  is_company?: string
  /** LinkedIn: https URL, must appear in text or it is appended */
  external_link?: string
  as_organization?: string
  /** Reply to this comment id (LinkedIn: from comments list) */
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
  /** Path param: LinkedIn uses `social_id` from GET post / list posts (not always the URL id). */
  post_id: string
  account_id: string
  /** Optional: reactions on a specific comment (LinkedIn: id from comments list) */
  comment_id?: string
  /** Optional page size per upstream request (1–100, default 100). Server aggregates all pages. */
  limit?: number
}

export type UnipileListPostReactionsToolResponse = ToolResponse & {
  output: UnipileListPagedItemsOutput
}

export interface UnipileLinkedinSearchParams {
  /** Unipile account id (required query param). */
  account_id: string
  /** JSON object: Classic / Sales Navigator / Recruiter search body, or `{ "url": "…" }`, or `{ "cursor": "…" }` for long cursors. */
  search_body: string
  /** Optional pagination cursor (query or use cursor-in-body pattern). */
  cursor?: string
  /** Optional 0–100; Classic searches should use ≤50 per Unipile docs. */
  limit?: number
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

export interface UnipileListAllChatsParams {
  account_id?: string
  unread?: boolean
  cursor?: string
  before?: string
  after?: string
  limit?: number
  account_type?: string
}

export type UnipileListAllChatsToolResponse = ToolResponse & {
  output: UnipileListPagedItemsOutput
}

export interface UnipileGetLinkedinSearchParametersParams {
  account_id: string
  /** Parameter category to list IDs for (Unipile `type` query, required). */
  type: string
  /** CLASSIC | RECRUITER | SALES_NAVIGATOR (default CLASSIC upstream). */
  service?: string
  /** Optional keywords (not used when type is EMPLOYMENT_TYPE). */
  keywords?: string
  /** Optional 1–100 (default 10 upstream). */
  limit?: number
}

export type UnipileGetLinkedinSearchParametersToolResponse = ToolResponse & {
  output: UnipileListPagedItemsOutput
}

export type UnipileResponse =
  | UnipileRetrieveCompanyDetailsToolResponse
  | UnipileStartNewChatToolResponse
  | UnipileGetChatToolResponse
  | UnipileListChatMessagesToolResponse
  | UnipileListAllChatsToolResponse
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
