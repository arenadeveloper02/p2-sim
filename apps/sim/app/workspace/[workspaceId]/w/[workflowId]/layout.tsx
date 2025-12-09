import { ErrorBoundary } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/error'

export default function WorkflowLayout({ children }: { children: React.ReactNode }) {
  return (
<<<<<<< HEAD
    <main className='h-full overflow-hidden bg-[var(--bg)]'>
=======
    <main className='flex h-full flex-1 flex-col overflow-hidden bg-muted/40'>
>>>>>>> 1ec60f77733970b775244ed498ea9df845ed7f7a
      <ErrorBoundary>{children}</ErrorBoundary>
    </main>
  )
}
