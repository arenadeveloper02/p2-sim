# Skipped Upstream Changes — 2026-07-01

Changes from simstudioai/sim we deliberately did not take during this sync.

### 2026-07-02 — A2A agent hosting (migration 0252)

- **Reason skipped:** Reviewer chose to align with upstream removal of internal A2A agent hosting (`a2a_agent`, `a2a_task`, `a2a_push_notification_config` tables and `agent-card.ts`). External A2A client tools (block + `/api/tools/a2a/*`) are retained — upstream still ships those.
- **What we miss:** Ability to expose Sim workflows as hosted A2A agents with DB-backed task lifecycle.
