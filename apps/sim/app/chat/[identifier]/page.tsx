import type { Metadata } from 'next'
import ArenaChatClient from '@/app/chat/[identifier]/ArenaDeployedChat'

export const metadata: Metadata = {
  title: 'Chat',
}

export default async function ChatPage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params
  return <ArenaChatClient identifier={identifier} />
}
