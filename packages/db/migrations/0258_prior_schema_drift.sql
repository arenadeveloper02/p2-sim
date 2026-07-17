CREATE TYPE "public"."help_support_issue_type" AS ENUM('bug', 'feedback', 'feature_request', 'other');--> statement-breakpoint
CREATE TYPE "public"."local_copilot_audit_status" AS ENUM('success', 'failure', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."local_copilot_patch_status" AS ENUM('pending', 'applied', 'rejected', 'expired');--> statement-breakpoint
CREATE TABLE "account_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"id_token" text,
	"scope" text,
	"alias" text,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_task_summary" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id_ref" text NOT NULL,
	"client_name" text NOT NULL,
	"type" text,
	"one_day_summary" text,
	"seven_day_summary" text,
	"fourteen_day_summary" text,
	"created_date" timestamp DEFAULT now() NOT NULL,
	"updated_date" timestamp DEFAULT now() NOT NULL,
	"start_time" timestamp,
	"end_time" timestamp,
	"status" text NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"run_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "banner_messages" (
	"id" text NOT NULL,
	"message" text,
	"success" boolean,
	"type" text NOT NULL,
	"is_active" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_accounts" (
	"account_id" varchar(100) NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"account_type" varchar(50) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_prompt_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"comment" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"in_complete" boolean DEFAULT false,
	"in_accurate" boolean DEFAULT false,
	"out_of_date" boolean DEFAULT false,
	"too_long" boolean DEFAULT false,
	"too_short" boolean DEFAULT false,
	"liked" boolean DEFAULT false,
	"execution_id" text NOT NULL,
	"workflow_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_channel_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"channel_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_details" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_name" text,
	"gmail_domain" text,
	"client_customer_id" text,
	"client_manager" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "default_user_workflows" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_workflow_id" text NOT NULL,
	"user_workflow_id" text NOT NULL,
	"user_workspace_id" text NOT NULL,
	"last_synced_at" timestamp,
	"last_deployed_version" integer,
	"archived_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployed_chat" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"chat_id" text,
	"title" text,
	"workflow_id" text,
	"executing_user_id" text
);
--> statement-breakpoint
CREATE TABLE "gmail_client_summary" (
	"id" text PRIMARY KEY NOT NULL,
	"run_date" date NOT NULL,
	"status" text NOT NULL,
	"run_start_time" timestamp,
	"run_end_time" timestamp,
	"client_id" text,
	"client_name" text,
	"client_domain" text,
	"type" text,
	"one_day_summary" text,
	"seven_day_summary" text
);
--> statement-breakpoint
CREATE TABLE "help_support_issue" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL,
	"workspace_id" text,
	"workflow_id" text,
	"type" "help_support_issue_type" NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_copilot_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"workflow_id" text,
	"conversation_id" uuid,
	"patch_id" uuid,
	"action" text NOT NULL,
	"summary" text,
	"status" "local_copilot_audit_status" DEFAULT 'success' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_copilot_conversations" (
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
--> statement-breakpoint
CREATE TABLE "local_copilot_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"seq" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_copilot_patches" (
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
--> statement-breakpoint
CREATE TABLE "local_copilot_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid,
	"tool_name" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"arguments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "local_copilot_user_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"has_access" boolean DEFAULT false NOT NULL,
	"local_only" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_summary" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id_ref" text NOT NULL,
	"client_name" text NOT NULL,
	"meeting_type" text,
	"type" text,
	"one_day_summary" text,
	"seven_day_summary" text,
	"fourteen_day_summary" text,
	"created_date" timestamp DEFAULT now() NOT NULL,
	"updated_date" timestamp DEFAULT now() NOT NULL,
	"start_time" timestamp,
	"end_time" timestamp,
	"status" text NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"run_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_user_connections_v1" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id_ref" varchar(64) NOT NULL,
	"platform_id" text NOT NULL,
	"platform_type" varchar(64) NOT NULL,
	"is_connected" boolean DEFAULT true NOT NULL,
	"is_shown" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	"name" text,
	"account_id" varchar,
	"user_email" varchar,
	"user_persona" text,
	"file_name" varchar,
	"default_persona" text,
	"time_zone" varchar,
	"synced" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overall_client_summary" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id_ref" text NOT NULL,
	"client_name" text NOT NULL,
	"type" text,
	"one_day_summary" text,
	"seven_day_summary" text,
	"fourteen_day_summary" text,
	"daily_summary_changes" text,
	"weekly_sentiment" text,
	"created_date" timestamp DEFAULT now() NOT NULL,
	"updated_date" timestamp DEFAULT now() NOT NULL,
	"start_time" timestamp,
	"end_time" timestamp,
	"status" text NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"run_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_config" (
	"id" text PRIMARY KEY NOT NULL,
	"key" varchar(256) NOT NULL,
	"prompt" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "slack_summary" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id_ref" text NOT NULL,
	"client_name" text NOT NULL,
	"channel_id_ref" text NOT NULL,
	"channel_name" text NOT NULL,
	"channel_type" text NOT NULL,
	"type" text,
	"one_day_summary" text,
	"seven_day_summary" text,
	"fourteen_day_summary" text,
	"created_date" timestamp DEFAULT now() NOT NULL,
	"updated_date" timestamp DEFAULT now() NOT NULL,
	"start_time" timestamp,
	"end_time" timestamp,
	"status" text NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"run_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_arena_details" (
	"id" text,
	"user_type" text,
	"created_at" timestamp,
	"department" text,
	"updated_at" timestamp,
	"user_id_ref" text,
	"arena_user_id_ref" text,
	"_airbyte_raw_id" text,
	"_airbyte_extracted_at" timestamp with time zone,
	"_airbyte_generation_id" bigint,
	"_airbyte_meta" jsonb,
	"arena_token" text,
	"timezone" text,
	"persona" text
);
--> statement-breakpoint
CREATE TABLE "user_knowledge_base" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id_ref" text DEFAULT '' NOT NULL,
	"user_workspace_id_ref" text DEFAULT '' NOT NULL,
	"knowledge_base_id_ref" text DEFAULT '' NOT NULL,
	"kb_workspace_id_ref" text DEFAULT '' NOT NULL,
	"knowledge_base_name_ref" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workflow_queries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"query" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_stats_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id_ref" text,
	"workflow_name" text,
	"workflow_author_id" text,
	"workflow_author_name" text,
	"category" text,
	"execution_count" integer DEFAULT 0 NOT NULL,
	"execution_date" date NOT NULL,
	"executor_name" text,
	"executor_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_stats_monthly" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id_ref" text,
	"workflow_name" text,
	"workflow_author_id" text,
	"workflow_author_name" text,
	"category" text,
	"execution_count" integer DEFAULT 0 NOT NULL,
	"execution_month" integer NOT NULL,
	"executor_name" text,
	"executor_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "remarks" text;--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "permission_group" ADD COLUMN "auto_add_new_members" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow" ADD COLUMN "default_agent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "is_external_chat" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "chat_id" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "conversation_id" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "initial_input" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "final_chat_output" text;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "is_personal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "default_user_workflows" ADD CONSTRAINT "default_user_workflows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_support_issue" ADD CONSTRAINT "help_support_issue_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_support_issue" ADD CONSTRAINT "help_support_issue_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_support_issue" ADD CONSTRAINT "help_support_issue_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_copilot_audit_logs" ADD CONSTRAINT "local_copilot_audit_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_copilot_audit_logs" ADD CONSTRAINT "local_copilot_audit_logs_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_copilot_audit_logs" ADD CONSTRAINT "local_copilot_audit_logs_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_copilot_audit_logs" ADD CONSTRAINT "local_copilot_audit_logs_conversation_id_local_copilot_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."local_copilot_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_copilot_audit_logs" ADD CONSTRAINT "local_copilot_audit_logs_patch_id_local_copilot_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."local_copilot_patches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_copilot_conversations" ADD CONSTRAINT "local_copilot_conversations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_copilot_conversations" ADD CONSTRAINT "local_copilot_conversations_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_copilot_conversations" ADD CONSTRAINT "local_copilot_conversations_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_copilot_messages" ADD CONSTRAINT "local_copilot_messages_conversation_id_local_copilot_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."local_copilot_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_copilot_patches" ADD CONSTRAINT "local_copilot_patches_conversation_id_local_copilot_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."local_copilot_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_copilot_patches" ADD CONSTRAINT "local_copilot_patches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_copilot_patches" ADD CONSTRAINT "local_copilot_patches_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_copilot_tool_calls" ADD CONSTRAINT "local_copilot_tool_calls_conversation_id_local_copilot_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."local_copilot_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_copilot_tool_calls" ADD CONSTRAINT "local_copilot_tool_calls_message_id_local_copilot_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."local_copilot_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_copilot_user_access" ADD CONSTRAINT "local_copilot_user_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_knowledge_base" ADD CONSTRAINT "user_knowledge_base_user_id_ref_user_id_fk" FOREIGN KEY ("user_id_ref") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_knowledge_base" ADD CONSTRAINT "user_knowledge_base_user_workspace_id_ref_workspace_id_fk" FOREIGN KEY ("user_workspace_id_ref") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_knowledge_base" ADD CONSTRAINT "user_knowledge_base_knowledge_base_id_ref_knowledge_base_id_fk" FOREIGN KEY ("knowledge_base_id_ref") REFERENCES "public"."knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_knowledge_base" ADD CONSTRAINT "user_knowledge_base_kb_workspace_id_ref_workspace_id_fk" FOREIGN KEY ("kb_workspace_id_ref") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_queries" ADD CONSTRAINT "workflow_queries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_queries" ADD CONSTRAINT "workflow_queries_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_tokens_alias_idx" ON "account_tokens" USING btree ("alias");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_account_tokens_on_provider_alias" ON "account_tokens" USING btree ("provider_id","alias");--> statement-breakpoint
CREATE INDEX "arena_task_summary_client_id_ref_idx" ON "arena_task_summary" USING btree ("client_id_ref");--> statement-breakpoint
CREATE INDEX "arena_task_summary_status_idx" ON "arena_task_summary" USING btree ("status");--> statement-breakpoint
CREATE INDEX "arena_task_summary_run_date_idx" ON "arena_task_summary" USING btree ("run_date");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_accounts_pkey" ON "channel_accounts" USING btree ("account_id","account_type");--> statement-breakpoint
CREATE INDEX "chat_prompt_feedback_created_at_idx" ON "chat_prompt_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "client_channel_mapping_client_id_idx" ON "client_channel_mapping" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_channel_mapping_channel_id_idx" ON "client_channel_mapping" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "client_details_client_id_idx" ON "client_details" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "default_user_workflows_user_source_unique" ON "default_user_workflows" USING btree ("user_id","source_workflow_id");--> statement-breakpoint
CREATE INDEX "default_user_workflows_source_workflow_id_idx" ON "default_user_workflows" USING btree ("source_workflow_id");--> statement-breakpoint
CREATE INDEX "default_user_workflows_user_workflow_id_idx" ON "default_user_workflows" USING btree ("user_workflow_id");--> statement-breakpoint
CREATE INDEX "default_user_workflows_archived_at_idx" ON "default_user_workflows" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "deployed_chat_chat_id_idx" ON "deployed_chat" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "deployed_chat_workflow_id_idx" ON "deployed_chat" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "gmail_client_summary_client_id_idx" ON "gmail_client_summary" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "gmail_client_summary_status_idx" ON "gmail_client_summary" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gmail_client_summary_run_date_idx" ON "gmail_client_summary" USING btree ("run_date");--> statement-breakpoint
CREATE INDEX "help_support_issue_user_id_idx" ON "help_support_issue" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "help_support_issue_workspace_id_idx" ON "help_support_issue" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "help_support_issue_workflow_id_idx" ON "help_support_issue" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "help_support_issue_type_idx" ON "help_support_issue" USING btree ("type");--> statement-breakpoint
CREATE INDEX "help_support_issue_created_at_idx" ON "help_support_issue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "local_copilot_audit_logs_user_id_idx" ON "local_copilot_audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "local_copilot_audit_logs_workspace_id_idx" ON "local_copilot_audit_logs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "local_copilot_audit_logs_workflow_id_idx" ON "local_copilot_audit_logs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "local_copilot_audit_logs_created_at_idx" ON "local_copilot_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "local_copilot_conversations_user_id_idx" ON "local_copilot_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "local_copilot_conversations_workspace_id_idx" ON "local_copilot_conversations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "local_copilot_conversations_workflow_id_idx" ON "local_copilot_conversations" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "local_copilot_conversations_user_workflow_idx" ON "local_copilot_conversations" USING btree ("user_id","workflow_id");--> statement-breakpoint
CREATE INDEX "local_copilot_conversations_updated_at_idx" ON "local_copilot_conversations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "local_copilot_messages_conversation_seq_idx" ON "local_copilot_messages" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE INDEX "local_copilot_patches_conversation_id_idx" ON "local_copilot_patches" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "local_copilot_patches_workflow_id_idx" ON "local_copilot_patches" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "local_copilot_patches_status_idx" ON "local_copilot_patches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "local_copilot_tool_calls_conversation_id_idx" ON "local_copilot_tool_calls" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "local_copilot_tool_calls_tool_call_id_idx" ON "local_copilot_tool_calls" USING btree ("tool_call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "local_copilot_user_access_user_id_uidx" ON "local_copilot_user_access" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "local_copilot_user_access_email_idx" ON "local_copilot_user_access" USING btree ("email");--> statement-breakpoint
CREATE INDEX "meeting_summary_client_id_ref_idx" ON "meeting_summary" USING btree ("client_id_ref");--> statement-breakpoint
CREATE INDEX "meeting_summary_status_idx" ON "meeting_summary" USING btree ("status");--> statement-breakpoint
CREATE INDEX "meeting_summary_run_date_idx" ON "meeting_summary" USING btree ("run_date");--> statement-breakpoint
CREATE INDEX "overall_client_summary_client_id_ref_idx" ON "overall_client_summary" USING btree ("client_id_ref");--> statement-breakpoint
CREATE INDEX "overall_client_summary_status_idx" ON "overall_client_summary" USING btree ("status");--> statement-breakpoint
CREATE INDEX "overall_client_summary_run_date_idx" ON "overall_client_summary" USING btree ("run_date");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_config_key_idx" ON "prompt_config" USING btree ("key");--> statement-breakpoint
CREATE INDEX "slack_summary_client_id_ref_idx" ON "slack_summary" USING btree ("client_id_ref");--> statement-breakpoint
CREATE INDEX "slack_summary_channel_id_ref_idx" ON "slack_summary" USING btree ("channel_id_ref");--> statement-breakpoint
CREATE INDEX "slack_summary_status_idx" ON "slack_summary" USING btree ("status");--> statement-breakpoint
CREATE INDEX "slack_summary_run_date_idx" ON "slack_summary" USING btree ("run_date");--> statement-breakpoint
CREATE INDEX "slack_summary_client_channel_idx" ON "slack_summary" USING btree ("client_id_ref","channel_id_ref");--> statement-breakpoint
CREATE INDEX "user_arena_details__airbyte_raw_id_idx" ON "user_arena_details" USING btree ("_airbyte_raw_id");--> statement-breakpoint
CREATE INDEX "user_kb_user_id_ref_idx" ON "user_knowledge_base" USING btree ("user_id_ref");--> statement-breakpoint
CREATE INDEX "user_kb_user_workspace_id_ref_idx" ON "user_knowledge_base" USING btree ("user_workspace_id_ref");--> statement-breakpoint
CREATE INDEX "user_kb_kb_id_ref_idx" ON "user_knowledge_base" USING btree ("knowledge_base_id_ref");--> statement-breakpoint
CREATE INDEX "user_kb_kb_workspace_id_ref_idx" ON "user_knowledge_base" USING btree ("kb_workspace_id_ref");--> statement-breakpoint
CREATE INDEX "user_kb_user_kb_idx" ON "user_knowledge_base" USING btree ("user_id_ref","knowledge_base_id_ref");--> statement-breakpoint
CREATE INDEX "user_kb_user_workspace_kb_idx" ON "user_knowledge_base" USING btree ("user_workspace_id_ref","knowledge_base_id_ref");--> statement-breakpoint
CREATE INDEX "user_kb_deleted_at_idx" ON "user_knowledge_base" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "workflow_queries_workflow_id_idx" ON "workflow_queries" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_queries_user_id_idx" ON "workflow_queries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workflow_stats_daily_workflow_id_idx" ON "workflow_stats_daily" USING btree ("workflow_id_ref");--> statement-breakpoint
CREATE INDEX "workflow_stats_daily_workflow_author_id_idx" ON "workflow_stats_daily" USING btree ("workflow_author_id");--> statement-breakpoint
CREATE INDEX "workflow_stats_monthly_workflow_id_idx" ON "workflow_stats_monthly" USING btree ("workflow_id_ref");--> statement-breakpoint
CREATE INDEX "workflow_stats_monthly_workflow_author_id_idx" ON "workflow_stats_monthly" USING btree ("workflow_author_id");--> statement-breakpoint
-- workflow is an existing table: build its new index CONCURRENTLY so the build never
-- write-locks the relation (runner convention — plain CREATE INDEX takes ACCESS EXCLUSIVE).
COMMIT;--> statement-breakpoint
SET lock_timeout = 0;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_default_agent_idx" ON "workflow" USING btree ("default_agent");--> statement-breakpoint
SET lock_timeout = '5s';