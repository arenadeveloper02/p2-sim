/**
 * Usage Example for the Updated KB Approval System
 * 
 * This demonstrates the new individual document rows with grouping concept
 */

import { useKbApprovalStore } from '@/stores/kb-approval/store'

// Example: Creating an approval request for multiple documents
export async function createGroupedApprovalExample() {
  const { createApproval } = useKbApprovalStore.getState()
  
  const approvalData = {
    kbId: 'your-knowledge-base-id',
    approverId: 'approver-user-id',
    documentIds: ['doc1', 'doc2', 'doc3'], // Multiple documents
    workspaceId: 'workspace-id',
    // groupingId is optional - will be auto-generated if not provided
  }
  
  const result = await createApproval(approvalData)
  
  if (result) {
    console.log('Grouped approval created:', result.groupingId)
    console.log('Individual approvals:', result.approvals)
    // All documents will have the same groupingId for UI grouping
  }
}

// Example: Creating individual document approvals
export async function createIndividualApprovalExample() {
  const { createApproval } = useKbApprovalStore.getState()
  
  // Each document gets its own approval request
  const approvalData = {
    kbId: 'your-knowledge-base-id',
    approverId: 'approver-user-id',
    documentIds: ['doc1'], // Single document
    workspaceId: 'workspace-id',
    groupingId: 'unique-group-id', // Custom grouping ID
  }
  
  const result = await createApproval(approvalData)
  
  if (result) {
    console.log('Individual approval created:', result)
  }
}

// Example: Fetching and displaying approvals
export function KbApprovalComponent({ kbId }: { kbId: string }) {
  const { 
    individualApprovals, 
    groupedApprovals, 
    loading, 
    error, 
    fetchApprovals, 
    updateApproval 
  } = useKbApprovalStore()
  
  // Fetch approvals when component mounts
  React.useEffect(() => {
    fetchApprovals(kbId)
  }, [kbId, fetchApprovals])
  
  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>
  
  return (
    <div>
      <h3>Knowledge Base Approvals</h3>
      
      {/* Display grouped approvals */}
      <div>
        <h4>Grouped Approvals</h4>
        {groupedApprovals.map((group) => (
          <div key={group.groupingId} className="approval-group">
            <h5>Group: {group.groupingId}</h5>
            <p>Status: {group.status}</p>
            <p>Approver: {group.approverName}</p>
            <p>Documents: {group.documentCount}</p>
            
            {/* Individual documents in the group */}
            <div className="documents">
              {group.documents.map((doc) => (
                <div key={doc.id} className="document">
                  <span>{doc.documentName}</span>
                  <span>Status: {doc.status}</span>
                  {doc.status === 'pending' && (
                    <div>
                      <button onClick={() => updateApproval(doc.id, { status: 'approved' })}>
                        Approve
                      </button>
                      <button onClick={() => updateApproval(doc.id, { status: 'rejected' })}>
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {/* Display individual approvals (if needed) */}
      <div>
        <h4>Individual Approvals</h4>
        {individualApprovals.map((approval) => (
          <div key={approval.id} className="individual-approval">
            <p>Document: {approval.documentName}</p>
            <p>Status: {approval.status}</p>
            <p>Group: {approval.groupingId}</p>
            {approval.status === 'pending' && (
              <div>
                <button onClick={() => updateApproval(approval.id, { status: 'approved' })}>
                  Approve
                </button>
                <button onClick={() => updateApproval(approval.id, { status: 'rejected' })}>
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Example: Bulk operations on grouped documents
export function BulkApprovalComponent({ groupingId }: { groupingId: string }) {
  const { individualApprovals, updateApproval } = useKbApprovalStore()
  
  // Get all documents in this group
  const groupDocuments = individualApprovals.filter(
    approval => approval.groupingId === groupingId
  )
  
  const handleBulkApprove = async () => {
    // Approve all pending documents in the group
    const pendingDocs = groupDocuments.filter(doc => doc.status === 'pending')
    
    for (const doc of pendingDocs) {
      await updateApproval(doc.id, { status: 'approved' })
    }
  }
  
  const handleBulkReject = async () => {
    // Reject all pending documents in the group
    const pendingDocs = groupDocuments.filter(doc => doc.status === 'pending')
    
    for (const doc of pendingDocs) {
      await updateApproval(doc.id, { status: 'rejected' })
    }
  }
  
  return (
    <div>
      <h4>Bulk Actions for Group: {groupingId}</h4>
      <p>Documents in group: {groupDocuments.length}</p>
      <button onClick={handleBulkApprove}>Approve All</button>
      <button onClick={handleBulkReject}>Reject All</button>
    </div>
  )
}
