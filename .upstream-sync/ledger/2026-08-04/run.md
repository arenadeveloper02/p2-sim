# Upstream Sync Run — 2026-08-04

## Sync topology

- **Target branch:** `feat/github-merge-agent`
- **Upstream HEAD:** `1b9e0f25`
- **Merge-base (target ↔ upstream):** `e2fecc86`
- **Analysis baseline:** `e2fecc86` (merge-base)
- **Commits in sync range:** 518

## Grill analysis

_Resume mode: yes. `grill-log.md` and `qa-history.jsonl` are empty — no prior human answers to honor or re-ask. `skipped.md` empty. Analysis grounded against the working tree (pre-merge, branch `upstream-sync/2026-08-03T10-08-54`); fork-owned paths verified present except `apps/sim/app/chat` (see §Chat)._

### Upstream FBIs in this batch (27 releases, v0.7.29 → v0.7.55)

High-signal upstream themes, by area:

- **New integrations (additive, upstream-owned):** TikTok (#5504/#5703/#5978), Buffer (#5637), Flint (#5641), ClickUp (#5702/#5708), Rocketlane (#5709), GitLab (#5710/#5743), Instagram (#5568/#6143), Kimi/Moonshot + NVIDIA NIM + Z.ai + xAI hosted-key providers (#5560/#5574/#5716), Zoho Desk (#6157), Outlook calendar (#6041), Logfire (#6075), Exa refresh (#6074), Gong/HubSpot API alignment (#5632/#5635), Claude Managed Agents block (#5778/#6140), Slack v2 preview block + custom-bot creds (#5323/#5800/#5892/#5898/#5977).
- **DB schema / migrations (manualReview):** generic resourceType folder engine (#6037/#6045/#6025), drop legacy folder tables + deferred `folder_id` FKs (#6051), org session policies (#5862), tables select/multi-select/currency columns + saved views + per-table mutation locks (#5873/#5960/#5961/#6106), custom-block child-run billing (#6023), resource pinning (#6014/#6039), workflow_id FK indexes (#4ef7bbad/#6136), role-keyed `dbFor` clients (#5583).
- **Auth / security (upstream-first shared infra):** extract connectors out of `auth.ts` (#6203), better-auth 1.6.23 + trusted-proxy client IP (#5857), SSO DNS domain verification (#5909/#5931), org session lifetime/idle/revocation (#5862), MCP SSRF validate-at-connect + IPv4 pinning + response-body caps (#5823/#5850/#6169), zip-bomb / billion-laughs guards (#5756/#6166/#6176), secret exposure in trace spans (#6000/#18214158), copilot fail-open write-gate closure (#6132), presigned-upload per-type authz (#6175), realtime continuous room-access enforcement (#6170/#5917/#e5d2f7d8), CVE dep bumps (sharp/js-yaml #5848, next #5890/#6077/#6235→reverted #6242, @opentelemetry/core #6182).
- **Providers / models:** Claude Opus 5 (#5925), prompt-caching capability + cache pricing (#5922), Gemini 3.6 Flash / 3.5 Flash-Lite (#5812), Groq/Cerebras/GLM catalog (#5561/#5559), model sunset tiers (#5805), sim auto model (#6103/#6144).
- **Platform / infra:** desktop app (#5998 + hardening #6065/#6109/#6086/#6050), custom sandboxes + Daytona failover (#6071/#5860/#6033), realtime shared room spine + Yjs Files/Tables collab (#5991/#2ccda18f), hybrid lexical+vector KB search (#6124), public v1 import/export API + quota headers (#5999/#6011/#6012/#6014), self-host settings plane + Docker/Helm alignment (#5990/#6216/#6225/#5907/#5939), CI runner/cache churn (many), test db-mock convergence tranches 1–4 (#5861/#5863/#5864/#5866).
- **Registry-refactor touching manualReview paths:** `blocks/registry.ts` no longer reads `BLOCK_REGISTRY` at module scope — config moved to `registry-maps.ts` (#6083); tool-metadata artifacts + client-boundary registry guard (#6153/#6155/#6156). Fork tree already reflects this split (fork blocks live in `registry-maps.ts`).

### Fork-owned paths at risk (from merge-policy.json)

| Path | Upstream pressure this batch | Resolution |
|------|------------------------------|------------|
| `blocks/registry-maps.ts`, `tools/registry.ts` (manualReview) | ~20 new integrations register here; registry-refactor #6083/#6153 | Take upstream structure, re-add fork entries (arena, arena-development, facebook_ads, p2_docs, unipile; presentation is commented out). Mechanical. |
| `packages/db/migrations/`, `packages/db/schema/` (manualReview) | Heavy: folder engine, org sessions, tables columns/views/locks, pinning, FK indexes | Renumber fork migrations after upstream's; collision already visible (`0251`/`0252` fork-named vs upstream drizzle auto-names). Use `db-migrate` skill. Mechanical, needs care. |
| `apps/sim/lib/auth/` (manualReview) + `session-cookie-domain.ts` / `legacy-session-cookie-clears.ts` (forkFirst) | `auth.ts` connector extraction (#6203), better-auth bump (#5857) | Upstream-first on shared auth infra; preserve fork session-cookie files verbatim. |
| `apps/sim/lib/branding/` (forkFirst) | Sim wordmark/favicon/OG churn (#5587/#5990), "Sim"→"Sim Chat" block rename (#5933) | Fork-first: keep Arena branding. Upstream branding on landing/docs (non-fork paths) flows in. Block rename touches `blocks/blocks/sim.ts`, not `lib/branding` — mechanically neutral. |
| `apps/sim/app/chat/` (forkFirst) | Voice-mode removal (#6215/#6218/#6220), `NEXT_PUBLIC_CHAT_DISABLED` (#6137), highlight-to-chat (#6087) | Dir **absent** in fork tree → no conflict; upstream chat changes apply cleanly. |
| `apps/sim/app/api/admin/`, `hooks/queries/mothership-admin.ts` (forkFirst) | Banned-user filter (#5659), recent impersonations (#5750), included-usage/default tweaks | Fork-first: keep fork admin surface. |
| `apps/sim/lib/copilot/generated/` (upstreamFirst) | Copilot tool/skill changes across batch | Regenerate post-merge via `bun run mship:generate` (already in `regenerateAfterMerge`). |
| `apps/sim/lib/hubspot/` (forkFirst) | Upstream HubSpot tool alignment (#5635) touches `tools/hubspot`, not fork `lib/hubspot` | Fork-first on `lib/hubspot`; upstream tool changes are a separate path. |

### Take vs skip

- **Take (upstream-first / additive, no fork-path conflict):** all new integrations, providers/models, security hardening + CVE bumps, realtime spine, KB hybrid search, v1 import/export API, custom sandboxes, desktop app, CI/test infra, folder engine + tables features. These are the bulk of the 518 commits and carry no fork-vs-upstream tension.
- **Preserve fork (fork-first):** Arena/P2/Unipile/Facebook/Presentation integrations, admin/mothership routes, Arena branding, auth session-cookie handling, hubspot lib. Re-apply fork entries on top of upstream registry/schema restructures.
- **Regenerate, don't hand-merge:** `lib/copilot/generated/` via `mship:generate`.
- **Nothing deliberately skipped** — `skipped.md` stays empty unless a child conflict agent finds an upstream change that overrides a fork-owned path (then it records the skip).

### Open decisions requiring a human

None that policy/ledger cannot resolve. Every conflict surface above maps to an existing rule: fork-first on the listed prefixes, upstream-first on shared infra (auth/deps/CI/security), manualReview handled mechanically (registry re-add, migration renumber, `mship:generate`). The desktop app (#5998) and Slack v2 preview block are additive and upstream-owned; taken by default under the fork-first strategy's "upstream wins on shared infra unless ledger says otherwise" clause — no product tension since neither overrides a fork path. No genuine fork-vs-upstream product call is left ambiguous.

