import { SlackIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { AuthMode } from '@/blocks/types'
import type { SlackResponse } from '@/tools/slack/types'
import { getTrigger } from '@/triggers'

export const SlackBlock: BlockConfig<SlackResponse> = {
  type: 'slack',
  name: 'Slack',
  description:
    'Send, update, delete messages, add reactions in Slack or trigger workflows from Slack events',
  authMode: AuthMode.OAuth,
  longDescription:
    'Integrate Slack into the workflow. Can send, update, and delete messages, create canvases, read messages, and add reactions. Requires Bot Token instead of OAuth in advanced mode. Can be used in trigger mode to trigger a workflow when a message is sent to a channel.',
  docsLink: 'https://docs.sim.ai/tools/slack',
  category: 'tools',
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
        { label: 'Create Canvas', id: 'canvas' },
        { label: 'Read Messages', id: 'read' },
        { label: 'List Channels', id: 'list_channels' },
        { label: 'List Channel Members', id: 'list_members' },
        { label: 'List Users', id: 'list_users' },
        { label: 'Get User Info', id: 'get_user' },
        { label: 'Download File', id: 'download' },
        { label: 'Update Message', id: 'update' },
        { label: 'Delete Message', id: 'delete' },
        { label: 'Add Reaction', id: 'react' },
        { label: 'Search All', id: 'search_all' },
      ],
      value: () => 'send',
    },
    {
      id: 'authMethod',
      title: 'Authentication Method',
      type: 'dropdown',
      options: [
        { label: 'Sim Bot', id: 'oauth' },
        { label: 'Custom Bot', id: 'bot_token' },
      ],
      value: () => 'oauth',
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
      serviceId: 'slack',
      requiredScopes: [
        'channels:read',
        'channels:history',
        'groups:read',
        'groups:history',
        'chat:write',
        'chat:write.public',
        'im:write',
        'im:history',
        'im:read',
        'users:read',
        'files:write',
        'files:read',
        'canvases:write',
        'reactions:write',
      ],
      placeholder: 'Select Slack workspace',
      dependsOn: ['authMethod'],
      condition: {
        field: 'authMethod',
        value: 'oauth',
      },
    },
    {
      id: 'botToken',
      title: 'Bot Token',
      type: 'short-input',
      placeholder: 'Enter your Slack bot token (xoxb-...)',
      password: true,
      dependsOn: ['authMethod'],
      condition: {
        field: 'authMethod',
        value: 'bot_token',
      },
    },
    {
      id: 'channel',
      title: 'Channel',
      type: 'channel-selector',
      canonicalParamId: 'channel',
      serviceId: 'slack',
      placeholder: 'Select Slack channel',
      mode: 'basic',
      dependsOn: { all: ['authMethod'], any: ['credential', 'botToken'] },
      condition: {
        field: 'operation',
        value: ['list_channels', 'list_users', 'get_user', 'search_all'],
        not: true,
        and: {
          field: 'destinationType',
          value: 'dm',
          not: true,
        },
      },
    },
    {
      id: 'manualChannel',
      title: 'Channel ID',
      type: 'short-input',
      canonicalParamId: 'channel',
      placeholder: 'Enter Slack channel ID (e.g., C1234567890)',
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: ['list_channels', 'list_users', 'get_user', 'search_all'],
        not: true,
        and: {
          field: 'destinationType',
          value: 'dm',
          not: true,
        },
      },
    },
    {
      id: 'dmUserId',
      title: 'User',
      type: 'user-selector',
      canonicalParamId: 'dmUserId',
      serviceId: 'slack',
      placeholder: 'Select Slack user',
      mode: 'basic',
      dependsOn: { all: ['authMethod'], any: ['credential', 'botToken'] },
      condition: {
        field: 'destinationType',
        value: 'dm',
      },
    },
    {
      id: 'manualDmUserId',
      title: 'User ID',
      type: 'short-input',
      canonicalParamId: 'dmUserId',
      placeholder: 'Enter Slack user ID (e.g., U1234567890)',
      mode: 'advanced',
      condition: {
        field: 'destinationType',
        value: 'dm',
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
        value: 'send',
      },
      dependsOn: ['credential', 'authMethod'],
      required: true,
    },
    {
      id: 'threadTs',
      title: 'Thread Timestamp',
      type: 'short-input',
      placeholder: 'Reply to thread (e.g., 1405894322.002768)',
      condition: {
        field: 'operation',
        value: 'send',
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
      type: 'date-input',
      placeholder: 'Select from date',
      condition: {
        field: 'operation',
        value: 'read',
      },
    },
    {
      id: 'toDate',
      title: 'To Date',
      type: 'date-input',
      placeholder: 'Select to date',
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
      defaultValue: false,
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
      defaultValue: false,
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
        value: 'list_channels',
      },
    },
    {
      id: 'channelLimit',
      title: 'Channel Limit',
      type: 'short-input',
      placeholder: '100',
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
      condition: {
        field: 'operation',
        value: 'list_users',
      },
    },
    // Get User specific fields
    {
      id: 'userId',
      title: 'User ID',
      type: 'short-input',
      placeholder: 'Enter Slack user ID (e.g., U1234567890)',
      condition: {
        field: 'operation',
        value: 'get_user',
      },
      required: true,
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
      },
      required: true,
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
        value: 'react',
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
        value: 'react',
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
    ...getTrigger('slack_webhook').subBlocks,
  ],
  tools: {
    access: [
      'slack_message',
      'slack_canvas',
      'slack_message_reader',
      'slack_list_channels',
      'slack_list_members',
      'slack_list_users',
      'slack_get_user',
      'slack_download',
      'slack_update_message',
      'slack_delete_message',
      'slack_add_reaction',
      'slack_search_all',
    ],
    config: {
      tool: (params) => {
        switch (params.operation) {
          case 'send':
            return 'slack_message'
          case 'canvas':
            return 'slack_canvas'
          case 'read':
            return 'slack_message_reader'
          case 'list_channels':
            return 'slack_list_channels'
          case 'list_members':
            return 'slack_list_members'
          case 'list_users':
            return 'slack_list_users'
          case 'get_user':
            return 'slack_get_user'
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
          default:
            throw new Error(`Invalid Slack operation: ${params.operation}`)
        }
      },
      params: (params) => {
        const {
          credential,
          authMethod,
          botToken,
          operation,
          destinationType,
          channel,
          manualChannel,
          dmUserId,
          manualDmUserId,
          text,
          title,
          content,
          limit,
          oldest,
          fromDate,
          toDate,
          cursor,
          autoPaginate,
          includeThreads,
          maxThreads,
          maxRepliesPerThread,
          attachmentFiles,
          files,
          threadTs,
          updateTimestamp,
          updateText,
          deleteTimestamp,
          reactionTimestamp,
          emojiName,
          includePrivate,
          channelLimit,
          memberLimit,
          includeDeleted,
          userLimit,
          userId,
          clientId,
          channelId,
          query,
          searchCount,
          searchPage,
          sortBy,
          sortDir,
          highlight,
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
        const effectiveChannel = (channel || manualChannel || channelFromObject || '').trim()
        const effectiveUserId = (dmUserId || manualDmUserId || '').trim()

        const noChannelOperations = ['list_channels', 'list_users', 'get_user']
        const dmSupportedOperations = ['send', 'read']

        if (isDM && dmSupportedOperations.includes(operation)) {
          if (!effectiveUserId) {
            throw new Error('User is required for DM operations.')
          }
        } else if (!effectiveChannel && !noChannelOperations.includes(operation)) {
          throw new Error('Channel is required.')
        }

        const baseParams: Record<string, any> = {}

        if (isDM && dmSupportedOperations.includes(operation)) {
          baseParams.userId = effectiveUserId
        } else if (effectiveChannel) {
          baseParams.channel = effectiveChannel
        }

        // Handle authentication based on method
        if (authMethod === 'bot_token') {
          if (!botToken) {
            throw new Error('Bot token is required when using bot token authentication')
          }
          baseParams.accessToken = botToken
        } else {
          // Default to OAuth
          if (!credential) {
            throw new Error('Slack account credential is required when using Sim Bot')
          }
          baseParams.credential = credential
        }

        switch (operation) {
          case 'send': {
            if (!text || text.trim() === '') {
              throw new Error('Message text is required for send operation')
            }

            // Text already contains mentions in <@USER_ID> format from mention-input
            baseParams.text = text
            if (threadTs) {
              baseParams.thread_ts = threadTs
            }
            const fileParam = attachmentFiles || files
            if (fileParam) {
              baseParams.files = fileParam
            }
            break
          }

          case 'canvas':
            if (!title || !content) {
              throw new Error('Title and content are required for canvas operation')
            }
            baseParams.title = title
            baseParams.content = content
            break

          case 'read': {
            const parsedLimit = limit ? Number.parseInt(limit, 10) : 10
            if (Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
              throw new Error('Message limit must be between 1 and 200')
            }
            baseParams.limit = parsedLimit

            // Handle date conversion to timestamps
            if (fromDate) {
              const fromTimestamp = Math.floor(new Date(fromDate).getTime() / 1000).toString()
              baseParams.oldest = fromTimestamp
            } else if (oldest) {
              baseParams.oldest = oldest
            }

            if (toDate) {
              let toDateObj = new Date(toDate)
              // If fromDate and toDate are the same day, set toDate to end of that day
              // to include all messages from the entire day
              if (fromDate && fromDate === toDate) {
                toDateObj.setHours(23, 59, 59, 999)
              }
              const toTimestamp = Math.floor(toDateObj.getTime() / 1000).toString()
              baseParams.latest = toTimestamp
            }

            console.log(`[Slack Block] cursor value: "${cursor}", type: ${typeof cursor}`)
            if (cursor && cursor.trim() !== '') {
              baseParams.cursor = cursor.trim()
              console.log(`[Slack Block] Setting baseParams.cursor to: "${cursor.trim()}"`)
            } else {
              console.log(`[Slack Block] No cursor value, not setting baseParams.cursor`)
            }

            baseParams.autoPaginate = autoPaginate
            baseParams.includeThreads = includeThreads
            if (maxThreads) {
              const parsedMaxThreads = Number.parseInt(maxThreads, 10)
              if (
                !Number.isNaN(parsedMaxThreads) &&
                parsedMaxThreads > 0 &&
                parsedMaxThreads <= 50
              ) {
                baseParams.maxThreads = parsedMaxThreads
              }
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
            }

            break
          }

          case 'list_channels': {
            baseParams.includePrivate = includePrivate !== 'false'
            baseParams.excludeArchived = true
            baseParams.limit = channelLimit ? Number.parseInt(channelLimit, 10) : 100
            break
          }

          case 'list_members': {
            baseParams.limit = memberLimit ? Number.parseInt(memberLimit, 10) : 100
            break
          }

          case 'list_users': {
            baseParams.includeDeleted = includeDeleted === 'true'
            baseParams.limit = userLimit ? Number.parseInt(userLimit, 10) : 100
            break
          }

          case 'get_user':
            if (!userId) {
              throw new Error('User ID is required for get user operation')
            }
            baseParams.userId = userId
            break

          case 'download': {
            const fileId = (rest as any).fileId
            const downloadFileName = (rest as any).downloadFileName
            if (!fileId) {
              throw new Error('File ID is required for download operation')
            }
            baseParams.fileId = fileId
            if (downloadFileName) {
              baseParams.fileName = downloadFileName
            }
            break
          }

          case 'update':
            if (!updateTimestamp || !updateText) {
              throw new Error('Timestamp and text are required for update operation')
            }
            baseParams.timestamp = updateTimestamp
            baseParams.text = updateText
            break

          case 'delete':
            if (!deleteTimestamp) {
              throw new Error('Timestamp is required for delete operation')
            }
            baseParams.timestamp = deleteTimestamp
            break

          case 'react':
            if (!reactionTimestamp || !emojiName) {
              throw new Error('Timestamp and emoji name are required for reaction operation')
            }
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
            // For search_all, use user token instead of bot token
            if (authMethod === 'bot_token') {
              throw new Error('Search All operation requires OAuth authentication with user token')
            }
            // Use credential for OAuth, but we'll need to get user token from idToken
            if (!credential) {
              throw new Error('Slack account credential is required for Search All operation')
            }
            baseParams.credential = credential
            baseParams.useUserToken = true // Flag to indicate user token should be used
            break
          }
        }

        return baseParams
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Operation to perform' },
    authMethod: { type: 'string', description: 'Authentication method' },
    destinationType: { type: 'string', description: 'Destination type (channel or dm)' },
    credential: { type: 'string', description: 'Slack access token' },
    botToken: { type: 'string', description: 'Bot token' },
    channel: { type: 'string', description: 'Channel identifier' },
    manualChannel: { type: 'string', description: 'Manual channel identifier' },
    dmUserId: { type: 'string', description: 'User ID for DM recipient (selector)' },
    manualDmUserId: { type: 'string', description: 'User ID for DM recipient (manual input)' },
    text: { type: 'string', description: 'Message text' },
    title: { type: 'string', description: 'Canvas title' },
    content: { type: 'string', description: 'Canvas content' },
    limit: { type: 'string', description: 'Message limit' },
    oldest: { type: 'string', description: 'Oldest timestamp' },
    fromDate: { type: 'string', description: 'From date (YYYY-MM-DD)' },
    toDate: { type: 'string', description: 'To date (YYYY-MM-DD)' },
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
    downloadFileName: { type: 'string', description: 'File name override for download' },
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
    includePrivate: { type: 'string', description: 'Include private channels (true/false)' },
    channelLimit: { type: 'string', description: 'Maximum number of channels to return' },
    // List Members inputs
    memberLimit: { type: 'string', description: 'Maximum number of members to return' },
    // List Users inputs
    includeDeleted: { type: 'string', description: 'Include deactivated users (true/false)' },
    userLimit: { type: 'string', description: 'Maximum number of users to return' },
    // Get User inputs
    userId: { type: 'string', description: 'User ID to look up' },
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

    // slack_canvas outputs
    canvas_id: { type: 'string', description: 'Canvas identifier for created canvases' },
    title: { type: 'string', description: 'Canvas title' },

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
    nextCursor: {
      type: 'string',
      description: 'Pagination cursor for next page of results',
      condition: {
        field: 'operation',
        value: 'read',
      },
    },
    hasMore: {
      type: 'boolean',
      description: 'Whether there are more messages available for pagination',
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

    // slack_download outputs
    file: {
      type: 'json',
      description: 'Downloaded file stored in execution files',
    },

    // slack_update_message outputs (update operation)
    content: { type: 'string', description: 'Success message for update operation' },
    metadata: {
      type: 'json',
      description: 'Updated message metadata (legacy, use message object instead)',
    },

    // Trigger outputs (when used as webhook trigger)
    event_type: { type: 'string', description: 'Type of Slack event that triggered the workflow' },
    channel_name: { type: 'string', description: 'Human-readable channel name' },
    user_name: { type: 'string', description: 'Username who triggered the event' },
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
