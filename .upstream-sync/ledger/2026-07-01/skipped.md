# Skipped Upstream Changes — 2026-07-01

Changes from simstudioai/sim we deliberately did not take during this sync.

- **#5195 SSE reader consolidation — `apps/sim/app/chat/hooks/use-chat-streaming.ts` only.** `apps/sim/app/chat/` is fork-owned (`merge-policy.json` `forkFirst`) and the fork heavily rewrote this streaming hook (+164/−18) for the Arena chat surface. #5195 is a refactor (consolidate client SSE readers behind a typed primitive), not a fix, so fork-first applies: keep the fork's hook, do not adopt the upstream rewrite for this file. The shared SSE primitive itself lands via the merge in upstream-owned paths; only the chat hook's adoption of it is skipped.
