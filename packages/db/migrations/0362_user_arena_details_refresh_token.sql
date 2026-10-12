-- Expand: nullable encrypted Arena refresh token for SSO + refresh-on-401.
-- Backward-compatible with deployed app (column unused until new code ships).
ALTER TABLE "user_arena_details" ADD COLUMN IF NOT EXISTS "arena_refresh_token" text;
