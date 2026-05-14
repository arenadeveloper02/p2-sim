CREATE TYPE "public"."skill_node_type" AS ENUM('folder', 'skill', 'file');--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "root_path" text;--> statement-breakpoint
CREATE TABLE "skill_node" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_id" text NOT NULL,
	"parent_id" text,
	"workspace_id" text NOT NULL,
	"path" text NOT NULL,
	"type" "skill_node_type" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"content" text,
	"allowed_tools" jsonb,
	"search_text" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "skill_node" ADD CONSTRAINT "skill_node_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_node" ADD CONSTRAINT "skill_node_parent_id_skill_node_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."skill_node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_node" ADD CONSTRAINT "skill_node_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_node_skill_id_idx" ON "skill_node" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skill_node_workspace_id_idx" ON "skill_node" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "skill_node_parent_id_idx" ON "skill_node" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_node_skill_path_unique" ON "skill_node" USING btree ("skill_id","path");--> statement-breakpoint
UPDATE "skill" SET "root_path" = 'SKILL.md' WHERE "root_path" IS NULL;--> statement-breakpoint
INSERT INTO "skill_node" (
	"id",
	"skill_id",
	"parent_id",
	"workspace_id",
	"path",
	"type",
	"name",
	"description",
	"content",
	"allowed_tools",
	"search_text",
	"sort_order",
	"created_at",
	"updated_at"
)
SELECT
	"id" || '_root',
	"id",
	NULL,
	"workspace_id",
	'SKILL.md',
	'skill',
	"name",
	"description",
	"content",
	NULL,
	concat_ws(E'\n', "name", "description", "content"),
	0,
	"created_at",
	"updated_at"
FROM "skill"
WHERE "workspace_id" IS NOT NULL
ON CONFLICT ("skill_id", "path") DO NOTHING;
