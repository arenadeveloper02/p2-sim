import type { ToolResponse } from '@/tools/types'

// Base parameters shared by all Figma operations
export type BaseFigmaParams = object

// Create Figma file parameters
export interface CreateFigmaParams extends BaseFigmaParams {
  name: string
  description?: string
  designPrompt: string
  projectId: string
  brandGuidelines?: File
  wireframes?: File
  additionalData?: File
  additionalInfo?: string
}

// Convert Figma to HTML/React/Angular parameters
export interface ConvertFigmaParams extends BaseFigmaParams {
  fileKey: string
  nodeId?: string
  outputFormat: 'html' | 'react' | 'angular'
  includeStyles?: boolean
  responsive?: boolean
}

// Get comments parameters
export interface GetCommentsParams extends BaseFigmaParams {
  fileKey: string
  nodeId?: string
}

// Post comment parameters
export interface PostCommentParams extends BaseFigmaParams {
  fileKey: string
  message: string
  x?: number
  y?: number
  nodeId?: string
}

// Delete comment parameters
export interface DeleteCommentParams extends BaseFigmaParams {
  fileKey: string
  commentId: string
}

// Get team projects parameters
export interface GetTeamProjectsParams extends BaseFigmaParams {
  teamId: string
}

// Get file parameters
export interface GetFileParams extends BaseFigmaParams {
  fileKey: string
  version?: string
  ids?: string[]
  depth?: number
  geometry?: 'paths' | 'bounds'
  plugin_data?: string
  branch_data?: boolean
}

// Get file nodes parameters
export interface GetFileNodesParams extends BaseFigmaParams {
  fileKey: string
  ids: string[] | string
  version?: string
  depth?: number
  geometry?: 'paths' | 'bounds'
  plugin_data?: string
}

// Get file images parameters
export interface GetFileImagesParams extends BaseFigmaParams {
  fileKey: string
  ids: string[] | string
  format?: 'jpg' | 'png' | 'svg' | 'pdf'
  scale?: number
  svg_include_id?: boolean
  svg_simplify_stroke?: boolean
  use_absolute_bounds?: boolean
  version?: string
}

// Get project files parameters
export interface GetProjectFilesParams extends BaseFigmaParams {
  projectId: string
  branch_data?: boolean
}

// AI Design parameters
export interface CreateAiDesignParams extends BaseFigmaParams {
  name: string
  description: string
  designPrompt: string
  projectId?: string
}

export interface UpdateAiDesignParams extends BaseFigmaParams {
  fileKey: string
  updatePrompt: string
  nodeId?: string
  version?: string
}

export interface GenerateAiComponentsParams extends BaseFigmaParams {
  fileKey: string
  componentPrompt: string
  componentType: 'button' | 'card' | 'form' | 'navigation' | 'layout' | 'custom'
  nodeId?: string
  count?: number
}

// Response metadata interfaces
interface FigmaFileMetadata {
  key: string
  name: string
  lastModified: string
  thumbnailUrl: string
  version: string
  role: string
  editorType: string
  linkAccess: string
}

interface FigmaCommentMetadata {
  id: string
  file_key: string
  parent_id?: string
  user: {
    id: string
    handle: string
    img_url: string
  }
  created_at: string
  resolved_at?: string
  message: string
  client_meta: {
    x?: number
    y?: number
    node_id?: string
    node_offset?: {
      x: number
      y: number
    }
  }
  order_id: string
}

interface FigmaProjectMetadata {
  id: string
  name: string
  created_at: string
  modified_at: string
  thumbnail_url?: string
}

interface FigmaNodeMetadata {
  id: string
  name: string
  type: string
  visible: boolean
  children?: FigmaNodeMetadata[]
  absoluteBoundingBox?: {
    x: number
    y: number
    width: number
    height: number
  }
  fills?: Array<{
    type: string
    color?: {
      r: number
      g: number
      b: number
      a: number
    }
  }>
  strokes?: Array<{
    type: string
    color?: {
      r: number
      g: number
      b: number
      a: number
    }
  }>
  strokeWeight?: number
  cornerRadius?: number
  characters?: string
  style?: {
    fontFamily: string
    fontPostScriptName: string
    paragraphSpacing: number
    fontSize: number
    textAlignHorizontal: string
    textAlignVertical: string
    letterSpacing: number
    lineHeightPx: number
  }
}

interface FigmaImageMetadata {
  id: string
  url: string
  format: string
  scale: number
}

// Response types
export interface CreateFigmaResponse extends ToolResponse {
  output: {
    content: string
    metadata: FigmaFileMetadata & {
      designPrompt: string
      projectId: string
      figmaFileUrl?: string
      renderedData?: string
    }
  }
}

export interface ConvertFigmaResponse extends ToolResponse {
  output: {
    content: string
    metadata: {
      fileKey: string
      nodeId?: string
      outputFormat: string
      generatedCode: string
      styles?: string
    }
  }
}

export interface GetCommentsResponse extends ToolResponse {
  output: {
    content: string
    metadata: {
      comments: FigmaCommentMetadata[]
      fileKey: string
      nodeId?: string
    }
  }
}

export interface PostCommentResponse extends ToolResponse {
  output: {
    content: string
    metadata: FigmaCommentMetadata
  }
}

export interface DeleteCommentResponse extends ToolResponse {
  output: {
    content: string
    metadata: {
      success: boolean
      commentId: string
    }
  }
}

export interface GetTeamProjectsResponse extends ToolResponse {
  output: {
    content: string
    metadata: {
      projects: FigmaProjectMetadata[]
      teamId: string
    }
  }
}

export interface GetFileResponse extends ToolResponse {
  output: {
    content: string
    metadata: {
      file: FigmaFileMetadata
      document: FigmaNodeMetadata
    }
  }
}

export interface GetFileNodesResponse extends ToolResponse {
  output: {
    content: string
    metadata: {
      nodes: Record<string, FigmaNodeMetadata>
      fileKey: string
    }
  }
}

export interface GetFileImagesResponse extends ToolResponse {
  output: {
    content: string
    metadata: {
      images: Record<string, FigmaImageMetadata>
      fileKey: string
    }
  }
}

export interface GetProjectFilesResponse extends ToolResponse {
  output: {
    content: string
    metadata: {
      files: FigmaFileMetadata[]
      projectId: string
    }
  }
}

export type FigmaResponse =
  | CreateFigmaResponse
  | ConvertFigmaResponse
  | GetCommentsResponse
  | PostCommentResponse
  | DeleteCommentResponse
  | GetTeamProjectsResponse
  | GetFileResponse
  | GetFileNodesResponse
  | GetFileImagesResponse
  | GetProjectFilesResponse
