---
name: tdd
description: Test-driven development with red-green-refactor vertical slices. Use when fixing upstream merge regressions or adding tests for conflict resolutions.
---

# Test-Driven Development

## Philosophy

Tests verify behavior through **public interfaces**, not implementation details.

**Good tests** exercise real code paths through public APIs and survive refactors.

**Bad tests** mock internal collaborators, test private methods, or break on refactor without behavior change.

## Anti-pattern: horizontal slices

Do **not** write all tests then all implementation. Use **vertical slices**:

```
RED→GREEN: test1→impl1
RED→GREEN: test2→impl2
```

## Workflow

### 1. Planning

- Confirm which behaviors to test (prioritize critical paths)
- List behaviors, not implementation steps

### 2. Tracer bullet

One test → minimal code to pass → repeat.

### 3. Incremental loop

One test at a time. Only enough code to pass the current test.

### 4. Refactor

After GREEN only. Run tests after each refactor step.

## Checklist per cycle

- [ ] Test describes behavior, not implementation
- [ ] Test uses public interface only
- [ ] Code is minimal for this test
- [ ] No speculative features added
