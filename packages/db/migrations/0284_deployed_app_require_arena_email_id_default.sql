ALTER TABLE "deployed_app" ALTER COLUMN "require_arena_email_id" SET DEFAULT true;--> statement-breakpoint
-- Apps published under the old open default are reachable anonymously by URL.
-- Requiring an Arena emailId closes that without locking anyone out: rows already
-- on auth_type 'email'/'sso' keep enforcing their allowlist on top, and rows with
-- an empty allowlist stay reachable to any Arena user instead of becoming
-- inaccessible. Bounded and idempotent — a replay matches no rows.
UPDATE "deployed_app" SET "require_arena_email_id" = true WHERE "require_arena_email_id" = false;
