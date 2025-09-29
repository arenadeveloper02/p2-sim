'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import NextError from 'next/error'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    // Log error to console for debugging
    console.error('Global error caught:', error)
    
    // Send to Sentry if available
    try {
      Sentry.captureException(error)
    } catch (sentryError) {
      console.error('Failed to send error to Sentry:', sentryError)
    }
  }, [error])

  return (
    <html lang='en'>
      <head>
        <title>Error - Sim Studio</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ 
        fontFamily: 'system-ui, sans-serif', 
        margin: 0, 
        padding: '20px',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{
          maxWidth: '600px',
          margin: '0 auto',
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <h1 style={{ color: '#dc2626', marginBottom: '20px' }}>
            Something went wrong
          </h1>
          <p style={{ marginBottom: '20px', color: '#6b7280' }}>
            We're sorry, but something unexpected happened. Please try refreshing the page.
          </p>
          <div style={{ marginBottom: '20px' }}>
            <button 
              onClick={() => window.location.href = '/'}
              style={{
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                cursor: 'pointer',
                marginRight: '10px'
              }}
            >
              Go to Homepage
            </button>
            <button 
              onClick={() => window.location.reload()}
              style={{
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Refresh Page
            </button>
          </div>
          {process.env.NODE_ENV === 'development' && (
            <details style={{ marginTop: '20px' }}>
              <summary style={{ cursor: 'pointer', color: '#6b7280' }}>
                Error Details (Development)
              </summary>
              <pre style={{ 
                backgroundColor: '#f3f4f6', 
                padding: '10px', 
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '12px',
                marginTop: '10px'
              }}>
                {error.message}
                {error.stack && `\n\nStack trace:\n${error.stack}`}
              </pre>
            </details>
          )}
        </div>
      </body>
    </html>
  )
}
