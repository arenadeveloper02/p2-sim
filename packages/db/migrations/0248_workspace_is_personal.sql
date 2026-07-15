-- migration-safe: additive column with default; backfill targets workspace_mode = 'personal' only and is idempotent
ALTER TABLE "workspace" ADD COLUMN IF NOT EXISTS "is_personal" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- migration-safe: idempotent backfill — only rows still on legacy personal mode, safe under concurrent writes
UPDATE "workspace"
SET "is_personal" = true
WHERE "workspace_mode" = 'personal' AND "is_personal" = false;
--> statement-breakpoint
-- migration-safe: idempotent mode flip for org-attached personal workspaces already migrated in data
UPDATE "workspace"
SET "workspace_mode" = 'organization'
WHERE "workspace_mode" = 'personal' AND "organization_id" IS NOT NULL;
--> statement-breakpoint
COMMIT;--> statement-breakpoint
SET lock_timeout = 0;--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "workspace_owner_personal_uidx" ON "workspace" USING btree ("owner_id") WHERE "is_personal" = true AND "archived_at" IS NULL;--> statement-breakpoint
SET lock_timeout = '5s';
