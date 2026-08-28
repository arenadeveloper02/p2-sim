CREATE TABLE "generative_app_draft" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"entry_path" text DEFAULT 'home' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"manifest" jsonb NOT NULL,
	"api_bindings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generative_app_draft_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"revision" integer NOT NULL,
	"title" text NOT NULL,
	"entry_path" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"api_bindings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployed_app" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"user_id" text NOT NULL,
	"identifier" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"department" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"customizations" json DEFAULT '{}',
	"auth_type" text DEFAULT 'public' NOT NULL,
	"password" text,
	"allowed_emails" json DEFAULT '[]',
	"require_arena_email_id" boolean DEFAULT false NOT NULL,
	"draft_id" text,
	"revision_id" text,
	"manifest" jsonb NOT NULL,
	"api_bindings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"http_allowlist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generative_app_draft" ADD CONSTRAINT "generative_app_draft_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generative_app_draft" ADD CONSTRAINT "generative_app_draft_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generative_app_draft" ADD CONSTRAINT "generative_app_draft_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generative_app_draft_revision" ADD CONSTRAINT "generative_app_draft_revision_draft_id_generative_app_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."generative_app_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployed_app" ADD CONSTRAINT "deployed_app_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployed_app" ADD CONSTRAINT "deployed_app_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployed_app" ADD CONSTRAINT "deployed_app_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployed_app" ADD CONSTRAINT "deployed_app_draft_id_generative_app_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."generative_app_draft"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployed_app" ADD CONSTRAINT "deployed_app_revision_id_generative_app_draft_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."generative_app_draft_revision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generative_app_draft_workflow_idx" ON "generative_app_draft" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "generative_app_draft_workspace_idx" ON "generative_app_draft" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generative_app_draft_revision_unique" ON "generative_app_draft_revision" USING btree ("draft_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "deployed_app_identifier_idx" ON "deployed_app" USING btree ("identifier") WHERE "deployed_app"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "deployed_app_workflow_archived_idx" ON "deployed_app" USING btree ("workflow_id","archived_at");
