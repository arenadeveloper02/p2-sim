export type KbApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface KbApprovalRequest {
  id: string
  kbId: string
  approverId: string
  documentId: string
  workspaceId: string
  groupingId: string
  status: KbApprovalStatus
  createdAt: Date
  updatedAt: Date
}

export interface CreateKbApprovalRequest {
  kbId: string
  approverId: string
  documentIds: string[]
  workspaceId: string
  groupingId?: string
}

export interface UpdateKbApprovalRequest {
  status: 'approved' | 'rejected'
}

export interface KbApprovalWithDetails extends KbApprovalRequest {
  // Additional fields that might be useful for UI
  approverName?: string
  approverEmail?: string
  documentName?: string
  knowledgeBaseName?: string
}

// Grouped approval requests for UI display
export interface KbApprovalGroup {
  groupingId: string
  kbId: string
  approverId: string
  status: KbApprovalStatus
  createdAt: Date
  updatedAt: Date
  documents: KbApprovalWithDetails[]
  approverName?: string
  approverEmail?: string
  knowledgeBaseName?: string
  documentCount: number
}
