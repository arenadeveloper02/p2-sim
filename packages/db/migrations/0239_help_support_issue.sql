CREATE TYPE "public"."help_support_issue_type" AS ENUM('bug', 'feedback', 'feature_request', 'other');--> statement-breakpoint
CREATE TABLE "help_support_issue" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"workflow_id" text,
	"type" "help_support_issue_type" NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "help_support_issue" ADD CONSTRAINT "help_support_issue_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_support_issue" ADD CONSTRAINT "help_support_issue_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_support_issue" ADD CONSTRAINT "help_support_issue_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "help_support_issue_user_id_idx" ON "help_support_issue" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "help_support_issue_workspace_id_idx" ON "help_support_issue" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "help_support_issue_workflow_id_idx" ON "help_support_issue" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "help_support_issue_type_idx" ON "help_support_issue" USING btree ("type");--> statement-breakpoint
CREATE INDEX "help_support_issue_created_at_idx" ON "help_support_issue" USING btree ("created_at");
