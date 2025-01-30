import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sim Studio',
  description:
    'Drag and drop agents to create workflows. Powered by Simplicity',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
