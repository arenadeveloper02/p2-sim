-- Ensure unique index exists for ON CONFLICT (workflow_id, state_hash) in snapshot upserts.
-- Fixes PostgresError 42P10 (infer_arbiter_indexes) on DBs where this index was missing.
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_snapshots_workflow_hash_idx" ON "workflow_execution_snapshots" USING btree ("workflow_id","state_hash");
