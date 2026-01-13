# Changes Required to Enable Nested Loop Blocks

This document outlines all the changes needed to allow loop blocks to be nested inside other loop blocks.

## Overview

Currently, the system explicitly prevents nesting container blocks (loops and parallels) inside each other. To enable nested loops, we need to:

1. **Remove validation restrictions** that prevent nesting
2. **Update data structures** to handle nested hierarchies
3. **Modify executor logic** to handle nested loop scopes
4. **Update UI components** to allow and render nested structures
5. **Update documentation** to reflect the new capability

---

## 1. Validation & Prevention Logic

### 1.1 Edit Workflow Tool (`apps/sim/lib/copilot/tools/server/workflow/edit-workflow.ts`)

**Location 1: Lines 1491-1500** - When editing nested nodes
```typescript
// REMOVE THIS CHECK:
if (childBlock.type === 'loop' || childBlock.type === 'parallel') {
  logSkippedItem(skippedItems, {
    type: 'nested_subflow_not_allowed',
    operationType: 'edit_nested_node',
    blockId: childId,
    reason: `Cannot nest ${childBlock.type} inside ${block.type} - nested subflows are not supported`,
    details: { parentType: block.type, childType: childBlock.type },
  })
  return
}
```

**Location 2: Lines 1748-1757** - When adding nested nodes to new containers
```typescript
// REMOVE THIS CHECK:
if (childBlock.type === 'loop' || childBlock.type === 'parallel') {
  logSkippedItem(skippedItems, {
    type: 'nested_subflow_not_allowed',
    operationType: 'add_nested_node',
    blockId: childId,
    reason: `Cannot nest ${childBlock.type} inside ${params.type} - nested subflows are not supported`,
    details: { parentType: params.type, childType: childBlock.type },
  })
  return
}
```

**Location 3: Lines 1825-1834** - When inserting blocks into subflows
```typescript
// REMOVE THIS CHECK:
if (params.type === 'loop' || params.type === 'parallel') {
  logSkippedItem(skippedItems, {
    type: 'nested_subflow_not_allowed',
    operationType: 'insert_into_subflow',
    blockId: block_id,
    reason: `Cannot nest ${params.type} inside ${subflowBlock.type} - nested subflows are not supported`,
    details: { parentType: subflowBlock.type, childType: params.type },
  })
  break
}
```

**Location 4: Lines 1843-1850** - When moving existing blocks into subflows
```typescript
// REMOVE THIS CHECK:
if (existingBlock.type === 'loop' || existingBlock.type === 'parallel') {
  logSkippedItem(skippedItems, {
    type: 'nested_subflow_not_allowed',
    operationType: 'insert_into_subflow',
    blockId: block_id,
    reason: `Cannot move ${existingBlock.type} into ${subflowBlock.type} - nested subflows are not supported`,
    details: { parentType: subflowBlock.type, childType: existingBlock.type },
  })
  break
}
```

### 1.2 Block Metadata Tool (`apps/sim/lib/copilot/tools/server/blocks/get-blocks-metadata-tool.ts`)

**Line 960** - Update best practices text:
```typescript
// CHANGE FROM:
- Cannot have loops/parallels inside a loop block.

// CHANGE TO:
- Nested loops are supported. Inner loops execute within each iteration of outer loops.
```

---

## 2. Data Structure & Utilities

### 2.1 Find Child Nodes (`apps/sim/stores/workflows/workflow/utils.ts`)

**Current implementation (lines 126-130)** only finds direct children:
```typescript
export function findChildNodes(containerId: string, blocks: Record<string, BlockState>): string[] {
  return Object.values(blocks)
    .filter((block) => block.data?.parentId === containerId)
    .map((block) => block.id)
}
```

**This is actually CORRECT** - it should only find direct children. The function `findAllDescendantNodes` (lines 139-157) already handles recursion if needed.

**However**, we need to ensure `convertLoopBlockToLoop` (lines 61-82) correctly handles nested loops. Currently it uses `findChildNodes` which is correct, but we need to verify that nested loops are properly included in the `nodes` array.

**Action**: Verify that when a loop contains another loop, the inner loop's block ID is included in the outer loop's `nodes` array. The current implementation should work, but we should add a test.

### 2.2 Generate Loop Blocks (`apps/sim/stores/workflows/workflow/utils.ts`)

**Lines 165-178** - The `generateLoopBlocks` function should already work with nested loops since it:
1. Finds all blocks of type 'loop'
2. Converts each to a Loop object
3. Each loop's `nodes` array includes its direct children (which could be another loop)

**Action**: Add test cases for nested loops to ensure this works correctly.

---

## 3. Executor & DAG Building

