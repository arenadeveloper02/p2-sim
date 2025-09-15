import { useCallback, useEffect, useMemo, useState } from 'react'
import { createLogger } from '@/lib/logs/console/logger'
import type { KnowledgeBaseData } from '@/stores/knowledge/store'

const logger = createLogger('UseP2KnowledgeBase')

export interface P2KnowledgeBaseData extends KnowledgeBaseData {
  type: 'p2-knowledge'
  milvusStats?: {
    totalChunks: number
    totalDocuments: number
    collectionStatus: string
  }
}

export function useP2KnowledgeBasesList(workspaceId?: string) {
  const [knowledgeBases, setKnowledgeBases] = useState<P2KnowledgeBaseData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const maxRetries = 3

  const loadKnowledgeBases = useCallback(async (attempt = 0) => {
    try {
      setIsLoading(true)
      setError(null)

      const url = workspaceId ? `/api/p2-knowledge?workspaceId=${workspaceId}` : '/api/p2-knowledge'
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch P2 knowledge bases: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch P2 knowledge bases')
      }

      const p2KnowledgeBases = result.data || []
      setKnowledgeBases(p2KnowledgeBases)
      setRetryCount(0)
      setLoaded(true)
      logger.info(`P2 Knowledge bases loaded: ${p2KnowledgeBases.length} items`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load P2 knowledge bases'

      if (attempt < maxRetries) {
        console.warn(`P2 Knowledge bases load attempt ${attempt + 1} failed, retrying...`, err)
        setRetryCount(attempt + 1)

        // Exponential backoff: 1s, 2s, 4s
        const delay = 2 ** attempt * 1000
        setTimeout(() => {
          loadKnowledgeBases(attempt + 1)
        }, delay)
      } else {
        logger.error('All retry attempts failed for P2 knowledge bases list:', err)
        setError(errorMessage)
        setRetryCount(maxRetries)
      }
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, maxRetries])

  useEffect(() => {
    if (!loaded && !isLoading) {
      loadKnowledgeBases(0)
    }
  }, [loaded, isLoading, loadKnowledgeBases])

  const refreshList = useCallback(async () => {
    try {
      setError(null)
      setRetryCount(0)
      setLoaded(false)
      await loadKnowledgeBases(0)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh P2 knowledge bases'
      setError(errorMessage)
      logger.error('Error refreshing P2 knowledge bases list:', err)
    }
  }, [loadKnowledgeBases])

  const addKnowledgeBase = useCallback((newKnowledgeBase: P2KnowledgeBaseData) => {
    setKnowledgeBases(prev => [newKnowledgeBase, ...prev])
  }, [])

  const removeKnowledgeBase = useCallback((id: string) => {
    setKnowledgeBases(prev => prev.filter(kb => kb.id !== id))
  }, [])

  return {
    knowledgeBases,
    isLoading,
    error,
    refreshList,
    addKnowledgeBase,
    removeKnowledgeBase,
    retryCount,
    maxRetries,
  }
}

export function useP2KnowledgeBase(id: string) {
  const [knowledgeBase, setKnowledgeBase] = useState<P2KnowledgeBaseData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    let isMounted = true

    const loadKnowledgeBase = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const response = await fetch(`/api/p2-knowledge/${id}`)

        if (!response.ok) {
          throw new Error(`Failed to fetch P2 knowledge base: ${response.statusText}`)
        }

        const result = await response.json()

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch P2 knowledge base')
        }

        if (isMounted) {
          setKnowledgeBase(result.data)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load P2 knowledge base')
          logger.error(`Failed to load P2 knowledge base ${id}:`, err)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadKnowledgeBase()

    return () => {
      isMounted = false
    }
  }, [id])

  return {
    knowledgeBase,
    isLoading,
    error,
  }
}
