import { BookOpen, ClipboardList, File, Table, Users } from '@sim/emcn/icons'
import { GoogleTranslateIcon, GreptileIcon, LinearIcon, SlackIcon } from '@/components/icons'
import { getScopesForService } from '@/lib/oauth/utils'
import type { BlockConfig, BlockMeta } from '@/blocks/types'
import { AuthMode, IntegrationType } from '@/blocks/types'
import { normalizeFileInput } from '@/blocks/utils'
import type { SlackResponse } from '@/tools/slack/types'
import { getTrigger } from '@/triggers'

export const SlackBlock: BlockConfig<SlackResponse> = {
  type: 'slack',
  name: 'Slack',
  description:
    'Send, update, delete messages, manage views and modals, add or remove reactions, manage canvases, get channel info and user presence in Slack',
  authMode: AuthMode.OAuth,
  longDescription:
    'Integrate Slack into the workflow. Can send, update, and delete messages, send ephemeral messages visible only to a specific user, open/update/push modal views, publish Home tab views, create canvases, read messages, and add or remove reactions. Requires Bot Token instead of OAuth in advanced mode. Can be used in trigger mode to trigger a workflow when a message is sent to a channel.',
  docsLink: 'https://docs.sim.ai/integrations/slack',
  category: 'tools',
  integrationType: IntegrationType.Communication,
  bgColor: '#611f69',
  icon: SlackIcon,
  triggerAllowed: true,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      options: [
        { label: 'Send Message', id: 'send' },
        { label: 'Send Ephemeral Message', id: 'ephemeral' },
        { label: 'Create Canvas', id: 'canvas' },
        { label: 'Read Messages', id: 'read' },
        { label: 'Get Message', id: 'get_message' },
        { label: 'Get Thread', id: 'get_thread' },
        { label: 'Get Thread Replies', id: 'get_thread_replies' },
        { label: 'Get Channel History', id: 'get_channel_history' },
        { label: 'Get Message Permalink', id: 'get_permalink' },
        { label: 'Set Assistant Status', id: 'set_status' },
        { label: 'Set Assistant Title', id: 'set_title' },
        { label: 'Set Suggested Prompts', id: 'set_suggested_prompts' },
        { label: 'List Channels', id: 'list_channels' },
        { label: 'Get My Channels & DMs', id: 'get_user_channels' },
        { label: 'List Channel Members', id: 'list_members' },
        { label: 'List Users', id: 'list_users' },
        { label: 'Get User Info', id: 'get_user' },
        { label: 'Auth User', id: 'get_auth_user' },
        { label: 'Download File', id: 'download' },
        { label: 'Update Message', id: 'update' },
        { label: 'Delete Message', id: 'delete' },
        { label: 'Add Reaction', id: 'react' },
        { label: 'Search All', id: 'search_all' },
        { label: 'Remove Reaction', id: 'unreact' },
        { label: 'Get Channel Info', id: 'get_channel_info' },
        { label: 'Get User Presence', id: 'get_user_presence' },
        { label: 'Edit Canvas', id: 'edit_canvas' },
        { label: 'Create Channel Canvas', id: 'create_channel_canvas' },
        { label: 'Get Canvas Info', id: 'get_canvas' },
        { label: 'List Canvases', id: 'list_canvases' },
        { label: 'Lookup Canvas Sections', id: 'lookup_canvas_sections' },
        { label: 'Delete Canvas', id: 'delete_canvas' },
        { label: 'Create Conversation', id: 'create_conversation' },
        { label: 'Invite to Conversation', id: 'invite_to_conversation' },
        { label: 'Open View', id: 'open_view' },
        { label: 'Update View', id: 'update_view' },
        { label: 'Push View', id: 'push_view' },
        { label: 'Publish View', id: 'publish_view' },
      ],
      value: () => 'send',
    },
    {
      id: 'authMethod',
      title: 'Authentication Method',
      type: 'dropdown',
      description:
        'Sim Bot uses the workspace OAuth bot token (bot/app actions). Custom Bot uses a user token (user-level actions). If the task is “as a user” (DMs, user conversations), prefer Custom Bot; otherwise prefer Sim Bot.',
      options: [
        { label: 'Sim Bot (bot token)', id: 'oauth' },
        { label: 'Custom Bot (user token)', id: 'bot_token' },
      ],
      value: () => 'bot_token',
      required: true,
    },
    {
      id: 'destinationType',
      title: 'Destination',
      type: 'dropdown',
      options: [
        { label: 'Channel', id: 'channel' },
        { label: 'Direct Message', id: 'dm' },
      ],
      value: () => 'channel',
      condition: {
        field: 'operation',
        value: ['send', 'read'],
      },
    },
    {
      id: 'credential',
      title: 'Slack Account',
      type: 'oauth-input',
      canonicalParamId: 'oauthCredential',
      mode: 'basic',
      serviceId: 'slack',
      requiredScopes: getScopesForService('slack'),
      placeholder: 'Select Slack workspace',
      required: true,
    },
    {
      id: 'manualCredential',
      title: 'Slack Account',
      type: 'short-input',
      canonicalParamId: 'oauthCredential',
      mode: 'advanced',
      placeholder: 'Enter credential ID',
      required: true,
    },
    {
      id: 'channel',
      title: 'Channel',
      type: 'channel-selector',
      canonicalParamId: 'channel',
      serviceId: 'slack',
      selectorKey: 'slack.channels',
      placeholder: 'Select Slack channel',
      mode: 'basic',
      dependsOn: { all: ['authMethod', 'credential'] },
      condition: (values?: Record<string, unknown>) => {
        const op = values?.operation as string
        if (op === 'ephemeral') {
          return { field: 'operation', value: 'ephemeral' }
        }
        return {
          field: 'operation',
          value: [
            'list_channels',
            'get_user_channels',
            'list_users',
            'get_user',
            'get_auth_user',
            'search_all',
            'get_user_presence',
            'edit_canvas',
            'get_canvas',
            'lookup_canvas_sections',
            'delete_canvas',
            'create_conversation',
            'open_view',
            'update_view',
            'push_view',
            'publish_view',
          ],
          not: true,
          and: {
            field: 'destinationType',
            value: 'dm',
            not: true,
          },
        }
      },
      required: {
        field: 'operation',
        value: 'list_canvases',
        not: true,
      },
    },
    {
      id: 'manualChannel',
      title: 'Channel ID',
      type: 'short-input',
      canonicalParamId: 'channel',
      placeholder: 'Enter Slack channel ID (e.g., C1234567890)',
      dependsOn: { all: ['authMethod'], any: ['credential', 'botToken'] },
      mode: 'advanced',
      condition: (values?: Record<string, unknown>) => {
        const op = values?.operation as string
        if (op === 'ephemeral') {
          return { field: 'operation', value: 'ephemeral' }
        }
        return {
          field: 'operation',
          value: [
            'list_channels',
            'get_user_channels',
            'list_users',
            'get_user',
            'get_auth_user',
            'search_all',
            'get_user_presence',
            'edit_canvas',
            'get_canvas',
            'lookup_canvas_sections',
            'delete_canvas',
            'create_conversation',
            'open_view',
            'update_view',
            'push_view',
            'publish_view',
          ],
          not: true,
          and: {
            field: 'destinationType',
            value: 'dm',
            not: true,
          },
        }
      },
      required: {
        field: 'operation',
        value: 'list_canvases',
        not: true,
      },
    },
    {
      id: 'dmUserId',
      title: 'User',
      type: 'user-selector',
      canonicalParamId: 'dmUserId',
      serviceId: 'slack',
      selectorKey: 'slack.users',
      placeholder: 'Select Slack user',
      mode: 'basic',
      dependsOn: { all: ['authMethod', 'credential'] },
      condition: {
        field: 'destinationType',
        value: 'dm',
      },
      required: true,
    },
    {
      id: 'manualDmUserId',
      title: 'User ID',
      type: 'short-input',
      canonicalParamId: 'dmUserId',
      placeholder: 'Enter Slack user ID (e.g., U1234567890)',
      dependsOn: { all: ['authMethod'], any: ['credential', 'botToken'] },
      mode: 'advanced',
      condition: {
        field: 'destinationType',
        value: 'dm',
      },
      required: true,
    },
    {
      id: 'ephemeralUser',
      title: 'Target User',
      type: 'user-selector',
      canonicalParamId: 'ephemeralUser',
      serviceId: 'slack',
      selectorKey: 'slack.users',
      placeholder: 'Select Slack user',
      mode: 'basic',
      dependsOn: { all: ['authMethod', 'credential'] },
      condition: {
        field: 'operation',
        value: 'ephemeral',
      },
      required: true,
    },
    {
      id: 'manualEphemeralUser',
      title: 'Target User ID',
      type: 'short-input',
      canonicalParamId: 'ephemeralUser',
      placeholder: 'Enter Slack user ID (e.g., U1234567890)',
      dependsOn: { all: ['authMethod'], any: ['credential', 'botToken'] },
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: 'ephemeral',
      },
      required: true,
    },
    {
      id: 'messageFormat',
      title: 'Message Format',
      type: 'dropdown',
      options: [
        { label: 'Plain Text', id: 'text' },
        { label: 'Block Kit', id: 'blocks' },
      ],
      value: () => 'text',
      condition: {
        field: 'operation',
        value: ['send', 'ephemeral', 'update'],
      },
    },
    {
      id: 'text',
      title: 'Message',
      type: 'mention-input',
      serviceId: 'slack',
      placeholder: 'Type your message...',
      condition: {
        field: 'operation',
        value: ['send', 'ephemeral'],
        and: { field: 'messageFormat', value: 'blocks', not: true },
      },
      required: {
        field: 'operation',
        value: ['send', 'ephemeral'],
        and: { field: 'messageFormat', value: 'blocks', not: true },
      },
    },
    {
      id: 'blocks',
      title: 'Block Kit Blocks',
      type: 'code',
      language: 'json',
      placeholder: 'JSON array of Block Kit blocks',
      condition: {
        field: 'operation',
        value: ['send', 'ephemeral', 'update'],
        and: { field: 'messageFormat', value: 'blocks' },
      },
      required: {
        field: 'operation',
        value: ['send', 'ephemeral', 'update'],
        and: { field: 'messageFormat', value: 'blocks' },
      },
      wandConfig: {
        enabled: true,
        maintainHistory: true,
        prompt: `You are an expert at Slack Block Kit.
Generate ONLY a valid JSON array of Block Kit blocks based on the user's request.
The output MUST be a JSON array starting with [ and ending with ].

Current blocks: {context}

Available block types for messages:
- "section": Displays text with an optional accessory element. Text uses { "type": "mrkdwn", "text": "..." } or { "type": "plain_text", "text": "..." }.
- "header": Large text header. Text must be plain_text.
- "divider": A horizontal rule separator. No fields needed besides type.
- "image": Displays an image. Requires "image_url" and "alt_text".
- "context": Contextual info with an "elements" array of image and text objects.
- "actions": Interactive elements like buttons. Each button needs "type": "button", a "text" object, and an "action_id".
- "rich_text": Structured rich text with "elements" array of rich_text_section objects.

Example output:
[
  {
    "type": "header",
    "text": { "type": "plain_text", "text": "Order Confirmation" }
  },
  {
    "type": "section",
    "text": { "type": "mrkdwn", "text": "Your order *#1234* has been confirmed." }
  },
  { "type": "divider" },
  {
    "type": "actions",
    "elements": [
      {
        "type": "button",
        "text": { "type": "plain_text", "text": "View Order" },
        "action_id": "view_order",
        "url": "https://example.com/orders/1234"
      }
    ]
  }
]

You can reference workflow variables using angle brackets, e.g., <blockName.output>.
Do not include any explanations, markdown formatting, or other text outside the JSON array.`,
        placeholder: 'Describe the Block Kit layout you want to create...',
      },
      dependsOn: ['credential', 'authMethod'],
      // required: true,
    },
    {
      id: 'threadTs',
      title: 'Thread Timestamp',
      type: 'short-input',
      placeholder: 'Reply to thread (e.g., 1405894322.002768)',
      condition: {
        field: 'operation',
        value: ['send', 'ephemeral'],
      },
      required: false,
    },
    {
      id: 'attachmentFiles',
      title: 'Attachments',
      type: 'file-upload',
      canonicalParamId: 'files',
      placeholder: 'Upload files to attach',
      condition: { field: 'operation', value: 'send' },
      mode: 'basic',
      multiple: true,
      required: false,
    },
    {
      id: 'files',
      title: 'File Attachments',
      type: 'short-input',
      canonicalParamId: 'files',
      placeholder: 'Reference files from previous blocks',
      condition: { field: 'operation', value: 'send' },
      mode: 'advanced',
      required: false,
    },
    // Canvas specific fields
    {
      id: 'title',
      title: 'Canvas Title',
      type: 'short-input',
      placeholder: 'Enter canvas title',
      condition: {
        field: 'operation',
        value: 'canvas',
      },
      required: true,
    },
    {
      id: 'content',
      title: 'Canvas Content',
      type: 'long-input',
      placeholder: 'Enter canvas content (markdown supported)',
      condition: {
        field: 'operation',
        value: 'canvas',
      },
      required: true,
    },
    // Message Reader specific fields
    {
      id: 'limit',
      title: 'Message Limit',
      type: 'short-input',
      placeholder: '50',
      condition: {
        field: 'operation',
        value: 'read',
      },
    },
    {
      id: 'fromDate',
      title: 'From Date',
      type: 'short-input',
      placeholder: 'Select from date',
      condition: {
        field: 'operation',
        value: 'read',
      },
    },
    {
      id: 'toDate',
      title: 'To Date',
      type: 'short-input',
      placeholder: 'Select to date',
      condition: {
        field: 'operation',
        value: 'read',
      },
    },
    {
      id: 'dateRange',
      title: 'Quick Date Range',
      type: 'dropdown',
      placeholder: 'Select date range',
      options: [
        { label: 'Today', id: '1' },
        { label: 'Last 7 days', id: '7' },
        { label: 'Last 14 days', id: '14' },
        { label: 'Last 30 days', id: '30' },
      ],
      condition: {
        field: 'operation',
        value: 'read',
      },
    },
    {
      id: 'cursor',
      title: 'Cursor',
      type: 'short-input',
      placeholder: 'Pagination cursor from previous response',
      condition: {
        field: 'operation',
        value: 'read',
      },
    },
    {
      id: 'autoPaginate',
      title: 'Auto-Paginate',
      type: 'switch',
      description: 'Automatically fetch all pages (max 10 pages, 1000 messages)',
      defaultValue: true,
      condition: {
        field: 'operation',
        value: 'read',
      },
    },
    {
      id: 'includeThreads',
      title: 'Include Thread Replies',
      type: 'switch',
      description: 'Include replies for messages that are part of threads',
      defaultValue: true,
      condition: {
        field: 'operation',
        value: 'read',
      },
    },
    {
      id: 'maxThreads',
      title: 'Max Threads',
      type: 'short-input',
      placeholder: '10',
      description: 'Maximum number of threads to fetch replies for',
      condition: {
        field: 'operation',
        value: 'read',
        and: {
          field: 'includeThreads',
          value: true,
        },
      },
    },
    {
      id: 'maxRepliesPerThread',
      title: 'Max Replies Per Thread',
      type: 'short-input',
      placeholder: '100',
      description: 'Maximum number of replies to fetch per thread',
      condition: {
        field: 'operation',
        value: 'read',
        and: {
          field: 'includeThreads',
          value: true,
        },
      },
    },
    // List Channels specific fields
    {
      id: 'includePublic',
      title: 'Include Public Channels',
      type: 'dropdown',
      options: [
        { label: 'Yes', id: 'true' },
        { label: 'No', id: 'false' },
      ],
      value: () => 'true',
      condition: {
        field: 'operation',
        value: 'get_user_channels',
      },
    },
    {
      id: 'includePrivate',
      title: 'Include Private Channels',
      type: 'dropdown',
      options: [
        { label: 'Yes', id: 'true' },
        { label: 'No', id: 'false' },
      ],
      value: () => 'true',
      condition: {
        field: 'operation',
        value: ['list_channels', 'get_user_channels'],
      },
    },
    {
      id: 'includeDMs',
      title: 'Include 1:1 DMs (im)',
      type: 'dropdown',
      description: 'If the user asked for DMs, set this to Yes. Requires im:read.',
      options: [
        { label: 'No', id: 'false' },
        { label: 'Yes', id: 'true' },
      ],
      value: () => '',
      condition: {
        field: 'operation',
        value: ['list_channels', 'get_user_channels'],
      },
    },
    {
      id: 'includeGroupDMs',
      title: 'Include Group DMs (mpim)',
      type: 'dropdown',
      description: 'If the user asked for group DMs, set this to Yes. Requires mpim:read.',
      options: [
        { label: 'No', id: 'false' },
        { label: 'Yes', id: 'true' },
      ],
      value: () => '',
      condition: {
        field: 'operation',
        value: ['list_channels', 'get_user_channels'],
      },
    },
    {
      id: 'channelLimit',
      title: 'Channel Limit',
      type: 'short-input',
      placeholder: '200',
      value: () => '200',
      condition: {
        field: 'operation',
        value: ['list_channels', 'get_user_channels'],
      },
    },
    {
      id: 'getUserChannelsCursor',
      title: 'Cursor',
      type: 'short-input',
      placeholder: 'Pagination cursor from previous Get User Channels response',
      description: 'Pass output.cursor from a prior run to fetch the next page',
      condition: {
        field: 'operation',
        value: 'get_user_channels',
      },
    },
    {
      id: 'getUserChannelsAutoPaginate',
      title: 'Auto Paginate',
      type: 'dropdown',
      description: 'Fetch all pages automatically. Always enabled for Get User Channels.',
      options: [
        { label: 'Yes', id: 'true' },
        { label: 'No', id: 'false' },
      ],
      value: () => 'true',
      condition: {
        field: 'operation',
        value: 'get_user_channels',
      },
    },
    {
      id: 'listChannelsCursor',
      title: 'Cursor',
      type: 'short-input',
      placeholder: 'Pagination cursor from previous List Channels response',
      description: 'Optional. Pass output.cursor from a prior run to fetch the next page',
      condition: {
        field: 'operation',
        value: 'list_channels',
      },
    },
    // List Members specific fields
    {
      id: 'memberLimit',
      title: 'Member Limit',
      type: 'short-input',
      placeholder: '100',
      condition: {
        field: 'operation',
        value: 'list_members',
      },
    },
    {
      id: 'listMembersCursor',
      title: 'Cursor',
      type: 'short-input',
      placeholder: 'Pagination cursor from previous List Channel Members response',
      description: 'Optional. Pass output.cursor from a prior run to fetch the next page',
      condition: {
        field: 'operation',
        value: 'list_members',
      },
    },
    // List Users specific fields
    {
      id: 'includeDeleted',
      title: 'Include Deactivated Users',
      type: 'dropdown',
      options: [
        { label: 'No', id: 'false' },
        { label: 'Yes', id: 'true' },
      ],
      value: () => 'false',
      condition: {
        field: 'operation',
        value: 'list_users',
      },
    },
    {
      id: 'userLimit',
      title: 'User Limit',
      type: 'short-input',
      placeholder: '100',
      value: () => '100',
      condition: {
        field: 'operation',
        value: 'list_users',
      },
    },
    // {
    //   id: 'listUsersCursor',
    //   title: 'Cursor',
    //   type: 'short-input',
    //   placeholder: 'Pagination cursor from previous List Users response',
    //   description: 'Optional. Pass output.cursor from a prior run to fetch the next page',
    //   condition: {
    //     field: 'operation',
    //     value: 'list_users',
    //   },
    // },
    {
      id: 'listUsersAutoPaginate',
      title: 'Auto Paginate',
      type: 'dropdown',
      description: 'Fetch all pages automatically. Always enabled for List Users.',
      options: [
        { label: 'Yes', id: 'true' },
        { label: 'No', id: 'false' },
      ],
      value: () => 'true',
      condition: {
        field: 'operation',
        value: 'list_users',
      },
    },
    // Pagination cursor (shared across list_channels, list_members, list_users)
    {
      id: 'paginationCursor',
      title: 'Pagination Cursor',
      type: 'short-input',
      placeholder: 'next_cursor from a previous response',
      condition: {
        field: 'operation',
        value: ['list_channels', 'list_members', 'list_users'],
      },
      mode: 'advanced',
    },
    // Get User specific fields
    {
      id: 'userId',
      title: 'User',
      type: 'user-selector',
      canonicalParamId: 'userId',
      serviceId: 'slack',
      selectorKey: 'slack.users',
      placeholder: 'Select Slack user',
      mode: 'basic',
      dependsOn: { all: ['authMethod', 'credential'] },
      condition: {
        field: 'operation',
        value: 'get_user',
      },
      required: true,
    },
    {
      id: 'manualUserId',
      title: 'User ID',
      type: 'short-input',
      canonicalParamId: 'userId',
      placeholder: 'Enter Slack user ID (e.g., U1234567890)',
      dependsOn: { all: ['authMethod'], any: ['credential', 'botToken'] },
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: 'get_user',
      },
      required: true,
    },
    // Get Message specific fields
    {
      id: 'getMessageTimestamp',
      title: 'Message Timestamp',
      type: 'short-input',
      placeholder: 'Message timestamp (e.g., 1405894322.002768)',
      condition: {
        field: 'operation',
        value: ['get_message', 'get_permalink'],
      },
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `Extract or generate a Slack message timestamp from the user's input.
Slack message timestamps are in the format: XXXXXXXXXX.XXXXXX (seconds.microseconds since Unix epoch).
Examples:
- "1405894322.002768" -> 1405894322.002768 (already a valid timestamp)
- "thread_ts from the trigger" -> The user wants to reference a variable, output the original text
- A URL like "https://slack.com/archives/C123/p1405894322002768" -> Extract 1405894322.002768 (remove 'p' prefix, add decimal after 10th digit)

If the input looks like a reference to another block's output (contains < and >) or a variable, return it as-is.
Return ONLY the timestamp string - no explanations, no quotes, no extra text.`,
        placeholder: 'Paste a Slack message URL or timestamp...',
        generationType: 'timestamp',
      },
    },
    // Get Thread specific fields
    {
      id: 'getThreadTimestamp',
      title: 'Thread Timestamp',
      type: 'short-input',
      placeholder: 'Thread timestamp (thread_ts, e.g., 1405894322.002768)',
      condition: {
        field: 'operation',
        value: [
          'get_thread',
          'get_thread_replies',
          'set_status',
          'set_title',
          'set_suggested_prompts',
        ],
      },
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `Extract or generate a Slack thread timestamp from the user's input.
Slack thread timestamps (thread_ts) are in the format: XXXXXXXXXX.XXXXXX (seconds.microseconds since Unix epoch).
Examples:
- "1405894322.002768" -> 1405894322.002768 (already a valid timestamp)
- "thread_ts from the trigger" -> The user wants to reference a variable, output the original text
- A URL like "https://slack.com/archives/C123/p1405894322002768" -> Extract 1405894322.002768 (remove 'p' prefix, add decimal after 10th digit)

If the input looks like a reference to another block's output (contains < and >) or a variable, return it as-is.
Return ONLY the timestamp string - no explanations, no quotes, no extra text.`,
        placeholder: 'Paste a Slack thread URL or thread_ts...',
        generationType: 'timestamp',
      },
    },
    {
      id: 'threadLimit',
      title: 'Message Limit',
      type: 'short-input',
      placeholder: '100',
      condition: {
        field: 'operation',
        value: 'get_thread',
      },
    },
    // Set Assistant Status specific fields
    {
      id: 'status',
      title: 'Status Text',
      type: 'short-input',
      placeholder: 'e.g., Working on it… (leave empty to clear)',
      condition: {
        field: 'operation',
        value: 'set_status',
      },
      required: false,
    },
    {
      id: 'loadingMessages',
      title: 'Loading Messages',
      type: 'long-input',
      placeholder: 'Optional JSON array of phrases to animate (max 10)',
      condition: {
        field: 'operation',
        value: 'set_status',
      },
      required: false,
    },
    // Set Assistant Title specific fields
    {
      id: 'assistantTitle',
      title: 'Thread Title',
      type: 'short-input',
      placeholder: 'Title to display for the assistant thread',
      condition: {
        field: 'operation',
        value: 'set_title',
      },
      required: true,
    },
    // Set Suggested Prompts specific fields
    {
      id: 'suggestedPrompts',
      title: 'Suggested Prompts',
      type: 'long-input',
      placeholder: '[{"title": "Summarize", "message": "Summarize this thread"}]',
      condition: {
        field: 'operation',
        value: 'set_suggested_prompts',
      },
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `Generate a JSON array of Slack assistant suggested prompts from the user's description.
Each entry must be an object with exactly two string fields:
- "title": the short label shown on the clickable chip
- "message": the full message sent into the thread when the chip is clicked
Return at most 4 prompts.
Example:
[{"title": "Summarize", "message": "Summarize the key points of this thread"}, {"title": "Next steps", "message": "What are the next steps?"}]

Return ONLY the JSON array - no explanations, no quotes around the array, no extra text.`,
        placeholder: 'Describe the prompts you want (e.g., "summarize and list action items")...',
        generationType: 'json-object',
      },
    },
    {
      id: 'promptsTitle',
      title: 'Prompts Heading',
      type: 'short-input',
      placeholder: 'e.g., Suggested Prompts (optional)',
      condition: {
        field: 'operation',
        value: 'set_suggested_prompts',
      },
      mode: 'advanced',
      required: false,
    },
    // Get Channel History / Get Thread Replies shared pagination fields
    {
      id: 'historyOldest',
      title: 'Oldest Timestamp',
      type: 'short-input',
      placeholder: 'Unix seconds, e.g., 1700000000 (only messages after)',
      condition: {
        field: 'operation',
        value: ['get_channel_history', 'get_thread_replies'],
      },
      required: false,
    },
    {
      id: 'historyLatest',
      title: 'Latest Timestamp',
      type: 'short-input',
      placeholder: 'Unix seconds, e.g., 1700000000 (only messages before)',
      condition: {
        field: 'operation',
        value: ['get_channel_history', 'get_thread_replies'],
      },
      required: false,
    },
    {
      id: 'historyLimit',
      title: 'Page Size',
      type: 'short-input',
      placeholder: '200 (max 999)',
      condition: {
        field: 'operation',
        value: ['get_channel_history', 'get_thread_replies'],
      },
      required: false,
    },
    {
      id: 'historyMaxPages',
      title: 'Max Pages',
      type: 'short-input',
      placeholder: '10',
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: ['get_channel_history', 'get_thread_replies'],
      },
      required: false,
    },
    {
      id: 'historyCursor',
      title: 'Start Cursor',
      type: 'short-input',
      placeholder: 'Resume from a previous nextCursor',
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: ['get_channel_history', 'get_thread_replies'],
      },
      required: false,
    },
    {
      id: 'historyInclusive',
      title: 'Inclusive',
      type: 'dropdown',
      options: [
        { label: 'No', id: 'false' },
        { label: 'Yes', id: 'true' },
      ],
      value: () => 'false',
      condition: {
        field: 'operation',
        value: ['get_channel_history', 'get_thread_replies'],
      },
      required: false,
    },
    {
      id: 'getThreadCursor',
      title: 'Cursor',
      type: 'short-input',
      placeholder: 'Pagination cursor from previous Get Thread response',
      description:
        'Optional. Pass output.cursor from a prior run to fetch the next page of replies',
      condition: {
        field: 'operation',
        value: 'get_thread',
      },
    },
    {
      id: 'oldest',
      title: 'Oldest Timestamp',
      type: 'short-input',
      placeholder: 'ISO 8601 timestamp',
      condition: {
        field: 'operation',
        value: 'read',
      },
      wandConfig: {
        enabled: true,
        prompt: `Generate an ISO 8601 timestamp based on the user's description.
The timestamp should be in the format: YYYY-MM-DDTHH:MM:SSZ (UTC timezone).
This timestamp is used to filter Slack messages - only messages after this timestamp will be returned.
Examples:
- "last hour" -> Calculate 1 hour ago from current time
- "yesterday" -> Calculate yesterday's date at 00:00:00Z
- "last week" -> Calculate 7 days ago at 00:00:00Z
- "beginning of this month" -> First day of current month at 00:00:00Z
- "30 minutes ago" -> Calculate 30 minutes before current time

Return ONLY the timestamp string - no explanations, no quotes, no extra text.`,
        placeholder: 'Describe the cutoff date (e.g., "last hour", "yesterday", "last week")...',
        generationType: 'timestamp',
      },
    },
    // Download File specific fields
    {
      id: 'fileId',
      title: 'File ID',
      type: 'short-input',
      placeholder: 'Enter Slack file ID (e.g., F1234567890)',
      condition: {
        field: 'operation',
        value: 'download',
      },
      required: true,
    },
    {
      id: 'downloadFileName',
      title: 'File Name Override',
      type: 'short-input',
      canonicalParamId: 'fileName',
      placeholder: 'Optional: Override the filename',
      condition: {
        field: 'operation',
        value: 'download',
      },
    },
    // Update Message specific fields
    {
      id: 'updateTimestamp',
      title: 'Message Timestamp',
      type: 'short-input',
      placeholder: 'Message timestamp (e.g., 1405894322.002768)',
      condition: {
        field: 'operation',
        value: 'update',
      },
      required: true,
    },
    {
      id: 'updateText',
      title: 'New Message Text',
      type: 'long-input',
      placeholder: 'Enter new message text (supports Slack mrkdwn)',
      condition: {
        field: 'operation',
        value: 'update',
        and: { field: 'messageFormat', value: 'blocks', not: true },
      },
      required: {
        field: 'operation',
        value: 'update',
        and: { field: 'messageFormat', value: 'blocks', not: true },
      },
    },
    // Delete Message specific fields
    {
      id: 'deleteTimestamp',
      title: 'Message Timestamp',
      type: 'short-input',
      placeholder: 'Message timestamp (e.g., 1405894322.002768)',
      condition: {
        field: 'operation',
        value: 'delete',
      },
      required: true,
    },
    // Add Reaction specific fields
    {
      id: 'reactionTimestamp',
      title: 'Message Timestamp',
      type: 'short-input',
      placeholder: 'Message timestamp (e.g., 1405894322.002768)',
      condition: {
        field: 'operation',
        value: ['react', 'unreact'],
      },
      required: true,
    },
    {
      id: 'emojiName',
      title: 'Emoji Name',
      type: 'short-input',
      placeholder: 'Emoji name without colons (e.g., thumbsup, heart, eyes)',
      condition: {
        field: 'operation',
        value: ['react', 'unreact'],
      },
      required: true,
    },
    // Search All specific fields
    {
      id: 'clientId',
      title: 'Client ID',
      type: 'slack-client-selector',
      placeholder: 'Select client',
      condition: {
        field: 'operation',
        value: 'search_all',
      },
      required: false,
    },
    {
      id: 'channelId',
      title: 'Channel',
      type: 'slack-channel-selector',
      placeholder: 'Select channel',
      dependsOn: ['clientId'],
      condition: {
        field: 'operation',
        value: 'search_all',
      },
      required: false,
    },
    {
      id: 'query',
      title: 'Search Query',
      type: 'short-input',
      placeholder: 'Search terms (channel filter applied automatically from selection)',
      description:
        'Enter your search terms. The selected channel will be automatically included as "in:channel_name".',
      condition: {
        field: 'operation',
        value: 'search_all',
      },
      required: true,
    },
    // Get Channel Info specific fields
    {
      id: 'includeNumMembers',
      title: 'Include Member Count',
      type: 'dropdown',
      options: [
        { label: 'Yes', id: 'true' },
        { label: 'No', id: 'false' },
      ],
      value: () => 'true',
      condition: {
        field: 'operation',
        value: 'get_channel_info',
      },
    },
    // Get User Presence specific fields
    {
      id: 'presenceUserId',
      title: 'User',
      type: 'user-selector',
      canonicalParamId: 'presenceUserId',
      serviceId: 'slack',
      selectorKey: 'slack.users',
      placeholder: 'Select Slack user',
      mode: 'basic',
      dependsOn: { all: ['authMethod', 'credential'] },
      condition: {
        field: 'operation',
        value: 'get_user_presence',
      },
      required: true,
    },
    {
      id: 'searchCount',
      title: 'Result Count',
      type: 'short-input',
      placeholder: '50',
      condition: {
        field: 'operation',
        value: 'search_all',
      },
    },
    {
      id: 'searchPage',
      title: 'Page Number',
      type: 'short-input',
      placeholder: '1',
      condition: {
        field: 'operation',
        value: 'search_all',
      },
    },
    {
      id: 'sortBy',
      title: 'Sort By',
      type: 'dropdown',
      options: [
        { label: 'Timestamp', id: 'timestamp' },
        { label: 'Score', id: 'score' },
        { label: 'Relevance', id: 'relevance' },
      ],
      value: () => 'timestamp',
      condition: {
        field: 'operation',
        value: 'search_all',
      },
    },
    {
      id: 'sortDir',
      title: 'Sort Direction',
      type: 'dropdown',
      options: [
        { label: 'Descending', id: 'desc' },
        { label: 'Ascending', id: 'asc' },
      ],
      value: () => 'desc',
      condition: {
        field: 'operation',
        value: 'search_all',
      },
    },
    {
      id: 'highlight',
      title: 'Highlight Results',
      type: 'switch',
      description: 'Highlight search terms in results',
      defaultValue: true,
      condition: {
        field: 'operation',
        value: 'search_all',
      },
    },
    {
      id: 'manualPresenceUserId',
      title: 'User ID',
      type: 'short-input',
      canonicalParamId: 'presenceUserId',
      placeholder: 'Enter Slack user ID (e.g., U1234567890)',
      dependsOn: { all: ['authMethod'], any: ['credential', 'botToken'] },
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: 'get_user_presence',
      },
      required: true,
    },
    // Edit Canvas specific fields
    {
      id: 'editCanvasId',
      title: 'Canvas ID',
      type: 'short-input',
      placeholder: 'Enter canvas ID (e.g., F1234ABCD)',
      condition: {
        field: 'operation',
        value: 'edit_canvas',
      },
      required: true,
    },
    {
      id: 'canvasOperation',
      title: 'Edit Operation',
      type: 'dropdown',
      options: [
        { label: 'Insert at Start', id: 'insert_at_start' },
        { label: 'Insert at End', id: 'insert_at_end' },
        { label: 'Insert After Section', id: 'insert_after' },
        { label: 'Insert Before Section', id: 'insert_before' },
        { label: 'Replace Section', id: 'replace' },
        { label: 'Delete Section', id: 'delete' },
        { label: 'Rename Canvas', id: 'rename' },
      ],
      value: () => 'insert_at_end',
      condition: {
        field: 'operation',
        value: 'edit_canvas',
      },
      required: true,
    },
    {
      id: 'canvasContent',
      title: 'Content',
      type: 'long-input',
      placeholder: 'Enter content in markdown format',
      condition: {
        field: 'operation',
        value: 'edit_canvas',
        and: {
          field: 'canvasOperation',
          value: ['delete', 'rename'],
          not: true,
        },
      },
    },
    {
      id: 'sectionId',
      title: 'Section ID',
      type: 'short-input',
      placeholder: 'Section ID to target',
      condition: {
        field: 'operation',
        value: 'edit_canvas',
        and: {
          field: 'canvasOperation',
          value: ['insert_after', 'insert_before', 'replace', 'delete'],
        },
      },
      required: true,
    },
    {
      id: 'canvasTitle',
      title: 'New Title',
      type: 'short-input',
      placeholder: 'Enter new canvas title',
      condition: {
        field: 'operation',
        value: 'edit_canvas',
        and: { field: 'canvasOperation', value: 'rename' },
      },
      required: true,
    },
    // Create Channel Canvas specific fields
    {
      id: 'channelCanvasTitle',
      title: 'Canvas Title',
      type: 'short-input',
      placeholder: 'Enter canvas title (optional)',
      condition: {
        field: 'operation',
        value: 'create_channel_canvas',
      },
    },
    {
      id: 'channelCanvasContent',
      title: 'Canvas Content',
      type: 'long-input',
      placeholder: 'Enter canvas content (markdown supported)',
      condition: {
        field: 'operation',
        value: 'create_channel_canvas',
      },
    },
    // Get Canvas specific fields
    {
      id: 'getCanvasId',
      title: 'Canvas ID',
      type: 'short-input',
      placeholder: 'Enter canvas ID (e.g., F1234ABCD)',
      condition: {
        field: 'operation',
        value: 'get_canvas',
      },
      required: true,
    },
    // List Canvases specific fields
    {
      id: 'canvasListCount',
      title: 'Canvas Limit',
      type: 'short-input',
      placeholder: '100',
      condition: {
        field: 'operation',
        value: 'list_canvases',
      },
      mode: 'advanced',
    },
    {
      id: 'canvasListPage',
      title: 'Page',
      type: 'short-input',
      placeholder: '1',
      condition: {
        field: 'operation',
        value: 'list_canvases',
      },
      mode: 'advanced',
    },
    {
      id: 'canvasListUser',
      title: 'User ID',
      type: 'short-input',
      placeholder: 'Optional creator filter (e.g., U1234567890)',
      condition: {
        field: 'operation',
        value: 'list_canvases',
      },
      mode: 'advanced',
    },
    {
      id: 'canvasListTsFrom',
      title: 'Created After',
      type: 'short-input',
      placeholder: 'Unix timestamp (e.g., 123456789)',
      condition: {
        field: 'operation',
        value: 'list_canvases',
      },
      mode: 'advanced',
    },
    {
      id: 'canvasListTsTo',
      title: 'Created Before',
      type: 'short-input',
      placeholder: 'Unix timestamp (e.g., 123456789)',
      condition: {
        field: 'operation',
        value: 'list_canvases',
      },
      mode: 'advanced',
    },
    {
      id: 'canvasListTeamId',
      title: 'Team ID',
      type: 'short-input',
      placeholder: 'Encoded team ID (org tokens only)',
      condition: {
        field: 'operation',
        value: 'list_canvases',
      },
      mode: 'advanced',
    },
    // Lookup Canvas Sections specific fields
    {
      id: 'lookupCanvasId',
      title: 'Canvas ID',
      type: 'short-input',
      placeholder: 'Enter canvas ID (e.g., F1234ABCD)',
      condition: {
        field: 'operation',
        value: 'lookup_canvas_sections',
      },
      required: true,
    },
    {
      id: 'sectionCriteria',
      title: 'Section Criteria',
      type: 'code',
      language: 'json',
      placeholder: '{"section_types":["h1"],"contains_text":"Roadmap"}',
      condition: {
        field: 'operation',
        value: 'lookup_canvas_sections',
      },
      required: true,
    },
    // Delete Canvas specific fields
    {
      id: 'deleteCanvasId',
      title: 'Canvas ID',
      type: 'short-input',
      placeholder: 'Enter canvas ID (e.g., F1234ABCD)',
      condition: {
        field: 'operation',
        value: 'delete_canvas',
      },
      required: true,
    },
    // Create Conversation specific fields
    {
      id: 'conversationName',
      title: 'Channel Name',
      type: 'short-input',
      placeholder: 'e.g., project-updates',
      condition: {
        field: 'operation',
        value: 'create_conversation',
      },
      required: true,
    },
    {
      id: 'isPrivate',
      title: 'Private Channel',
      type: 'dropdown',
      options: [
        { label: 'No', id: 'false' },
        { label: 'Yes', id: 'true' },
      ],
      value: () => 'false',
      condition: {
        field: 'operation',
        value: 'create_conversation',
      },
    },
    {
      id: 'teamId',
      title: 'Team ID',
      type: 'short-input',
      placeholder: 'Encoded team ID (org tokens only)',
      condition: {
        field: 'operation',
        value: 'create_conversation',
      },
      mode: 'advanced',
    },
    // Invite to Conversation specific fields
    {
      id: 'inviteUsers',
      title: 'User IDs',
      type: 'short-input',
      placeholder: 'Comma-separated user IDs (e.g., U123,U456)',
      condition: {
        field: 'operation',
        value: 'invite_to_conversation',
      },
      required: true,
    },
    {
      id: 'inviteForce',
      title: 'Skip Invalid Users',
      type: 'dropdown',
      options: [
        { label: 'No', id: 'false' },
        { label: 'Yes', id: 'true' },
      ],
      value: () => 'false',
      condition: {
        field: 'operation',
        value: 'invite_to_conversation',
      },
      mode: 'advanced',
    },
    // Open View / Push View specific fields
    {
      id: 'viewTriggerId',
      title: 'Trigger ID',
      type: 'short-input',
      placeholder: 'Trigger ID from interaction payload',
      condition: {
        field: 'operation',
        value: ['open_view', 'push_view'],
      },
      required: true,
    },
    {
      id: 'viewInteractivityPointer',
      title: 'Interactivity Pointer',
      type: 'short-input',
      placeholder: 'Alternative to trigger_id (optional)',
      condition: {
        field: 'operation',
        value: ['open_view', 'push_view'],
      },
      mode: 'advanced',
    },
    // Update View specific fields
    {
      id: 'viewId',
      title: 'View ID',
      type: 'short-input',
      placeholder: 'Unique view identifier (either View ID or External ID required)',
      condition: {
        field: 'operation',
        value: 'update_view',
      },
    },
    {
      id: 'viewExternalId',
      title: 'External ID',
      type: 'short-input',
      placeholder: 'Developer-set unique identifier (max 255 chars)',
      condition: {
        field: 'operation',
        value: 'update_view',
      },
    },
    // Update View / Publish View hash field
    {
      id: 'viewHash',
      title: 'View Hash',
      type: 'short-input',
      placeholder: 'View state hash for race condition protection',
      condition: {
        field: 'operation',
        value: ['update_view', 'publish_view'],
      },
      mode: 'advanced',
    },
    // Publish View specific fields
    {
      id: 'publishUserId',
      title: 'User',
      type: 'user-selector',
      canonicalParamId: 'publishUserId',
      serviceId: 'slack',
      selectorKey: 'slack.users',
      placeholder: 'Select user to publish Home tab to',
      mode: 'basic',
      dependsOn: { all: ['authMethod', 'credential'] },
      condition: {
        field: 'operation',
        value: 'publish_view',
      },
      required: true,
    },
    {
      id: 'manualPublishUserId',
      title: 'User ID',
      type: 'short-input',
      canonicalParamId: 'publishUserId',
      placeholder: 'Enter Slack user ID (e.g., U0BPQUNTA)',
      dependsOn: { all: ['authMethod'], any: ['credential', 'botToken'] },
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: 'publish_view',
      },
      required: true,
    },
    // View payload (shared across all view operations)
    {
      id: 'viewPayload',
      title: 'View Payload',
      type: 'code',
      language: 'json',
      placeholder: 'JSON view payload with type, title, and blocks',
      condition: {
        field: 'operation',
        value: ['open_view', 'update_view', 'push_view', 'publish_view'],
      },
      required: true,
      wandConfig: {
        enabled: true,
        maintainHistory: true,
        prompt: `You are an expert at Slack Block Kit views.
Generate ONLY a valid JSON view payload object based on the user's request.
The output MUST be a JSON object starting with { and ending with }.

Current view: {context}

The view object must include:
- "type": "modal" (for open/update/push) or "home" (for publish)
- "title": { "type": "plain_text", "text": "Title text", "emoji": true } (max 24 chars)
- "blocks": Array of Block Kit blocks

Optional fields:
- "submit": { "type": "plain_text", "text": "Submit" } - Submit button text
- "close": { "type": "plain_text", "text": "Cancel" } - Close button text
- "private_metadata": String up to 3000 chars
- "callback_id": String identifier for interaction handling
- "clear_on_close": true/false
- "notify_on_close": true/false
- "external_id": Unique string per workspace (max 255 chars)

Available block types:
- "section": Text with optional accessory. Text uses { "type": "mrkdwn", "text": "..." } or { "type": "plain_text", "text": "..." }
- "input": Form input with a label and element (plain_text_input, static_select, multi_static_select, datepicker, timepicker, checkboxes, radio_buttons)
- "header": Large text header (plain_text only)
- "divider": Horizontal rule separator
- "image": Requires "image_url" and "alt_text"
- "context": Contextual info with "elements" array
- "actions": Interactive elements like buttons

Example modal:
{
  "type": "modal",
  "title": { "type": "plain_text", "text": "My Form" },
  "submit": { "type": "plain_text", "text": "Submit" },
  "close": { "type": "plain_text", "text": "Cancel" },
  "blocks": [
    {
      "type": "input",
      "block_id": "input_1",
      "label": { "type": "plain_text", "text": "Name" },
      "element": { "type": "plain_text_input", "action_id": "name_input" }
    }
  ]
}

You can reference workflow variables using angle brackets, e.g., <blockName.output>.
Do not include any explanations, markdown formatting, or other text outside the JSON object.`,
        placeholder: 'Describe the view/modal you want to create...',
      },
    },
    ...getTrigger('slack_webhook').subBlocks,
  ],
  tools: {
    access: [
      'slack_message',
      'slack_ephemeral_message',
      'slack_canvas',
      'slack_message_reader',
      'slack_get_message',
      'slack_get_thread',
      'slack_get_thread_replies',
      'slack_get_channel_history',
      'slack_get_permalink',
      'slack_set_status',
      'slack_set_title',
      'slack_set_suggested_prompts',
      'slack_list_channels',
      'slack_get_user_channels',
      'slack_list_members',
      'slack_list_users',
      'slack_get_user',
      'slack_download',
      'slack_update_message',
      'slack_delete_message',
      'slack_add_reaction',
      'slack_search_all',
      'slack_remove_reaction',
      'slack_get_channel_info',
      'slack_get_user_presence',
      'slack_edit_canvas',
      'slack_create_channel_canvas',
      'slack_get_canvas',
      'slack_list_canvases',
      'slack_lookup_canvas_sections',
      'slack_delete_canvas',
      'slack_create_conversation',
      'slack_invite_to_conversation',
      'slack_open_view',
      'slack_update_view',
      'slack_push_view',
      'slack_publish_view',
      'slack_get_auth_user',
    ],
    config: {
      tool: (params) => {
        switch (params.operation) {
          case 'send':
            return 'slack_message'
          case 'ephemeral':
            return 'slack_ephemeral_message'
          case 'canvas':
            return 'slack_canvas'
          case 'read':
            return 'slack_message_reader'
          case 'get_message':
            return 'slack_get_message'
          case 'get_thread':
            return 'slack_get_thread'
          case 'get_thread_replies':
            return 'slack_get_thread_replies'
          case 'get_channel_history':
            return 'slack_get_channel_history'
          case 'get_permalink':
            return 'slack_get_permalink'
          case 'set_status':
            return 'slack_set_status'
          case 'set_title':
            return 'slack_set_title'
          case 'set_suggested_prompts':
            return 'slack_set_suggested_prompts'
          case 'list_channels':
            return 'slack_list_channels'
          case 'get_user_channels':
            return 'slack_get_user_channels'
          case 'list_members':
            return 'slack_list_members'
          case 'list_users':
            return 'slack_list_users'
          case 'get_user':
            return 'slack_get_user'
          case 'get_auth_user':
            return 'slack_get_auth_user'
          case 'download':
            return 'slack_download'
          case 'update':
            return 'slack_update_message'
          case 'delete':
            return 'slack_delete_message'
          case 'react':
            return 'slack_add_reaction'
          case 'search_all':
            return 'slack_search_all'
          case 'unreact':
            return 'slack_remove_reaction'
          case 'get_channel_info':
            return 'slack_get_channel_info'
          case 'get_user_presence':
            return 'slack_get_user_presence'
          case 'edit_canvas':
            return 'slack_edit_canvas'
          case 'create_channel_canvas':
            return 'slack_create_channel_canvas'
          case 'get_canvas':
            return 'slack_get_canvas'
          case 'list_canvases':
            return 'slack_list_canvases'
          case 'lookup_canvas_sections':
            return 'slack_lookup_canvas_sections'
          case 'delete_canvas':
            return 'slack_delete_canvas'
          case 'create_conversation':
            return 'slack_create_conversation'
          case 'invite_to_conversation':
            return 'slack_invite_to_conversation'
          case 'open_view':
            return 'slack_open_view'
          case 'update_view':
            return 'slack_update_view'
          case 'push_view':
            return 'slack_push_view'
          case 'publish_view':
            return 'slack_publish_view'
          default:
            throw new Error(`Invalid Slack operation: ${params.operation}`)
        }
      },
      params: (params) => {
        const {
          oauthCredential,
          authMethod,
          operation,
          destinationType,
          channel,
          dmUserId,
          messageFormat,
          text,
          title,
          content,
          limit,
          oldest,
          fromDate,
          toDate,
          dateRange,
          cursor,
          autoPaginate,
          includeThreads,
          maxThreads,
          maxRepliesPerThread,
          attachmentFiles,
          files,
          blocks,
          threadTs,
          ephemeralUser,
          updateTimestamp,
          updateText,
          deleteTimestamp,
          reactionTimestamp,
          emojiName,
          includePublic,
          includePrivate,
          includeDMs,
          includeGroupDMs,
          channelLimit,
          getUserChannelsCursor,
          listChannelsCursor,
          memberLimit,
          listMembersCursor,
          includeDeleted,
          userLimit,
          listUsersAutoPaginate,
          // listUsersCursor,
          userId,
          clientId,
          channelId,
          query,
          searchCount,
          searchPage,
          sortBy,
          sortDir,
          highlight,
          getMessageTimestamp,
          getThreadTimestamp,
          threadLimit,
          getThreadCursor,
          status,
          loadingMessages,
          assistantTitle,
          suggestedPrompts,
          promptsTitle,
          historyOldest,
          historyLatest,
          historyLimit,
          historyMaxPages,
          historyCursor,
          historyInclusive,
          includeNumMembers,
          presenceUserId,
          editCanvasId,
          canvasOperation,
          canvasContent,
          sectionId,
          canvasTitle,
          channelCanvasTitle,
          channelCanvasContent,
          getCanvasId,
          canvasListCount,
          canvasListPage,
          canvasListUser,
          canvasListTsFrom,
          canvasListTsTo,
          canvasListTeamId,
          lookupCanvasId,
          sectionCriteria,
          deleteCanvasId,
          conversationName,
          isPrivate,
          teamId,
          inviteUsers,
          inviteForce,
          viewTriggerId,
          viewInteractivityPointer,
          viewId,
          viewExternalId,
          viewHash,
          publishUserId,
          viewPayload,
          fileId,
          fileName,
          paginationCursor,
          ...rest
        } = params

        // Extract channel name for query building
        const channelName =
          typeof channelId === 'object' && channelId?.channel_name ? channelId.channel_name : ''

        console.log('[Slack Block] Channel extraction:', {
          channelId,
          channelIdType: typeof channelId,
          channelIdKeys: channelId && typeof channelId === 'object' ? Object.keys(channelId) : [],
          hasChannelName: !!(channelId && typeof channelId === 'object' && channelId.channel_name),
          channelName,
          channelNameType: typeof channelName,
        })

        // Normalize IDs for other uses
        const normalizedChannelId =
          typeof channelId === 'object' && channelId?.channel_id ? channelId.channel_id : channelId

        const isDM = destinationType === 'dm'
        const channelFromObject =
          typeof channelId === 'object' && channelId?.channel_id ? channelId.channel_id : ''
        const effectiveChannel = channel
          ? String(channel).trim()
          : channelFromObject
            ? String(channelFromObject).trim()
            : ''
        const effectiveUserId = dmUserId ? String(dmUserId).trim() : ''

        const dmSupportedOperations = ['send', 'read']

        const baseParams: Record<string, any> = {}

        if (isDM && dmSupportedOperations.includes(operation)) {
          baseParams.userId = effectiveUserId
        } else if (effectiveChannel) {
          baseParams.channel = effectiveChannel
        }

        // Handle authentication based on method
        // Always use the selected Slack OAuth credential; choose token type later.
        // - Sim Bot (oauth): uses bot token (accessToken) from the credential
        // - Custom Bot (bot_token): uses user token (idToken) from the credential
        baseParams.credential = oauthCredential
        baseParams.useUserToken = authMethod === 'bot_token'

        switch (operation) {
          case 'send': {
            baseParams.text = messageFormat === 'blocks' && !text ? ' ' : text
            if (threadTs) {
              baseParams.threadTs = threadTs
            }
            if (blocks) {
              baseParams.blocks = blocks
            }
            // files is the canonical param from attachmentFiles (basic) or files (advanced)
            const normalizedFiles = normalizeFileInput(files)
            if (normalizedFiles) {
              baseParams.files = normalizedFiles
            }
            break
          }

          case 'ephemeral': {
            baseParams.text = messageFormat === 'blocks' && !text ? ' ' : text
            baseParams.user = ephemeralUser ? String(ephemeralUser).trim() : ''
            if (threadTs) {
              baseParams.threadTs = threadTs
            }
            if (blocks) {
              baseParams.blocks = blocks
            }
            break
          }

          case 'canvas':
            baseParams.title = title
            baseParams.content = content
            break

          case 'read': {
            const parsedLimit = limit ? Number.parseInt(limit, 10) : 10
            if (Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
              throw new Error('Message limit must be between 1 and 200')
            }
            baseParams.limit = parsedLimit

            // Validate that only one date selection method is used
            const hasQuickDate = dateRange && dateRange.trim() !== ''
            const hasFromDate = fromDate && fromDate.trim() !== ''
            const hasToDate = toDate && toDate.trim() !== ''

            if (hasQuickDate && (hasFromDate || hasToDate)) {
              throw new Error(
                'Cannot select both quick date range and specific from/to dates. Please choose one method.'
              )
            }

            // Handle date range presets
            if (hasQuickDate) {
              const days = Number.parseInt(dateRange, 10)
              if (!Number.isNaN(days) && days > 0) {
                const now = new Date()

                if (days === 1) {
                  // For "Today": from start of today to end of today (in UTC)
                  const startOfToday = new Date(
                    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
                  )
                  const endOfToday = new Date(
                    Date.UTC(
                      now.getUTCFullYear(),
                      now.getUTCMonth(),
                      now.getUTCDate(),
                      23,
                      59,
                      59,
                      999
                    )
                  )

                  const oldestTimestamp = Math.floor(startOfToday.getTime() / 1000).toString()
                  const latestTimestamp = Math.floor(endOfToday.getTime() / 1000).toString()
                  baseParams.oldest = oldestTimestamp
                  baseParams.latest = latestTimestamp
                } else {
                  // For "Last X days": from X days ago to end of today (in UTC)
                  const oldestDate = new Date(now)
                  oldestDate.setUTCDate(now.getUTCDate() - days)
                  oldestDate.setUTCHours(0, 0, 0, 0) // Start of that day in UTC

                  const endOfToday = new Date(
                    Date.UTC(
                      now.getUTCFullYear(),
                      now.getUTCMonth(),
                      now.getUTCDate(),
                      23,
                      59,
                      59,
                      999
                    )
                  ) // End of today in UTC

                  const oldestTimestamp = Math.floor(oldestDate.getTime() / 1000).toString()
                  const latestTimestamp = Math.floor(endOfToday.getTime() / 1000).toString()
                  baseParams.oldest = oldestTimestamp
                  baseParams.latest = latestTimestamp
                }
              }
            } else if (hasFromDate || hasToDate) {
              // Handle date conversion to timestamps
              if (hasFromDate) {
                const fromDateObj = new Date(fromDate)
                // Set fromDate to start of that day to include all messages from the beginning of the day
                fromDateObj.setHours(0, 0, 0, 0)
                const fromTimestamp = Math.floor(fromDateObj.getTime() / 1000).toString()
                baseParams.oldest = fromTimestamp
              } else if (oldest) {
                baseParams.oldest = oldest
              }

              if (hasToDate) {
                const toDateObj = new Date(toDate)
                // Always set toDate to end of that day to include all messages from the entire day
                toDateObj.setHours(23, 59, 59, 999)
                const toTimestamp = Math.floor(toDateObj.getTime() / 1000).toString()
                baseParams.latest = toTimestamp
              }
            }

            console.log(`[Slack Block] cursor value: "${cursor}", type: ${typeof cursor}`)
            if (cursor && cursor.trim() !== '') {
              baseParams.cursor = cursor.trim()
              console.log(`[Slack Block] Setting baseParams.cursor to: "${cursor.trim()}"`)
            } else {
              console.log(`[Slack Block] No cursor value, not setting baseParams.cursor`)
            }

            const effectiveAutoPaginate =
              autoPaginate === undefined || autoPaginate === null
                ? true
                : autoPaginate === true || autoPaginate === 'true'
            const effectiveIncludeThreads =
              includeThreads === undefined || includeThreads === null
                ? true
                : includeThreads === true || includeThreads === 'true'
            baseParams.autoPaginate = effectiveAutoPaginate
            baseParams.includeThreads = effectiveIncludeThreads

            // Set maxThreads - default to 10 if includeThreads is true and maxThreads is not set
            if (maxThreads) {
              const parsedMaxThreads = Number.parseInt(maxThreads, 10)
              if (
                !Number.isNaN(parsedMaxThreads) &&
                parsedMaxThreads > 0 &&
                parsedMaxThreads <= 50
              ) {
                baseParams.maxThreads = parsedMaxThreads
              }
            } else if (effectiveIncludeThreads) {
              // Default maxThreads to 10 when includeThreads is true but maxThreads is not specified
              baseParams.maxThreads = 10
            }
            if (maxRepliesPerThread) {
              const parsedMaxReplies = Number.parseInt(maxRepliesPerThread, 10)
              if (
                !Number.isNaN(parsedMaxReplies) &&
                parsedMaxReplies > 0 &&
                parsedMaxReplies <= 200
              ) {
                baseParams.maxRepliesPerThread = parsedMaxReplies
              }
            } else if (effectiveIncludeThreads) {
              // Default maxRepliesPerThread to 100 when includeThreads is true but maxRepliesPerThread is not specified
              baseParams.maxRepliesPerThread = 100
            }

            break
          }

          case 'get_message':
            baseParams.timestamp = getMessageTimestamp
            break

          case 'get_thread': {
            baseParams.threadTs = getThreadTimestamp
            if (threadLimit) {
              const parsedLimit = Number.parseInt(threadLimit, 10)
              if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
                baseParams.limit = Math.min(parsedLimit, 200)
              }
            }
            if (getThreadCursor?.trim()) {
              baseParams.cursor = getThreadCursor.trim()
            }
            break
          }

          case 'set_status': {
            baseParams.threadTs = getThreadTimestamp
            baseParams.status = status ?? ''
            if (loadingMessages) {
              baseParams.loadingMessages = loadingMessages
            }
            break
          }

          case 'set_title': {
            baseParams.threadTs = getThreadTimestamp
            baseParams.title = assistantTitle
            break
          }

          case 'set_suggested_prompts': {
            baseParams.threadTs = getThreadTimestamp
            baseParams.prompts = suggestedPrompts
            if (promptsTitle) {
              baseParams.promptsTitle = promptsTitle
            }
            break
          }

          case 'get_permalink': {
            baseParams.messageTs = getMessageTimestamp
            break
          }

          case 'get_channel_history':
          case 'get_thread_replies': {
            if (operation === 'get_thread_replies') {
              baseParams.threadTs = getThreadTimestamp
            }
            if (historyOldest) {
              baseParams.oldest = String(historyOldest).trim()
            }
            if (historyLatest) {
              baseParams.latest = String(historyLatest).trim()
            }
            if (historyLimit) {
              const parsedLimit = Number.parseInt(historyLimit, 10)
              if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
                baseParams.limit = parsedLimit
              }
            }
            if (historyMaxPages) {
              const parsedMaxPages = Number.parseInt(historyMaxPages, 10)
              if (!Number.isNaN(parsedMaxPages) && parsedMaxPages > 0) {
                baseParams.maxPages = parsedMaxPages
              }
            }
            if (historyCursor) {
              baseParams.cursor = String(historyCursor).trim()
            }
            baseParams.inclusive = historyInclusive === 'true'
            break
          }
          case 'list_channels':
          case 'get_user_channels': {
            // includePublic is only exposed in the UI for get_user_channels;
            // list_channels always includes public channels (there is no
            // dropdown for it there, so includePublic is undefined and the
            // tool falls back to its default "include").
            baseParams.includePublic = includePublic !== 'false'

            baseParams.includePrivate = includePrivate !== 'false'
            if (includeDMs === 'true' || includeDMs === 'false') {
              baseParams.includeDMs = includeDMs === 'true'
            }
            if (includeGroupDMs === 'true' || includeGroupDMs === 'false') {
              baseParams.includeGroupDMs = includeGroupDMs === 'true'
            }
            baseParams.excludeArchived = true
            baseParams.limit = channelLimit ? Number.parseInt(channelLimit, 10) : 100
            if (paginationCursor) {
              baseParams.cursor = String(paginationCursor).trim()
            }
            break
          }

          case 'list_members': {
            baseParams.limit = memberLimit ? Number.parseInt(memberLimit, 10) : 100
            if (paginationCursor) {
              baseParams.cursor = String(paginationCursor).trim()
            }
            break
          }

          case 'list_users': {
            baseParams.includeDeleted = includeDeleted === 'true'
            baseParams.limit = userLimit ? Number.parseInt(userLimit, 10) : 100
            baseParams.autoPaginate =
              listUsersAutoPaginate === undefined || listUsersAutoPaginate === null
                ? true
                : listUsersAutoPaginate === true || listUsersAutoPaginate === 'true'
            if (paginationCursor) {
              baseParams.cursor = String(paginationCursor).trim()
            }
            break
          }

          case 'get_user':
            baseParams.userId = userId
            break

          case 'get_auth_user':
            // No extra inputs — only the access/bot token (already in baseParams).
            break

          case 'download': {
            baseParams.fileId = fileId
            if (fileName) {
              baseParams.fileName = fileName
            }
            break
          }

          case 'update':
            baseParams.timestamp = updateTimestamp
            baseParams.text = messageFormat === 'blocks' && !updateText ? ' ' : updateText
            if (blocks) {
              baseParams.blocks = blocks
            }
            break

          case 'delete':
            baseParams.timestamp = deleteTimestamp
            break

          case 'react':
          case 'unreact':
            baseParams.timestamp = reactionTimestamp
            baseParams.name = emojiName
            break

          case 'search_all': {
            console.log('[Slack Block] ENTERED search_all case:', {
              operation: params.operation,
              query,
              channelId,
              channelName,
            })

            if (!query || query.trim() === '') {
              throw new Error('Search query is required for search all operation')
            }

            // Build query with channel filter if channel is selected
            let finalQuery = query
            console.log('[Slack Block] Before query building:', {
              originalQuery: query,
              channelName,
              channelNameTruthy: !!channelName,
              channelNameLength: channelName?.length || 0,
            })

            if (channelName) {
              finalQuery = `in:${channelName} ${query}`
              console.log('[Slack Block] Applied channel filter:', {
                channelName,
                finalQuery,
              })
            } else {
              console.log('[Slack Block] No channel filter applied - channelName is empty')
            }

            console.log('[Slack Block] Final query result:', {
              originalQuery: query,
              finalQuery,
              queryLength: finalQuery.length,
            })

            baseParams.query = finalQuery
            console.log('[Slack Block] SET baseParams.query to:', baseParams.query)
            if (searchCount) {
              const parsedCount = Number.parseInt(searchCount, 10)
              if (Number.isNaN(parsedCount) || parsedCount < 1 || parsedCount > 100) {
                throw new Error('Search count must be between 1 and 100')
              }
              baseParams.count = parsedCount
            } else {
              baseParams.count = 50 // default
            }
            if (searchPage) {
              const parsedPage = Number.parseInt(searchPage, 10)
              if (Number.isNaN(parsedPage) || parsedPage < 1) {
                throw new Error('Search page must be 1 or greater')
              }
              baseParams.page = parsedPage
            } else {
              baseParams.page = 1 // default
            }

            // Handle sort parameters
            baseParams.sort = sortBy || 'timestamp'
            baseParams.sort_dir = sortDir || 'desc'
            baseParams.highlight = highlight !== 'false' // default to true
            // For search_all, use user token instead of bot token (handled by useUserToken flag).
            if (!oauthCredential) {
              throw new Error('Slack account credential is required for Search All operation')
            }
            baseParams.credential = oauthCredential
            baseParams.useUserToken = true // Ensure user token is used for Search All
            break
          }
          case 'get_channel_info':
            baseParams.includeNumMembers = includeNumMembers !== 'false'
            break

          case 'get_user_presence':
            baseParams.userId = presenceUserId
            break

          case 'edit_canvas':
            baseParams.canvasId = editCanvasId
            baseParams.operation = canvasOperation
            if (canvasContent) {
              baseParams.content = canvasContent
            }
            if (sectionId) {
              baseParams.sectionId = sectionId
            }
            if (canvasTitle) {
              baseParams.title = canvasTitle
            }
            break

          case 'create_channel_canvas':
            if (channelCanvasTitle) {
              baseParams.title = channelCanvasTitle
            }
            if (channelCanvasContent) {
              baseParams.content = channelCanvasContent
            }
            break

          case 'get_canvas':
            baseParams.canvasId = getCanvasId
            break

          case 'list_canvases':
            if (canvasListCount) {
              const parsedCount = Number.parseInt(canvasListCount, 10)
              if (!Number.isNaN(parsedCount) && parsedCount > 0) {
                baseParams.count = parsedCount
              }
            }
            if (canvasListPage) {
              const parsedPage = Number.parseInt(canvasListPage, 10)
              if (!Number.isNaN(parsedPage) && parsedPage > 0) {
                baseParams.page = parsedPage
              }
            }
            if (canvasListUser) {
              baseParams.user = String(canvasListUser).trim()
            }
            if (canvasListTsFrom) {
              baseParams.tsFrom = String(canvasListTsFrom).trim()
            }
            if (canvasListTsTo) {
              baseParams.tsTo = String(canvasListTsTo).trim()
            }
            if (canvasListTeamId) {
              baseParams.teamId = String(canvasListTeamId).trim()
            }
            break

          case 'lookup_canvas_sections':
            baseParams.canvasId = lookupCanvasId
            baseParams.criteria = sectionCriteria
            break

          case 'delete_canvas':
            baseParams.canvasId = deleteCanvasId
            break

          case 'create_conversation':
            baseParams.name = conversationName
            baseParams.isPrivate = isPrivate === 'true'
            if (teamId) {
              baseParams.teamId = teamId
            }
            break

          case 'invite_to_conversation':
            baseParams.users = inviteUsers
            if (inviteForce === 'true') {
              baseParams.force = true
            }
            break

          case 'open_view':
            baseParams.triggerId = viewTriggerId
            if (viewInteractivityPointer) {
              baseParams.interactivityPointer = viewInteractivityPointer
            }
            baseParams.view = viewPayload
            break

          case 'update_view': {
            const trimmedViewId = viewId ? String(viewId).trim() : ''
            const trimmedExternalId = viewExternalId ? String(viewExternalId).trim() : ''
            if (!trimmedViewId && !trimmedExternalId) {
              throw new Error('update_view requires either View ID or External ID')
            }
            if (trimmedViewId) {
              baseParams.viewId = trimmedViewId
            }
            if (trimmedExternalId) {
              baseParams.externalId = trimmedExternalId
            }
            if (viewHash) {
              baseParams.hash = viewHash
            }
            baseParams.view = viewPayload
            break
          }

          case 'push_view':
            baseParams.triggerId = viewTriggerId
            if (viewInteractivityPointer) {
              baseParams.interactivityPointer = viewInteractivityPointer
            }
            baseParams.view = viewPayload
            break

          case 'publish_view':
            baseParams.userId = publishUserId
            if (viewHash) {
              baseParams.hash = viewHash
            }
            baseParams.view = viewPayload
            break
        }

        return baseParams
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Operation to perform' },
    messageFormat: { type: 'string', description: 'Message format: text or blocks' },
    authMethod: { type: 'string', description: 'Authentication method' },
    destinationType: { type: 'string', description: 'Destination type (channel or dm)' },
    oauthCredential: { type: 'string', description: 'Slack access token' },
    useUserToken: {
      type: 'boolean',
      description: 'Use user token (id_token) instead of bot token',
    },
    channel: { type: 'string', description: 'Channel identifier (canonical param)' },
    dmUserId: { type: 'string', description: 'User ID for DM recipient (canonical param)' },
    text: { type: 'string', description: 'Message text' },
    files: { type: 'array', description: 'Files to attach (canonical param)' },
    title: { type: 'string', description: 'Canvas title' },
    content: { type: 'string', description: 'Canvas content' },
    limit: { type: 'string', description: 'Message limit' },
    oldest: { type: 'string', description: 'Oldest timestamp' },
    fromDate: { type: 'string', description: 'From date (YYYY-MM-DD)' },
    toDate: { type: 'string', description: 'To date (YYYY-MM-DD)' },
    dateRange: {
      type: 'string',
      description: 'Quick date range preset (1, 7, 14, or 30 days)',
    },
    cursor: { type: 'string', description: 'Pagination cursor from previous response' },
    autoPaginate: { type: 'boolean', description: 'Auto-paginate when cursor is provided' },
    includeThreads: {
      type: 'boolean',
      description: 'Include thread replies for messages that have threads',
    },
    maxThreads: { type: 'string', description: 'Maximum number of threads to fetch replies for' },
    maxRepliesPerThread: {
      type: 'string',
      description: 'Maximum number of replies to fetch per thread',
    },
    fileId: { type: 'string', description: 'File ID to download' },
    fileName: { type: 'string', description: 'File name override for download (canonical param)' },
    // Update/Delete/React operation inputs
    updateTimestamp: { type: 'string', description: 'Message timestamp for update' },
    updateText: { type: 'string', description: 'New text for update' },
    deleteTimestamp: { type: 'string', description: 'Message timestamp for delete' },
    reactionTimestamp: { type: 'string', description: 'Message timestamp for reaction' },
    emojiName: { type: 'string', description: 'Emoji name for reaction' },
    // Search All operation inputs
    clientId: { type: 'string', description: 'Client/workspace ID for filtering search results' },
    channelId: { type: 'string', description: 'Channel ID for filtering search results' },
    query: { type: 'string', description: 'Search query string' },
    searchCount: { type: 'string', description: 'Number of results to return (1-100)' },
    searchPage: { type: 'string', description: 'Page number for pagination' },
    sortBy: { type: 'string', description: 'Sort results by (timestamp, score, relevance)' },
    sortDir: { type: 'string', description: 'Sort direction (asc, desc)' },
    highlight: { type: 'boolean', description: 'Highlight search terms in results' },
    timestamp: { type: 'string', description: 'Message timestamp' },
    name: { type: 'string', description: 'Emoji name' },
    threadTs: { type: 'string', description: 'Thread timestamp' },
    thread_ts: { type: 'string', description: 'Thread timestamp for reply' },
    // List Channels inputs
    includePublic: {
      type: 'string',
      description: 'Include public channels (true/false). Get User Channels only.',
    },
    includePrivate: { type: 'string', description: 'Include private channels (true/false)' },
    includeDMs: {
      type: 'string',
      description: 'Include 1:1 direct messages (true/false). Requires im:read scope.',
    },
    includeGroupDMs: {
      type: 'string',
      description: 'Include group DMs / mpims (true/false). Requires mpim:read scope.',
    },
    channelLimit: { type: 'string', description: 'Maximum number of channels to return' },
    getUserChannelsCursor: {
      type: 'string',
      description:
        'Pagination cursor for Get User Channels (maps to Slack users.conversations cursor)',
    },
    listChannelsCursor: {
      type: 'string',
      description:
        'Optional pagination cursor for List Channels (maps to Slack conversations.list cursor)',
    },
    // List Members inputs
    memberLimit: { type: 'string', description: 'Maximum number of members to return' },
    listMembersCursor: {
      type: 'string',
      description: 'Optional pagination cursor for List Channel Members (conversations.members)',
    },
    // List Users inputs
    includeDeleted: { type: 'string', description: 'Include deactivated users (true/false)' },
    userLimit: { type: 'string', description: 'Maximum number of users to return' },
    // Shared pagination input
    paginationCursor: {
      type: 'string',
      description: 'Pagination cursor (next_cursor) for list_channels/list_members/list_users',
    },
    // Ephemeral message inputs
    ephemeralUser: { type: 'string', description: 'User ID who will see the ephemeral message' },
    blocks: { type: 'json', description: 'Block Kit layout blocks as a JSON array' },
    // Get User inputs
    userId: { type: 'string', description: 'User ID to look up' },
    // Get Message inputs
    getMessageTimestamp: { type: 'string', description: 'Message timestamp to retrieve' },
    // Get Thread inputs
    getThreadTimestamp: { type: 'string', description: 'Thread timestamp to retrieve' },
    threadLimit: {
      type: 'string',
      description: 'Maximum number of messages to return from thread',
    },
    getThreadCursor: {
      type: 'string',
      description: 'Optional pagination cursor for Get Thread (conversations.replies)',
    },
    // Set Assistant Status inputs
    status: { type: 'string', description: 'Status text to display (empty clears the status)' },
    loadingMessages: {
      type: 'json',
      description: 'Optional array of phrases to animate as a loading indicator (max 10)',
    },
    // Set Assistant Title inputs
    assistantTitle: { type: 'string', description: 'Title to display for the assistant thread' },
    // Set Suggested Prompts inputs
    suggestedPrompts: {
      type: 'json',
      description: 'Array of { title, message } prompt objects (max 4)',
    },
    promptsTitle: { type: 'string', description: 'Optional heading for the prompt list' },
    // Get Channel History / Get Thread Replies inputs
    historyOldest: {
      type: 'string',
      description: 'Only include messages after this Unix timestamp',
    },
    historyLatest: {
      type: 'string',
      description: 'Only include messages before this Unix timestamp',
    },
    historyLimit: { type: 'string', description: 'Messages to request per page (max 999)' },
    historyMaxPages: { type: 'string', description: 'Maximum number of pages to fetch' },
    historyCursor: { type: 'string', description: 'Pagination cursor to resume from' },
    historyInclusive: {
      type: 'string',
      description: 'Include messages matching oldest/latest (true/false)',
    },
    // Get Channel Info inputs
    includeNumMembers: { type: 'string', description: 'Include member count (true/false)' },
    // Get User Presence inputs
    presenceUserId: { type: 'string', description: 'User ID to check presence for' },
    // Edit Canvas inputs
    editCanvasId: { type: 'string', description: 'Canvas ID to edit' },
    canvasOperation: { type: 'string', description: 'Canvas edit operation' },
    canvasContent: { type: 'string', description: 'Markdown content for canvas edit' },
    sectionId: { type: 'string', description: 'Canvas section ID to target' },
    canvasTitle: { type: 'string', description: 'New canvas title for rename' },
    // Create Channel Canvas inputs
    channelCanvasTitle: { type: 'string', description: 'Title for channel canvas' },
    channelCanvasContent: { type: 'string', description: 'Content for channel canvas' },
    // Canvas management inputs
    getCanvasId: { type: 'string', description: 'Canvas ID to retrieve' },
    canvasListCount: { type: 'string', description: 'Maximum number of canvases to return' },
    canvasListPage: { type: 'string', description: 'Canvas list page number' },
    canvasListUser: { type: 'string', description: 'Optional canvas creator user filter' },
    canvasListTsFrom: {
      type: 'string',
      description: 'Filter canvases created after this timestamp',
    },
    canvasListTsTo: {
      type: 'string',
      description: 'Filter canvases created before this timestamp',
    },
    canvasListTeamId: { type: 'string', description: 'Encoded team ID for org tokens' },
    lookupCanvasId: { type: 'string', description: 'Canvas ID to search for sections' },
    sectionCriteria: { type: 'json', description: 'Canvas section lookup criteria' },
    deleteCanvasId: { type: 'string', description: 'Canvas ID to delete' },
    // Create Conversation inputs
    conversationName: { type: 'string', description: 'Name for the new channel' },
    isPrivate: { type: 'string', description: 'Create as private channel (true/false)' },
    teamId: { type: 'string', description: 'Encoded team ID for org tokens' },
    // Invite to Conversation inputs
    inviteUsers: { type: 'string', description: 'Comma-separated user IDs to invite' },
    inviteForce: { type: 'string', description: 'Skip invalid users (true/false)' },
    // View operation inputs
    viewTriggerId: { type: 'string', description: 'Trigger ID from interaction payload' },
    viewInteractivityPointer: {
      type: 'string',
      description: 'Alternative to trigger_id for posting to user',
    },
    viewId: { type: 'string', description: 'Unique view identifier for update' },
    viewExternalId: {
      type: 'string',
      description: 'Developer-set unique identifier for update (max 255 chars)',
    },
    viewHash: { type: 'string', description: 'View state hash for race condition protection' },
    publishUserId: {
      type: 'string',
      description: 'User ID to publish Home tab view to',
    },
    viewPayload: { type: 'json', description: 'View payload object with type, title, and blocks' },
  },
  outputs: {
    // slack_message outputs (send operation)
    message: {
      type: 'json',
      description:
        'Complete message object with all properties: ts, text, user, channel, reactions, threads, files, attachments, blocks, stars, pins, and edit history',
    },
    // Legacy properties for send operation (backward compatibility)
    ts: { type: 'string', description: 'Message timestamp returned by Slack API' },
    channel: { type: 'string', description: 'Channel identifier where message was sent' },
    fileCount: {
      type: 'number',
      description: 'Number of files uploaded (when files are attached)',
    },
    files: { type: 'file[]', description: 'Files attached to the message' },

    // slack_ephemeral_message outputs (ephemeral operation)
    messageTs: {
      type: 'string',
      description: 'Timestamp of the ephemeral message (cannot be used to update or delete)',
    },

    // slack_canvas outputs
    canvas_id: { type: 'string', description: 'Canvas identifier for created canvases' },
    title: { type: 'string', description: 'Canvas title' },
    canvas: {
      type: 'json',
      description: 'Canvas file metadata returned by Slack',
    },
    canvases: {
      type: 'json',
      description: 'Array of canvas file objects returned by Slack',
    },
    paging: {
      type: 'json',
      description: 'Pagination information for listed canvases',
    },
    sections: {
      type: 'json',
      description: 'Canvas section IDs returned by Slack section lookup',
    },
    ok: {
      type: 'boolean',
      description: 'Whether Slack completed the canvas operation successfully',
    },

    // slack_message_reader outputs (read operation)
    messages: {
      type: 'json',
      description:
        'Array of message objects with comprehensive properties: text, user, timestamp, reactions, threads, files, attachments, blocks, stars, pins, and edit history',
      condition: {
        field: 'operation',
        value: 'read',
      },
    },
    totalPages: {
      type: 'number',
      description: 'Total number of pages fetched (when auto-pagination is enabled)',
      condition: {
        field: 'operation',
        value: 'read',
      },
    },
    totalMessages: {
      type: 'number',
      description: 'Total number of messages collected (when auto-pagination is enabled)',
      condition: {
        field: 'operation',
        value: 'read',
      },
    },
    paginationInfo: {
      type: 'json',
      description: 'Pagination metadata including continuation cursor if limits were reached',
      condition: {
        field: 'operation',
        value: 'read',
      },
    },

    // slack_get_thread outputs (get_thread operation)
    parentMessage: {
      type: 'json',
      description: 'The thread parent message with all properties',
    },
    replies: {
      type: 'json',
      description: 'Array of reply messages in the thread (excluding the parent)',
    },
    replyCount: {
      type: 'number',
      description: 'Number of replies returned in this response',
    },
    hasMore: {
      type: 'boolean',
      description: 'Whether there are more messages in the thread',
    },

    // slack_get_channel_history / slack_get_thread_replies pagination outputs
    pages: {
      type: 'number',
      description: 'Number of pages fetched during a paginated history/replies read',
    },
    threadTs: {
      type: 'string',
      description: 'Thread timestamp an assistant status/title/prompts op was set on',
    },

    // slack_get_permalink outputs (get_permalink operation)
    permalink: {
      type: 'string',
      description: 'Permalink URL to the message',
    },

    // slack_list_channels outputs (list_channels operation)
    channels: {
      type: 'json',
      description:
        'Array of channel objects with properties: id, name, is_private, is_archived, is_member, num_members, topic, purpose, created, creator',
    },
    count: {
      type: 'number',
      description: 'Total number of items returned (channels, members, or users)',
    },
    nextCursor: {
      type: 'string',
      description: 'Cursor for the next page (null when there are no more pages)',
    },

    // slack_list_members outputs (list_members operation)
    members: {
      type: 'json',
      description: 'Array of user IDs who are members of the channel',
    },

    // slack_list_users outputs (list_users operation)
    users: {
      type: 'json',
      description:
        'Array of user objects with properties: id, name, real_name, display_name, is_bot, is_admin, deleted, timezone, avatar, status_text, status_emoji',
    },

    // slack_get_user outputs (get_user operation)
    user: {
      type: 'json',
      description:
        'Detailed user object with properties: id, name, real_name, display_name, first_name, last_name, title, is_bot, is_admin, deleted, timezone, avatars, status',
    },

    // slack_get_auth_user outputs (get_auth_user operation)
    userId: { type: 'string', description: 'Slack user ID of the token owner (e.g., U1234567890)' },
    teamId: {
      type: 'string',
      description: 'Slack workspace/team ID (e.g., T0123456789)',
    },
    team: { type: 'string', description: 'Slack workspace/team name' },
    url: { type: 'string', description: 'Workspace URL (e.g., https://acme.slack.com/)' },
    botId: {
      type: 'string',
      description: 'Bot user ID — present only when the token is a bot token (xoxb-)',
    },
    appId: {
      type: 'string',
      description: 'Slack app ID associated with the token, when applicable',
    },
    isEnterpriseInstall: {
      type: 'boolean',
      description: 'Whether the token belongs to an Enterprise Grid org-level install',
    },
    enterpriseId: {
      type: 'string',
      description: 'Enterprise Grid org ID, when isEnterpriseInstall is true',
    },

    // slack_download outputs
    file: {
      type: 'file',
      description: 'Downloaded file stored in execution files',
    },

    // slack_update_message outputs (update operation)
    content: { type: 'string', description: 'Success message for update operation' },
    metadata: {
      type: 'json',
      description: 'Updated message metadata (legacy, use message object instead)',
    },

    // slack_get_channel_info outputs (get_channel_info operation)
    channelInfo: {
      type: 'json',
      description:
        'Detailed channel object with properties: id, name, is_private, is_archived, is_member, num_members, topic, purpose, created, creator',
    },

    // slack_get_user_presence outputs (get_user_presence operation)
    presence: {
      type: 'string',
      description: 'User presence status: "active" or "away"',
    },
    online: {
      type: 'boolean',
      description:
        'Whether user has an active client connection (only available when checking own presence)',
    },
    autoAway: {
      type: 'boolean',
      description:
        'Whether user was automatically set to away (only available when checking own presence)',
    },
    manualAway: {
      type: 'boolean',
      description:
        'Whether user manually set themselves as away (only available when checking own presence)',
    },
    connectionCount: {
      type: 'number',
      description: 'Total number of active connections (only available when checking own presence)',
    },
    lastActivity: {
      type: 'number',
      description:
        'Unix timestamp of last detected activity (only available when checking own presence)',
    },

    // View operation outputs (open_view, update_view, push_view, publish_view)
    view: {
      type: 'json',
      description:
        'View object with properties: id, team_id, type, title, submit, close, blocks, private_metadata, callback_id, external_id, state, hash, clear_on_close, notify_on_close, root_view_id, previous_view_id, app_id, bot_id',
    },

    // slack_invite_to_conversation outputs (invite_to_conversation operation)
    errors: {
      type: 'json',
      description:
        'Array of per-user error objects when force is true and some invitations failed (user, ok, error)',
    },

    // Trigger outputs (when used as webhook trigger)
    event_type: { type: 'string', description: 'Type of Slack event that triggered the workflow' },
    subtype: {
      type: 'string',
      description:
        'Message subtype (e.g., channel_join, channel_leave, bot_message). Null for regular user messages',
    },
    channel_name: { type: 'string', description: 'Human-readable channel name' },
    channel_type: {
      type: 'string',
      description: 'Type of channel (e.g., channel, group, im, mpim)',
    },
    user_name: { type: 'string', description: 'Username who triggered the event' },
    bot_id: {
      type: 'string',
      description: 'Bot ID if the message was sent by a bot. Null for human users',
    },
    timestamp: { type: 'string', description: 'Message timestamp from the triggering event' },
    thread_ts: {
      type: 'string',
      description: 'Parent thread timestamp (if message is in a thread)',
    },
    team_id: { type: 'string', description: 'Slack workspace/team ID' },
    event_id: { type: 'string', description: 'Unique event identifier for the trigger' },
    // Search All operation outputs
    searchResults: {
      type: 'json',
      description: 'Search results containing messages and files matching the query',
      condition: {
        field: 'operation',
        value: 'search_all',
      },
    },
    total: {
      type: 'number',
      description: 'Total number of results found',
      condition: {
        field: 'operation',
        value: 'search_all',
      },
    },
    page: {
      type: 'number',
      description: 'Current page number',
      condition: {
        field: 'operation',
        value: 'search_all',
      },
    },
  },
  // New: Trigger capabilities
  triggers: {
    enabled: true,
    available: ['slack_webhook'],
  },
}

