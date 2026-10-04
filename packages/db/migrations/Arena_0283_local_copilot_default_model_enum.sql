-- Convert local_copilot_user_access.default_model from text to a catalog enum.
-- Values match LOCAL_COPILOT_CATALOG; invalid rows are coerced to gemini-2.5-pro
-- before the type change. Old app code still reads/writes the same string labels.
-- Guarded so environments without the Arena Copilot table are a no-op.
-- migration-safe: text→enum of the same catalog-id strings 0282 already stored; drop/reset default only so PG can recast the column, old readers still treat the value as text
DO $migration$
BEGIN
  IF to_regclass('public.local_copilot_user_access') IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    CREATE TYPE "public"."local_copilot_default_model" AS ENUM (
      'claude',
      'gemini-2.5-pro',
      'gemini-3.1-pro',
      'bedrock-claude-opus-5',
      'bedrock-claude-sonnet-5',
      'bedrock-claude-opus-4-8',
      'bedrock-claude-opus-4-6',
      'bedrock-claude-sonnet-4-6',
      'bedrock-zai-glm-5',
      'bedrock-nemotron-super-3-120b',
      'bedrock-mistral-large-3',
      'bedrock-llama-3.3-70b'
    );
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  UPDATE "local_copilot_user_access"
  SET "default_model" = 'gemini-2.5-pro'
  WHERE "default_model" NOT IN (
    'claude',
    'gemini-2.5-pro',
    'gemini-3.1-pro',
    'bedrock-claude-opus-5',
    'bedrock-claude-sonnet-5',
    'bedrock-claude-opus-4-8',
    'bedrock-claude-opus-4-6',
    'bedrock-claude-sonnet-4-6',
    'bedrock-zai-glm-5',
    'bedrock-nemotron-super-3-120b',
    'bedrock-mistral-large-3',
    'bedrock-llama-3.3-70b'
  );

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'local_copilot_user_access'
      AND column_name = 'default_model'
      AND udt_name = 'text'
  ) THEN
    ALTER TABLE "local_copilot_user_access"
      ALTER COLUMN "default_model" DROP DEFAULT;
    ALTER TABLE "local_copilot_user_access"
      ALTER COLUMN "default_model" TYPE "public"."local_copilot_default_model"
      USING "default_model"::"public"."local_copilot_default_model";
    ALTER TABLE "local_copilot_user_access"
      ALTER COLUMN "default_model" SET DEFAULT 'gemini-2.5-pro'::"public"."local_copilot_default_model";
  END IF;

  CREATE OR REPLACE FUNCTION insert_local_copilot_user_access()
  RETURNS TRIGGER AS $$
  BEGIN
    INSERT INTO local_copilot_user_access (id, user_id, email, has_access, local_only, default_model)
    VALUES (
      gen_random_uuid(),
      NEW.id,
      NEW.email,
      false,
      true,
      'gemini-2.5-pro'::local_copilot_default_model
    )
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
END;
$migration$;
