import type {
  CatalogListItem,
  SkillServiceRow,
  WorkspaceSearchRow,
} from '@/lib/skill-share/repository'

function iso(value: Date): string {
  return value.toISOString()
}

export function presentSkillService(service: SkillServiceRow) {
  return {
    id: service.id,
    name: service.name,
    slug: service.slug,
    createdAt: iso(service.createdAt),
    updatedAt: iso(service.updatedAt),
  }
}

export function presentShareWorkspace(workspace: WorkspaceSearchRow) {
  return {
    id: workspace.id,
    name: workspace.name,
    organizationName: workspace.organizationName ?? null,
  }
}

export function presentCatalogEntry(entry: CatalogListItem) {
  return {
    id: entry.id,
    type: entry.type,
    originSkillId: entry.originSkillId,
    originWorkspaceId: entry.originWorkspaceId,
    originSkillName: entry.originSkillName,
    originSkillDescription: entry.originSkillDescription,
    originWorkspaceName: entry.originWorkspaceName,
    services: entry.services.map(presentSkillService),
    inSyncCount: entry.inSyncCount,
    editedCount: entry.editedCount,
    createdAt: iso(entry.createdAt),
    updatedAt: iso(entry.updatedAt),
  }
}
