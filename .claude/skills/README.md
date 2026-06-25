# Upstream Sync — Agent Skills

Skills vendored for the Sandcastle upstream-sync harness (GitHub Actions + local `bun run upstream-sync`).

Claude Code discovers skills in `.claude/skills/`. Sandcastle prompts instruct agents to read and follow these files.

## Harness workflow (order)

| Step | Skill / command | Path |
|------|-----------------|------|
| 1 | upstream-sync-grill | `.claude/skills/upstream-sync-grill/SKILL.md` |
| 2 | upstream-sync | `.claude/skills/upstream-sync/SKILL.md` |
| 3 | diagnosing-bugs | `.claude/skills/diagnosing-bugs/SKILL.md` (when verify fails) |
| 4 | tdd | `.claude/skills/tdd/SKILL.md` (regression tests for fixes) |
| 5 | review-upstream-merge | `.claude/skills/review-upstream-merge/SKILL.md` |

## Matt Pocock skills (vendored)

| Skill | Path |
|-------|------|
| grilling | `.claude/skills/grilling/SKILL.md` |
| grill-me | `.claude/skills/grill-me/SKILL.md` |

Source: [mattpocock/skills](https://github.com/mattpocock/skills)

## Sim repo skills (read on demand)

Not duplicated here — read from `.agents/skills/<name>/SKILL.md`:

- `db-migrate` — migration safety during merge
- `react-query-best-practices` — upstream RQ refactors
- `validate-integration` — integration/block changes
- `memory-load-check` — large payload changes
- `cleanup` — post-merge quality pass

## Slash commands

`.claude/commands/upstream-sync-grill.md`, `grill-me.md`, `upstream-sync.md`, `diagnosing-bugs.md`, `review-upstream-merge.md`