### 3.1 DAG Builder (`apps/sim/executor/dag/builder.ts`)

The DAG builder should already handle nested loops because:
- Each loop gets its own sentinel nodes
- Loop configs are stored independently
- Nodes are categorized by which loop they belong to

**However**, we need to verify that:
1. Nested loops get their own sentinel pairs
2. Sentinel wiring doesn't conflict between nested loops
3. Loop scopes are properly isolated

**Action**: Review and test nested loop DAG construction.

### 3.2 Loop Constructor (`apps/sim/executor/dag/construction/loops.ts`)

**Current implementation** creates sentinel pairs for each loop independently. This should work for nested loops, but we need to ensure:
- Inner loop sentinels are created before outer loop tries to reference them
- Sentinel IDs don't conflict

**Action**: Verify sentinel creation order and ID uniqueness.

### 3.3 Edge Constructor (`apps/sim/executor/dag/construction/edges.ts`)

**Lines 227-252** - `wireLoopSentinels` method:
- Currently wires each loop independently
- Should work for nested loops, but we need to ensure:
  - Inner loop edges don't interfere with outer loop edges
  - Terminal nodes of inner loops properly route to inner loop's sentinel end
  - Inner loop's sentinel end routes to outer loop's flow correctly

**Action**: Test edge wiring for nested loops.

### 3.4 Node Constructor (`apps/sim/executor/dag/construction/nodes.ts`)

**Lines 65-77** - `categorizeLoopBlocks`:
- Currently categorizes blocks by checking if they're in any loop's nodes array
- For nested loops, a block could be in multiple loops (inner and outer)
- **ISSUE**: `findLoopIdForBlock` (lines 139-146) returns the FIRST loop that contains the block, which might be the outer loop instead of the innermost one

**Action**: Update `findLoopIdForBlock` to return the innermost loop ID, or update the logic to handle multiple loop contexts.

**Lines 116-137** - `createRegularOrLoopNode`:
- Sets `loopId` in metadata based on `findLoopIdForBlock`
- For nested loops, we might need to track multiple loop IDs or use the innermost one

**Action**: Determine if we need to track nested loop hierarchy in node metadata.

### 3.5 Loop Orchestrator (`apps/sim/executor/orchestrators/loop.ts`)

**Current implementation** manages loop scopes independently. For nested loops, we need to ensure:
- Each loop has its own scope
- Inner loop scopes are properly initialized when outer loop iterates
- Loop continuation doesn't interfere between nested loops

**Key methods to review**:
- `initializeLoopScope` (lines 55-184): Should work independently for each loop
- `evaluateLoopContinuation` (lines 219-271): Should only affect its own loop
- `clearLoopExecutionState` (lines 313-329): Should only clear its own loop's nodes
- `restoreLoopEdges` (lines 331-367): Should only restore its own loop's edges

**Action**: Test nested loop execution to ensure scopes don't interfere.

### 3.6 Node Execution Orchestrator (`apps/sim/executor/orchestrators/node.ts`)

**Lines 43-54** - Loop scope initialization:
```typescript
const loopId = node.metadata.loopId
if (loopId && !this.loopOrchestrator.getLoopScope(ctx, loopId)) {
  this.loopOrchestrator.initializeLoopScope(ctx, loopId)
}
```

**ISSUE**: This only initializes one loop scope. For nested loops, a node might belong to multiple loops (inner and outer). We need to:
1. Find all loops containing this node
2. Initialize all loop scopes (from outermost to innermost)

**Action**: Update to handle multiple loop contexts per node.

---

## 4. UI Components

### 4.1 Workflow Editor (`apps/sim/app/workspace/[workspaceId]/w/[workflowId]/workflow.tsx`)

**Lines 2137-2154** - Drag/drop validation:
- Currently prevents trigger blocks from being in containers
- Should already allow loops to be dragged into other loops (no specific check prevents it)
- **Action**: Verify drag/drop works for nested loops

**Lines 1812-1819** - Connection validation:
- Prevents connections across container boundaries
- For nested loops, we need to allow connections:
  - Within the same loop (inner or outer)
  - From outer loop to inner loop
  - From inner loop to outer loop (when inner loop exits)

**Action**: Update connection validation to handle nested loop boundaries.

### 4.2 Workflow Preview (`apps/sim/app/workspace/[workspaceId]/w/components/workflow-preview/workflow-preview.tsx`)

**Lines 284-317** - Child block rendering:
- Currently only renders direct children of loops
- For nested loops, we need to recursively render children

**Action**: Update to recursively render nested loop children.

### 4.3 Loop Node Component

Need to verify that loop block UI components can render nested loops visually.

