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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.INITIAL_TIMESTAMP = 0;`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                window.INITIAL_TIMESTAMP = ${Date.now()};
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
