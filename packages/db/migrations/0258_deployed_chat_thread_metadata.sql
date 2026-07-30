-- migration-safe: adds nullable archived_at and pinned_at columns to deployed_chat for soft-delete and pin support; existing rows remain visible with null archived_at
ALTER TABLE "deployed_chat" ADD COLUMN "archived_at" timestamp;
ALTER TABLE "deployed_chat" ADD COLUMN "pinned_at" timestamp;
