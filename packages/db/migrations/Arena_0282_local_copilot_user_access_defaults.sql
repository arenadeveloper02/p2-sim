-- Per-user default Local catalog model, and local_only=true for newly created users.
-- Additive column with a default is expand-safe: existing rows backfill to gemini-2.5-pro
-- and already-deployed app code ignores the column.
-- SET DEFAULT on local_only does not rewrite existing rows (they stay false unless already true).
-- Guarded so environments without the Arena Copilot table are a no-op.
DO $migration$
BEGIN
  IF to_regclass('public.local_copilot_user_access') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE "local_copilot_user_access"
    ADD COLUMN IF NOT EXISTS "default_model" text DEFAULT 'gemini-3.1-pro' NOT NULL;

  ALTER TABLE "local_copilot_user_access"
    ALTER COLUMN "local_only" SET DEFAULT true;

  CREATE OR REPLACE FUNCTION insert_local_copilot_user_access()
  RETURNS TRIGGER AS $$
  BEGIN
    INSERT INTO local_copilot_user_access (id, user_id, email, has_access, local_only, default_model)
    VALUES (gen_random_uuid(), NEW.id, NEW.email, false, true, 'gemini-3.1-pro')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
END;
$migration$;