export const SlackBlockMeta = {
  tags: ['messaging', 'webhooks', 'automation'],
  url: 'https://slack.com',
  templates: [
    {
      icon: SlackIcon,
      title: 'Slack Q&A bot',
      prompt:
        'Create a knowledge base connected to my Notion workspace so it stays synced with my company wiki. Then build a workflow that monitors Slack channels for questions and answers them using the knowledge base with source citations.',
      modules: ['knowledge-base', 'agent', 'workflows'],
      category: 'support',
      tags: ['support', 'communication', 'team'],
      alsoIntegrations: ['notion'],
    },
    {
      icon: Table,
      title: 'Churn risk detector',
      prompt:
        'Create a workflow that monitors customer activity — support ticket frequency, response sentiment, usage patterns — scores each account for churn risk in a table, and triggers a Slack alert to the account team when a customer crosses the risk threshold.',
      modules: ['tables', 'scheduled', 'agent', 'workflows'],
      category: 'support',
      tags: ['support', 'sales', 'monitoring', 'analysis'],
    },
    {
      icon: LinearIcon,
      title: 'Incident postmortem writer',
      prompt:
        'Create a workflow that when triggered after an incident, pulls the Slack thread from the incident channel, gathers relevant Sentry errors and deployment logs, and drafts a structured postmortem with timeline, root cause, and action items.',
      modules: ['agent', 'files', 'workflows'],
      category: 'engineering',
      tags: ['engineering', 'devops', 'analysis'],
      alsoIntegrations: ['sentry'],
    },
    {
      icon: GreptileIcon,
      title: 'Slack code Q&A bot',
      prompt:
        'Build a workflow that monitors a Slack channel for code questions, routes them to Greptile against the relevant repository, and replies in-thread with the answer and the cited files so the team gets quick, sourced engineering answers.',
      modules: ['agent', 'workflows'],
      category: 'engineering',
      tags: ['engineering', 'communication', 'team'],
      alsoIntegrations: ['greptile'],
    },
    {
      icon: SlackIcon,
      title: 'Slack knowledge search',
      prompt:
        'Create a knowledge base connected to my Slack workspace so all channel conversations and threads are automatically synced and searchable. Then build an agent I can ask things like "what did the team decide about the launch date?" or "what was the outcome of the design review?" and get answers with links to the original messages.',
      modules: ['knowledge-base', 'agent'],
      category: 'productivity',
      tags: ['team', 'research', 'communication'],
    },
    {
      icon: File,
      title: 'Automated narrative report',
      prompt:
        'Build a scheduled workflow that pulls key data from my tables every week, analyzes trends and anomalies, and writes a narrative report — not just charts and numbers, but written insights explaining what changed, why it matters, and what to do next. Save it as a document and send a summary to Slack.',
      modules: ['tables', 'scheduled', 'agent', 'files', 'workflows'],
      category: 'productivity',
      tags: ['founder', 'reporting', 'analysis'],
    },
    {
      icon: BookOpen,
      title: 'Email digest curator',
      prompt:
        'Create a scheduled daily workflow that searches the web for the latest articles, papers, and news on topics I care about, picks the top 5 most relevant pieces, writes a one-paragraph summary for each, and delivers a curated reading digest to my inbox or Slack.',
      modules: ['scheduled', 'agent', 'files', 'workflows'],
      category: 'productivity',
      tags: ['individual', 'research', 'content'],
    },
    {
      icon: ClipboardList,
      title: 'Daily standup summary',
      prompt:
        'Create a scheduled workflow that reads the #standup Slack channel each morning, summarizes what everyone is working on, identifies blockers, and posts a structured recap to a Google Docs document.',
      modules: ['scheduled', 'agent', 'files', 'workflows'],
      category: 'productivity',
      tags: ['team', 'reporting', 'communication'],
      alsoIntegrations: ['google_docs'],
    },
    {
      icon: Users,
      title: 'New hire onboarding automation',
      prompt:
        "Build a workflow that when triggered with a new hire's info, creates their accounts, sends a personalized welcome message in Slack, schedules 1:1s with their team on Google Calendar, shares relevant onboarding docs from the knowledge base, and tracks completion in a table.",
      modules: ['knowledge-base', 'tables', 'agent', 'workflows'],
      category: 'operations',
      tags: ['hr', 'automation', 'team'],
      alsoIntegrations: ['google_calendar'],
    },
    {
      icon: Table,
      title: 'Customer 360 view',
      prompt:
        'Create a comprehensive customer table that aggregates data from my CRM, support tickets, billing history, and product usage into a single unified view per customer. Schedule it to sync daily and send a Slack alert when any customer shows signs of trouble across multiple signals.',
      modules: ['tables', 'scheduled', 'agent', 'workflows'],
      category: 'operations',
      tags: ['founder', 'sales', 'support', 'enterprise', 'sync'],
    },
    {
      icon: GoogleTranslateIcon,
      title: 'Slack thread translator',
      prompt:
        'Build a workflow that watches international Slack channels, detects non-English messages, translates them with Google Translate, and posts the English version in a thread so the wider team stays in the loop.',
      modules: ['agent', 'workflows'],
      category: 'productivity',
      tags: ['team', 'communication'],
      alsoIntegrations: ['google_translate'],
    },

    {
      icon: SlackIcon,
      title: 'Archive Slack conversations to Notion',
      prompt:
        'Build a workflow that captures important Slack messages and threads and saves them as Notion pages or database entries, so meeting notes and decisions are always documented.',
      modules: ['agent', 'workflows'],
      category: 'productivity',
      tags: ['automation', 'communication'],
      featured: true,
      alsoIntegrations: ['notion'],
    },
  ],
  skills: [
    {
      name: 'daily-standup-summary',
      description:
        'Read a standup channel and post a structured recap of progress, plans, and blockers.',
      content:
        '# Daily Standup Summary\n\nRead the messages posted in the standup channel since the last working day and produce a concise team recap.\n\n## Steps\n1. Collect every standup update in the channel from the relevant window (skip bot and off-topic messages).\n2. Group the content into three sections:\n   - **Done** — what was completed.\n   - **Today** — what each person plans to work on.\n   - **Blockers** — anything waiting on someone else, with the owner @-mentioned.\n3. Call out anyone who did not post an update.\n\n## Output\nPost a single threaded message with the three sections as bullet lists. Keep each bullet to one line. Lead with blockers if any exist so they are not missed.',
    },
    {
      name: 'channel-catch-up',
      description: 'Summarize what happened in a busy Slack channel so you can catch up fast.',
      content:
        '# Channel Catch-Up\n\nSummarize recent activity in a Slack channel for someone who has been away.\n\n## Steps\n1. Pull messages from the requested time range (default: since the user was last active, or the last 24 hours).\n2. Cluster the conversation into topics or threads rather than listing messages chronologically.\n3. For each topic, capture: the gist, any decision reached, and open questions still unanswered.\n\n## Output\n- A 1-sentence TL;DR.\n- A bulleted list of topics, each with **Decision:** and **Open:** lines where relevant.\n- A final "Needs your input" list of items where the user was @-mentioned or a question is unresolved.\nLink to the source thread for each topic.',
    },
    {
      name: 'slack-question-responder',
      description:
        'Watch a channel for questions and draft sourced, in-thread answers from your knowledge base.',
      content:
        '# Slack Question Responder\n\nMonitor a support or help channel and answer incoming questions.\n\n## Steps\n1. Detect when a message is a genuine question (ends in a question mark, asks "how/where/can someone", or is a help request).\n2. Search the connected knowledge base for the answer.\n3. If a confident answer exists, draft a concise reply in the thread with the answer and a citation/link to the source.\n4. If no confident answer exists, do not guess — post a short note that a human should help, and @-mention the channel owner.\n\n## Guidance\n- Always reply in-thread, never in the main channel.\n- Keep answers to 2–4 sentences plus the source link.\n- Never fabricate links or policy.',
    },
    {
      name: 'escalate-urgent-messages',
      description:
        'Scan a channel for urgent or at-risk messages and surface them to the right owner.',
      content:
        '# Escalate Urgent Messages\n\nTriage a channel for messages that need fast attention.\n\n## Steps\n1. Review recent messages and classify each as **Urgent**, **Today**, or **FYI** based on signals like "blocked", "down", "ASAP", customer impact, or an unanswered direct ask.\n2. For Urgent items, identify the most likely owner from the channel topic or message context.\n3. Skip resolved threads (those with a ✅ reaction or a clear answer).\n\n## Output\nPost a short escalation summary listing only Urgent and Today items: each as a one-line description, an @-mention of the owner, and a link to the message. If nothing is urgent, say so in one line.',
    },
  ],
} as const satisfies BlockMeta
