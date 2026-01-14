-- Fix circular parentId reference for workflow c74ab3ab-0d0e-42f7-9796-7919bb6a1f29
-- 
-- The issue: Loop "Write Links Loop" (65957620-6bd1-4d4d-9182-bbf411875c55) 
-- has parentId pointing to "Loop 1" (a2c7fbf5-111b-41d3-a020-a564cc777a90),
-- and "Loop 1" has parentId pointing back to "Write Links Loop"
--
-- Solution: Remove parentId from "Loop 1" since it's the inner nested loop
-- Nested loops should not have parentId references to their containing loops

UPDATE workflow_blocks
SET data = jsonb_set(
  jsonb_set(
    data::jsonb,
    '{parentId}',
    'null'::jsonb
  ),
  '{extent}',
  'null'::jsonb
)
WHERE id = 'a2c7fbf5-111b-41d3-a020-a564cc777a90'
  AND workflow_id = 'c74ab3ab-0d0e-42f7-9796-7919bb6a1f29'
  AND data->>'parentId' = '65957620-6bd1-4d4d-9182-bbf411875c55';

-- Alternative: If the above doesn't work, you can completely remove parentId and extent:
-- UPDATE workflow_blocks
-- SET data = data::jsonb - 'parentId' - 'extent'
-- WHERE id = 'a2c7fbf5-111b-41d3-a020-a564cc777a90'
--   AND workflow_id = 'c74ab3ab-0d0e-42f7-9796-7919bb6a1f29';

