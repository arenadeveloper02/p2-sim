import { WorkspaceSocketShell } from '@/app/workspace/providers/workspace-socket-shell'

interface WorkspaceRootLayoutProps {
  children: React.ReactNode
}

/**
 * Server layout for `/workspace`. The wrapping `div` must live here — a Client
 * Component layout that wraps `{children}` in extra DOM mismatches React 19
 * streaming `<script>` tags on hydrate.
 */
export default function WorkspaceRootLayout({ children }: WorkspaceRootLayoutProps) {
  return (
    <div className='workspace-root'>
      <WorkspaceSocketShell>{children}</WorkspaceSocketShell>
    </div>
  )
}
