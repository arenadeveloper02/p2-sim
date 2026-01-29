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
	"arena_token" text
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
ALTER TABLE "workflow_execution_logs" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "is_external_chat" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "chat_id" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "conversation_id" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "initial_input" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "final_chat_output" text;--> statement-breakpoint
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_knowledge_base" ADD CONSTRAINT "user_knowledge_base_user_id_ref_user_id_fk" FOREIGN KEY ("user_id_ref") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_knowledge_base" ADD CONSTRAINT "user_knowledge_base_user_workspace_id_ref_workspace_id_fk" FOREIGN KEY ("user_workspace_id_ref") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_knowledge_base" ADD CONSTRAINT "user_knowledge_base_knowledge_base_id_ref_knowledge_base_id_fk" FOREIGN KEY ("knowledge_base_id_ref") REFERENCES "public"."knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_knowledge_base" ADD CONSTRAINT "user_knowledge_base_kb_workspace_id_ref_workspace_id_fk" FOREIGN KEY ("kb_workspace_id_ref") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_tokens_alias_idx" ON "account_tokens" USING btree ("alias");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_account_tokens_on_provider_alias" ON "account_tokens" USING btree ("provider_id","alias");--> statement-breakpoint
CREATE INDEX "chat_prompt_feedback_created_at_idx" ON "chat_prompt_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "deployed_chat_chat_id_idx" ON "deployed_chat" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "deployed_chat_workflow_id_idx" ON "deployed_chat" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "user_arena_details__airbyte_raw_id_idx" ON "user_arena_details" USING btree ("_airbyte_raw_id");--> statement-breakpoint
CREATE INDEX "user_kb_user_id_ref_idx" ON "user_knowledge_base" USING btree ("user_id_ref");--> statement-breakpoint
CREATE INDEX "user_kb_user_workspace_id_ref_idx" ON "user_knowledge_base" USING btree ("user_workspace_id_ref");--> statement-breakpoint
CREATE INDEX "user_kb_kb_id_ref_idx" ON "user_knowledge_base" USING btree ("knowledge_base_id_ref");--> statement-breakpoint
CREATE INDEX "user_kb_kb_workspace_id_ref_idx" ON "user_knowledge_base" USING btree ("kb_workspace_id_ref");--> statement-breakpoint
CREATE INDEX "user_kb_user_kb_idx" ON "user_knowledge_base" USING btree ("user_id_ref","knowledge_base_id_ref");--> statement-breakpoint
CREATE INDEX "user_kb_user_workspace_kb_idx" ON "user_knowledge_base" USING btree ("user_workspace_id_ref","knowledge_base_id_ref");--> statement-breakpoint
CREATE INDEX "user_kb_deleted_at_idx" ON "user_knowledge_base" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "workflow_stats_daily_workflow_id_idx" ON "workflow_stats_daily" USING btree ("workflow_id_ref");--> statement-breakpoint
CREATE INDEX "workflow_stats_daily_workflow_author_id_idx" ON "workflow_stats_daily" USING btree ("workflow_author_id");--> statement-breakpoint
CREATE INDEX "workflow_stats_monthly_workflow_id_idx" ON "workflow_stats_monthly" USING btree ("workflow_id_ref");--> statement-breakpoint
CREATE INDEX "workflow_stats_monthly_workflow_author_id_idx" ON "workflow_stats_monthly" USING btree ("workflow_author_id");