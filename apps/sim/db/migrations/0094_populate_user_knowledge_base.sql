-- ============================================================================
-- Script to populate user_knowledge_base table
-- ============================================================================
-- This script creates entries for all users based on:
-- 1. Knowledge bases in workspaces where user has permissions (via permissions table)
-- 2. Knowledge bases in workspaces user owns (via workspace.owner_id)
-- 3. Knowledge bases user owns directly (legacy KBs without workspace)
--
-- IMPORTANT: 
-- - This script is idempotent - it will NOT create duplicate entries
--   if entries already exist for a user+knowledge_base combination.
-- - This script includes DELETED knowledge bases and sets their deleted_at
--   column accordingly to maintain data consistency.
-- ============================================================================

-- First, let's see what we're working with
-- Uncomment to check counts before running:
-- SELECT COUNT(*) as total_users FROM "user";
-- SELECT COUNT(*) as total_workspaces FROM workspace;
-- SELECT COUNT(*) as total_knowledge_bases FROM knowledge_base;
-- SELECT COUNT(*) as total_permissions FROM permissions WHERE entity_type = 'workspace';
-- SELECT COUNT(*) as existing_user_kb_entries FROM user_knowledge_base WHERE deleted_at IS NULL;

-- Start transaction for safety (can rollback if needed)
BEGIN;

-- ============================================================================
-- Main INSERT statement
-- ============================================================================
-- This uses UNION to combine three scenarios:
--
-- Scenario 1: KBs in workspaces where user has permissions
--   - User has a permission record (read/write/admin) on a workspace
--   - All KBs in that workspace become accessible to the user
--   - user_workspace_id_ref = workspace user has permission on
--   - kb_workspace_id_ref = workspace the KB belongs to
--
-- Scenario 2: KBs in workspaces user owns
--   - User is the owner of a workspace (workspace.owner_id = user.id)
--   - All KBs in that workspace become accessible to the user
--   - user_workspace_id_ref = workspace user owns
--   - kb_workspace_id_ref = workspace the KB belongs to
--
-- Scenario 3: KBs user owns directly (legacy, no workspace)
--   - KBs created before workspace feature (workspace_id IS NULL)
--   - Only accessible to the user who created them
--   - user_workspace_id_ref = '' (empty, no workspace context)
--   - kb_workspace_id_ref = '' (empty, KB has no workspace)
-- ============================================================================

INSERT INTO user_knowledge_base (
    id,
    user_id_ref,
    user_workspace_id_ref,
    knowledge_base_id_ref,
    kb_workspace_id_ref,
    knowledge_base_name_ref,
    created_at,
    updated_at,
    deleted_at
)
SELECT DISTINCT
    gen_random_uuid()::text AS id,
    user_id,
    user_workspace_id,
    kb_id,
    kb_workspace_id,
    kb_name,
    NOW() AS created_at,
    NOW() AS updated_at,
    kb_deleted_at AS deleted_at
FROM (
    -- Scenario 1: KBs in workspaces where user has permissions (including deleted KBs)
    SELECT DISTINCT
        p.user_id AS user_id,
        p.entity_id AS user_workspace_id,
        kb.id AS kb_id,
        COALESCE(kb.workspace_id, '') AS kb_workspace_id,
        kb.name AS kb_name,
        kb.deleted_at AS kb_deleted_at
    FROM permissions p
    INNER JOIN knowledge_base kb ON (
        kb.workspace_id = p.entity_id
    )
    WHERE p.entity_type = 'workspace'
    
    UNION
    
    -- Scenario 2: KBs in workspaces user owns (including deleted KBs)
    SELECT DISTINCT
        ws.owner_id AS user_id,
        ws.id AS user_workspace_id,
        kb.id AS kb_id,
        COALESCE(kb.workspace_id, '') AS kb_workspace_id,
        kb.name AS kb_name,
        kb.deleted_at AS kb_deleted_at
    FROM workspace ws
    INNER JOIN knowledge_base kb ON (
        kb.workspace_id = ws.id
    )
    
    UNION
    
    -- Scenario 3: KBs user owns directly (legacy, no workspace) (including deleted KBs)
    SELECT DISTINCT
        kb.user_id AS user_id,
        '' AS user_workspace_id,
        kb.id AS kb_id,
        '' AS kb_workspace_id,
        kb.name AS kb_name,
        kb.deleted_at AS kb_deleted_at
    FROM knowledge_base kb
    WHERE kb.workspace_id IS NULL
) AS all_user_kb_access
WHERE
    -- Exclude already existing entries (to avoid duplicates)
    -- This checks for entries regardless of deleted_at status
    NOT EXISTS (
        SELECT 1 
        FROM user_knowledge_base ukb
        WHERE ukb.user_id_ref = all_user_kb_access.user_id
        AND ukb.knowledge_base_id_ref = all_user_kb_access.kb_id
    );

-- Commit the transaction
-- If you want to review first, change COMMIT to ROLLBACK
COMMIT;

-- ============================================================================
-- Verification queries (uncomment to run after the script)
-- ============================================================================

-- Check total entries created
-- SELECT 
--     COUNT(*) as total_entries,
--     COUNT(DISTINCT user_id_ref) as unique_users,
--     COUNT(DISTINCT knowledge_base_id_ref) as unique_knowledge_bases
-- FROM user_knowledge_base 
-- WHERE deleted_at IS NULL;

-- Check entries per user
-- SELECT 
--     u.email,
--     COUNT(ukb.id) as kb_count
-- FROM "user" u
-- LEFT JOIN user_knowledge_base ukb ON ukb.user_id_ref = u.id AND ukb.deleted_at IS NULL
-- GROUP BY u.id, u.email
-- ORDER BY kb_count DESC;

-- Check entries per workspace
-- SELECT 
--     ws.name as workspace_name,
--     COUNT(DISTINCT ukb.user_id_ref) as user_count,
--     COUNT(DISTINCT ukb.knowledge_base_id_ref) as kb_count
-- FROM workspace ws
-- INNER JOIN user_knowledge_base ukb ON ukb.kb_workspace_id_ref = ws.id
-- WHERE ukb.deleted_at IS NULL
-- GROUP BY ws.id, ws.name
-- ORDER BY kb_count DESC;

