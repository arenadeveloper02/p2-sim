CREATE TABLE "client_organization" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_name" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_organization" ADD CONSTRAINT "client_organization_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_organization_client_id_unique" ON "client_organization" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_organization_organization_id_unique" ON "client_organization" USING btree ("organization_id");
