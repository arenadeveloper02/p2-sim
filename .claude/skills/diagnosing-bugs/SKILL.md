---
name: diagnosing-bugs
description: Diagnosis loop for hard bugs and performance regressions. Use when upstream sync verification fails, merge regressions appear, or tests fail after conflict resolution.
---

# Diagnosing Bugs

A discipline for hard bugs. Skip phases only when explicitly justified.

When exploring the codebase, read `CLAUDE.md` and `AGENTS.md` for repo conventions. For upstream sync context, also read `.upstream-sync/ledger/<RUN_ID>/run.md`.

## Phase 1 — Build a feedback loop

**This is the skill.** Everything else is mechanical. If you have a **tight** pass/fail signal for the bug — one that goes red on _this_ bug — you will find the cause.

Spend disproportionate effort here. **Be aggressive. Be creative. Refuse to give up.**

### Ways to construct one — try them in roughly this order

1. **Failing test** at whatever seam reaches the bug — unit, integration, e2e.
2. **Curl / HTTP script** against a running dev server.
3. **CLI invocation** with a fixture input, diffing stdout against a known-good snapshot.
4. **Replay a captured trace.**
5. **Throwaway harness** — minimal subset exercising the bug path.

For upstream sync: start with the failing command from verification (`bun run check`, `lint`, `test`, or `build`) and narrow to the specific package/test.

### Completion criterion

Phase 1 is done when you can name **one command** that is red-capable, deterministic, fast, and agent-runnable.

## Phase 2 — Reproduce + minimise

Run the loop. Shrink the repro to the smallest scenario that still goes red.

## Phase 3 — Hypothesise

Generate **3–5 ranked hypotheses** before testing. Each must be falsifiable.

## Phase 4 — Instrument

Each probe maps to a hypothesis. Change one variable at a time. Tag debug logs with `[DEBUG-a4f2]`.

## Phase 5 — Fix + regression test

Write regression test before fix when a correct seam exists. Re-run the Phase 1 loop after fixing.

## Phase 6 — Cleanup + post-mortem

Remove debug instrumentation. State the correct hypothesis in the commit message.
