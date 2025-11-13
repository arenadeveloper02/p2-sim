-- Add final_chat_output column to workflow_execution_logs table
ALTER TABLE "workflow_execution_logs" ADD COLUMN "final_chat_output" text;

