import { UnipileIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { IntegrationType } from '@/blocks/types'
import type { UnipileResponse } from '@/tools/unipile/types'

export const UnipileBlock: BlockConfig<UnipileResponse> = {
  type: 'unipile',
  name: 'Unipile',
  description: 'LinkedIn company data and messaging via Unipile (server-configured API key)',
  longDescription:
    'Uses `UNIPILE_API_KEY` from the deployment environment. Covers LinkedIn company and user profiles, posts, post comments and reactions, user comments and reactions, LinkedIn search, chats, messages, attendees, relations, and attachments.',
  category: 'tools',
  integrationType: IntegrationType.Communication,
  tags: ['messaging', 'sales-engagement'],
  bgColor: '#0F2736',
  icon: UnipileIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      options: [
        { label: 'Comment on Post', id: 'comment_post' },
        { label: 'Create Post', id: 'create_post' },
        { label: 'Get Chat', id: 'get_chat' },
        { label: 'Get Message Attachment', id: 'get_message_attachment' },
        { label: 'Get LinkedIn Search Parameters', id: 'get_linkedin_search_parameters' },
        { label: 'Get Post', id: 'get_post' },
        { label: 'Get User Profile', id: 'get_user_profile' },
        { label: 'List Chat Attendees', id: 'list_chat_attendees' },
        { label: 'List Chat Messages', id: 'list_chat_messages' },
        { label: 'LinkedIn Search', id: 'linkedin_search' },
        { label: 'List Post Comments', id: 'list_post_comments' },
        { label: 'List Post Reactions', id: 'list_post_reactions' },
        { label: 'List User Comments', id: 'list_user_comments' },
        { label: 'List User Posts', id: 'list_user_posts' },
        { label: 'List User Reactions', id: 'list_user_reactions' },
        { label: 'List User Relations', id: 'list_user_relations' },
        { label: 'Retrieve LinkedIn Company Profile', id: 'retrieve_company_details' },
        { label: 'Send Chat Message', id: 'send_chat_message' },
        { label: 'Start New Chat', id: 'start_new_chat' },
      ],
      value: () => 'retrieve_company_details',
    },
    {
      id: 'identifier',
      title: 'Company Identifier',
      type: 'short-input',
      placeholder: 'LinkedIn company identifier (URL segment or id)',
      condition: { field: 'operation', value: 'retrieve_company_details' },
      required: { field: 'operation', value: 'retrieve_company_details' },
    },
    {
      id: 'user_identifier',
      title: 'User Identifier',
      type: 'short-input',
      placeholder: 'Unipile user identifier (path segment)',
      condition: {
        field: 'operation',
        value: ['get_user_profile', 'list_user_posts', 'list_user_comments', 'list_user_reactions'],
      },
      required: {
        field: 'operation',
        value: ['get_user_profile', 'list_user_posts', 'list_user_comments', 'list_user_reactions'],
      },
    },
    {
      id: 'list_cursor',
      title: 'Pagination Cursor',
      type: 'short-input',
      placeholder: 'Cursor from a previous list response',
      condition: {
        field: 'operation',
        value: [
          'list_user_posts',
          'list_user_comments',
          'list_user_reactions',
          'list_post_comments',
          'list_post_reactions',
          'get_linkedin_search_parameters',
        ],
      },
      mode: 'advanced',
    },
    {
      id: 'message_id',
      title: 'Message ID',
      type: 'short-input',
      placeholder: 'Unipile message id',
      condition: { field: 'operation', value: 'get_message_attachment' },
      required: { field: 'operation', value: 'get_message_attachment' },
    },
    {
      id: 'attachment_id',
      title: 'Attachment ID',
      type: 'short-input',
      placeholder: 'Attachment id',
      condition: { field: 'operation', value: 'get_message_attachment' },
      required: { field: 'operation', value: 'get_message_attachment' },
    },
    {
      id: 'post_id',
      title: 'Post ID',
      type: 'short-input',
      placeholder: 'Unipile post id',
      condition: {
        field: 'operation',
        value: ['get_post', 'list_post_comments', 'comment_post', 'list_post_reactions'],
      },
      required: {
        field: 'operation',
        value: ['get_post', 'list_post_comments', 'comment_post', 'list_post_reactions'],
      },
    },
    {
      id: 'chat_id',
      title: 'Chat ID',
      type: 'short-input',
      placeholder: 'Unipile chat id',
      condition: {
        field: 'operation',
        value: ['get_chat', 'list_chat_messages', 'send_chat_message'],
      },
      required: {
        field: 'operation',
        value: ['get_chat', 'list_chat_messages', 'send_chat_message'],
      },
    },
    {
      id: 'account_id',
      title: 'Account ID',
      type: 'short-input',
      placeholder: 'Unipile connected account id',
      condition: {
        field: 'operation',
        value: ['start_new_chat', 'send_chat_message', 'create_post', 'comment_post'],
      },
      required: {
        field: 'operation',
        value: ['start_new_chat', 'send_chat_message', 'create_post', 'comment_post'],
      },
    },
    {
      id: 'text',
      title: 'Message / Post Text',
      type: 'long-input',
      placeholder: 'Message or post body',
      condition: {
        field: 'operation',
        value: ['start_new_chat', 'send_chat_message', 'create_post', 'comment_post'],
      },
      required: {
        field: 'operation',
        value: ['start_new_chat', 'send_chat_message', 'create_post', 'comment_post'],
      },
    },
    {
      id: 'linkedin_search_body',
      title: 'LinkedIn Search (JSON)',
      type: 'long-input',
      placeholder: '{"api":"classic","category":"people","keywords":"..."}',
      condition: { field: 'operation', value: 'linkedin_search' },
      required: { field: 'operation', value: 'linkedin_search' },
    },
    {
      id: 'linkedin_post_video_thumbnail',
      title: 'Video Thumbnail',
      type: 'short-input',
      placeholder: 'video_thumbnail form field',
      condition: { field: 'operation', value: 'create_post' },
      mode: 'advanced',
    },
    {
      id: 'linkedin_post_repost',
      title: 'Repost',
      type: 'short-input',
      placeholder: 'repost form field',
      condition: { field: 'operation', value: 'create_post' },
      mode: 'advanced',
    },
    {
      id: 'linkedin_post_include_job_posting',
      title: 'Include Job Posting',
      type: 'short-input',
      placeholder: 'include_job_posting form field',
      condition: { field: 'operation', value: 'create_post' },
      mode: 'advanced',
    },
    {
      id: 'linkedin_post_brand_name',
      title: 'Name (form)',
      type: 'short-input',
      placeholder: 'name form field',
      condition: { field: 'operation', value: ['create_post', 'comment_post'] },
      mode: 'advanced',
    },
    {
      id: 'linkedin_post_profile_id',
      title: 'Profile ID',
      type: 'short-input',
      placeholder: 'profile_id form field',
      condition: { field: 'operation', value: ['create_post', 'comment_post'] },
      mode: 'advanced',
    },
    {
      id: 'linkedin_post_is_company',
      title: 'Is Company',
      type: 'dropdown',
      options: [
        { label: 'Omit', id: '' },
        { label: 'True', id: 'true' },
        { label: 'False', id: 'false' },
      ],
      value: () => '',
      condition: { field: 'operation', value: ['create_post', 'comment_post'] },
      mode: 'advanced',
    },
    {
      id: 'linkedin_post_external_link',
      title: 'External Link',
      type: 'short-input',
      placeholder: 'external_link form field',
      condition: { field: 'operation', value: ['create_post', 'comment_post'] },
      mode: 'advanced',
    },
    {
      id: 'linkedin_post_as_organization',
      title: 'As Organization',
      type: 'short-input',
      placeholder: 'as_organization form field',
      condition: { field: 'operation', value: ['create_post', 'comment_post'] },
      mode: 'advanced',
    },
    {
      id: 'linkedin_comment_parent_id',
      title: 'Parent Comment ID',
      type: 'short-input',
      placeholder: 'Optional comment_id (reply to comment)',
      condition: { field: 'operation', value: 'comment_post' },
      mode: 'advanced',
    },
    {
      id: 'linkedin_post_location',
      title: 'Location',
      type: 'short-input',
      placeholder: 'location form field',
      condition: { field: 'operation', value: 'create_post' },
      mode: 'advanced',
    },
    {
      id: 'thread_id',
      title: 'Thread ID',
      type: 'short-input',
      placeholder: 'Optional thread id',
      condition: { field: 'operation', value: 'send_chat_message' },
      mode: 'advanced',
    },
    {
      id: 'quote_id',
      title: 'Quote ID',
      type: 'short-input',
      placeholder: 'Optional quote id',
      condition: { field: 'operation', value: 'send_chat_message' },
      mode: 'advanced',
    },
    {
      id: 'typing_duration',
      title: 'Typing Duration',
      type: 'short-input',
      placeholder: 'Optional typing duration (form string)',
      condition: { field: 'operation', value: 'send_chat_message' },
      mode: 'advanced',
    },
    {
      id: 'subject',
      title: 'Subject',
      type: 'short-input',
      placeholder: 'Optional chat subject',
      condition: { field: 'operation', value: 'start_new_chat' },
      mode: 'advanced',
    },
    {
      id: 'attachments',
      title: 'Attachments',
      type: 'short-input',
      placeholder: 'Unipile attachments field (string)',
      condition: {
        field: 'operation',
        value: ['start_new_chat', 'send_chat_message', 'create_post', 'comment_post'],
      },
      mode: 'advanced',
    },
    {
      id: 'voice_message',
      title: 'Voice Message',
      type: 'short-input',
      placeholder: 'Voice message field (string)',
      condition: { field: 'operation', value: ['start_new_chat', 'send_chat_message'] },
      mode: 'advanced',
    },
    {
      id: 'video_message',
      title: 'Video Message',
      type: 'short-input',
      placeholder: 'Video message field (string)',
      condition: { field: 'operation', value: ['start_new_chat', 'send_chat_message'] },
      mode: 'advanced',
    },
    {
      id: 'attendees_ids',
      title: 'Attendees IDs',
      type: 'short-input',
      placeholder: 'Attendees ids (string)',
      condition: { field: 'operation', value: 'start_new_chat' },
      mode: 'advanced',
    },
    {
      id: 'chat_api',
      title: 'API',
      type: 'short-input',
      placeholder: 'classic',
      condition: { field: 'operation', value: 'start_new_chat' },
      mode: 'advanced',
    },
    {
      id: 'chat_topic',
      title: 'Topic',
      type: 'short-input',
      placeholder: 'service_request',
      condition: { field: 'operation', value: 'start_new_chat' },
      mode: 'advanced',
    },
    {
      id: 'applicant_id',
      title: 'Applicant ID',
      type: 'short-input',
      placeholder: 'Optional applicant id',
      condition: { field: 'operation', value: 'start_new_chat' },
      mode: 'advanced',
    },
    {
      id: 'invitation_id',
      title: 'Invitation ID',
      type: 'short-input',
      placeholder: 'Optional invitation id',
      condition: { field: 'operation', value: 'start_new_chat' },
      mode: 'advanced',
    },
    {
      id: 'inmail',
      title: 'InMail',
      type: 'dropdown',
      options: [
        { label: 'Omit', id: '' },
        { label: 'True', id: 'true' },
        { label: 'False', id: 'false' },
      ],
      value: () => '',
      condition: { field: 'operation', value: 'start_new_chat' },
      mode: 'advanced',
    },
  ],
  tools: {
    access: [
      'unipile_comment_post',
      'unipile_create_post',
      'unipile_get_chat',
      'unipile_get_linkedin_search_parameters',
      'unipile_get_message_attachment',
      'unipile_get_post',
      'unipile_get_user_profile',
      'unipile_linkedin_search',
      'unipile_list_chat_attendees',
      'unipile_list_chat_messages',
      'unipile_list_post_comments',
      'unipile_list_post_reactions',
      'unipile_list_user_comments',
      'unipile_list_user_posts',
      'unipile_list_user_reactions',
      'unipile_list_user_relations',
      'unipile_retrieve_company_details',
      'unipile_send_chat_message',
      'unipile_start_new_chat',
    ],
    config: {
      tool: (params) => `unipile_${params.operation}`,
      params: (params) => {
        const op = params.operation as string
        if (
          op === 'list_user_posts' ||
          op === 'list_user_comments' ||
          op === 'list_user_reactions'
        ) {
          const out: Record<string, unknown> = {
            user_identifier:
              typeof params.user_identifier === 'string' ? params.user_identifier.trim() : '',
          }
          if (typeof params.list_cursor === 'string' && params.list_cursor.trim() !== '') {
            out.cursor = params.list_cursor.trim()
          }
          return out
        }
        if (op === 'list_post_comments' || op === 'list_post_reactions') {
          const out: Record<string, unknown> = {
            post_id: typeof params.post_id === 'string' ? params.post_id.trim() : '',
          }
          if (typeof params.list_cursor === 'string' && params.list_cursor.trim() !== '') {
            out.cursor = params.list_cursor.trim()
          }
          return out
        }
        if (op === 'get_linkedin_search_parameters') {
          const out: Record<string, unknown> = {}
          if (typeof params.list_cursor === 'string' && params.list_cursor.trim() !== '') {
            out.cursor = params.list_cursor.trim()
          }
          return out
        }
        if (op === 'linkedin_search') {
          return {
            search_body:
              typeof params.linkedin_search_body === 'string' ? params.linkedin_search_body : '{}',
          }
        }
        if (op === 'comment_post') {
          const out: Record<string, unknown> = {
            post_id: typeof params.post_id === 'string' ? params.post_id.trim() : '',
            account_id: typeof params.account_id === 'string' ? params.account_id.trim() : '',
            text: typeof params.text === 'string' ? params.text : '',
          }
          const copyIfString = (fromKey: string, toKey: string) => {
            const v = params[fromKey]
            if (typeof v === 'string' && v.trim() !== '') {
              out[toKey] = v.trim()
            }
          }
          copyIfString('attachments', 'attachments')
          copyIfString('linkedin_post_brand_name', 'name')
          copyIfString('linkedin_post_profile_id', 'profile_id')
          copyIfString('linkedin_post_external_link', 'external_link')
          copyIfString('linkedin_post_as_organization', 'as_organization')
          copyIfString('linkedin_comment_parent_id', 'comment_id')
          if (
            params.linkedin_post_is_company === 'true' ||
            params.linkedin_post_is_company === 'false'
          ) {
            out.is_company = params.linkedin_post_is_company
          }
          return out
        }
        if (op === 'create_post') {
          const out: Record<string, unknown> = {
            account_id: typeof params.account_id === 'string' ? params.account_id.trim() : '',
            text: typeof params.text === 'string' ? params.text : '',
          }
          const copyIfString = (fromKey: string, toKey: string) => {
            const v = params[fromKey]
            if (typeof v === 'string' && v.trim() !== '') {
              out[toKey] = v.trim()
            }
          }
          copyIfString('attachments', 'attachments')
          copyIfString('linkedin_post_video_thumbnail', 'video_thumbnail')
          copyIfString('linkedin_post_repost', 'repost')
          copyIfString('linkedin_post_include_job_posting', 'include_job_posting')
          copyIfString('linkedin_post_brand_name', 'name')
          copyIfString('linkedin_post_profile_id', 'profile_id')
          copyIfString('linkedin_post_external_link', 'external_link')
          copyIfString('linkedin_post_as_organization', 'as_organization')
          copyIfString('linkedin_post_location', 'location')
          if (
            params.linkedin_post_is_company === 'true' ||
            params.linkedin_post_is_company === 'false'
          ) {
            out.is_company = params.linkedin_post_is_company
          }
          return out
        }
        if (op === 'send_chat_message') {
          const out: Record<string, unknown> = {
            chat_id: typeof params.chat_id === 'string' ? params.chat_id.trim() : '',
            account_id: typeof params.account_id === 'string' ? params.account_id.trim() : '',
            text: typeof params.text === 'string' ? params.text : '',
          }
          const copyIfString = (key: string) => {
            const v = params[key]
            if (typeof v === 'string' && v.trim() !== '') {
              out[key] = v.trim()
            }
          }
          copyIfString('thread_id')
          copyIfString('quote_id')
          copyIfString('voice_message')
          copyIfString('video_message')
          copyIfString('attachments')
          copyIfString('typing_duration')
          return out
        }
        if (op === 'start_new_chat') {
          const out: Record<string, unknown> = {
            account_id: typeof params.account_id === 'string' ? params.account_id.trim() : '',
            text: typeof params.text === 'string' ? params.text : '',
          }
          const copyIfString = (key: string) => {
            const v = params[key]
            if (typeof v === 'string' && v.trim() !== '') {
              out[key] = v.trim()
            }
          }
          copyIfString('subject')
          copyIfString('attachments')
          copyIfString('voice_message')
          copyIfString('video_message')
          copyIfString('attendees_ids')
          copyIfString('applicant_id')
          copyIfString('invitation_id')
          if (typeof params.chat_api === 'string' && params.chat_api.trim() !== '') {
            out.api = params.chat_api.trim()
          }
          if (typeof params.chat_topic === 'string' && params.chat_topic.trim() !== '') {
            out.topic = params.chat_topic.trim()
          }
          if (params.inmail === 'true' || params.inmail === 'false') {
            out.inmail = params.inmail
          }
          return out
        }
        return {}
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Operation to perform' },
    identifier: { type: 'string', description: 'LinkedIn company identifier' },
    user_identifier: { type: 'string', description: 'Unipile user identifier' },
    list_cursor: { type: 'string', description: 'Pagination cursor' },
    message_id: { type: 'string', description: 'Message id' },
    attachment_id: { type: 'string', description: 'Attachment id' },
    post_id: { type: 'string', description: 'Post id' },
    chat_id: { type: 'string', description: 'Unipile chat id' },
    account_id: { type: 'string', description: 'Unipile account id' },
    text: { type: 'string', description: 'Message or post text' },
    linkedin_search_body: { type: 'string', description: 'LinkedIn search request JSON string' },
    linkedin_comment_parent_id: { type: 'string', description: 'Parent comment id for replies' },
    linkedin_post_video_thumbnail: { type: 'string', description: 'Create post video_thumbnail' },
    linkedin_post_repost: { type: 'string', description: 'Create post repost' },
    linkedin_post_include_job_posting: {
      type: 'string',
      description: 'Create post include_job_posting',
    },
    linkedin_post_brand_name: { type: 'string', description: 'Create post name field' },
    linkedin_post_profile_id: { type: 'string', description: 'Create post profile_id' },
    linkedin_post_is_company: { type: 'string', description: 'Create post is_company' },
    linkedin_post_external_link: { type: 'string', description: 'Create post external_link' },
    linkedin_post_as_organization: { type: 'string', description: 'Create post as_organization' },
    linkedin_post_location: { type: 'string', description: 'Create post location' },
    thread_id: { type: 'string', description: 'Thread id for send message' },
    quote_id: { type: 'string', description: 'Quote id for send message' },
    typing_duration: { type: 'string', description: 'Typing duration form field' },
    subject: { type: 'string', description: 'Chat subject' },
    attachments: { type: 'string', description: 'Attachments form field' },
    voice_message: { type: 'string', description: 'Voice message form field' },
    video_message: { type: 'string', description: 'Video message form field' },
    attendees_ids: { type: 'string', description: 'Attendees ids form field' },
    chat_api: { type: 'string', description: 'Unipile api form field' },
    chat_topic: { type: 'string', description: 'Unipile topic form field' },
    applicant_id: { type: 'string', description: 'Applicant id' },
    invitation_id: { type: 'string', description: 'Invitation id' },
    inmail: { type: 'string', description: 'inmail form field (true/false)' },
  },
  outputs: {
    object: { type: 'string', description: 'Unipile object discriminator' },
    id: { type: 'string', description: 'Resource id (company, chat, post, etc.)' },
    name: { type: 'string', description: 'Display name when applicable' },
    description: { type: 'string', description: 'Company description (profile operation)' },
    public_identifier: { type: 'string', description: 'LinkedIn public identifier' },
    profile_url: { type: 'string', description: 'LinkedIn profile URL (company)' },
    followers_count: { type: 'number', description: 'Followers count (company)' },
    employee_count: { type: 'number', description: 'Employee count (company)' },
    website: { type: 'string', description: 'Company website' },
    logo: { type: 'string', description: 'Logo URL' },
    profile: { type: 'json', description: 'Full company or user profile payload' },
    provider: { type: 'string', description: 'Provider (user profile)' },
    first_name: { type: 'string', description: 'First name (user profile)' },
    last_name: { type: 'string', description: 'Last name (user profile)' },
    headline: { type: 'string', description: 'Headline (user profile)' },
    account_type: { type: 'string', description: 'Chat account type (get chat)' },
    provider_id: { type: 'string', description: 'Provider id (get chat)' },
    subject: {
      type: 'string',
      description: 'Subject when returned by get chat or set when starting a chat',
    },
    timestamp: { type: 'string', description: 'Chat timestamp (get chat)' },
    unread_count: { type: 'number', description: 'Unread count (get chat)' },
    content_type: { type: 'string', description: 'Chat content type (get chat)' },
    last_message_text: { type: 'string', description: 'Last message text preview (get chat)' },
    chat: { type: 'json', description: 'Full chat payload (get chat)' },
    item_count: { type: 'number', description: 'List item count' },
    items: { type: 'json', description: 'List items payload' },
    cursor: { type: 'string', description: 'Pagination cursor' },
    paging: { type: 'json', description: 'Paging metadata' },
    total_items: { type: 'number', description: 'Total items when API returns total_items' },
    config: { type: 'json', description: 'LinkedIn search echoed config when present' },
    metadata: { type: 'json', description: 'LinkedIn search metadata when present' },
    content: { type: 'string', description: 'Attachment text body when applicable' },
    content_base64: { type: 'string', description: 'Attachment base64 when binary' },
    mime_type: { type: 'string', description: 'Attachment MIME type' },
    share_url: { type: 'string', description: 'Post share URL' },
    text: { type: 'string', description: 'Post or message text snippet' },
    post: { type: 'json', description: 'Full post payload (get post)' },
    chat_id: { type: 'string', description: 'Chat id (start new chat)' },
    message_id: { type: 'string', description: 'Message id' },
    post_id: { type: 'string', description: 'Post id (create post)' },
    account_id: { type: 'string', description: 'Account id' },
    comment_id: { type: 'string', description: 'Comment id (comment on post)' },
  },
}
