import { z } from 'zod'
import { requiredFieldSchema, workspaceIdSchema } from '@/lib/api/contracts/primitives'
import { defineRouteContract } from '@/lib/api/contracts/types'

export const skillShareTypeSchema = z.enum(['general', 'service'])
export type SkillShareType = z.output<typeof skillShareTypeSchema>

export const skillSharePresenceStatusSchema = z.enum([
  'absent',
  'in_sync',
  'edited',
  'name_clash',
  'source',
])
export type SkillSharePresenceStatus = z.output<typeof skillSharePresenceStatusSchema>

export const skillShareResultStatusSchema = z.enum([
  'created',
  'updated',
  'skipped_edited',
  'skipped_name_clash',
  'skipped_source',
  'error',
])
export type SkillShareResultStatus = z.output<typeof skillShareResultStatusSchema>

export const skillServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type SkillService = z.output<typeof skillServiceSchema>

export const skillShareCatalogEntrySchema = z.object({
  id: z.string(),
  type: skillShareTypeSchema,
  originSkillId: z.string(),
  originWorkspaceId: z.string(),
  originSkillName: z.string(),
  originSkillDescription: z.string(),
  originWorkspaceName: z.string(),
  services: z.array(skillServiceSchema),
  inSyncCount: z.number().int().nonnegative(),
  editedCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type SkillShareCatalogEntry = z.output<typeof skillShareCatalogEntrySchema>

export const skillShareSourceSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  catalogId: z.string().nullable(),
})
export type SkillShareSourceSkill = z.output<typeof skillShareSourceSkillSchema>

export const skillShareWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  organizationName: z.string().nullable(),
})
export type SkillShareWorkspace = z.output<typeof skillShareWorkspaceSchema>

export const skillSharePresenceRowSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  status: skillSharePresenceStatusSchema,
})
export type SkillSharePresenceRow = z.output<typeof skillSharePresenceRowSchema>

export const skillShareWorkspaceResultSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string().optional(),
  status: skillShareResultStatusSchema,
  message: z.string().optional(),
})
export type SkillShareWorkspaceResult = z.output<typeof skillShareWorkspaceResultSchema>

const serviceNameSchema = z
  .string()
  .trim()
  .min(1, 'Service name is required')
  .max(64, 'Service name is too long')

const catalogIdSchema = requiredFieldSchema('Catalog ID is required').max(128)
const serviceIdSchema = requiredFieldSchema('Service ID is required').max(128)
const originSkillIdSchema = requiredFieldSchema('Skill ID is required').max(128)

export const listSkillServicesContract = defineRouteContract({
  method: 'GET',
  path: '/api/admin/skill-share/services',
  response: {
    mode: 'json',
    schema: z.object({
      success: z.literal(true),
      services: z.array(skillServiceSchema),
    }),
  },
})

export const createSkillServiceBodySchema = z.object({
  name: serviceNameSchema,
})
export type CreateSkillServiceBody = z.input<typeof createSkillServiceBodySchema>

export const createSkillServiceContract = defineRouteContract({
  method: 'POST',
  path: '/api/admin/skill-share/services',
  body: createSkillServiceBodySchema,
  response: {
    mode: 'json',
    status: 201,
    schema: z.object({
      success: z.literal(true),
      service: skillServiceSchema,
    }),
  },
})

export const skillServiceIdParamsSchema = z.object({
  id: serviceIdSchema,
})
export type SkillServiceIdParams = z.input<typeof skillServiceIdParamsSchema>

export const updateSkillServiceBodySchema = z.object({
  name: serviceNameSchema,
})
export type UpdateSkillServiceBody = z.input<typeof updateSkillServiceBodySchema>

export const updateSkillServiceContract = defineRouteContract({
  method: 'PATCH',
  path: '/api/admin/skill-share/services/[id]',
  params: skillServiceIdParamsSchema,
  body: updateSkillServiceBodySchema,
  response: {
    mode: 'json',
    schema: z.object({
      success: z.literal(true),
      service: skillServiceSchema,
    }),
  },
})

export const deleteSkillServiceContract = defineRouteContract({
  method: 'DELETE',
  path: '/api/admin/skill-share/services/[id]',
  params: skillServiceIdParamsSchema,
  response: {
    mode: 'json',
    schema: z.object({
      success: z.literal(true),
    }),
  },
})

export const listSkillShareCatalogContract = defineRouteContract({
  method: 'GET',
  path: '/api/admin/skill-share/catalog',
  response: {
    mode: 'json',
    schema: z.object({
      success: z.literal(true),
      catalog: z.array(skillShareCatalogEntrySchema),
    }),
  },
})

