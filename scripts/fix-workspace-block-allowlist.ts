#!/usr/bin/env bun
/**
 * Diagnose and fix a workspace-scoped permission group that restricts toolbar blocks.
 *
 * When a non-default permission group targets a workspace with a short
 * `allowedIntegrations` list, the workflow toolbar only shows those block types.
 *
 * Usage:
 *   bun --env-file=apps/sim/.env run scripts/fix-workspace-block-allowlist.ts
 *   bun --env-file=apps/sim/.env run scripts/fix-workspace-block-allowlist.ts --workspace-id=<uuid>
 *   bun --env-file=apps/sim/.env run scripts/fix-workspace-block-allowlist.ts --fix
 *   bun --env-file=apps/sim/.env run scripts/fix-workspace-block-allowlist.ts --fix --workspace-id=<uuid>
 */

import { db } from '@sim/db'
import { permissionGroup, permissionGroupWorkspace, workspace } from '@sim/db/schema'
import { getErrorMessage } from '@sim/utils/errors'
import { and, eq } from 'drizzle-orm'
import {
  parsePermissionGroupConfig,
  type PermissionGroupConfig,
} from '../apps/sim/lib/permission-groups/types'

const DEFAULT_WORKSPACE_ID = '7124a2f6-7075-4e14-b726-daa92b631e0c'

interface Options {
  workspaceId: string
  fix: boolean
}

function parseArgs(argv: string[]): Options {
  const workspaceArg = argv.find((a) => a.startsWith('--workspace-id='))
  return {
    workspaceId: workspaceArg?.split('=')[1]?.trim() || DEFAULT_WORKSPACE_ID,
    fix: argv.includes('--fix'),
  }
}

function summarizeAllowlist(config: PermissionGroupConfig): string {
  const list = config.allowedIntegrations
  if (list === null) return 'null (all integrations allowed)'
  if (list.length === 0) return '[] (no integrations allowed)'
  return `[${list.length} items] ${list.join(', ')}`
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  console.log(
    `Workspace block allowlist check — workspace=${options.workspaceId}${options.fix ? ', mode=fix' : ', dry-run'}`
  )

  const [ws] = await db
    .select({
      id: workspace.id,
      name: workspace.name,
      orgId: workspace.organizationId,
    })
    .from(workspace)
    .where(eq(workspace.id, options.workspaceId))
    .limit(1)

  if (!ws) {
    throw new Error(`Workspace not found: ${options.workspaceId}`)
  }

  console.log(`Workspace: ${ws.name ?? '(unnamed)'} (${ws.id})`)
  console.log(`Organization: ${ws.orgId ?? '(none — no permission groups)'}`)

  if (!ws.orgId) {
    console.log('No organization — toolbar is not filtered by permission groups.')
    return
  }

  const scopedGroups = await db
    .select({
      id: permissionGroup.id,
      name: permissionGroup.name,
      isDefault: permissionGroup.isDefault,
      config: permissionGroup.config,
    })
    .from(permissionGroup)
    .innerJoin(
      permissionGroupWorkspace,
      eq(permissionGroupWorkspace.permissionGroupId, permissionGroup.id)
    )
    .where(eq(permissionGroupWorkspace.workspaceId, options.workspaceId))

  if (scopedGroups.length === 0) {
    console.log('No workspace-scoped permission groups — check org default group in Access Control.')
    const [defaultGroup] = await db
      .select({
        id: permissionGroup.id,
        name: permissionGroup.name,
        config: permissionGroup.config,
      })
      .from(permissionGroup)
      .where(
        and(eq(permissionGroup.organizationId, ws.orgId), eq(permissionGroup.isDefault, true))
      )
      .limit(1)

    if (defaultGroup) {
      const config = parsePermissionGroupConfig(defaultGroup.config)
      console.log(`Default group "${defaultGroup.name}": allowedIntegrations=${summarizeAllowlist(config)}`)
    }
    return
  }

  for (const group of scopedGroups) {
    const config = parsePermissionGroupConfig(group.config)
    console.log(
      `\nGroup "${group.name}" (${group.id}) isDefault=${group.isDefault}\n  allowedIntegrations=${summarizeAllowlist(config)}`
    )

    if (!options.fix) continue

    if (config.allowedIntegrations === null) {
      console.log('  → already unrestricted, skipping')
      continue
    }

    const nextConfig = { ...config, allowedIntegrations: null }
    await db
      .update(permissionGroup)
      .set({ config: nextConfig, updatedAt: new Date() })
      .where(eq(permissionGroup.id, group.id))

    console.log('  → updated allowedIntegrations to null (all blocks visible for this workspace)')
  }

  if (!options.fix) {
    console.log('\nRe-run with --fix to clear workspace-scoped integration allowlists.')
  } else {
    console.log('\nDone. Hard-refresh the workflow editor to pick up the change.')
  }
}

main().catch((error) => {
  console.error(getErrorMessage(error, 'fix-workspace-block-allowlist failed'))
  process.exit(1)
})
