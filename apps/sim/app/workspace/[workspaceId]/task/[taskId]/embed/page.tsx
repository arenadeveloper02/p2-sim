import type { Metadata } from 'next'
import { HomeEmbed } from '@/app/workspace/[workspaceId]/home/home-embed'

export const metadata: Metadata = {
  title: 'Task',
}

interface TaskEmbedPageProps {
  params: Promise<{
    workspaceId: string
    taskId: string
  }>
}

export default async function TaskEmbedPage({ params }: TaskEmbedPageProps) {
  const { workspaceId, taskId } = await params
  return (
    <HomeEmbed key={taskId} chatId={taskId} embedBackHref={`/workspace/${workspaceId}/embed`} />
  )
}
