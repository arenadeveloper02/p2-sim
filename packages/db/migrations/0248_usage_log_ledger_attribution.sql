ALTER TABLE "usage_log" ADD COLUMN "raw_cost" numeric;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "billable_cost" numeric;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "vendor" text;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "tool_id" text;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "chat_id" uuid;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "quantity" numeric;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "pricing_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_chat_id_copilot_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."copilot_chats"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "usage_log" VALIDATE CONSTRAINT "usage_log_chat_id_copilot_chats_id_fk";--> statement-breakpoint
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_run_id_copilot_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."copilot_runs"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "usage_log" VALIDATE CONSTRAINT "usage_log_run_id_copilot_runs_id_fk";--> statement-breakpoint
COMMIT;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "usage_log_workspace_source_created_at_idx" ON "usage_log" USING btree ("workspace_id","source","created_at");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "usage_log_chat_id_idx" ON "usage_log" USING btree ("chat_id") WHERE "usage_log"."chat_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "usage_log_run_id_idx" ON "usage_log" USING btree ("run_id") WHERE "usage_log"."run_id" IS NOT NULL;
