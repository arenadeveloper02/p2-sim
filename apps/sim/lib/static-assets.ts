import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Serve static assets with proper fallback for multi-instance deployments
 */
export async function serveStaticAsset(
  request: NextRequest,
  assetPath: string
): Promise<NextResponse> {
  try {
    // Try to serve from local filesystem first
    const localPath = join(process.cwd(), 'apps/sim/.next/static', assetPath)

    if (existsSync(localPath)) {
      const fileContent = await readFile(localPath)

      // Determine content type based on file extension
      let contentType = 'application/javascript'
      if (assetPath.endsWith('.css')) {
        contentType = 'text/css'
      } else if (assetPath.endsWith('.map')) {
        contentType = 'application/json'
      } else if (
        assetPath.endsWith('.png') ||
        assetPath.endsWith('.jpg') ||
        assetPath.endsWith('.jpeg')
      ) {
        contentType = 'image/png'
      } else if (assetPath.endsWith('.svg')) {
        contentType = 'image/svg+xml'
      }

      return new NextResponse(new Uint8Array(fileContent), {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    // If local file doesn't exist, try to fetch from another instance
    // This is a fallback for multi-instance deployments
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (appUrl) {
      try {
        const response = await fetch(`${appUrl}/_next/static/${assetPath}`)
        if (response.ok) {
          const content = await response.arrayBuffer()
          return new NextResponse(content, {
            headers: {
              'Content-Type': response.headers.get('content-type') || 'application/javascript',
              'Cache-Control': 'public, max-age=31536000, immutable',
              'X-Content-Type-Options': 'nosniff',
            },
          })
        }
      } catch (fetchError) {
        console.warn('Failed to fetch asset from other instance:', fetchError)
      }
    }

    // Return 404 if asset not found
    return new NextResponse('Asset not found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain',
      },
    })
  } catch (error) {
    console.error('Error serving static asset:', error)
    return new NextResponse('Internal Server Error', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
      },
    })
  }
}
