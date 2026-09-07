CREATE TYPE "public"."skill_share_type" AS ENUM('general', 'service');--> statement-breakpoint
CREATE TABLE "skill_service" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_share_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"origin_skill_id" text NOT NULL,
	"origin_workspace_id" text NOT NULL,
	"type" "skill_share_type" NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_share_catalog_service" (
	"catalog_id" text NOT NULL,
	"service_id" text NOT NULL,
	CONSTRAINT "skill_share_catalog_service_catalog_id_service_id_pk" PRIMARY KEY("catalog_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "skill_share_copy" (
	"id" text PRIMARY KEY NOT NULL,
	"catalog_id" text NOT NULL,
	"copy_skill_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"synced_content_hash" text NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_share_catalog" ADD CONSTRAINT "skill_share_catalog_origin_skill_id_skill_id_fk" FOREIGN KEY ("origin_skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_share_catalog" ADD CONSTRAINT "skill_share_catalog_origin_workspace_id_workspace_id_fk" FOREIGN KEY ("origin_workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_share_catalog" ADD CONSTRAINT "skill_share_catalog_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_share_catalog_service" ADD CONSTRAINT "skill_share_catalog_service_catalog_id_skill_share_catalog_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."skill_share_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_share_catalog_service" ADD CONSTRAINT "skill_share_catalog_service_service_id_skill_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."skill_service"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_share_copy" ADD CONSTRAINT "skill_share_copy_catalog_id_skill_share_catalog_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."skill_share_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_share_copy" ADD CONSTRAINT "skill_share_copy_copy_skill_id_skill_id_fk" FOREIGN KEY ("copy_skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_share_copy" ADD CONSTRAINT "skill_share_copy_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_service_name_unique" ON "skill_service" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_service_slug_unique" ON "skill_service" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_share_catalog_origin_skill_unique" ON "skill_share_catalog" USING btree ("origin_skill_id");--> statement-breakpoint
CREATE INDEX "skill_share_catalog_type_idx" ON "skill_share_catalog" USING btree ("type");--> statement-breakpoint
CREATE INDEX "skill_share_catalog_service_service_idx" ON "skill_share_catalog_service" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_share_copy_catalog_workspace_unique" ON "skill_share_copy" USING btree ("catalog_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_share_copy_skill_unique" ON "skill_share_copy" USING btree ("copy_skill_id");--> statement-breakpoint
CREATE INDEX "skill_share_copy_workspace_idx" ON "skill_share_copy" USING btree ("workspace_id");
