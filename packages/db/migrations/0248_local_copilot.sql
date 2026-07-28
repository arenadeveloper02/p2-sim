-- Arena Copilot tables (self-hosted workflow assistant)

CREATE TYPE "public"."local_copilot_patch_status" AS ENUM('pending', 'applied', 'rejected', 'expired');
CREATE TYPE "public"."local_copilot_audit_status" AS ENUM('success', 'failure', 'rejected');

CREATE TABLE IF NOT EXISTS "local_copilot_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "workspace_id" text NOT NULL,
  "workflow_id" text,
  "title" text,
  "model" text NOT NULL,
  "provider" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "local_copilot_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "role" text NOT NULL,
  "content" jsonb NOT NULL,
  "seq" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "local_copilot_tool_calls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "message_id" uuid,
  "tool_name" text NOT NULL,
  "tool_call_id" text NOT NULL,
  "arguments" jsonb DEFAULT '{}' NOT NULL,
  "result" jsonb,
  "status" text DEFAULT 'completed' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);

CREATE TABLE IF NOT EXISTS "local_copilot_patches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "workflow_id" text NOT NULL,
  "summary" text NOT NULL,
  "patch" jsonb NOT NULL,
  "status" "local_copilot_patch_status" DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp
);

CREATE TABLE IF NOT EXISTS "local_copilot_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "workspace_id" text NOT NULL,
  "workflow_id" text,
  "conversation_id" uuid,
  "patch_id" uuid,
  "action" text NOT NULL,
  "summary" text,
  "status" "local_copilot_audit_status" DEFAULT 'success' NOT NULL,
  "metadata" jsonb DEFAULT '{}' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "local_copilot_conversations" ADD CONSTRAINT "local_copilot_conversations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "local_copilot_conversations" ADD CONSTRAINT "local_copilot_conversations_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "local_copilot_conversations" ADD CONSTRAINT "local_copilot_conversations_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "local_copilot_messages" ADD CONSTRAINT "local_copilot_messages_conversation_id_local_copilot_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."local_copilot_conversations"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "local_copilot_tool_calls" ADD CONSTRAINT "local_copilot_tool_calls_conversation_id_local_copilot_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."local_copilot_conversations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "local_copilot_tool_calls" ADD CONSTRAINT "local_copilot_tool_calls_message_id_local_copilot_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."local_copilot_messages"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "local_copilot_patches" ADD CONSTRAINT "local_copilot_patches_conversation_id_local_copilot_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."local_copilot_conversations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "local_copilot_patches" ADD CONSTRAINT "local_copilot_patches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "local_copilot_patches" ADD CONSTRAINT "local_copilot_patches_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "local_copilot_audit_logs" ADD CONSTRAINT "local_copilot_audit_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "local_copilot_audit_logs" ADD CONSTRAINT "local_copilot_audit_logs_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "local_copilot_audit_logs" ADD CONSTRAINT "local_copilot_audit_logs_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "local_copilot_audit_logs" ADD CONSTRAINT "local_copilot_audit_logs_conversation_id_local_copilot_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."local_copilot_conversations"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "local_copilot_audit_logs" ADD CONSTRAINT "local_copilot_audit_logs_patch_id_local_copilot_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."local_copilot_patches"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "local_copilot_conversations_user_id_idx" ON "local_copilot_conversations" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "local_copilot_conversations_workspace_id_idx" ON "local_copilot_conversations" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "local_copilot_conversations_workflow_id_idx" ON "local_copilot_conversations" USING btree ("workflow_id");
CREATE INDEX IF NOT EXISTS "local_copilot_conversations_user_workflow_idx" ON "local_copilot_conversations" USING btree ("user_id","workflow_id");
CREATE INDEX IF NOT EXISTS "local_copilot_conversations_updated_at_idx" ON "local_copilot_conversations" USING btree ("updated_at");

CREATE INDEX IF NOT EXISTS "local_copilot_messages_conversation_seq_idx" ON "local_copilot_messages" USING btree ("conversation_id","seq");

CREATE INDEX IF NOT EXISTS "local_copilot_tool_calls_conversation_id_idx" ON "local_copilot_tool_calls" USING btree ("conversation_id");
CREATE INDEX IF NOT EXISTS "local_copilot_tool_calls_tool_call_id_idx" ON "local_copilot_tool_calls" USING btree ("tool_call_id");

CREATE INDEX IF NOT EXISTS "local_copilot_patches_conversation_id_idx" ON "local_copilot_patches" USING btree ("conversation_id");
CREATE INDEX IF NOT EXISTS "local_copilot_patches_workflow_id_idx" ON "local_copilot_patches" USING btree ("workflow_id");
CREATE INDEX IF NOT EXISTS "local_copilot_patches_status_idx" ON "local_copilot_patches" USING btree ("status");

CREATE INDEX IF NOT EXISTS "local_copilot_audit_logs_user_id_idx" ON "local_copilot_audit_logs" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "local_copilot_audit_logs_workspace_id_idx" ON "local_copilot_audit_logs" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "local_copilot_audit_logs_workflow_id_idx" ON "local_copilot_audit_logs" USING btree ("workflow_id");
CREATE INDEX IF NOT EXISTS "local_copilot_audit_logs_created_at_idx" ON "local_copilot_audit_logs" USING btree ("created_at");
