-- Phase 1 expand: actor/lineage/triggering attribution on usage_log and workflow_execution_logs.
-- Indexes on existing tables use CONCURRENTLY (COMMIT breakpoint) per scripts/migrate.ts.
ALTER TABLE "usage_log" ADD COLUMN "actor_user_id" text;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "actor_type" text;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "api_key_id" text;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "parent_execution_id" text;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "root_execution_id" text;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "triggering_chat_id" text;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "triggering_run_id" text;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "occurred_at" timestamp;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "billable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "parent_execution_id" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "root_execution_id" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "actor_user_id" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "actor_type" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "api_key_id" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "triggering_chat_id" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "triggering_run_id" text;--> statement-breakpoint
COMMIT;--> statement-breakpoint
SET lock_timeout = 0;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "usage_log_billing_entity_period_billable_idx" ON "usage_log" USING btree ("billing_entity_type","billing_entity_id","billing_period_start","billing_period_end") WHERE "usage_log"."billable" = true AND "usage_log"."billing_entity_type" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "usage_log_workspace_occurred_at_idx" ON "usage_log" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "usage_log_actor_user_occurred_at_idx" ON "usage_log" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "usage_log_root_execution_id_idx" ON "usage_log" USING btree ("root_execution_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_execution_logs_workspace_actor_user_idx" ON "workflow_execution_logs" USING btree ("workspace_id","actor_user_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_execution_logs_root_execution_id_idx" ON "workflow_execution_logs" USING btree ("root_execution_id");--> statement-breakpoint
SET lock_timeout = '5s';
