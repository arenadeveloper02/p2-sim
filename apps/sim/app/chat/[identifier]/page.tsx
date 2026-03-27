import ArenaChatClient from '@/app/chat/[identifier]/ArenaDeployedChat'
import type { Metadata } from 'next'
import ChatClient from '@/app/chat/[identifier]/chat'

export const metadata: Metadata = {
  title: 'Chat',
}

export default async function ChatPage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params
  return <ArenaChatClient identifier={identifier} />
}
