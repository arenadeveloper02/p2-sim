CREATE TABLE IF NOT EXISTS "user_access" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"capability" text NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"granted_by" text
);
--> statement-breakpoint
ALTER TABLE "user_access" ADD CONSTRAINT "user_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_access" ADD CONSTRAINT "user_access_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_access_user_capability_unique" ON "user_access" USING btree ("user_id","capability");--> statement-breakpoint
CREATE INDEX "user_access_user_id_idx" ON "user_access" USING btree ("user_id");
