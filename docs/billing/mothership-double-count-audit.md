# Mothership billing double-count audit

**Date:** 2026-07-09  
**Scope:** Whether mothership block cost can land in `usage_log` twice — once via the workflow ledger and again via `/api/billing/update-cost`.

## Sim-side paths

| Path | When it runs | Ledger `source` | Key linkage |
|------|----------------|-----------------|-------------|
| **Workflow mothership block** | `mothership-handler.ts` reads Go `/api/mothership/execute` final event | `workflow` | `usage_log.execution_id` = hosting run |
| **Copilot stream complete** | `handleCompleteEvent` → `postStreamBillingUpdateCost` when `goRoute` starts with `/api/mothership/execute` | `mothership_block` | `usage_log.parent_execution_id` when `execContext.executionId` is set |

Workflow blocks do **not** go through the copilot stream handler. They call Go execute directly and attach `result.cost` to the block output, which `recordExecutionUsage` reconciles under `source='workflow'`.

`postStreamBillingUpdateCost` only fires from the copilot/mothership **chat stream** path (`complete.ts`), not from `mothership-handler.ts`.

## Double-count risk

A run is **double-billed** only when **both** are true:

1. Go returns non-zero `cost` on the mothership block `final` event (workflow ledger path), **and**
2. The same logical work also emits a copilot `complete` event that triggers `postStreamBillingUpdateCost` with `source: mothership_block` and the same `parentExecutionId`.

That second case requires Go to bill via the stream callback **in addition to** returning cost on the execute response. This cannot be ruled out from the Sim repo alone — verify on staging with the audit query below.

## Detection query

`scripts/phase0-arena-cost-audit.ts` includes a **Potential mothership double-count** section:

```sql
-- workflow ledger + mothership_block rows sharing parent_execution_id / execution_id
```

Manual check:

```sql
SELECT
  w.execution_id,
  SUM(CASE WHEN u.source = 'workflow' THEN u.cost::numeric ELSE 0 END) AS workflow_total,
  SUM(CASE WHEN u.source = 'mothership_block' THEN u.cost::numeric ELSE 0 END) AS mothership_total
FROM usage_log u
JOIN workflow_execution_logs w ON w.execution_id = COALESCE(u.execution_id, u.parent_execution_id)
WHERE u.created_at >= NOW() - INTERVAL '30 days'
GROUP BY w.execution_id
HAVING
  SUM(CASE WHEN u.source = 'workflow' THEN u.cost::numeric ELSE 0 END) > 0
  AND SUM(CASE WHEN u.source = 'mothership_block' THEN u.cost::numeric ELSE 0 END) > 0;
```

## Go mothership recommendation

For `/api/mothership/execute` used **inside workflows**:

- Return `cost` on the final NDJSON event for Sim workflow ledger reconciliation, **or**
- POST `/api/billing/update-cost` with `source: mothership_block` and `parentExecutionId`

**Do not do both** for the same token usage.

Copilot chat (`/api/mothership` stream, not execute-in-workflow) should continue using `postStreamBillingUpdateCost` only; workflow blocks should rely on `result.cost` → workflow ledger unless product explicitly wants split attribution.
