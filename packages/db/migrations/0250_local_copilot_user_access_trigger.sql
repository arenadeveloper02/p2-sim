-- Auto-create a local_copilot_user_access row whenever a user is created.
-- has_access defaults to false (deny by default); flip to true to grant Arena Copilot.
CREATE OR REPLACE FUNCTION insert_local_copilot_user_access()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO local_copilot_user_access (id, user_id, email, has_access)
  VALUES (gen_random_uuid(), NEW.id, NEW.email, false)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS local_copilot_user_access_on_user_insert ON "user";
--> statement-breakpoint
CREATE TRIGGER local_copilot_user_access_on_user_insert
  AFTER INSERT ON "user"
  FOR EACH ROW
  EXECUTE FUNCTION insert_local_copilot_user_access();
--> statement-breakpoint
-- Backfill existing users so the allowlist is complete after migrate.
INSERT INTO local_copilot_user_access (id, user_id, email, has_access)
SELECT gen_random_uuid(), id, email, false
FROM "user"
ON CONFLICT (user_id) DO NOTHING;
