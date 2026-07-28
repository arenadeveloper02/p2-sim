-- Restrict selected users to the in-deployment Local copilot only.
-- local_only takes precedence over has_access: when true the Local/Cloud
-- switch is hidden and the backend is forced to `local`.
-- Additive column with a default is expand-safe: existing rows backfill to
-- false and already-deployed app code ignores the column.
ALTER TABLE "local_copilot_user_access" ADD COLUMN IF NOT EXISTS "local_only" boolean DEFAULT false NOT NULL;
