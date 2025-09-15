import { TextChunker } from '@/lib/knowledge/documents/chunker'

/**
 * Simple utility function to chunk text using the TextChunker
 */
export async function chunkText(
  text: string,
  chunkSize: number = 1024,
  overlap: number = 200
): Promise<string[]> {
  const chunker = new TextChunker({
    chunkSize,
    overlap,
    minChunkSize: 1,
  })

  const chunks = await chunker.chunk(text)
  return chunks.map(chunk => chunk.text)
}
