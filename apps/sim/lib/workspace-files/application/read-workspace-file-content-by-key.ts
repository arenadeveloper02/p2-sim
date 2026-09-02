import type { AuthorizedWorkspaceUseCaseContext } from '@/lib/core/application'
import { OrchestrationError } from '@/lib/core/orchestration/types'
import {
  type ActiveWorkspaceFileContext,
  fetchWorkspaceFileBuffer,
  getWorkspaceFile,
  loadActiveWorkspaceFileContext,
  type WorkspaceFileRecord,
} from '@/lib/uploads/contexts/workspace'
import { getFileMetadataByKey } from '@/lib/uploads/server/metadata'
import { MAX_BUFFERED_TRANSFER_BYTES } from '@/lib/uploads/shared/types'
import { defineAuthorizedWorkspaceFileUseCase } from '@/lib/workspace-files/application/authorized-workspace-file-use-case'
import { fileOperations } from '@/lib/workspace-files/application/operations'

export interface ReadWorkspaceFileContentByKeyInput {
  key: string
  assertedWorkspaceId?: string
}

export interface ReadWorkspaceFileContentByKeyResult {
  file: WorkspaceFileRecord
  content: Buffer
}

async function executeReadWorkspaceFileContentByKey({
  input,
  context,
}: AuthorizedWorkspaceUseCaseContext<
  typeof fileOperations.readContent,
  ReadWorkspaceFileContentByKeyInput,
  ActiveWorkspaceFileContext
>): Promise<ReadWorkspaceFileContentByKeyResult> {
  const file = await getWorkspaceFile(context.workspaceId, context.fileId, {
    throwOnError: true,
    includeMothership: true,
  })
  if (!file || file.key !== input.key) throw new OrchestrationError('not_found', 'File not found')
  return {
    file,
    content: await fetchWorkspaceFileBuffer(file, { maxBytes: MAX_BUFFERED_TRANSFER_BYTES }),
  }
}

const SERVABLE_BY_WORKSPACE_KEY = new Set(['workspace', 'mothership'])

export const readWorkspaceFileContentByKey = defineAuthorizedWorkspaceFileUseCase({
  operation: fileOperations.readContent,
  async resolveContext({ input }) {
    const metadata = await getFileMetadataByKey(input.key)
    if (
      !metadata?.workspaceId ||
      !SERVABLE_BY_WORKSPACE_KEY.has(metadata.context) ||
      (input.assertedWorkspaceId !== undefined &&
        input.assertedWorkspaceId !== metadata.workspaceId)
    ) {
      throw new OrchestrationError('not_found', 'File not found')
    }
    const canonical = await loadActiveWorkspaceFileContext(metadata.id, {
      includeMothership: true,
    })
    if (!canonical || canonical.workspaceId !== metadata.workspaceId) {
      throw new OrchestrationError('not_found', 'File not found')
    }
    return canonical
  },
  execute: executeReadWorkspaceFileContentByKey,
})
