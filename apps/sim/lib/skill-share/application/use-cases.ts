import type { SessionPrincipal } from '@sim/auth/principal'
import { defineAuthorizedPlatformAdminUseCase } from '@/lib/skill-share/application/authorized-platform-admin-use-case'
import { skillShareOperations } from '@/lib/skill-share/application/operations'
import {
  createSkillService,
  deleteSkillService,
  getCatalogPresence,
  listShareCatalog,
  listSkillServices,
  listSourceSkills,
  publishSkillToCatalog,
  renameSkillService,
  type SkillShareType,
  searchShareWorkspaces,
  shareCatalogToWorkspaces,
  unpublishCatalogEntry,
} from '@/lib/skill-share/repository'

export const listSkillServicesUseCase = defineAuthorizedPlatformAdminUseCase({
  operation: skillShareOperations.listServices,
  execute: async () => ({ services: await listSkillServices() }),
})

export const createSkillServiceUseCase = defineAuthorizedPlatformAdminUseCase({
  operation: skillShareOperations.createService,
  execute: async ({ input }: { principal: SessionPrincipal; input: { name: string } }) => ({
    service: await createSkillService(input.name),
  }),
})

export const updateSkillServiceUseCase = defineAuthorizedPlatformAdminUseCase({
  operation: skillShareOperations.updateService,
  execute: async ({
    input,
  }: {
    principal: SessionPrincipal
    input: { serviceId: string; name: string }
  }) => ({
    service: await renameSkillService(input.serviceId, input.name),
  }),
})

export const deleteSkillServiceUseCase = defineAuthorizedPlatformAdminUseCase({
  operation: skillShareOperations.deleteService,
  execute: async ({ input }: { principal: SessionPrincipal; input: { serviceId: string } }) => {
    await deleteSkillService(input.serviceId)
    return { success: true as const }
  },
})

export const listShareCatalogUseCase = defineAuthorizedPlatformAdminUseCase({
  operation: skillShareOperations.listCatalog,
  execute: async () => ({ catalog: await listShareCatalog() }),
})

export const publishSkillToCatalogUseCase = defineAuthorizedPlatformAdminUseCase({
  operation: skillShareOperations.publishCatalog,
  execute: async ({
    principal,
    input,
  }: {
    principal: SessionPrincipal
    input: { originSkillId: string; type: SkillShareType; serviceIds: string[] }
  }) => ({
    entry: await publishSkillToCatalog({
      originSkillId: input.originSkillId,
      type: input.type,
      serviceIds: input.serviceIds,
      createdBy: principal.userId,
    }),
  }),
})

export const unpublishCatalogUseCase = defineAuthorizedPlatformAdminUseCase({
  operation: skillShareOperations.unpublishCatalog,
  execute: async ({ input }: { principal: SessionPrincipal; input: { catalogId: string } }) => {
    await unpublishCatalogEntry(input.catalogId)
    return { success: true as const }
  },
})

export const listSourceSkillsUseCase = defineAuthorizedPlatformAdminUseCase({
  operation: skillShareOperations.listSourceSkills,
  execute: async ({ input }: { principal: SessionPrincipal; input: { workspaceId: string } }) => ({
    skills: await listSourceSkills(input.workspaceId),
  }),
})

export const searchShareWorkspacesUseCase = defineAuthorizedPlatformAdminUseCase({
  operation: skillShareOperations.searchWorkspaces,
  execute: async ({ input }: { principal: SessionPrincipal; input: { search: string } }) => ({
    workspaces: await searchShareWorkspaces(input.search),
  }),
})

export const getCatalogPresenceUseCase = defineAuthorizedPlatformAdminUseCase({
  operation: skillShareOperations.getPresence,
  execute: async ({
    input,
  }: {
    principal: SessionPrincipal
    input: { catalogId: string; workspaceIds: string[] }
  }) => getCatalogPresence(input.catalogId, input.workspaceIds),
})

export const shareCatalogUseCase = defineAuthorizedPlatformAdminUseCase({
  operation: skillShareOperations.share,
  execute: async ({
    principal,
    input,
  }: {
    principal: SessionPrincipal
    input: { catalogId: string; workspaceIds: string[]; overwriteEdited: boolean }
  }) => ({
    results: await shareCatalogToWorkspaces({
      catalogId: input.catalogId,
      workspaceIds: input.workspaceIds,
      actorUserId: principal.userId,
      overwriteEdited: input.overwriteEdited,
    }),
  }),
})
