import { PackageSearchIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'

export const P2KnowledgeBlock: BlockConfig = {
  type: 'p2-knowledge',
  name: 'P2 Knowledge',
  description: 'Use vector search with Milvus',
  longDescription:
    'Perform semantic vector search across knowledge bases using Milvus vector database, upload individual chunks to existing documents, or create new documents from text content. Uses advanced AI embeddings to understand meaning and context for search operations.',
  bgColor: '#00B0B0',
  icon: PackageSearchIcon,
  category: 'blocks',
  docsLink: 'https://docs.sim.ai/blocks/p2-knowledge',
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      layout: 'full',
      options: [
        { label: 'Search', id: 'search' },
        { label: 'Upload Chunk', id: 'upload_chunk' },
        { label: 'Create Document', id: 'create_document' },
        { label: 'Create Knowledge Base', id: 'create_knowledge_base' },
      ],
      value: () => 'search',
    },
    {
      id: 'knowledgeBaseId',
      title: 'Knowledge Base',
      type: 'knowledge-base-selector',
      layout: 'full',
      placeholder: 'Select knowledge base',
      multiSelect: false,
      required: true,
      condition: { field: 'operation', value: ['search', 'upload_chunk', 'create_document'] },
    },
    {
      id: 'query',
      title: 'Search Query',
      type: 'short-input',
      layout: 'full',
      placeholder: 'Enter your search query (optional when using tag filters)',
      required: false,
      condition: { field: 'operation', value: 'search' },
    },
    {
      id: 'topK',
      title: 'Number of Results',
      type: 'short-input',
      layout: 'full',
      placeholder: 'Enter number of results (default: 10)',
      condition: { field: 'operation', value: 'search' },
    },
    {
      id: 'tagFilters',
      title: 'Tag Filters',
      type: 'knowledge-tag-filters',
      layout: 'full',
      placeholder: 'Add tag filters to narrow search results',
      required: false,
      condition: { field: 'operation', value: 'search' },
    },
    {
      id: 'documentId',
      title: 'Document',
      type: 'document-selector',
      layout: 'full',
      placeholder: 'Select document to upload chunk to',
      required: true,
      condition: { field: 'operation', value: 'upload_chunk' },
    },
    {
      id: 'content',
      title: 'Content',
      type: 'long-input',
      layout: 'full',
      placeholder: 'Enter content to upload',
      rows: 5,
      required: true,
      condition: { field: 'operation', value: ['upload_chunk', 'create_document'] },
    },
    {
      id: 'name',
      title: 'Document Name',
      type: 'short-input',
      layout: 'full',
      placeholder: 'Enter document name',
      required: true,
      condition: { field: 'operation', value: 'create_document' },
    },
    {
      id: 'documentTags',
      title: 'Document Tags',
      type: 'document-tag-entry',
      layout: 'full',
      placeholder: 'Add tags to categorize the document',
      required: false,
      condition: { field: 'operation', value: 'create_document' },
    },
    {
      id: 'kbName',
      title: 'Knowledge Base Name',
      type: 'short-input',
      layout: 'full',
      placeholder: 'Enter knowledge base name',
      required: true,
      condition: { field: 'operation', value: 'create_knowledge_base' },
    },
    {
      id: 'kbDescription',
      title: 'Description',
      type: 'long-input',
      layout: 'full',
      placeholder: 'Enter knowledge base description (optional)',
      rows: 3,
      required: false,
      condition: { field: 'operation', value: 'create_knowledge_base' },
    },
    {
      id: 'chunkingConfig',
      title: 'Chunking Configuration',
      type: 'short-input',
      layout: 'half',
      placeholder: 'Max chunk size (default: 1024)',
      required: false,
      condition: { field: 'operation', value: 'create_knowledge_base' },
    },
    {
      id: 'chunkOverlap',
      title: 'Chunk Overlap',
      type: 'short-input',
      layout: 'half',
      placeholder: 'Chunk overlap (default: 200)',
      required: false,
      condition: { field: 'operation', value: 'create_knowledge_base' },
    },
  ],
  tools: {
    access: ['p2_knowledge_search', 'p2_knowledge_upload_chunk', 'p2_knowledge_create_document', 'p2_knowledge_create_knowledge_base'],
    config: {
      tool: (params) => {
        switch (params.operation) {
          case 'search':
            return 'p2_knowledge_search'
          case 'upload_chunk':
            return 'p2_knowledge_upload_chunk'
          case 'create_document':
            return 'p2_knowledge_create_document'
          case 'create_knowledge_base':
            return 'p2_knowledge_create_knowledge_base'
          default:
            return 'p2_knowledge_search'
        }
      },
      params: (params) => {
        // Validate required fields for each operation
        if (params.operation === 'search' && !params.knowledgeBaseId) {
          throw new Error('Knowledge base ID is required for search operation')
        }
        if (
          (params.operation === 'upload_chunk' || params.operation === 'create_document') &&
          !params.knowledgeBaseId
        ) {
          throw new Error(
            'Knowledge base ID is required for upload_chunk and create_document operations'
          )
        }
        if (params.operation === 'upload_chunk' && !params.documentId) {
          throw new Error('Document ID is required for upload_chunk operation')
        }
        if (params.operation === 'create_knowledge_base' && !params.kbName) {
          throw new Error('Knowledge base name is required for create_knowledge_base operation')
        }

        return params
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Operation to perform' },
    knowledgeBaseId: { type: 'string', description: 'Knowledge base identifier' },
    query: { type: 'string', description: 'Search query terms' },
    topK: { type: 'number', description: 'Number of results' },
    documentId: { type: 'string', description: 'Document identifier' },
    content: { type: 'string', description: 'Content data' },
    name: { type: 'string', description: 'Document name' },
    // Dynamic tag filters for search
    tagFilters: { type: 'string', description: 'Tag filter criteria' },
    // Document tags for create document (JSON string of tag objects)
    documentTags: { type: 'string', description: 'Document tags' },
    // Knowledge base creation fields
    kbName: { type: 'string', description: 'Knowledge base name' },
    kbDescription: { type: 'string', description: 'Knowledge base description' },
    chunkingConfig: { type: 'number', description: 'Max chunk size' },
    chunkOverlap: { type: 'number', description: 'Chunk overlap' },
  },
  outputs: {
    results: { type: 'json', description: 'Search results' },
    documentId: { type: 'string', description: 'Document identifier' },
    documentName: { type: 'string', description: 'Document name' },
    chunkId: { type: 'string', description: 'Chunk identifier' },
    knowledgeBaseId: { type: 'string', description: 'Knowledge base identifier' },
    knowledgeBaseName: { type: 'string', description: 'Knowledge base name' },
    success: { type: 'boolean', description: 'Operation success status' },
  },
}
