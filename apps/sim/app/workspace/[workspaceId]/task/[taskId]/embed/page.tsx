import type { Metadata } from 'next'
import { Home } from '@/app/workspace/[workspaceId]/home/home'

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
  const { taskId } = await params
  return <Home key={taskId} chatId={taskId} />
}
