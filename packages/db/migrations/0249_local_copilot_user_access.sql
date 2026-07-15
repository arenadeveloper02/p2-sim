-- Per-user Arena Copilot allowlist (deny by default until has_access = true)
CREATE TABLE IF NOT EXISTS "local_copilot_user_access" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "email" text NOT NULL,
  "has_access" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "local_copilot_user_access" ADD CONSTRAINT "local_copilot_user_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "local_copilot_user_access_user_id_uidx" ON "local_copilot_user_access" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "local_copilot_user_access_email_idx" ON "local_copilot_user_access" USING btree ("email");
