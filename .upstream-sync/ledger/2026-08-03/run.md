# Upstream Sync Run — 2026-08-03

## Sync topology

- **Target branch:** `feat/github-merge-agent`
- **Upstream HEAD:** `13a9119d`
- **Merge-base (target ↔ upstream):** `e2fecc86`
- **Analysis baseline:** `e2fecc86` (merge-base)
- **Commits in sync range:** 480


## Grill analysis

_Analyzed the bounded sync range (480 commits, merge-base `e2fecc86` → upstream HEAD `13a9119d`, v0.7.29 → v0.7.52). Prior memory read: `grill-log.md` (empty), `qa-history.jsonl` (empty), `merge-policy.json`, `extensibility-notes.md`, full `release-notes.md`, full `fbi-report.md`. This is the first substantive grilled sync — no prior human answers to honor._

### Fork posture (measured)

- Fork = Arena/Position2 hard fork of `simstudioai/sim`. `git diff e2fecc86..HEAD -- apps/sim` = **1,376 changed files**; **1,051** fall outside the explicit `forkFirst`/`manualReview` globs (heavily customized landing/hero/footer/`sim-wordmark`, auth/OAuth routes, billing routes, providers).
- Merge policy strategy is **fork-first**: "Preserve version-5-main behavior by default … Upstream wins on shared infra (deps, CI, security) unless ledger says otherwise." This is a global default, not just the `forkFirst` allowlist — so every conflicting file already has a documented disposition (keep fork), and the allowlist is the never-override subset.
- Fork-owned paths confirmed present: `tools/arena`, `lib/branding`, `app/api/admin`, `hooks/queries/mothership-admin.ts`, `lib/unipile`, `blocks/blocks/{arena,p2_docs}.ts`, `tools/p2_docs`, `lib/hubspot`. `app/chat/` is a protective glob (not materialized in fork).

### Upstream FBIs in this batch — disposition per policy

**Take (additive, no fork-owned override) — new integrations & blocks:**
TikTok #5504/#5978, Buffer #5637, Flint #5641, ClickUp #5702/#5708, Rocketlane #5709, GitLab #5710/#5743, Instagram #5568/#6143, Gong #5632, Zoho Desk #6157, Outlook calendar #6041, Logfire #6075, Exa refresh #6074, Managed Agents #5778/#6140, Slack v2 preview #5323/#5892/#5800, Buffer/Confluence/SharePoint connector fixes. New providers: NVIDIA NIM + Z.ai #5560, Groq/Cerebras #5561, Kimi #5716, Gemini 3.6/3.5 #5812, Claude Opus 5 #5925, auto model #6103. These register in `blocks/registry-maps.ts` / `tools/registry.ts` (manualReview): mechanically take upstream additions **and** keep fork's arena/p2_docs/unipile/facebook_ads/presentation entries. Run `bun run mship:generate` post-merge (already in `regenerateAfterMerge`).

**Take (security / shared infra — policy: upstream wins):**
docx hyperlink XSS #5599, files-upload workspace authz #5604, YAML billion-laughs #5756, isolated-vm env construction / v8 escape #5935/#6116, secret exposure in trace spans #6000/#9064039c, SSH/SFTP read caps #6168, secureFetch body bounds #6169, zip-bomb guards #6166/#6176, presigned upload authz #6175, copilot fail-open write gates #6132, realtime room access enforcement #5991/#6170/#6174/#5917, vertex credential binding #6167, copilot attachment key binding #6179, deps bumps (sharp/js-yaml #5848, next 16.2.11/16.2.12 #5890/#6077, better-auth 1.6.23 #5857, @opentelemetry/core CVE-2026-54285 #6182), CI/test-infra (db-mock convergence, Turbopack cache, runner sizing). Take upstream.

**Manual-review flags (routed to harness child agents + verification — NOT product decisions, but the high-risk merge surface):**
1. **Global folders schema refactor** #6025/#6037/#6045/#6051/#6023 — introduces a generic `resourceType`-driven folder engine, moves workflow/file/KB/table folders onto it, then **drops the legacy folder tables** (#6051) with deferred `folder_id` FKs. Destructive migration. Fork-first on app code + forward-only migration can produce a broken hybrid if fork code references legacy folder tables. Verify migrations apply cleanly and no fork code (arena/admin) reads dropped tables.
2. **Org session policies** #5862 + **role-keyed `dbFor` clients** #5583 + **tables v2** (#6067 predicate grammar/cursor pagination, #5873/#6106 column types, #5960 mutation locks, #5961 saved views) — schema-touching; reconcile against fork's custom billing/admin/schema.
3. **Auth** (`lib/auth/` manualReview): better-auth 1.6.23 #5857 (trusted-proxy client IP), email-otp signup gating #5840, impersonation recovery #5688/#5692, SSO DNS verification #5909/#5931. Reconcile with fork's `session-cookie-domain` / `legacy-session-cookie-clears` / `clear-domain-session-cookies` (all forkFirst).
4. **Tool-registry client-boundary perf refactor** #6138/#6152/#6153/#6155/#6156/#6163 — generated serializable tool-metadata artifacts + CI guard. Fork's custom tools must be included in regenerated metadata; `mship:generate` covers this — confirm the new CI boundary guard passes with fork tools.

**Keep fork (fork-first default; upstream reverses a deliberate fork choice):**
- Branding/marketing: upstream's ~50 wordmark/SEO/landing/"Sim Chat" rename commits (e.g. #5933, #5587, #5996, #5990 "Sim wordmark in sidebar") conflict with fork's Arena branding + `constitution.md`. Fork has diverged hero/footer/features/`sim-wordmark`/`page.tsx` — fork-first correctly preserves Arena. Take only additive upstream library/blog posts where fork hasn't diverged.
- Mothership → "Chat" overhaul #5410 (v0.8: mixture-of-models, search agent, persistent subagents, fork chat, soft-delete chats, natural-language tool titles): fork-first on `app/chat/` + fork's `mothership-admin`. Copilot code under `lib/copilot/generated/` is `upstreamFirst`; regenerate.
- Custom billing/admin routes (diverged): keep fork; upstream billing/admin changes (#5545, #5678, #5715, #5749, #5825, #6112) are opt-in, not default.

### Extensibility note

Fork carries 1,051 diverged files outside policy globs — a large recurring conflict surface. Future-proofing (isolating fork landing/auth/billing behind path prefixes or extension hooks) would cut merge cost, but is out of scope for this run and does not block merge.

### Open decisions requiring a human before merge

None. The fork-first strategy supplies an explicit, safe default for every conflicting file (preserve fork); security/deps/CI go to upstream per policy; schema/auth/registry conflicts are `manualReview` and handled by the harness's child conflict agents + post-merge verification (`bun run mship:generate`, migration + build/test gates). No item in this batch presents a fork-vs-upstream product call that the documented policy + ledger does not already resolve. Recording dispositions here rather than posting blocking questions, per the grill skill's "if the codebase or ledger answers the question, do not ask" rule.
