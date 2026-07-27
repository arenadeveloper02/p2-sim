import path from 'path'
import { createContentRegistry } from '@/lib/content/registry-factory'

// turbopackIgnore: bare process.cwd() makes NFT sweep next.config into every
// consumer route; two routes then collide on the same server chunk path.
const LIBRARY_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), 'content', 'library')
const AUTHORS_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), 'content', 'authors')

const libraryRegistry = createContentRegistry({
  contentDir: LIBRARY_DIR,
  authorsDir: AUTHORS_DIR,
})

export const getAllPostMeta = libraryRegistry.getAllPostMeta
export const getPostBySlug = libraryRegistry.getPostBySlug
export const getAllTags = libraryRegistry.getAllTags
export const getRelatedPosts = libraryRegistry.getRelatedPosts
export const getNavLibraryPosts = libraryRegistry.getNavPosts
export const invalidateLibraryCaches = libraryRegistry.invalidateCaches
