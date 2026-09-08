-- Expand local_copilot_default_model with Vertex Gemini 3.8 Flash
-- (same Google AI Studio model id, Vertex backend).
ALTER TYPE "public"."local_copilot_default_model" ADD VALUE IF NOT EXISTS 'vertex-gemini-3.8-flash';