export const publishSkillShareBodySchema = z
  .object({
    originSkillId: originSkillIdSchema,
    type: skillShareTypeSchema,
    serviceIds: z.array(serviceIdSchema).max(20).default([]),
  })
  .superRefine((body, ctx) => {
    if (body.type === 'service' && body.serviceIds.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['serviceIds'],
        message: 'Service skills require at least one service',
      })
    }
    if (body.type === 'general' && body.serviceIds.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['serviceIds'],
        message: 'General skills cannot be tagged with services',
      })
    }
  })
export type PublishSkillShareBody = z.input<typeof publishSkillShareBodySchema>

export const publishSkillShareContract = defineRouteContract({
  method: 'POST',
  path: '/api/admin/skill-share/catalog',
  body: publishSkillShareBodySchema,
  response: {
    mode: 'json',
    status: 201,
    schema: z.object({
      success: z.literal(true),
      entry: skillShareCatalogEntrySchema,
    }),
  },
})

export const skillShareCatalogIdParamsSchema = z.object({
  id: catalogIdSchema,
})
export type SkillShareCatalogIdParams = z.input<typeof skillShareCatalogIdParamsSchema>

export const unpublishSkillShareContract = defineRouteContract({
  method: 'DELETE',
  path: '/api/admin/skill-share/catalog/[id]',
  params: skillShareCatalogIdParamsSchema,
  response: {
    mode: 'json',
    schema: z.object({
      success: z.literal(true),
    }),
  },
})

export const listSkillShareSourceSkillsQuerySchema = z.object({
  workspaceId: workspaceIdSchema,
})
export type ListSkillShareSourceSkillsQuery = z.input<typeof listSkillShareSourceSkillsQuerySchema>

export const listSkillShareSourceSkillsContract = defineRouteContract({
  method: 'GET',
  path: '/api/admin/skill-share/source-skills',
  query: listSkillShareSourceSkillsQuerySchema,
  response: {
    mode: 'json',
    schema: z.object({
      success: z.literal(true),
      skills: z.array(skillShareSourceSkillSchema),
    }),
  },
})

export const searchSkillShareWorkspacesQuerySchema = z.object({
  search: z.string().max(256).optional().default(''),
})
export type SearchSkillShareWorkspacesQuery = z.input<typeof searchSkillShareWorkspacesQuerySchema>

export const searchSkillShareWorkspacesContract = defineRouteContract({
  method: 'GET',
  path: '/api/admin/skill-share/workspaces',
  query: searchSkillShareWorkspacesQuerySchema,
  response: {
    mode: 'json',
    schema: z.object({
      success: z.literal(true),
      workspaces: z.array(skillShareWorkspaceSchema),
    }),
  },
})

export const skillSharePresenceQuerySchema = z.object({
  workspaceIds: z.string().max(20_000).optional().default(''),
})
export type SkillSharePresenceQuery = z.input<typeof skillSharePresenceQuerySchema>

export const getSkillSharePresenceContract = defineRouteContract({
  method: 'GET',
  path: '/api/admin/skill-share/catalog/[id]/presence',
  params: skillShareCatalogIdParamsSchema,
  query: skillSharePresenceQuerySchema,
  response: {
    mode: 'json',
    schema: z.object({
      success: z.literal(true),
      originWorkspaceId: z.string(),
      rows: z.array(skillSharePresenceRowSchema),
    }),
  },
})

export const SKILL_SHARE_MAX_WORKSPACES_PER_REQUEST = 200

export const shareSkillShareBodySchema = z.object({
  catalogId: catalogIdSchema,
  workspaceIds: z
    .array(workspaceIdSchema)
    .min(1, 'Select at least one workspace')
    .max(
      SKILL_SHARE_MAX_WORKSPACES_PER_REQUEST,
      `Share at most ${SKILL_SHARE_MAX_WORKSPACES_PER_REQUEST} workspaces at a time`
    ),
  overwriteEdited: z.boolean().optional().default(false),
})
export type ShareSkillShareBody = z.input<typeof shareSkillShareBodySchema>

export const shareSkillShareContract = defineRouteContract({
  method: 'POST',
  path: '/api/admin/skill-share/share',
  body: shareSkillShareBodySchema,
  response: {
    mode: 'json',
    schema: z.object({
      success: z.literal(true),
      results: z.array(skillShareWorkspaceResultSchema),
    }),
  },
})
