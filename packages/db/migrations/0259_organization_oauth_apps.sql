CREATE TABLE "oauth_custom_app_state" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"provider_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"return_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_oauth_apps" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_custom_app_state" ADD CONSTRAINT "oauth_custom_app_state_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_custom_app_state" ADD CONSTRAINT "oauth_custom_app_state_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_custom_app_state" ADD CONSTRAINT "oauth_custom_app_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_oauth_apps" ADD CONSTRAINT "organization_oauth_apps_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_oauth_apps" ADD CONSTRAINT "organization_oauth_apps_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_custom_app_state_state_unique" ON "oauth_custom_app_state" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_oauth_apps_org_provider_unique" ON "organization_oauth_apps" USING btree ("organization_id","provider_id");