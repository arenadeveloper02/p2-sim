import type { NextRequest } from 'next/server'
import { serveStaticAsset } from '@/lib/static-assets'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const assetPath = `chunks/${path.join('/')}`

  return serveStaticAsset(request, assetPath)
}
