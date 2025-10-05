-- Create deployed_chat table
CREATE TABLE "deployed_chat" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"chat_id" text,
	"title" text,
	"workflow_id" text
);

-- Add indexes for deployed_chat table
CREATE INDEX "deployed_chat_chat_id_idx" ON "deployed_chat" ("chat_id");
CREATE INDEX "deployed_chat_workflow_id_idx" ON "deployed_chat" ("workflow_id");
