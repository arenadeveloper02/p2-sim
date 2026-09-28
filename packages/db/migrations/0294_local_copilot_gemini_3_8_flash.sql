-- Expand local_copilot_default_model with the Gemini 3.8 Flash catalog id.
-- Additive enum value is backward-compatible: already-deployed app code ignores unknown
-- picker ids, and new app code only writes this value after this migration lands.
ALTER TYPE "public"."local_copilot_default_model" ADD VALUE IF NOT EXISTS 'gemini-3.8-flash';
