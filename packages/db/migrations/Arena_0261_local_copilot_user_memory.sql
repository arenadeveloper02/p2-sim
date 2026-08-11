-- migration-safe: additive table for Local Copilot user_memory (expand-only, no drops)
CREATE TABLE IF NOT EXISTS "local_copilot_user_memory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "workspace_id" text,
  "key" text NOT NULL,
  "value" text NOT NULL,
  "memory_type" text DEFAULT 'preference' NOT NULL,
  "source" text DEFAULT 'explicit' NOT NULL,
  "confidence" double precision DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "local_copilot_user_memory" ADD CONSTRAINT "local_copilot_user_memory_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "local_copilot_user_memory" ADD CONSTRAINT "local_copilot_user_memory_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "local_copilot_user_memory_user_key_global_uidx" ON "local_copilot_user_memory" USING btree ("user_id","key") WHERE "workspace_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "local_copilot_user_memory_user_workspace_key_uidx" ON "local_copilot_user_memory" USING btree ("user_id","workspace_id","key") WHERE "workspace_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "local_copilot_user_memory_user_id_idx" ON "local_copilot_user_memory" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "local_copilot_user_memory_workspace_id_idx" ON "local_copilot_user_memory" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "local_copilot_user_memory_type_idx" ON "local_copilot_user_memory" USING btree ("memory_type");
