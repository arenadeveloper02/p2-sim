-- CASA-aligned Arena ↔ Sim SSO ticket store (hash only; never store raw cookie)
CREATE TABLE IF NOT EXISTS "arena_sso_ticket" (
  "id" text PRIMARY KEY NOT NULL,
  "ticket_hash" text NOT NULL,
  "aud" text NOT NULL,
  "user_id" text NOT NULL,
  "arena_email" text NOT NULL,
  "arena_sys_id" text,
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arena_sso_ticket" ADD CONSTRAINT "arena_sso_ticket_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "arena_sso_ticket_ticket_hash_uidx" ON "arena_sso_ticket" USING btree ("ticket_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "arena_sso_ticket_user_id_idx" ON "arena_sso_ticket" USING btree ("user_id");
