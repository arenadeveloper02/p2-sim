import ArenaChatClient from '@/app/chat/[identifier]/ArenaDeployedChat'

export default async function ChatPage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params
  return <ArenaChatClient identifier={identifier} />
}
