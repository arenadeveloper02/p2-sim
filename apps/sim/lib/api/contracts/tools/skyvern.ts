import { z } from 'zod'
import type {
  ContractBody,
  ContractBodyInput,
  ContractJsonResponse,
} from '@/lib/api/contracts/types'
import { defineRouteContract } from '@/lib/api/contracts/types'
import { nullableOptionalString, optionalString } from '@/lib/api/contracts/selectors/shared'

export const skyvernWorkflowOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export const skyvernWorkflowsBodySchema = z.object({
  apiKey: optionalString,
  baseUrl: optionalString,
  searchKey: optionalString,
  workflowId: nullableOptionalString,
})

export const skyvernWorkflowsResponseSchema = z.object({
  workflows: z.array(skyvernWorkflowOptionSchema),
})

export const skyvernWorkflowsContract = defineRouteContract({
  method: 'POST',
  path: '/api/tools/skyvern/workflows',
  body: skyvernWorkflowsBodySchema,
  response: { mode: 'json', schema: skyvernWorkflowsResponseSchema },
})

export type SkyvernWorkflowsBody = ContractBody<typeof skyvernWorkflowsContract>
export type SkyvernWorkflowsBodyInput = ContractBodyInput<typeof skyvernWorkflowsContract>
export type SkyvernWorkflowOption = z.output<typeof skyvernWorkflowOptionSchema>
export type SkyvernWorkflowsResponse = ContractJsonResponse<typeof skyvernWorkflowsContract>
