ALTER TABLE "workflow_execution_logs" ADD COLUMN "chat_id" text;--> statement-breakpoint
CREATE INDEX "workflow_execution_logs_chat_id_idx" ON "workflow_execution_logs" USING btree ("chat_id");
