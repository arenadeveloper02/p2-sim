-- Create kb_approval_status table
CREATE TABLE IF NOT EXISTS "kb_approval_status" (
	"id" text PRIMARY KEY NOT NULL,
	"kb_id" text NOT NULL,
	"approver_id" text NOT NULL,
	"document_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"grouping_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints
ALTER TABLE "kb_approval_status" ADD CONSTRAINT "kb_approval_status_kb_id_knowledge_base_id_fk" FOREIGN KEY ("kb_id") REFERENCES "knowledge_base"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "kb_approval_status" ADD CONSTRAINT "kb_approval_status_approver_id_user_id_fk" FOREIGN KEY ("approver_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "kb_approval_status" ADD CONSTRAINT "kb_approval_status_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "kb_approval_status" ADD CONSTRAINT "kb_approval_status_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE cascade ON UPDATE no action;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS "kb_approval_status_kb_id_idx" ON "kb_approval_status" USING btree ("kb_id");
CREATE INDEX IF NOT EXISTS "kb_approval_status_approver_id_idx" ON "kb_approval_status" USING btree ("approver_id");
CREATE INDEX IF NOT EXISTS "kb_approval_status_document_id_idx" ON "kb_approval_status" USING btree ("document_id");
CREATE INDEX IF NOT EXISTS "kb_approval_status_workspace_id_idx" ON "kb_approval_status" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "kb_approval_status_grouping_id_idx" ON "kb_approval_status" USING btree ("grouping_id");
CREATE INDEX IF NOT EXISTS "kb_approval_status_status_idx" ON "kb_approval_status" USING btree ("status");
