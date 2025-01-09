import Providers from './providers'
import { Toolbar } from './components/toolbar/toolbar'
import { ControlBar } from './components/control-bar'
import { Sidebar } from './components/sidebar'

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Providers>
      <div className="flex min-h-screen w-full flex-col bg-muted/40">
        <nav className="flex">
          <Sidebar />
          <Toolbar />
          <div className="fixed top-0 left-[344px] right-0 z-30">
            <ControlBar />
          </div>
        </nav>
        <main className="flex-1 grid items-start gap-2 sm:gap-4 sm:py-0 md:gap-4 sm:pt-[56px] sm:pl-[344px] bg-muted/40">
          {children}
        </main>
      </div>
    </Providers>
  )
}
