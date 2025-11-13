-- Add chat_id column to workflow_execution_logs table
ALTER TABLE "workflow_execution_logs" ADD COLUMN "chat_id" text;

-- Add index for chat_id column
CREATE INDEX "workflow_execution_logs_chat_id_idx" ON "workflow_execution_logs" ("chat_id");