**Action**: Test visual rendering of nested loops.

---

## 5. Documentation

### 5.1 Loop Block Documentation (`apps/docs/content/docs/en/blocks/loop.mdx`)

**Lines 154-161** - Remove the warning about nesting:
```markdown
<!-- REMOVE THIS ENTIRE CALLOUT: -->
<Callout type="warning">
  Container blocks (Loops and Parallels) cannot be nested inside each other. This means:
  - You cannot place a Loop block inside another Loop block
  - You cannot place a Parallel block inside a Loop block
  - You cannot place any container block inside another container block
  
  If you need multi-dimensional iteration, consider restructuring your workflow to use sequential loops or process data in stages.
</Callout>
```

**Action**: Replace with information about nested loop capabilities and best practices.

### 5.2 Parallel Block Documentation (`apps/docs/content/docs/en/blocks/parallel.mdx`)

**Similar warning** - Update to reflect that loops can be nested inside parallels (if that's desired), or keep restriction for parallels only.

**Action**: Update documentation accordingly.

### 5.3 Other Language Translations

Update all translated versions:
- `apps/docs/content/docs/de/blocks/loop.mdx`
- `apps/docs/content/docs/es/blocks/loop.mdx`
- `apps/docs/content/docs/fr/blocks/loop.mdx`
- `apps/docs/content/docs/ja/blocks/loop.mdx`
- `apps/docs/content/docs/zh/blocks/loop.mdx`

---

## 6. Testing

### 6.1 Unit Tests

Add tests for:
- Nested loop block creation
- Nested loop DAG construction
- Nested loop execution
- Nested loop scope isolation
- Nested loop edge wiring

### 6.2 Integration Tests

Add tests for:
- Creating nested loops via UI
- Dragging loops into other loops
- Connecting blocks across nested loop boundaries
- Executing workflows with nested loops

---

## 7. Critical Implementation Details

### 7.1 Loop Scope Isolation

**Challenge**: When a node belongs to multiple loops (inner and outer), we need to:
- Track which loop scope variables belong to
- Ensure `<loop.index>` references the correct loop
- Handle loop variable scoping correctly

**Solution**: 
- Use the innermost loop ID for node metadata
- Track loop hierarchy in execution context
- Resolve loop variables from innermost to outermost

### 7.2 Sentinel Node Wiring

**Challenge**: Inner loop sentinels must not interfere with outer loop flow.

**Solution**: 
- Each loop's sentinel nodes are independent
- Inner loop's sentinel end should route to outer loop's flow (not outer loop's sentinel end)
- Outer loop's sentinel end should wait for all inner loops to complete

### 7.3 Edge Routing

**Challenge**: Connections between nested loops need proper routing.

**Solution**:
- Allow connections within the same loop level
- Allow connections from outer loop to inner loop start
- Allow connections from inner loop end to outer loop continuation
- Prevent invalid cross-boundary connections

---

## 8. Migration Considerations

### 8.1 Existing Workflows

Existing workflows should continue to work without changes since:
- They don't have nested loops
- The changes are additive (removing restrictions)
- No data migration needed

### 8.2 Backward Compatibility

All changes should be backward compatible:
- Existing single-level loops work as before
- New nested loops are an additional feature
- No breaking changes to data structures

---

## Summary of Files to Modify

1. **Validation & Prevention**:
   - `apps/sim/lib/copilot/tools/server/workflow/edit-workflow.ts` (4 locations)
   - `apps/sim/lib/copilot/tools/server/blocks/get-blocks-metadata-tool.ts` (1 location)

2. **Executor Logic**:
   - `apps/sim/executor/orchestrators/node.ts` (loop scope initialization)
   - `apps/sim/executor/dag/construction/nodes.ts` (loop ID finding)
   - Potentially: `apps/sim/executor/orchestrators/loop.ts` (if scope isolation issues)

3. **UI Components**:
   - `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/workflow.tsx` (connection validation)
   - `apps/sim/app/workspace/[workspaceId]/w/components/workflow-preview/workflow-preview.tsx` (recursive rendering)

4. **Documentation**:
   - `apps/docs/content/docs/en/blocks/loop.mdx`
   - All other language versions of loop.mdx
   - `apps/docs/content/docs/en/blocks/parallel.mdx` (if needed)

5. **Testing**:
   - Add comprehensive test coverage for nested loops

---

## Estimated Complexity

- **Low Complexity**: Removing validation checks, updating documentation
- **Medium Complexity**: UI updates, connection validation
- **High Complexity**: Executor loop scope handling, nested loop execution logic

**Total Estimated Effort**: 2-3 days for a senior developer, including testing and documentation.

