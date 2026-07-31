# Upstream Sync Run — 2026-07-31

## Sync topology

- **Target branch:** `feat/github-merge-agent`
- **Upstream HEAD:** `19d929b1`
- **Merge-base (target ↔ upstream):** `e2fecc86`
- **Analysis baseline:** `e2fecc86` (merge-base)
- **Commits in sync range:** 429


## Grill analysis

_Analyzed 429 commits (merge-base `e2fecc86` → upstream HEAD `19d929b1`, releases v0.7.29–v0.7.50). Strategy: fork-first per `merge-policy.json`. Fork is Arena-branded (`lib/branding/defaults.ts`: "Agentic AI Builder | Arena", position2.com, thearena.ai)._

### Upstream FBIs in this batch (themes)

- **Mothership / Chat (v0.8):** #5410 (mixture-of-models, search agent, persistent subagents, fork chat, inline questions), #5660/#5666/#5669/#5828, agent thinking+tool streaming #5671/#5956, MCP-in-chat persistence, billing passthrough #5657/#5698/#5740/#5745. Fork owns `apps/sim/app/chat/` + `hooks/queries/mothership-admin.ts` + `app/api/admin/` → fork-first.
- **MCP hardening (large):** OAuth bounding/teardown, SSRF validate-at-connect (#5823 replaced single-IP pinning), pagination #5833, warm-connection reuse #5760, Bun undici streaming #5897/#5901. Upstream-owned infra → take upstream.
- **Auth/security:** better-auth 1.6.23 + trusted-proxy client IP #5857, org session policies #5862, email-otp signup gated by DISABLE_EMAIL_SIGNUP #5840, chat-otp authType recheck #5600, isolated-vm hardening #6116/#5935, next 16.2.12 #6077, sharp/js-yaml/YAML-billion-laughs #5848/#5756. `apps/sim/lib/auth/` is manualReview; fork owns `session-cookie-domain.ts` + `legacy-session-cookie-clears.ts` → preserve fork cookie logic, take upstream better-auth bump.
- **Integrations (new, upstream-owned, additive):** Buffer #5637, Flint #5641, ClickUp #5702/#5708, Rocketlane #5709, GitLab #5710/#5743, Instagram #5568, TikTok #5504/#5978, Logfire #6075, Outlook calendar #6041, Kimi/NVIDIA-NIM/Z.ai/xAI/Context.dev providers, Exa refresh #6074. Take upstream (new registry entries; alphabetical registry merge is manualReview).
- **Tables (large):** select/multi-select #5873, currency #6106, per-table mutation locks #5960, saved views #5961, v2 predicate-filter surface #6067, atomic per-cell merge #5970. Upstream-owned → take.
- **Folders migration (destructive DB):** generic resourceType folder engine #6037/#6014/#6025/#6045, then #6051 **drops legacy folder tables** + adopts deferred `folder_id` FKs. See risks below.
- **Desktop app (new surface):** #5998 + #6050/#6065/#6086/#6098/#6109/#6060/#6044. See open decisions.
- **PII:** #5552 added CUDA torch for GLiNER, then #5697 **drops GLiNER + GPU image** for regex-only redaction; custom regex patterns #5732. See open decisions.
- **Slack:** slack_v2 preview block #5323, unified credential picker #5800, native app trigger #5892, scope changes #5631/#5898/#5977 (gate unapproved scopes behind opt-in flag).
- **Landing/SEO/library (very high volume):** dozens of marketing/content commits. Not fork-first listed → take upstream; fork branding is isolated to `lib/branding/`.

### Fork-owned paths at risk (from merge-policy.json)

- `apps/sim/lib/hubspot/` — fork owns only `env-aliases.ts` + `list-account-options.ts`; upstream HubSpot work (#5635, #5693) lives in `apps/sim/tools/hubspot/` (upstream-owned, separate path). **Low conflict risk — resolves mechanically.**
- `apps/sim/blocks/blocks/slack.ts` — fork diverged (commit `5d46f06e7` "changes done in slack read operation"). Upstream #5800/#5898 touch Slack auth/scopes. slack_v2 is a **new** file (no fork copy) → adds clean; slack.ts is a real 3-way merge for child agents. **Preview-gated, low product risk.**
- `apps/sim/app/api/admin/` + `hooks/queries/mothership-admin.ts` — upstream admin changes #5659/#5749/#5750/#5825/#6112 → fork-first wins; verify no upstream admin route the fork actually wants is dropped.
- `apps/sim/lib/branding/` — fork-owned Arena branding; sidebar already routes wordmark through it via `sidebar-brand-header`. Upstream #5990 "Sim wordmark in sidebar" is the branding collision (see open decisions).
- `blocks/registry.ts` / `tools/registry.ts` (manualReview) — many new integrations add entries; #6083 stopped `registry.ts` reading BLOCK_REGISTRY at module scope. Regenerate + alphabetical merge.
- `packages/db/migrations/` (manualReview) — fork migrations run to `0261`; upstream folder migrations land in the same numeric range → **numbering-collision risk** (db-migrate skill / harness handles renumber).

### Resolved mechanically (no human input needed)

- New upstream integrations, providers, models, tables features, MCP hardening, landing/SEO/library content, auth/security dep bumps → **take upstream** (not overriding fork paths).
- All fork-first listed paths (arena, p2_docs, unipile, facebook_ads, presentation, figma, admin, chat, branding, deploy scripts, docker-compose, bunfig) → **fork wins** on conflict.
- HubSpot lib vs tools path separation, slack_v2 additive, folder migration renumber, better-auth bump alongside fork cookie logic → mechanical per policy.

### Open decisions (cannot be resolved from codebase or ledger alone)

1. **Desktop app (#5998 + 8 follow-ups).** Brand-new top-level Sim-branded app with its own release/CI pipeline (`desktop-prerelease` tag computation #6044, release script #6060, deepsec fixes #6065). Not covered by fork-first/upstream-first policy. **Adopt into the Arena fork, or skip the desktop app entirely?** If adopted, its Sim branding + independent pipeline are not covered by the fork's deploy scripts.

2. **Setup wizard + self-host settings plane + "Sim wordmark in sidebar" (#5911, #5964, #5990).** The fork already renders the sidebar wordmark through fork-owned `lib/branding` (`sidebar-brand-header.tsx`). Upstream #5990 re-introduces a hardcoded Sim wordmark and a self-host settings plane. **Take the setup-wizard/self-host-settings features but keep every surface routed through Arena branding (no hardcoded "Sim" wordmark)? Or skip the wordmark change?**

3. **PII GLiNER removal (#5697).** Fork's `apps/pii` still ships `requirements-gliner.txt` (GLiNER model support); fork docker-compose files do not wire a GPU image. Upstream drops GLiNER + the CUDA/GPU image for regex-only block-output redaction. **Adopt regex-only PII (drop GLiNER), or preserve the fork's GLiNER capability?**
