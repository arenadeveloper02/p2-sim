-- Chat deployments can now be surfaced as an external web app: 'chat' keeps the
-- built-in /chat/{identifier} page, 'app' redirects the listing card to the
-- stored external URL. Additive nullable/defaulted columns — expand-safe; the
-- deployed app version ignores them. Run manually.
ALTER TABLE "chat" ADD COLUMN IF NOT EXISTS "deployment_type" text DEFAULT 'chat' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN IF NOT EXISTS "redirect_url" text;
