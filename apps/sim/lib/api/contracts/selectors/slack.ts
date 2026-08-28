import { z } from 'zod'
import {
  credentialWorkflowBodySchema,
  definePostSelector,
} from '@/lib/api/contracts/selectors/shared'
import type { ContractJsonResponse } from '@/lib/api/contracts/types'

const slackChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  isPrivate: z.boolean(),
})
const slackUserSchema = z
  .object({ id: z.string(), name: z.string(), real_name: z.string() })
  .passthrough()

/**
 * Slack selector auth. `useUserToken` lists with the OAuth user token (`xoxp-`)
 * instead of the bot token — Custom Bot on a connected Slack account. Ignored
 * for pasted `xoxb-` tokens and reusable custom-bot credentials, which have no
 * user token.
 */
export const slackSelectorAuthBodySchema = credentialWorkflowBodySchema.extend({
  useUserToken: z.boolean().optional(),
})

export type SlackSelectorAuthBody = z.input<typeof slackSelectorAuthBodySchema>

export const slackUsersBodySchema = slackSelectorAuthBodySchema.extend({
  userId: z.string().optional(),
})

export const slackChannelsSelectorContract = definePostSelector(
  '/api/tools/slack/channels',
  slackSelectorAuthBodySchema,
  z.object({ channels: z.array(slackChannelSchema) })
)

export const slackUsersSelectorContract = definePostSelector(
  '/api/tools/slack/users',
  slackSelectorAuthBodySchema,
  z.object({ users: z.array(slackUserSchema) })
)

export const slackUserSelectorContract = definePostSelector(
  '/api/tools/slack/users',
  slackSelectorAuthBodySchema.extend({ userId: z.string().min(1) }),
  z.object({ user: slackUserSchema })
)

export const slackUsersListOrDetailContract = definePostSelector(
  '/api/tools/slack/users',
  slackUsersBodySchema,
  z.union([z.object({ user: slackUserSchema }), z.object({ users: z.array(slackUserSchema) })])
)

export type SlackChannelsSelectorResponse = ContractJsonResponse<
  typeof slackChannelsSelectorContract
>
export type SlackUsersSelectorResponse = ContractJsonResponse<typeof slackUsersSelectorContract>
export type SlackUserSelectorResponse = ContractJsonResponse<typeof slackUserSelectorContract>
