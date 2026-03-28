CREATE TABLE IF NOT EXISTS "prompt_config" (
	"id" text PRIMARY KEY NOT NULL,
	"key" varchar(256) NOT NULL,
	"prompt" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prompt_config_key_idx" ON "prompt_config" USING btree ("key");

ALTER TABLE "workflow_execution_logs" ADD COLUMN IF NOT EXISTS "conversation_id" text;

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_snapshots_workflow_hash_idx" ON "workflow_execution_snapshots" USING btree ("workflow_id","state_hash");
