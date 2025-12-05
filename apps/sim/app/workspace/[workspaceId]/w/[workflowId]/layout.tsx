import { ErrorBoundary } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/error'

export default function WorkflowLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className='h-full overflow-hidden bg-[var(--bg)]'>
      <ErrorBoundary>{children}</ErrorBoundary>
    </main>
  )
}
