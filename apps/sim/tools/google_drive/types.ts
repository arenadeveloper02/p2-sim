import type { ToolResponse } from '@/tools/types'

export interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  webViewLink?: string
  webContentLink?: string
  size?: string
  createdTime?: string
  modifiedTime?: string
  parents?: string[]
  owners?: Array<{ displayName?: string; emailAddress?: string }>
  driveId?: string
  isGoogleWorkspaceFile?: boolean
  fileType?: string
  content?: string
  contentEncoding?: string
  pageCount?: number
  sheetCount?: number
  contentSource?: string
  extractionMethod?: string
}

export interface GoogleDriveListResponse extends ToolResponse {
  output: {
    files: GoogleDriveFile[]
    nextPageToken?: string
  }
}

export interface GoogleDriveUploadResponse extends ToolResponse {
  output: {
    file: GoogleDriveFile
  }
}

export interface GoogleDriveGetContentResponse extends ToolResponse {
  output: {
    content: string
    metadata: GoogleDriveFile
  }
}

export interface GoogleDriveDownloadResponse extends ToolResponse {
  output: {
    file: {
      name: string
      mimeType: string
      data: Buffer
      size: number
    }
  }
}

export interface GoogleDriveToolParams {
  accessToken: string
  folderId?: string
  folderSelector?: string
  fileId?: string
  fileName?: string
  file?: any // UserFile object
  content?: string
  mimeType?: string
  query?: string
  pageSize?: number
  pageToken?: string
  exportMimeType?: string
}

export interface GoogleDriveSearchParams {
  accessToken: string
  prompt: string
  pageSize?: number
  pageToken?: string
}

export type GoogleDriveResponse =
  | GoogleDriveUploadResponse
  | GoogleDriveGetContentResponse
  | GoogleDriveDownloadResponse
  | GoogleDriveListResponse

export interface GoogleDriveSearchResponse extends ToolResponse {
  output: {
    files: GoogleDriveFile[]
  }
}
