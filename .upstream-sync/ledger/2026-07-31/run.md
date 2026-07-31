# Upstream Sync Run — 2026-07-31

## Sync topology

- **Target branch:** `feat/github-merge-agent`
- **Upstream HEAD:** `19d929b1`
- **Merge-base (target ↔ upstream):** `e2fecc86`
- **Analysis baseline:** `e2fecc86` (merge-base)
- **Commits in sync range:** 429

## Grill analysis

_Analyst: parent grill agent (resume mode). Sources: `merge-policy.json`, `fbi-report.md`,
`release-notes.md`, `qa-history.jsonl` (empty), `grill-log.md` (empty), and a direct diff of
`e2fecc86..19d929b1` against every fork-owned and manual-review path._

### Verdict

**No genuine fork-vs-upstream product decision is unresolved.** Every conflict class in this
batch is mechanical and resolvable from `merge-policy.json` (fork-first) + the `db-migrate`
skill + standard registry union merges. No new blocking questions posted to PR #668.

### Fork-owned paths at risk (from `merge-policy.json`)

Diffing `e2fecc86..19d929b1` against all 38 `forkFirst` prefixes, **only two** are touched by
upstream in this range:

1. `apps/sim/hooks/queries/mothership-admin.ts` — upstream `#5955`
   (`fix(settings): a11y labels, URL-backed member search, and design-system cleanup`).
   Fork has diverged (6 fork commits, mostly upstream merges). **Resolution:** fork-first —
   preserve fork behavior; take upstream a11y/URL-search hunks only where they do not conflict
   with fork customizations.
2. `apps/sim/lib/permission-groups/` (`block-access.ts`, `types.ts`) — upstream `#5818`
   (`feat(access-control): per-group chat-deploy auth modes + polish`). Fork has heavily
   customized this dir (19 fork commits). **Resolution:** fork-first, additive union — keep the
   fork's block-access logic AND layer upstream's per-group chat-deploy auth mode where it does
   not overwrite fork code. Watch `types.ts` for both sides extending the same type.

All other fork product surfaces — `arena/`, `p2_docs/`, `unipile/`, `facebook_ads/`,
`presentation/`, `figma/`, `app/chat/`, `lib/branding/`, `lib/hubspot/`, `app/api/admin/`,
the auth session-cookie files, and every deploy script / docker-compose — are **untouched** by
upstream in this range. In particular `apps/sim/app/chat/` is clean, so mothership v0.8
(`#5410`) does not collide with fork-owned chat directly (it will still touch shared
copilot/mothership code outside `forkFirst` — normal shared-infra territory).

Note: upstream `#5635`/`#5693` change `apps/sim/tools/hubspot/` (shared, not fork-owned — fork
owns only `apps/sim/lib/hubspot/`), so those hubspot improvements are safe to take.

### Manual-review paths (shared infra — highest merge effort)

- **`packages/db/migrations/` — migration numbering collision (mechanical, per `db-migrate`).**
  Both sides added `0258`–`0261`. Fork: `0258_deployed_chat_thread_metadata`,
  `0259_organization_oauth_apps`, `0260_organization_oauth_apps_allowed_workspaces`,
  `0261_local_copilot_user_memory`. Upstream added 20 files `0258`–`0277` (folders cutover,
  tables locks/views, org session policy, SSO domain verification, workspace sandboxes, etc.).
  `meta/_journal.json` is a guaranteed conflict (20 upstream vs 73 fork touches).
  **Resolution:** renumber the fork's four colliding migrations to follow upstream's tail
  (i.e. after `0277`) and rebuild `_journal.json` per the `db-migrate` skill. Verify no fork
  code hardcodes the old fork migration numbers.
- **Destructive migration `0276_drop_legacy_folder_tables.sql` (`#6051`).** Drops the two legacy
  folder tables after the generic-folders cutover (`#6025`/`#6037`/`#6045`). Upstream documents
  read-only precondition verification (0 stranded rows, full-row tree comparison clean). Fork
  migrations do **not** touch folder tables, so this is safe to adopt — but it is a
  post-merge **verification checkpoint**: confirm no fork feature reads the legacy
  `workflow_folder`/file-folder tables before running migrations forward.
- **`apps/sim/tools/registry.ts` (21 upstream commits) + `apps/sim/blocks/registry.ts` /
  `registry-maps.ts` (2 commits).** Fork carries 94 fork integration refs in `tools/registry.ts`
  and 17 in `registry-maps.ts`. Conflicts are guaranteed but **mechanical union**: keep every
  fork entry (arena, p2_docs, unipile, facebook_ads, presentation) AND add every new upstream
  integration (buffer, flint, clickup, rocketlane, gitlab, instagram, logfire, outlook, exa,
  tiktok, kimi/nvidia/z.ai providers, managed-agents block, sim-auto model). Preserve
  alphabetical ordering per CLAUDE.md.
- **`apps/sim/lib/auth/` (18 upstream commits).** Notable: better-auth → 1.6.23 + trusted-proxy
  client IP (`#5857`), org session policies (`#5862`), SSO DNS domain verification (`#5909`),
  email-otp auto-signup gated behind `DISABLE_EMAIL_SIGNUP` (`#5840`). Fork owns only
  `session-cookie-domain.ts` and `legacy-session-cookie-clears.ts` (untouched upstream).
  **Resolution:** take upstream auth changes; preserve the fork's two cookie-domain files
  verbatim. Regenerate mship contracts after merge (`bun run mship:generate`).
- **`packages/db/schema/` — 0 upstream commits in range** (schema lives elsewhere; changes ride
  through migrations). No action.

### Upstream FBIs worth calling out (context for verification)

- **mothership v0.8** (`#5410`): mixture of models, search agent, persistent subagents, fork
  chat, inline questions. Large surface; shared copilot code — verify fork admin/chat still runs.
- **Generic folders engine** (`#6025`/`#6037`/`#6045`/`#6051`): folders unified onto one table
  with resourceType; legacy tables dropped. See destructive-migration checkpoint above.
- **Tables v2** (`#6067`), select/multi-select/currency column types (`#5873`/`#6106`),
  per-table mutation locks (`#5960`), saved views (`#5961`).
- **Desktop app** (`#5998`) + follow-ups — additive, new surface, low fork-collision risk.
- **PII**: GLiNER/GPU image dropped for regex-only redaction (`#5697`) + custom regex (`#5732`).
- **Custom sandboxes / function secrets** (`#6071`/`#6118`), **sim auto model** (`#6103`).
- **Security**: isolated-vm env construction hardening (`#6116`), YAML billion-laughs bound
  (`#1b06b6c6`), next → 16.2.12, sharp/js-yaml bumps. Take all (upstream wins on security).

### Skipped upstream changes

None. Fork-first policy preserves fork behavior on the two contested files while still layering
non-conflicting upstream hunks; nothing is deliberately dropped. `skipped.md` remains empty.

### Open decisions requiring a human

None. All resolutions above derive from `merge-policy.json` + `db-migrate` + registry union
conventions. No `<!-- upstream-sync-question -->` comment posted to PR #668.

