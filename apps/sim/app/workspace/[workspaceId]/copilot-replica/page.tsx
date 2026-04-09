import type { Metadata } from 'next'
import { CopilotReplicaPage } from './copilot-replica-page'

export const metadata: Metadata = {
  title: 'Copilot Replica',
}

interface PageProps {
  params: Promise<{
    workspaceId: string
  }>
}

export default async function Page({ params }: PageProps) {
  const { workspaceId } = await params
  return <CopilotReplicaPage workspaceId={workspaceId} />
}
