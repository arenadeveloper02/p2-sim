---
name: review-upstream-merge
description: Review an upstream sync PR — fork preservation, skipped upstream ledger, verification, and alignment with release notes. Use before marking the draft PR ready for human review.
---

# Review Upstream Merge

Two-axis review for upstream sync PRs (adapted from [mattpocock/skills](https://github.com/mattpocock/skills) `review`).

## Fixed point

Compare sync branch against `version-4.2-main`:

```bash
git diff version-4.2-main...HEAD
git log version-4.2-main..HEAD --oneline
```

## Axis 1 — Standards

Does the merge follow this repo's documented standards?

Sources: `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, `bun run check:api-validation` policy.

Report violations per file/hunk. Skip what CI already enforces.

## Axis 2 — Spec (upstream sync)

Does the merge correctly implement the upstream sync intent?

Spec sources (in order):

1. `.upstream-sync/ledger/<RUN_ID>/release-notes.md` — what upstream shipped
2. `.upstream-sync/ledger/<RUN_ID>/fbi-report.md` — commits in range
3. `.upstream-sync/merge-policy.json` — fork-first rules
4. `.upstream-sync/ledger/<RUN_ID>/skipped.md` — intentional omissions (must be documented)

Report:

- Upstream FBIs that should have been taken but weren't (and aren't in `skipped.md`)
- Fork changes accidentally dropped
- Skipped entries missing "what we miss"
- Verification gaps

## Output

Append findings to `.upstream-sync/ledger/<RUN_ID>/run.md` under `## Review`.

End with: **Ready for human review** or **Blocked — list issues**.
