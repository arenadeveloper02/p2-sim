# Upstream Sync Run — 2026-08-06-5

## Sync topology

- **Target branch:** `feat/github-merge-agent`
- **Upstream HEAD:** `578d9ddc`
- **Merge-base (target ↔ upstream):** `e2fecc86`
- **Analysis baseline:** `9d23e25c` (lastSyncedUpstreamSha)
- **Commits in sync range:** 149
- **Merge tip:** next-releases v0.7.38…v0.7.43 (n=6) (`578d9ddc`; full upstream HEAD `e1ab24c1`)

## Grill analysis

### Measurement (read-only, before any merge)

Three-step method from `extensibility-notes.md`, run in that order:

| Step | Command | Result |
|---|---|---|
| 1 | `git merge-base HEAD 578d9ddc` | `9d23e25c` — identical to the analysis baseline, so the sync range and the conflict surface are the same window |
| 2 | `comm -12` of upstream-changed vs fork-changed files | 1635 upstream × 1658 fork → **226-file overlap** |
| 3 | `git merge-tree --write-tree HEAD 578d9ddc` | exit 1, tree `09435b33`, **83 conflicted files** (79 content, 4 modify/delete, 0 add/add, 0 renames) |

Ranked by conflicted-line count (not file count), the work concentrates in:
`providers/models.ts` (1945), `copilot/api-keys/validate/route.test.ts` (282),
`api/workspaces/route.ts` (240), `special-tags.tsx` (210), `message-content.tsx` (183),
`.github/workflows/ci.yml` (177 / 16 hunks), `files/serve/[...path]/route.ts` (150).
The 40-file tail is 1–2 hunk import/union noise.

### Two silent-breakage classes the conflict list does NOT show

These are the highest-value findings of this slice. Both auto-merge cleanly and would ship broken.

**1. `packages/db/migrations/meta/_journal.json` auto-merges into duplicate `idx`.**
Both sides added migrations at 0261–0264. Git merged the journal with **no conflict markers**, so
no child agent would ever open it. The merged journal has 270 entries with `idx` 261, 262, 263, 264
each appearing **twice**:

```
fork:     261 local_copilot_user_memory · 262 tiktok_credential_id_idx · 263 slack_native_routing · 264 unknown_sinister_six
upstream: 261 tranquil_donald_blake · 262 strong_storm · 263 workflow_fork_sync_excluded · 264 fat_ikaris · 265 org_session_policy
```

Per the standing rule (renumber the *unapplied* side), upstream's five migrations renumber to
**0265…0269** after the fork's highest applied index, journal entries append, snapshots rename to
match. The fork added **zero** snapshots, so upstream's `0261…0265_snapshot.json` land in the fork's
long-standing `meta/` gap — they must be renamed alongside their SQL or `meta/` and the journal
disagree.

**2. `lib/copilot/generated/*` — the standing verify-only assertion is necessary but not sufficient.**
Upstream `#5410`/`#5656` **deleted seven catalog entries the fork still routes** — `Superagent`,
`Research`, `UserMemory`, `MoveFile`, `MoveFileFolder`, `RenameFile`, `RenameFileFolder` — and
inserted `ShareFile` + `Search` at the same file offsets. Consequences of the natural merge:

- Git aligned the fork's hand-edited Superagent `task.description` against `share_file`'s `action`
  property, so the merged tree contains the GFM sentence **exactly once, attached to the wrong tool**.
  The `grep -c "Drive handles GFM import"` assertion from runs 3 and 4 returns `1` and **passes**.
- All seven exports vanish from the merged tree, while `lib/copilot/tools/server/router.ts` still
  imports five of them (`MoveFile`…`UserMemory`) — a hard build break, and `UserMemory` is backed by
  the fork's own `0261_local_copilot_user_memory` table.
- Upstream also renamed the `research` subagent to `search`; the fork's `local-copilot/` (fork-only,
  absent upstream) dispatches `research` and `superagent` as specialist domains.

Resolution: restore all seven entries **additively** and take `ShareFile`/`Search` as well. Additive
is unconditionally safe on the upstream side and is status quo for the fork.

### Prior answers applied, not re-asked

Run `2026-08-06-4` settled both open questions and this slice's billing conflicts sit downstream of them.
Symbol census (`grep -c` at base / fork / upstream tip) confirms what actually landed:

| Symbol | base | fork | upstream | reading |
|---|---|---|---|---|
| `BillingAttributionSnapshot` | 62 | 62 | 63 | Q1=B adopted; upstream's model is the billing path |
| `ExecutionActor` | 0 | 11 | 0 | retained as observability only |
| `checkMothershipUsageLimits` | 0 | 7 | 0 | Q2=A honoured; fork gate still governs |
| `checkSelfHostedMothershipUsageLimits` | 0 | 4 | 0 | same |

So on the 7 billing/attribution test conflicts: take upstream's shared-mock scaffolding, keep the fork's
assertions for the fork-only helpers. No new question.

### Upstream FBIs worth taking

- **Test infrastructure (`#5853`, `#5856`, `#5861`–`#5866`, `#5871`, `#5875`)** — the whole rewrite
  lands clean: `packages/testing/**` (+1334/−256) and `vitest.setup.ts` auto-merge, and the fork's only
  edit there is a single line in `schema.mock.ts`. Because the new shared mocks are in force, upstream's
  version of each conflicted test file is the internally consistent one.
- **MCP hardening (~25 commits)** — zero conflicts. Free.
- **Security: `#5756` (YAML billion-laughs), `#5823` (SSRF validate-at-connect), `#5848`
  (sharp 0.35.3 / js-yaml 4.3.0), `#5799`** — take all. `js-yaml` already auto-merged to 4.3.0.
- **GCS storage (`#5728`)**, **zip (`#5788`)**, **org session policies (`#5862`)**,
  **trusted-proxy client IP (`#5857`)**, **deployment state machine (`#5680`/`#5841`)**,
  **nuqs URL-state audit (`#5851`)**, **Kimi + Gemini 3.6 (`#5716`/`#5812`)**, **sunset tiers
  (`#5785`/`#5793`/`#5805`)** — take, union'd against fork additions.

### Upstream changes skipped, with rationale

- **X pixel + HubSpot loader on landing (`#5731`)** — the fork already removed the entire tracking
  block from `(landing)/layout.tsx`. Upstream's script hardcodes Sim's HubSpot portal
  (`js-na2.hs-scripts.com/246720681.js`) and is gated on `isHosted`, which the fork redefines to
  include `*.thearena.ai`. Taking it sends Arena landing traffic into Sim's marketing analytics.
  Fork-first. The paired CSP allowlist (`#5804`) auto-merged and is inert with no pixel loaded — kept.
- **Slack Community help-menu item (`#5858`)** — points at Sim's community. Same class as the
  `docs.sim.ai` link the fork already replaced with Arena docs (`arena_docs_opened`). Skipped in
  `sidebar.tsx`; the `slack_community_opened` key is still union'd into `lib/posthog/events.ts` so the
  event type stays aligned with upstream.
- **Hosted-key narrowing in `tools/image/generate.ts`** — upstream simplified to `falai` only via
  `hostedKeyEnabledWhen` with a static `'FALAI_API_KEY'`. The fork's version is a **superset**:
  `falai` + `openai` + `gemini`, a dynamic `envKeyPrefix` resolver, a `__skipHostedKeyHandling` escape
  hatch, and `calculateHostedImageToolCost`. `--theirs` here removes fork capability. Fork-first —
  the "audit both directions" lesson from run 2026-08-06-2, recurring.
- **Hosted-key env resolution (`hosted-key-rate-limiter.ts`)** — same shape: the fork added `_1..3`
  fallback and the Gemini key namespace for Google-hosted image tools. Fork-first.
- **SambaNova/OpenRouter removal from the hosted gate (`providers/utils.ts`)** — the fork retains both
  with an explicit TSDoc saying so. Union: keep the fork's list, add `isKimiModel`.
- **Email social-links row (`#5802`/`#5803`)** — fork keeps its suppression (standing decision from run
  4); upstream's wordmark clear-space and footer icon sizing are taken.
- **`.github/workflows/ci.yml` (`#5701`…`#5881`)** — upstream is Blacksmith runners + ECR; the fork is
  `ubuntu-latest` + GHCR (`p2-sim-simstudio`) with its own `migrate` job wiring. Fork-first, now
  codified in `merge-policy.forkFirst`.

### Genuine fork↔upstream collisions (resolvable, with invariants)

None of these is a product decision — each has one defensible resolution once the invariant is named.

1. **`lib/auth/auth.ts`** — the fork's Arena block (`ARENA_V3_OAUTH_CALLBACK_ORIGINS`,
   `resolveBetterAuthCrossSubdomainCookieDomain`, `arenaHubTrustedOrigin`, dev embed origins) occupies
   the region upstream replaced with `trustedProxies` (`#5857`) + a `guardSubscriptionPlanWrites`
   wrapper around `drizzleAdapter`. Union, and the `advanced.crossSubDomainCookies` spread must survive
   the switch of `database` from a value to a function. **Dropping it breaks Arena SSO across
   `*.thearena.ai`.**
2. **`app/api/auth/oauth/utils.ts`** — the fork calls `refreshOAuthToken(providerId, refreshToken,
   alias, organizationId, getOrganizationOAuthApp)` for org-scoped custom OAuth apps and branches on a
   fork-only `account_tokens` table (`accountTokens`: base 0, fork 1, upstream 0). Upstream `#5723`/
   `#5737` wrapped the same call in Slack per-installation coalescing with a chain-version guard and
   reduced it to two args. Thread the fork's three extra args through upstream's `refreshTokenToUse`
   path and keep the `account_tokens` write branch.
3. **`credential-selector.tsx`** — both sides renamed the same concept: fork
   `credentialKind === 'custom-bot'`, upstream `'service-account'` plus a merged `'any'` kind
   (`#5690`/`#5800`). Upstream's generalization is a superset and explicitly covers the custom Slack bot
   case, so adopt it — then re-graft the fork's Unipile/HubSpot account options,
   `handleUnipileReconnect`, `additionalConnectItems`, and `isAdminWorkspace` gating.
4. **`sync-local-draft.ts` (modify/delete ×2)** — not a deletion, a **relocation** to
   `apps/sim/stores/workflows/sync-local-draft.ts`. Accept the move, re-apply the fork's
   `flushMergedLocalDraftToServer` (which fixes image-generator provider/model being cleared on deploy)
   into the new file, and repoint `deploy-modal.tsx` / `use-deployment.ts`.
5. **`app/api/workspaces/route.ts`** — adopt upstream's `listWorkspacesForViewer` /
   `resolveInviteFlags` refactor (`#5706`, which `hooks/queries/workspace.ts` and the sidebar prefetch
   now depend on) and re-apply the fork's invite-gating suppression (`inviteDisabledReason: null`).
6. **`hooks/queries/workspace.ts`** — adopt `normalizeWorkspacesResponse` +
   `WORKSPACE_LIST_STALE_TIME`; verify the shared normalizer carries the fork's `isPersonal` field
   (`0248_workspace_is_personal`) and keep the `setZoomAdminAccessCache` side effect.
7. **`tools/index.ts`** (4 hunks) — keep the fork's `allowHttp` (fork-only: base 0, fork 3, upstream 0)
   *and* upstream's `proxyUrl` (`#5867`); keep the fork's `responseData`-aware `json`/`text` wrapper
   *and* add upstream's `body: response.body` (needed for zip); take
   `tool.directExecution(contextParams, effectiveSignal)` and upstream's copilot-only `_serviceCost`.
8. **`lib/uploads/config.ts`** — take the GCS configs and `getServeStoragePrefix`, keep the fork's
   `S3_AGENT_GENERATED_IMAGES_CONFIG` and its `agent-generated-images` context branch, and **dedupe
   `BLOB_CONFIG`** (the fork already exports it at L122).
9. **`(files/serve)/[...path]/route.ts`** — keep the fork's whole agent-generated-images auth block
   (internal-JWT sentinel + `canAccessAgentGeneratedImageViaDeployedChat`), add the `gcs` path prefix.
10. **`lib/workflows/orchestration/chat-deploy.ts`** — take upstream's in-flight-attempt guard and
    `needsRedeploy` short-circuit, keep the fork's extra `performFullDeploy` args
    (`workflowName`/`requestId`/`request`/`actorId`).
11. **`home/**` chat surface** — parallel additions, not a collision: fork adds a `chart` special tag,
    upstream adds a `question` tag (`#5410`). Fork diffs are additive (+133/−6, +149/−12, +18/−1),
    upstream's are larger. Union on the shared union types and tag arrays.
12. **Two fork-deleted test files** (`home/hooks/use-chat.test.ts`,
    `stream/turn-model-serialize.test.ts`) — the fork dropped them deliberately in `d4a304b0`; the
    sources survive and `use-chat.ts` itself merges clean. Keep them deleted.

### The union hazard class (new)

Four files fail on a *naive* union because upstream re-adds, at a new position, a symbol the fork
already defines elsewhere in the same file — duplicate object-literal keys and duplicate exports are
hard TypeScript errors, not lint nits. Measured, in the merged tree:

- `lib/core/config/env.ts` — `XAI_API_KEY_1/2/3` would appear at **both** L175–177 and L195–197.
- `lib/core/config/api-keys.ts` — a second `provider !== 'xai'` guard and a second unreachable
  `else if (provider === 'xai')` branch.
- `lib/uploads/config.ts` — a second `BLOB_CONFIG` export.
- `providers/utils.ts` — the hosted gate re-listing `isXaiModel`.

Recorded as `dedupeOnUnion` in `merge-policy.json`. Union the genuinely new symbols only (here: the
`KIMI_*` keys and the `kimi` branch), then grep the merged file for duplicate identifiers.

### Follow-ups (pre-existing, not sync-caused)

- **`vars.CI_PROVIDER` should be set to `github` on `p2-sim`** unless Blacksmith is installed. The
  merged `test-build.yml` (auto-merged, no conflict) defaults to `blacksmith-8vcpu-ubuntu-2404` when
  the variable is unset. This is strictly better than today — the fork's current `test-build.yml`
  hardcodes Blacksmith with no fallback — but the variable is what activates the GitHub-hosted path.
- **Snapshot gap persists.** `meta/` still has no fork-authored snapshots; upstream's renumbered
  `0265…0269_snapshot.json` describe upstream's schema, not the fork's. Harmless while nobody runs
  `drizzle-kit generate` during a sync (standing rule), but it blocks ever regenerating safely.
- **Fork-only copilot catalog entries belong in an overlay.** Seven entries and one hand-edited prompt
  sentence live inside a generated file upstream rewrites every release. A fork-owned overlay applied
  on top of the generated output would retire this conflict class permanently.
- **`AUTH_TRUSTED_PROXIES` is unset**, so `#5857`'s forwarded-IP resolution is inert and session client
  IPs stay at the direct peer (pre-merge behavior). Set it if Arena runs behind a known proxy chain.
- **Model sunset tiers (`#5805`)** will start rendering amber/red warnings on canvas for any model
  upstream marks legacy/deprecated. Worth a pass over which models Arena workflows actually use.

## Parent plan

### Self-resolutions

- **Renumber upstream's 5 migrations to 0265-0269; keep the fork's journal lineage** (`mustEdit`): packages/db/migrations/0261_tranquil_donald_blake.sql, packages/db/migrations/0262_strong_storm.sql, packages/db/migrations/0263_workflow_fork_sync_excluded.sql, packages/db/migrations/0264_fat_ikaris.sql, packages/db/migrations/0265_org_session_policy.sql, packages/db/migrations/meta/_journal.json — CRITICAL SILENT BREAKAGE — _journal.json auto-merges with NO conflict markers, so no child agent would ever open it. The merged journal has 270 entries with idx 261/262/263/264 each appearing twice (fork: local_copilot_user_memory, tiktok_credential_id_idx, slack_native_routing, unknown_sinister_six; upstream: tranquil_donald_blake, strong_storm, workflow_fork_sync_excluded, fat_ikaris, org_session_policy). Renumber the UNAPPLIED side (upstream) to 0265..0269 after the fork's highest applied index, append its journal entries in order, and rename upstream's meta/0261..0265_snapshot.json to 0265..0269_snapshot.json so meta/ and the journal agree. Copy upstream SQL verbatim (already carries COMMIT; breakpoints and CREATE INDEX CONCURRENTLY). Do NOT run drizzle-kit generate. (extensibility-notes 2026-08-05 'renumber the unapplied side' + 2026-08-06-4 '0260 collision'; measured on merge-tree 09435b33)
- **Restore the 7 fork-consumed copilot catalog entries upstream deleted; take ShareFile + Search additively; re-attach the GFM sentence to Superagent.task** (`mustEdit`): apps/sim/lib/copilot/generated/tool-catalog-v1.ts, apps/sim/lib/copilot/generated/tool-schemas-v1.ts, apps/sim/lib/copilot/tools/server/router.ts, apps/sim/lib/copilot/tools/descriptions.ts — CRITICAL SILENT BREAKAGE — the standing verify-only 'Drive handles GFM import' assertion PASSES on a wrong tree. Upstream #5410/#5656 deleted Superagent, Research, UserMemory, MoveFile, MoveFileFolder, RenameFile, RenameFileFolder (all present at base, all still fork-consumed) and inserted ShareFile/Search at the same offsets, so git grafted the fork's Superagent task.description onto share_file's action param. router.ts still imports MoveFile/MoveFileFolder/RenameFile/RenameFileFolder/UserMemory (hard build break); UserMemory is backed by the fork's 0261_local_copilot_user_memory table; local-copilot/ (fork-only) dispatches the superagent and research specialist domains. Restore all 7 entries and their tool-schemas-v1 keys additively, keep upstream's ShareFile with action:/Search, and add upstream's queryUserTableServerTool. Verify: grep for each of the 7 exports AND that share_file's parameter is named 'action' AND that the GFM sentence sits on Superagent.task. (merge-policy lib/copilot/generated note; simstudioai/sim#5410, #5656; measured export census base/fork/upstream)
- **CI workflow stays fork-owned** (`ours`): .github/workflows/ci.yml — Upstream is Blacksmith runners + ECR push; the fork is ubuntu-latest + GHCR (ghcr.io/<owner>/p2-sim-simstudio) with its own migrate/detect-version job wiring and docker/build-push-action. Taking upstream replaces the fork's entire publish and deploy chain. 16 hunks, every one infrastructure ownership. Now codified in merge-policy.forkFirst. (simstudioai/sim#5808, #5814, #5826, #5869, #5881; merge-policy.forkFirst (added this run))
- **Keep the fork's landing page free of HubSpot + X tracking** (`ours`): apps/sim/app/(landing)/layout.tsx — The fork already removed the whole tracking block. Upstream #5731 hardcodes Sim's HubSpot portal (js-na2.hs-scripts.com/246720681.js) plus an X conversion pixel behind isHosted — which the fork redefines to include *.thearena.ai and localhost:3000, so it WOULD fire on Arena and report into Sim's marketing analytics. The paired CSP allowlist (#5804) auto-merged and is inert without a pixel; keep it. (extensibility-notes 2026-08-05 'isHosted is fork-redefined'; simstudioai/sim#5731, #5804)
- **Keep the fork's hosted-key supersets for image generation and env resolution** (`ours`): apps/sim/tools/image/generate.ts, apps/sim/lib/core/rate-limiter/hosted-key/hosted-key-rate-limiter.ts, apps/sim/lib/core/rate-limiter/hosted-key/hosted-key-rate-limiter.test.ts — Audit runs both directions. Upstream narrowed image hosted keys to falai only (static 'FALAI_API_KEY' via hostedKeyEnabledWhen); the fork supports falai + openai + gemini with a dynamic envKeyPrefix resolver, a __skipHostedKeyHandling escape hatch, and calculateHostedImageToolCost. The rate limiter likewise adds _1..3 fallback and the Gemini key namespace. --theirs REMOVES fork capability. Verify tools/types.ts still accepts a predicate for `enabled` (it auto-merged, so it should). (extensibility-notes 2026-08-06-2 'check for fork supersets' (xAI rotation case))
- **Union the provider/model/env-key surface: take only genuinely new symbols (dedupe hazard)** (`union`): apps/sim/lib/core/config/env.ts, apps/sim/lib/core/config/api-keys.ts, apps/sim/lib/uploads/config.ts, apps/sim/providers/models.ts, apps/sim/providers/utils.ts, apps/sim/providers/utils.test.ts — providers/models.ts is the slice's largest conflict (1945 conflicted lines / 11 hunks): union the fork's model entries with upstream's Kimi (#5716), Gemini 3.6 Flash + 3.5 Flash-Lite (#5812) and the legacy/deprecated sunset-tier metadata (#5805) — keep every fork model entry, and keep the fork's models in the hosted lists. The other four files carry a NEW hazard class where a naive union produces duplicate identifiers, a hard TS error: env.ts would carry XAI_API_KEY_1/2/3 at BOTH L175-177 and L195-197 (fork already has them at L168-171); api-keys.ts would gain a second `provider !== 'xai'` guard and a second unreachable `else if (provider === 'xai')`; uploads/config.ts a second BLOB_CONFIG export; providers/utils.ts a re-listed isXaiModel. Take ONLY the KIMI_* keys, the kimi branch, isKimiModel, and the GCS_* configs. Keep the fork's TSDoc in providers/utils.ts explaining why SambaNova and OpenRouter stay in the hosted gate. Then grep the merged files for duplicate identifiers. (merge-policy.dedupeOnUnion (added this run); simstudioai/sim#5716, #5812, #5805, #5728)
- **Accept upstream's sync-local-draft relocation; re-apply the fork's flush helper at the new path** (`mustEdit`): apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/hooks/sync-local-draft.ts, apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/hooks/sync-local-draft.test.ts, apps/sim/stores/workflows/sync-local-draft.ts, apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/components/deploy-modal/deploy-modal.tsx, apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/hooks/use-deployment.ts — The 2 modify/delete conflicts are a RELOCATION, not a deletion — upstream moved the module to apps/sim/stores/workflows/sync-local-draft.ts and imports it from there in deploy-modal.tsx, use-deployment.ts and socket-provider.tsx. Delete the old path, port the fork's flushMergedLocalDraftToServer (fixes image-generator provider/model being cleared on deploy, called at deploy-modal.tsx:329 and :447) into the new file, and repoint the fork's imports. Port the fork's sync-local-draft.test.ts cases onto upstream's stores/workflows/sync-local-draft.test.ts. (simstudioai/sim#5680, #5790; measured — upstream tip has stores/workflows/sync-local-draft.{ts,test.ts})
- **Keep the two test files the fork deliberately deleted** (`delete`): apps/sim/app/workspace/[workspaceId]/home/hooks/use-chat.test.ts, apps/sim/app/workspace/[workspaceId]/home/hooks/stream/turn-model-serialize.test.ts — modify/delete where the fork deleted (commit d4a304b0) and upstream modified. Both sources survive and diverge on the fork side (use-chat.ts +298/-27, turn-model-serialize.ts +33/-5 vs base) while use-chat.ts itself merges clean. Resurrecting upstream's tests would assert upstream behaviour against fork-extended modules. Status quo: stay deleted. (measured modify/delete list from merge-tree 09435b33)
- **package.json union; take upstream's security dependency bumps; regenerate bun.lock** (`union`): apps/sim/package.json, bun.lock — Only sharp conflicts (fork 0.34.3 vs upstream 0.35.3); js-yaml already auto-merged to 4.3.0. Both are security-advisory bumps in #5848, so take upstream's versions and keep the fork-only deps the union preserves (sanitize-html, selenium-webdriver, soap). Never hand-merge bun.lock — regenerate it after the manifests settle. (simstudioai/sim#5848; merge-policy.packageJson.sharedDependencyVersions (added this run))
- **Union lib/auth/auth.ts — Arena cross-subdomain cookies and trusted origins are non-negotiable** (`union`): apps/sim/lib/auth/auth.ts — The fork's ARENA_V3_OAUTH_CALLBACK_ORIGINS parsing, devArenaEmbedCallbackOrigins, resolveBetterAuthCrossSubdomainCookieDomain and arenaHubTrustedOrigin sit in exactly the region upstream replaced with trustedProxies (#5857). Keep all of it and add trustedProxies. Second hunk changes `database` from a value to a function (guardSubscriptionPlanWrites wrapping drizzleAdapter) — the fork's conditional `advanced.crossSubDomainCookies` spread must survive that switch. INVARIANT: losing crossSubDomainCookies breaks Arena SSO across *.thearena.ai. AUTH_TRUSTED_PROXIES stays unset, so #5857 is inert. (merge-policy.unionPaths apps/sim/lib/auth/auth.ts; simstudioai/sim#5857, #5862)
- **Union app/api/auth/oauth/utils.ts — thread the fork's org-app args through upstream's Slack coalescing** (`union`): apps/sim/app/api/auth/oauth/utils.ts, apps/sim/lib/oauth/terminal-errors.ts — The fork calls refreshOAuthToken(providerId, refreshToken, alias, organizationId, getOrganizationOAuthApp) for org-scoped custom OAuth apps (0259_organization_oauth_apps) and branches writes on a fork-only account_tokens table (accountTokens: base 0, fork 1, upstream 0). Upstream #5723/#5737 wrapped the call in getFreshestSlackChain / fanOutSlackTokenChain with an ifChainUnchangedSince guard and reduced it to two args. Keep the fork's 5-arg call inside upstream's refreshTokenToUse path and keep the account_tokens write branch. terminal-errors.ts is a plain union (custom_app_not_configured + token_revoked). (simstudioai/sim#5723, #5737; merge-policy.unionPaths app/api/auth/oauth/utils.ts)
- **Adopt upstream's service-account credential generalization; re-graft the fork's Unipile/HubSpot pickers** (`theirs`): apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/credential-selector/credential-selector.tsx, apps/sim/lib/credentials/connect-draft.ts, apps/sim/lib/credentials/access.test.ts, apps/sim/blocks/blocks/zoom.ts — Both sides renamed the same concept: fork credentialKind 'custom-bot', upstream 'service-account' plus a merged 'any' kind (#5690 client-credentials service accounts, #5800 slack_v2 picker merge). Upstream's version is a strict superset and its own comments call out the custom Slack bot case, so adopt it — then re-apply the fork's isSharedUnipileWorkspace, unipileAccountOptions, hubspotAccountOptions, handleUnipileReconnect, additionalConnectItems and isAdminWorkspace gating, mapping the fork's 'custom-bot' semantics onto 'service-account'. connect-draft.ts: take upstream's displayName dedup/auto-numbering. zoom.ts: take upstream's service-account 'me' caveat wording. (simstudioai/sim#5690, #5800, #5710, #5743)
- **Adopt upstream's workspace-list prefetch refactor; re-apply the fork's invite suppression and zoom-admin cache** (`theirs`): apps/sim/app/api/workspaces/route.ts, apps/sim/hooks/queries/workspace.ts, apps/sim/lib/workspaces/policy.ts, apps/sim/lib/workspaces/policy.test.ts — #5706 moved normalization into hooks/queries/utils/workspace-list-query (normalizeWorkspacesResponse + WORKSPACE_LIST_STALE_TIME) so the server prefetch and the client query share one staleTime constant — the sidebar depends on it. Adopt it, then: (a) re-apply the fork's invite-gating suppression in route.ts (inviteDisabledReason: null, keeping upstream's inviteMembersEnabled value); (b) keep setZoomAdminAccessCache and the isAdminWorkspace import in the hook; (c) VERIFY the shared normalizer carries the fork's isPersonal field (0248_workspace_is_personal) and re-add it if not; (d) take upstream's policy-constants import in policy.ts so the merged upstream body compiles. (simstudioai/sim#5706, #5715; react-query-best-practices (named staleTime constant shared with prefetch))
- **Adopt upstream's deployment state machine on the chat/schedule deploy paths** (`theirs`): apps/sim/lib/workflows/orchestration/chat-deploy.ts, apps/sim/lib/workflows/schedules/deploy.ts, apps/sim/lib/workflows/schedules/deploy.test.ts, apps/sim/lib/api/contracts/workflows.test.ts, apps/sim/lib/workflows/persistence/utils.ts, apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/components/deploy-modal/deploy-modal.tsx, apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/components/deploy-modal/components/chat/chat.tsx, apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/hooks/use-deployment.ts — #5680/#5841 introduced preparing/activating/active deployment attempts, shorter lock windows and tx safety timeouts; the 0262/0264 migrations deliver the columns. Upstream hardening on shared code, not a fork feature. Keep the fork's extra performFullDeploy args (workflowName, requestId, request, actorId — orchestration/deploy.ts auto-merged so the signature survives) and union persistence/utils.ts (fork migrateBlockTypes + upstream isDynamicHandleSubblock). (simstudioai/sim#5680, #5841, #5790, #5818)
- **Union tools/index.ts and the executor types** (`union`): apps/sim/tools/index.ts, apps/sim/tools/index.test.ts, apps/sim/executor/execution/types.ts, apps/sim/executor/handlers/workflow/workflow-handler.ts — Four hunks in tools/index.ts, each needing both sides: keep the fork's allowHttp (base 0 / fork 3 / upstream 0) AND add upstream's proxyUrl (#5867); keep the fork's responseData-aware json/text wrapper AND add upstream's `body: response.body` (needed for zip, #5788); take tool.directExecution(contextParams, effectiveSignal); take upstream's copilot-only _serviceCost via resolveToolScope. executor/execution/types.ts is a two-import union (fork ExecutionActor + upstream CustomPiiPattern, #5732). workflow-handler.ts: union the type imports and take START_BLOCK_METADATA_FIELD / StartBlockRunMetadata (#5700). (simstudioai/sim#5867, #5788, #5700, #5732, #5740)
- **Take upstream's rewritten test files; keep the fork's assertions for fork-only billing helpers** (`theirs`): apps/sim/app/api/copilot/api-keys/validate/route.test.ts, apps/sim/app/api/billing/update-cost/route.test.ts, apps/sim/lib/billing/core/usage-log.test.ts, apps/sim/lib/billing/organizations/member-limits.test.ts, apps/sim/lib/execution/preprocessing.test.ts, apps/sim/lib/logs/execution/logger.test.ts, apps/sim/lib/copilot/chat/payload.test.ts, apps/sim/lib/core/security/csp.test.ts, apps/sim/lib/core/utils.test.ts, apps/sim/providers/models.test.ts — #5853/#5856/#5861-#5866/#5871/#5875 rewrote these onto a new table-aware @sim/db chain mock, complete env-flags mock and auto-unstub setup. packages/testing/** (+1334/-256) and vitest.setup.ts BOTH auto-merged and the fork's only edit there is one line in schema.mock.ts — so the new infra is in force and upstream's file is the internally consistent one. Then re-apply the fork's assertions: checkMothershipUsageLimits / checkSelfHostedMothershipUsageLimits (run 4 Q2 = A) and ExecutionActor observability (run 4 Q1 = B with ExecutionActor retained). For csp.test.ts verify the shared env mock supplies NEXT_PUBLIC_BRAND_* / PRIVACY_URL / TERMS_URL; if not, keep the fork's local createEnvMock block. (qa-history a-5204435835 (run 2026-08-06-4: Q1=B, Q2=A); simstudioai/sim#5856, #5871, #5875)
- **Union the branding/UI surfaces; skip the Sim-branded Slack Community item** (`union`): apps/sim/app/workspace/[workspaceId]/w/components/sidebar/sidebar.tsx, apps/sim/lib/posthog/events.ts, apps/sim/components/emails/components/email-footer.tsx, apps/sim/components/emails/components/email-layout.tsx, apps/sim/app/workspace/[workspaceId]/home/components/message-content/components/special-tags/special-tags.tsx, apps/sim/app/workspace/[workspaceId]/home/components/message-content/message-content.tsx, apps/sim/app/workspace/[workspaceId]/home/components/message-content/components/agent-group/tool-call-item.tsx, apps/sim/app/workspace/[workspaceId]/home/components/mothership-chat/mothership-chat.tsx, apps/sim/app/workspace/[workspaceId]/home/hooks/stream/stream-context.ts, apps/sim/lib/copilot/chat/payload.ts, apps/sim/lib/copilot/chat/workspace-context.ts, apps/sim/lib/copilot/request/handlers/run.ts, apps/sim/lib/copilot/tools/server/workflow/edit-workflow/validation.ts, apps/sim/app/workspace/[workspaceId]/knowledge/[id]/[documentId]/document.tsx, apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/sub-block.tsx, apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/tool-input/tool-input.tsx, apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/hooks/use-panel-resize.ts — sidebar.tsx: keep the fork's brand-gated support/terms/privacy items and its Arena docs handler; SKIP upstream's handleOpenSlackCommunity and its menu item (points at Sim's community — same class as the docs.sim.ai link the fork already replaced), but DO union slack_community_opened into posthog/events.ts so the event type stays aligned. email-footer/layout: keep the fork's commented-out social-links row, take upstream's wordmark clear-space and footer icon sizing (#5802/#5803). home/**: parallel additions, not a collision — fork adds a `chart` special tag, upstream a `question` tag (#5410); union the union types, the tag-name arrays and the type guards. copilot/chat/*: two-import unions (fork isAdminWorkspace/UserMemory vs upstream archive guidance / queryUserTable). request/handlers/run.ts: take upstream's findActiveCompactionBlock/addCompactionBlock dedup (the fork side is inherited base code, not a fork feature). Remaining panel/knowledge files are 1-2 hunk nuqs/resize unions (#5851, #5730, #5738, #5832). (extensibility-notes 2026-08-06-4 'Move Arena brand strings out of (landing) JSX'; simstudioai/sim#5858, #5802, #5803, #5410, #5851)
- **Union packages/db/schema.ts and lib/uploads + app/api/files for GCS** (`union`): packages/db/schema.ts, apps/sim/lib/uploads/core/setup.server.ts, apps/sim/lib/uploads/core/storage-client.ts, apps/sim/lib/uploads/core/storage-service.ts, apps/sim/lib/uploads/utils/file-utils.ts, apps/sim/app/api/files/authorization.ts, apps/sim/app/api/files/multipart/route.ts, apps/sim/app/api/files/parse/route.ts, apps/sim/app/api/files/presigned/route.ts, apps/sim/app/api/files/presigned/batch/route.ts, apps/sim/app/api/files/serve/[...path]/route.ts, apps/sim/app/api/files/upload/route.ts — schema.ts is a clean union: the fork's workflowQueries table + upstream's CustomPiiPattern interface (#5732). The uploads/files cluster is GCS (#5728) + zip (#5788) + Gmail-API mail (#5736) landing alongside the fork's Azure Blob retention and its agent-generated-images bucket. INVARIANTS: keep S3_AGENT_GENERATED_IMAGES_CONFIG and the agent-generated-images context branch in config.ts; keep the whole agent-generated-images auth block in files/serve (internal-JWT sentinel userId plus canAccessAgentGeneratedImageViaDeployedChat) and add only the `gcs` path prefix alongside `s3`/`blob`; add getServeStoragePrefix. The fork keeps Azure, so BLOB_CONFIG must appear exactly once. (simstudioai/sim#5728, #5788, #5736, #5732; merge-policy.unionPaths apps/sim/lib/uploads/ + app/api/files/)

### Child areas

- **db-schema-migrations** `packages/db/` (`union`): `packages/db/schema.ts`, `packages/db/migrations/meta/_journal.json`, `packages/db/migrations/0261_tranquil_donald_blake.sql`, `packages/db/migrations/0262_strong_storm.sql`, `packages/db/migrations/0263_workflow_fork_sync_excluded.sql`, `packages/db/migrations/0264_fat_ikaris.sql`, `packages/db/migrations/0265_org_session_policy.sql`, `packages/db/migrations/meta/0261_snapshot.json`, `packages/db/migrations/meta/0262_snapshot.json`, `packages/db/migrations/meta/0263_snapshot.json`, `packages/db/migrations/meta/0264_snapshot.json`, `packages/db/migrations/meta/0265_snapshot.json` — Only packages/db/schema.ts is conflict-marked (union: fork workflowQueries table + upstream CustomPiiPattern, #5732). EVERY OTHER FILE IN THIS LIST AUTO-MERGED WITH NO CONFLICT MARKERS AND IS WRONG — that is why they are listed explicitly. VERIFIED IN THE MERGED TREE: meta/_journal.json now has 270 entries with idx 261/262/263/264 EACH APPEARING TWICE (fork applied: local_copilot_user_memory, tiktok_credential_id_idx, slack_native_routing, unknown_sinister_six; upstream unapplied: tranquil_donald_blake, strong_storm, workflow_fork_sync_excluded, fat_ikaris, org_session_policy at idx 265). Renumber the UNAPPLIED (upstream) side to 0265..0269 — after the fork's highest applied index — rewrite the journal to a single monotonic idx sequence with upstream's entries appended in `when` order, and rename upstream's meta/0261..0265_snapshot.json to meta/0265..0269_snapshot.json so meta/ and the journal agree. Copy the upstream SQL verbatim (it already carries COMMIT; breakpoints and CREATE INDEX CONCURRENTLY). NEVER run drizzle-kit generate. Read .agents/skills/db-migrate/SKILL.md first. Do NOT git-checkout any file in this cluster — five of them are staged adds, not conflicts.
- **copilot-generated-catalog** `apps/sim/lib/copilot/generated/` (`mustEdit`): `apps/sim/lib/copilot/generated/tool-catalog-v1.ts`, `apps/sim/lib/copilot/generated/tool-schemas-v1.ts`, `apps/sim/lib/copilot/tools/server/router.ts`, `apps/sim/lib/copilot/tools/descriptions.ts`, `apps/sim/lib/copilot/tools/server/workflow/edit-workflow/validation.ts` — CRITICAL — the standing verify-only 'Drive handles GFM import' grep PASSES on a wrong tree, so that assertion is NECESSARY BUT NOT SUFFICIENT. MEASURED IN THE MERGED TREE: tool-catalog-v1.ts contains ZERO occurrences of Superagent, Research, UserMemory, MoveFile, MoveFileFolder, RenameFile, RenameFileFolder (all present at the merge base, all still fork-consumed), and the fork's GFM sentence has been grafted onto `export const ShareFile` (:3930, sentence at :3941) instead of Superagent.task. router.ts:19-23 and :158 still import MoveFile / MoveFileFolder / RenameFile / RenameFileFolder / UserMemory — a hard build break today. Restore all 7 entries and their tool-schemas-v1 keys ADDITIVELY, keep upstream's ShareFile (parameter must stay named `action`) and Search, add upstream's queryUserTableServerTool. UserMemory is backed by the fork's 0261_local_copilot_user_memory table and local-copilot/ (fork-only) dispatches the superagent and research specialist domains — do not drop either. Never run `bun run mship:generate`: scripts/sync-tool-catalog.ts reads a sibling ../copilot/ repo the fork does not have. EXIT CHECKS: (1) each of the 7 exports greps non-zero; (2) share_file's parameter is named `action`; (3) the GFM sentence sits on Superagent.task and NOT on share_file. Also owns lib/copilot/tools/server/workflow/edit-workflow/validation.ts — that one is unrelated to the catalog: a small union under the same lib/copilot/tools/ owner (self-resolution 17), assigned here only so one child owns the directory.
- **copilot-chat-mothership** `apps/sim/app/workspace/[workspaceId]/home/` (`union`): `apps/sim/app/workspace/[workspaceId]/home/components/message-content/components/agent-group/tool-call-item.tsx`, `apps/sim/app/workspace/[workspaceId]/home/components/message-content/components/special-tags/special-tags.tsx`, `apps/sim/app/workspace/[workspaceId]/home/components/message-content/message-content.tsx`, `apps/sim/app/workspace/[workspaceId]/home/components/mothership-chat/mothership-chat.tsx`, `apps/sim/app/workspace/[workspaceId]/home/hooks/stream/stream-context.ts`, `apps/sim/app/workspace/[workspaceId]/home/hooks/stream/turn-model-serialize.test.ts`, `apps/sim/app/workspace/[workspaceId]/home/hooks/use-chat.test.ts`, `apps/sim/lib/copilot/chat/payload.ts`, `apps/sim/lib/copilot/chat/payload.test.ts`, `apps/sim/lib/copilot/chat/workspace-context.ts`, `apps/sim/lib/copilot/request/handlers/run.ts` — Mothership v0.8 (#5410) vs the fork's chart tag and Arena additions — PARALLEL ADDITIONS, not a collision. Union the shared union types, the tag-name arrays and the type guards (fork `chart` tag + upstream `question` tag). copilot/chat/{payload,workspace-context}.ts are two-import unions (fork isAdminWorkspace / UserMemory vs upstream archive guidance / queryUserTable). request/handlers/run.ts: take upstream's findActiveCompactionBlock / addCompactionBlock dedup — the fork side there is inherited base code, not a fork feature. payload.test.ts follows the test rule (take upstream's rewrite onto the new @sim/db chain mock, then re-apply the fork's assertions) and is assigned here rather than to billing-usage-tests so a single child owns payload.ts and its test. hooks/stream/turn-model-serialize.test.ts and hooks/use-chat.test.ts are modify/delete where the FORK deleted (d4a304b0) and upstream modified — they are in directives.delete and STAY DELETED; do not resurrect them (they would assert upstream behaviour against fork-extended use-chat.ts +298/-27 and turn-model-serialize.ts +33/-5).
- **billing-usage-tests** `apps/sim/lib/billing/` (`theirs`): `apps/sim/lib/billing/core/usage-log.test.ts`, `apps/sim/lib/billing/organizations/member-limits.test.ts`, `apps/sim/lib/logs/execution/logger.test.ts`, `apps/sim/lib/execution/preprocessing.test.ts`, `apps/sim/app/api/copilot/api-keys/validate/route.test.ts`, `apps/sim/app/api/billing/update-cost/route.test.ts`, `apps/sim/lib/core/rate-limiter/hosted-key/hosted-key-rate-limiter.ts`, `apps/sim/lib/core/rate-limiter/hosted-key/hosted-key-rate-limiter.test.ts` — #5853 / #5856 / #5861-#5866 / #5871 / #5875 rewrote these onto a new table-aware @sim/db chain mock, a complete env-flags mock and auto-unstub setup. packages/testing/** (+1334/-256) and vitest.setup.ts BOTH auto-merged and the fork's only edit there is one line in schema.mock.ts, so the new infra is already in force and upstream's version of each test file is the internally consistent one. Take upstream's rewrite, THEN re-apply the fork's assertions — these are the settled Q&A, do not re-litigate: run 2026-08-06-4 Q2 = A, so checkMothershipUsageLimits / checkSelfHostedMothershipUsageLimits remain the governing copilot gate and their assertions must survive; run 2026-08-06-4 Q1 = B *with ExecutionActor retained*, so upstream's BillingAttributionSnapshot is the billing path while ExecutionActor / extractExecutionActor / billingUserId stay as an observability field (they have no upstream equivalent, which is exactly the human's 'B only if all of A is included, else A' condition). EXCEPTION — hosted-key-rate-limiter.{ts,test.ts} are FORK SUPERSETS (self-resolution 5): the fork adds _1..3 key fallback and the Gemini key namespace. Use the fork side as the baseline for both; --theirs REMOVES capability. They are deliberately NOT in directives.checkoutOurs because the .test.ts may still need the new mock infra to run — keep every fork superset assertion.
- **uploads-storage-gcs** `apps/sim/lib/uploads/` (`union`): `apps/sim/lib/uploads/config.ts`, `apps/sim/lib/uploads/core/setup.server.ts`, `apps/sim/lib/uploads/core/storage-client.ts`, `apps/sim/lib/uploads/core/storage-service.ts`, `apps/sim/lib/uploads/utils/file-utils.ts`, `apps/sim/app/api/files/authorization.ts`, `apps/sim/app/api/files/multipart/route.ts`, `apps/sim/app/api/files/parse/route.ts`, `apps/sim/app/api/files/presigned/route.ts`, `apps/sim/app/api/files/presigned/batch/route.ts`, `apps/sim/app/api/files/serve/[...path]/route.ts`, `apps/sim/app/api/files/upload/route.ts` — GCS (#5728) + zip (#5788) + Gmail-API mail (#5736) landing alongside the fork's Azure Blob retention and its agent-generated-images bucket. Take GCS, zip and getServeStoragePrefix. HARD INVARIANTS: keep S3_AGENT_GENERATED_IMAGES_CONFIG and the agent-generated-images context branch in config.ts; keep the ENTIRE agent-generated-images auth block in files/serve/[...path] (internal-JWT sentinel userId plus canAccessAgentGeneratedImageViaDeployedChat) and add only the `gcs` path prefix alongside `s3`/`blob`. DEDUPE HAZARD (merge-policy.dedupeOnUnion) — the fork keeps Azure, so a naive union yields a SECOND `export const BLOB_CONFIG` in config.ts, a hard TS error. BLOB_CONFIG must appear EXACTLY ONCE; add only the genuinely new GCS_* configs, then grep the merged file for duplicate identifiers. config.ts is in directives.mustEdit for this reason.
- **auth-oauth-credentials** `apps/sim/lib/auth/` (`union`): `apps/sim/lib/auth/auth.ts`, `apps/sim/app/api/auth/oauth/utils.ts`, `apps/sim/lib/oauth/terminal-errors.ts`, `apps/sim/lib/credentials/connect-draft.ts`, `apps/sim/lib/credentials/access.test.ts`, `apps/sim/blocks/blocks/zoom.ts`, `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/credential-selector/credential-selector.tsx` — HARD INVARIANTS, in order of blast radius. (1) auth.ts — the fork's ARENA_V3_OAUTH_CALLBACK_ORIGINS parsing, devArenaEmbedCallbackOrigins, resolveBetterAuthCrossSubdomainCookieDomain and arenaHubTrustedOrigin sit in exactly the region upstream replaced with trustedProxies (#5857). Keep ALL of it and add trustedProxies. The second hunk turns `database` from a value into a function (guardSubscriptionPlanWrites wrapping drizzleAdapter) — the fork's conditional `advanced.crossSubDomainCookies` spread must survive that switch. Losing crossSubDomainCookies breaks Arena SSO across *.thearena.ai. AUTH_TRUSTED_PROXIES stays unset, so #5857 is inert. (2) app/api/auth/oauth/utils.ts — keep the fork's 5-arg refreshOAuthToken(providerId, refreshToken, alias, organizationId, getOrganizationOAuthApp) for org-scoped custom OAuth apps (0259_organization_oauth_apps) INSIDE upstream's getFreshestSlackChain / fanOutSlackTokenChain / ifChainUnchangedSince refreshTokenToUse path (#5723, #5737), and keep the fork-only account_tokens write branch (accountTokens: base 0 / fork 1 / upstream 0). (3) terminal-errors.ts is a plain union (custom_app_not_configured + token_revoked). (4) credential-selector.tsx + connect-draft.ts + access.test.ts + zoom.ts: adopt upstream's service-account generalization — both sides renamed the same concept (fork credentialKind 'custom-bot', upstream 'service-account' plus a merged 'any' kind, #5690/#5800) and upstream's is a strict superset whose own comments call out the custom Slack bot case. Then re-apply the fork's isSharedUnipileWorkspace, unipileAccountOptions, hubspotAccountOptions, handleUnipileReconnect, additionalConnectItems and isAdminWorkspace gating, mapping 'custom-bot' semantics onto 'service-account'. connect-draft.ts takes upstream's displayName dedup/auto-numbering; zoom.ts takes upstream's service-account 'me' caveat wording.
- **providers-models-envkeys** `apps/sim/providers/` (`union`): `apps/sim/providers/models.ts`, `apps/sim/providers/models.test.ts`, `apps/sim/providers/utils.ts`, `apps/sim/providers/utils.test.ts`, `apps/sim/lib/core/config/env.ts`, `apps/sim/lib/core/config/api-keys.ts` — providers/models.ts is the slice's largest conflict (1945 conflicted lines / 11 hunks): union the fork's model entries with upstream's Kimi (#5716), Gemini 3.6 Flash + 3.5 Flash-Lite (#5812) and the legacy/deprecated sunset-tier metadata (#5805). Keep EVERY fork model entry and keep the fork's models in the hosted lists. DEDUPE HAZARD (merge-policy.dedupeOnUnion) — env.ts, api-keys.ts and providers/utils.ts are the class where upstream re-adds, at a NEW position, a symbol the fork already defines elsewhere in the SAME file; a naive union is a hard TypeScript error, not a lint nit. Measured: env.ts would carry XAI_API_KEY_1/2/3 twice (the fork already has them near L168-171); api-keys.ts would gain a second `provider !== 'xai'` guard plus a second unreachable `else if (provider === 'xai')`; providers/utils.ts would re-list isXaiModel. Add ONLY the genuinely new symbols — the KIMI_* keys, the kimi branch, isKimiModel — then grep each merged file for duplicate identifiers. Keep the fork's TSDoc in providers/utils.ts explaining why SambaNova and OpenRouter stay in the hosted gate. env.ts, api-keys.ts and utils.ts are all in directives.mustEdit. models.test.ts follows the test rule: take upstream's rewrite, keep fork model coverage.
- **deploy-state-machine** `apps/sim/lib/workflows/` (`theirs`): `apps/sim/lib/workflows/orchestration/chat-deploy.ts`, `apps/sim/lib/workflows/schedules/deploy.ts`, `apps/sim/lib/workflows/schedules/deploy.test.ts`, `apps/sim/lib/workflows/persistence/utils.ts`, `apps/sim/lib/api/contracts/workflows.test.ts`, `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/components/deploy-modal/deploy-modal.tsx`, `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/components/deploy-modal/components/chat/chat.tsx`, `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/hooks/use-deployment.ts`, `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/hooks/sync-local-draft.ts`, `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/hooks/sync-local-draft.test.ts`, `apps/sim/stores/workflows/sync-local-draft.ts`, `apps/sim/stores/workflows/sync-local-draft.test.ts` — #5680 / #5841 introduced preparing/activating/active deployment attempts, shorter lock windows and tx safety timeouts; the renumbered 0262/0264 migrations deliver the columns. This is upstream hardening on shared code, not a fork feature — adopt it. Keep the fork's extra performFullDeploy args (workflowName, requestId, request, actorId — orchestration/deploy.ts auto-merged so the signature survives) and UNION persistence/utils.ts (fork migrateBlockTypes + upstream isDynamicHandleSubblock). RELOCATION, NOT DELETION: the two DEPLOY/hooks/sync-local-draft.* modify/delete conflicts are upstream MOVING the module to apps/sim/stores/workflows/sync-local-draft.ts (imported from there by deploy-modal.tsx, use-deployment.ts and socket-provider.tsx). The old paths are in directives.delete. In the SAME change: port the fork's flushMergedLocalDraftToServer (it fixes image-generator provider/model being cleared on deploy; called at deploy-modal.tsx:329 and :447) into the new stores/workflows/sync-local-draft.ts, repoint the fork's imports, and port the fork's test cases onto stores/workflows/sync-local-draft.test.ts. Those two stores/ files are STAGED ADDS, not conflicts — edit them, never git-checkout them. Deleting the old path without porting the flush helper is a silent regression.
- **tools-executor** `apps/sim/tools/` (`union`): `apps/sim/tools/index.ts`, `apps/sim/tools/index.test.ts`, `apps/sim/tools/image/generate.ts`, `apps/sim/executor/execution/types.ts`, `apps/sim/executor/handlers/workflow/workflow-handler.ts` — tools/index.ts has four hunks and EVERY one needs both sides: keep the fork's allowHttp (base 0 / fork 3 / upstream 0) AND add upstream's proxyUrl (#5867); keep the fork's responseData-aware json/text wrapper AND add upstream's `body: response.body` (needed for zip, #5788); take tool.directExecution(contextParams, effectiveSignal); take upstream's copilot-only _serviceCost via resolveToolScope. executor/execution/types.ts is a two-import union (fork ExecutionActor + upstream CustomPiiPattern, #5732) — ExecutionActor is retained as observability per run 4 Q1. workflow-handler.ts: union the type imports and take START_BLOCK_METADATA_FIELD / StartBlockRunMetadata (#5700). tools/image/generate.ts is in directives.checkoutOurs (harness applies --ours): upstream narrowed image hosted keys to falai only via a static 'FALAI_API_KEY' + hostedKeyEnabledWhen, while the fork supports falai + openai + gemini with a dynamic envKeyPrefix resolver, a __skipHostedKeyHandling escape hatch and calculateHostedImageToolCost — --theirs REMOVES fork capability. After the merge, VERIFY tools/types.ts still accepts a predicate for `enabled` (it auto-merged, so it should).
- **branding-workspace-ui** `apps/sim/components/emails/` (`union`): `apps/sim/components/emails/components/email-footer.tsx`, `apps/sim/components/emails/components/email-layout.tsx`, `apps/sim/app/(landing)/layout.tsx`, `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/sidebar.tsx`, `apps/sim/lib/posthog/events.ts`, `apps/sim/lib/core/security/csp.test.ts`, `apps/sim/lib/core/utils.test.ts`, `apps/sim/app/api/workspaces/route.ts`, `apps/sim/hooks/queries/workspace.ts`, `apps/sim/lib/workspaces/policy.ts`, `apps/sim/lib/workspaces/policy.test.ts`, `apps/sim/app/workspace/[workspaceId]/knowledge/[id]/[documentId]/document.tsx`, `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/sub-block.tsx`, `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/tool-input/tool-input.tsx`, `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/hooks/use-panel-resize.ts` — (landing)/layout.tsx is in directives.checkoutOurs (harness applies --ours): #5731 hardcodes Sim's HubSpot portal (js-na2.hs-scripts.com/246720681.js) plus an X conversion pixel behind isHosted, and the fork REDEFINES isHosted to include *.thearena.ai and localhost:3000 — it would fire on Arena and report into Sim's marketing analytics. The paired CSP allowlist (#5804) auto-merged and is inert without a pixel; leave it. sidebar.tsx: keep the fork's brand-gated support/terms/privacy items and its Arena docs handler; SKIP upstream's handleOpenSlackCommunity and its menu item (points at Sim's community — same class as the docs.sim.ai link the fork already replaced), but DO union slack_community_opened into lib/posthog/events.ts so the event type stays aligned. email-footer/email-layout: keep the fork's commented-out social-links row, take upstream's wordmark clear-space and footer icon sizing (#5802/#5803). Workspace-list trio (#5706/#5715) — adopt upstream's move of normalization into hooks/queries/utils/workspace-list-query (normalizeWorkspacesResponse + WORKSPACE_LIST_STALE_TIME, one staleTime constant shared by the server prefetch and the client query; the sidebar depends on it), THEN: (a) re-apply the fork's invite-gating suppression in app/api/workspaces/route.ts (inviteDisabledReason: null, keeping upstream's inviteMembersEnabled value) — route.ts is in directives.mustEdit; (b) keep setZoomAdminAccessCache and the isAdminWorkspace import in hooks/queries/workspace.ts; (c) VERIFY the shared normalizer carries the fork's isPersonal field (0248_workspace_is_personal) and re-add it if not; (d) take upstream's policy-constants import in lib/workspaces/policy.ts so the merged upstream body compiles. csp.test.ts: verify the shared env mock supplies NEXT_PUBLIC_BRAND_* / PRIVACY_URL / TERMS_URL; if it does not, keep the fork's local createEnvMock block. Remaining panel/knowledge files are 1-2 hunk nuqs/resize unions (#5851, #5730, #5738, #5832).
- **ci-manifests** `.github/workflows/` (`ours`): `.github/workflows/ci.yml`, `apps/sim/package.json`, `bun.lock` — ci.yml is in directives.checkoutOurs (harness applies --ours): upstream is Blacksmith runners + ECR push, the fork is ubuntu-latest + GHCR (ghcr.io/<owner>/p2-sim-simstudio) with its own migrate/detect-version wiring and docker/build-push-action. 16 hunks, every one infrastructure ownership; --theirs replaces the fork's entire publish and deploy chain. Now codified in merge-policy.forkFirst. package.json and bun.lock are NOT conflicted — both auto-merged. VERIFIED in the merged tree: apps/sim/package.json already carries upstream's security bumps (sharp 0.35.3, js-yaml 4.3.0, #5848) and the union preserved the fork-only deps (sanitize-html, selenium-webdriver, soap), so package.json needs VERIFY-ONLY, no edit. bun.lock must be REGENERATED (`bun install`) after all manifests settle — never hand-merged. NOTE FOR THE HUMAN: set repo variable CI_PROVIDER=github unless Blacksmith is installed — the auto-merged test-build.yml defaults to Blacksmith when it is unset.

FINAL (Phase B) — first finalize of run 2026-08-06-5; no prior final plan and no completed child cluster reports (.upstream-sync/ledger/2026-08-06-5/clusters/ does not exist), so nothing is being re-planned or overwritten. The WIP overlay was skipped (no-wip), conflicts left as-is. The harness merged the release tip: 81 paths are unmerged (the draft predicted 83 from merge-tree 09435b33 — close, and the 81 actual paths match the harness-supplied authoritative list exactly). All 81 are assigned to exactly one of the 11 clusters below; there is no `unplanned` cluster because the draft's area plan covered every remaining path. Both predicted SILENT-BREAKAGE classes were re-verified as real in the merged tree and are the highest-priority work in this run: (1) packages/db/migrations/meta/_journal.json auto-merged with NO conflict markers into 270 entries where idx 261/262/263/264 each appear TWICE (fork applied vs upstream unapplied); (2) apps/sim/lib/copilot/generated/tool-catalog-v1.ts now contains ZERO occurrences of Superagent / Research / UserMemory / MoveFile / MoveFileFolder / RenameFile / RenameFileFolder while lib/copilot/tools/server/router.ts still imports five of them, and the fork's 'Drive handles GFM import' sentence was grafted onto `export const ShareFile` (:3930, sentence at :3941) — so the standing verify-only grep PASSES on a broken tree. Both are covered by explicit cluster file lists and notes. Also verified already-good and needing no edit: apps/sim/package.json auto-merged to upstream's sharp 0.35.3 + js-yaml 4.3.0 security bumps (#5848) while keeping the fork-only deps.

## Merge directives

LOCKED. No open questions were raised this run (open-questions.md: 'No open questions'), so nothing new was asked and nothing settled is re-opened. The two inherited answers from run 2026-08-06-4 (qa-history a-5204435835) govern the billing/copilot clusters and are FINAL: Q1 = B *conditional on B covering A* — upstream's BillingAttributionSnapshot / deriveBillingContext is the billing path, and because ExecutionActor / extractExecutionActor / billingUserId have NO upstream equivalent, the human's 'if not, then A only' clause keeps them as an observability field (the workflow_execution_logs_workspace_actor_user_idx index is retained; the human confirmed nothing outside the repo reads actor_user_id / actor_type / api_key_id). Q2 = A — checkMothershipUsageLimits and checkSelfHostedMothershipUsageLimits remain the governing copilot gate; COPILOT_BILLING_ATTRIBUTION_V1_ENABLED and COPILOT_BILLING_PROTOCOL_REQUIRED stay unset. Every directive path below was confirmed still unmerged via `git diff --name-only --diff-filter=U` at finalize time. CHANGES FROM THE DRAFT proposedDirectives, all deliberate: (1) REMOVED from mustEdit — packages/db/migrations/meta/_journal.json, packages/db/migrations/0261_tranquil_donald_blake.sql and apps/sim/stores/workflows/sync-local-draft.ts. They are NOT unmerged (journal is a clean auto-merge, the others are staged adds), so per the finalize rules directives must not target them. They are still owned work: they appear in the db-schema-migrations and deploy-state-machine cluster file lists with explicit 'auto-merged and WRONG / staged add, never git-checkout' notes, which is exactly the mechanism that gets a child to open them. Do not lose them — the journal currently has duplicate idx 261/262/263/264 (verified). (2) ADDED to delete — the two fork-deleted home/hooks test files. Draft self-resolution 8 settles them as `delete` but the draft's proposedDirectives omitted them; a modify/delete where our side deleted is resolved by git rm. (3) ADDED to mustEdit — lib/copilot/tools/server/router.ts (self-resolution 2 marks it mustEdit and it is a hard build break today: it imports 5 catalog exports the merge deleted), plus lib/core/config/api-keys.ts and providers/utils.ts (merge-policy.dedupeOnUnion lists four files in the duplicate-identifier hazard class; the draft's mustEdit covered only two of them). mustEdit is non-destructive — it only forbids auto --ours/--theirs, which is already policy for unionPaths. checkoutOurs stays at exactly 3 files — do NOT extend it. In particular lib/core/rate-limiter/hosted-key/{hosted-key-rate-limiter.ts,hosted-key-rate-limiter.test.ts} are fork supersets to be preserved by the child (fork side as baseline), not harness-checked-out, because the test may need upstream's new mock infra to run. checkoutTheirs is intentionally EMPTY: every `theirs` self-resolution requires re-applying fork behaviour afterwards, so none of them is a whole-file side take. unionPaths are never auto ours/theirs — they are assigned to clusters with strategy union or mustEdit. Post-merge, outside the clusters: regenerate bun.lock (`bun install`), never `drizzle-kit generate`, never `bun run mship:generate`.
- checkoutOurs: 3
- checkoutTheirs: 0
- delete: 4
- failed: 0
- mustEdit: `apps/sim/lib/copilot/generated/tool-catalog-v1.ts`, `apps/sim/lib/copilot/generated/tool-schemas-v1.ts`, `apps/sim/lib/copilot/tools/server/router.ts`, `apps/sim/lib/core/config/env.ts`, `apps/sim/lib/core/config/api-keys.ts`, `apps/sim/lib/uploads/config.ts`, `apps/sim/providers/utils.ts`, `apps/sim/lib/auth/auth.ts`, `apps/sim/app/api/workspaces/route.ts`

## Cluster db-schema-migrations

| File | Resolution | Notes |
| --- | --- | --- |
| `packages/db/schema.ts` | manual | Unioned the fork's workflowQueries table with upstream's CustomPiiPattern and customPatterns field. |
| `packages/db/migrations/meta/_journal.json` | manual | Kept fork entries 0261-0264, appended upstream entries in when order as indices 0265-0269, and updated their tags to match renamed files. |
| `packages/db/migrations/0261_tranquil_donald_blake.sql` | manual | Preserved upstream SQL verbatim at 0265_tranquil_donald_blake.sql. |
| `packages/db/migrations/0262_strong_storm.sql` | manual | Preserved upstream SQL verbatim at 0266_strong_storm.sql. |
| `packages/db/migrations/0263_workflow_fork_sync_excluded.sql` | manual | Preserved upstream SQL verbatim at 0267_workflow_fork_sync_excluded.sql. |
| `packages/db/migrations/0264_fat_ikaris.sql` | manual | Preserved upstream SQL verbatim at 0268_fat_ikaris.sql. |
| `packages/db/migrations/0265_org_session_policy.sql` | manual | Preserved upstream SQL verbatim at 0269_org_session_policy.sql. |
| `packages/db/migrations/meta/0261_snapshot.json` | manual | Renamed upstream snapshot to meta/0265_snapshot.json without changing its contents. |
| `packages/db/migrations/meta/0262_snapshot.json` | manual | Renamed upstream snapshot to meta/0266_snapshot.json without changing its contents. |
| `packages/db/migrations/meta/0263_snapshot.json` | manual | Renamed upstream snapshot to meta/0267_snapshot.json without changing its contents. |
| `packages/db/migrations/meta/0264_snapshot.json` | manual | Renamed upstream snapshot to meta/0268_snapshot.json without changing its contents. |
| `packages/db/migrations/meta/0265_snapshot.json` | manual | Renamed upstream snapshot to meta/0269_snapshot.json without changing its contents. |

No upstream hunks were skipped. The existing manualReview migration policy covers the journal and migration collision handling.

## Cluster copilot-generated-catalog

| File | Resolution | Notes |
| --- | --- | --- |
| `apps/sim/lib/copilot/generated/tool-catalog-v1.ts` | manual | Kept upstream Search and ShareFile definitions, including ShareFile.action, and restored the seven fork-consumed entries plus their catalog registrations. Re-attached the fork GFM instruction to Superagent.task. |
| `apps/sim/lib/copilot/generated/tool-schemas-v1.ts` | manual | Kept upstream runtime schema additions and added schema keys for Superagent, Research, UserMemory, MoveFile, MoveFileFolder, RenameFile, and RenameFileFolder; ShareFile retains action. |
| `apps/sim/lib/copilot/tools/server/router.ts` | manual | Restored fork catalog imports and permission keys for the file tools and UserMemory while retaining upstream queryUserTableServerTool and ShareFile routing. |
| `apps/sim/lib/copilot/tools/descriptions.ts` | manual | Preserved Arena branding and the fork Google Docs GFM note while retaining upstream conditional hosted-key handling. |
| `apps/sim/lib/copilot/tools/server/workflow/edit-workflow/validation.ts` | manual | Combined fork agent prompt/message normalization with upstream webhook/read-only validation and additional input types; unknown block handling preserves normalized inputs and validation errors. |

Policy proposals:

- `unionPaths` `apps/sim/lib/copilot/tools/descriptions.ts` — Keep fork branding/GFM guidance and take upstream hosted-key behavior additively.
- `unionPaths` `apps/sim/lib/copilot/tools/server/workflow/edit-workflow/validation.ts` — Keep fork agent normalization and take upstream webhook/read-only validation additively.

Focused assertions, Biome check, and git diff --check passed. The targeted validation test could not start because @next/env is unavailable in the workspace dependency installation.

## Cluster copilot-chat-mothership

| File | Resolution | Notes |
| --- | --- | --- |
| `apps/sim/app/workspace/[workspaceId]/home/components/message-content/components/agent-group/tool-call-item.tsx` | manual | Unioned fork status-icon and multiline-row behavior with upstream gateway icon and status-title additions. |
| `apps/sim/app/workspace/[workspaceId]/home/components/message-content/components/special-tags/special-tags.tsx` | manual | Unioned chart and question tags, parsers, renderers, and type guards while retaining the fork live-status indicator. |
| `apps/sim/app/workspace/[workspaceId]/home/components/message-content/message-content.tsx` | manual | Unioned fork Arena live-status, table, and label behavior with upstream question, action, and stream-pacing UI. |
| `apps/sim/app/workspace/[workspaceId]/home/components/mothership-chat/mothership-chat.tsx` | manual | Passed fork liveStatus and upstream question/last-row props; upstream fixed-tail handling covers an empty streaming row. |
| `apps/sim/app/workspace/[workspaceId]/home/hooks/stream/stream-context.ts` | manual | Kept fork liveStatus and embed refs together with upstream text-flush timer and resume-cursor behavior. |
| `apps/sim/lib/copilot/chat/payload.ts` | manual | Kept fork admin-workspace filtering and upstream archive-extraction guidance. |
| `apps/sim/lib/copilot/chat/payload.test.ts` | manual | Unioned upstream metadata and hosted-key expectations with fork Arena, admin-filtering, and latest-schema assertions. |
| `apps/sim/lib/copilot/chat/workspace-context.ts` | manual | Kept HubSpot and shared-environment integration presence plus the fork Position2 note with upstream deterministic env snapshots. |
| `apps/sim/lib/copilot/request/handlers/run.ts` | manual | Kept the fork payload kind guard and adopted upstream scoped compaction deduplication and status updates. |

Union cluster resolved; fork-deleted stream and chat tests remain deleted per the locked directives.

## Cluster billing-usage-tests

| File | Resolution | Notes |
| --- | --- | --- |
| `apps/sim/lib/billing/core/usage-log.test.ts` | manual | Kept the shared table-aware DB mock rewrite and fork billable, actor, chat, and streaming assertions. |
| `apps/sim/lib/billing/organizations/member-limits.test.ts` | manual | Migrated fork allocation assertions to the shared table-routed DB queues while retaining upstream period tests. |
| `apps/sim/lib/logs/execution/logger.test.ts` | manual | Used shared DB chain spies and retained fork cost projection and pending-reconciliation assertions. |
| `apps/sim/lib/execution/preprocessing.test.ts` | manual | Retained fork ExecutionActor and usage-gate coverage, added shared reservation mocking and compatible immutable attribution snapshot coverage. |
| `apps/sim/app/api/copilot/api-keys/validate/route.test.ts` | manual | Used shared DB and env-flag mocks; retained checkMothershipUsageLimits/checkSelfHostedMothershipUsageLimits as the governing Copilot gate and kept protocol assertions additive. |
| `apps/sim/app/api/billing/update-cost/route.test.ts` | manual | Kept the shared DB/env mock setup and both fork keyless attribution assertions and upstream protocol coverage. |
| `apps/sim/lib/core/rate-limiter/hosted-key/hosted-key-rate-limiter.ts` | manual | Fork superset retained: singular and _1..3 fallback plus the Gemini namespace, with upstream singular-key behavior. |
| `apps/sim/lib/core/rate-limiter/hosted-key/hosted-key-rate-limiter.test.ts` | manual | Retained all fork fallback assertions and upstream singular hosted-key coverage. |

Upstream-only governing-helper assertions were skipped per the locked Q&A; see skipped.md.

## Cluster uploads-storage-gcs

| File | Resolution | Notes |
| --- | --- | --- |
| `apps/sim/lib/uploads/config.ts` | manual | Unioned GCS configs, provider selection, and serve prefix with Azure Blob and the fork's agent-generated-images S3 config; BLOB_CONFIG appears exactly once. |
| `apps/sim/lib/uploads/core/setup.server.ts` | manual | Added GCS and Azure Blob setup handling while retaining the fork's local agent-image initialization. |
| `apps/sim/lib/uploads/core/storage-client.ts` | manual | Added GCS provider reporting and metadata lookup while retaining Blob and S3 behavior. |
| `apps/sim/lib/uploads/core/storage-service.ts` | manual | Retained fork agent-generated-images S3 handling and unioned upstream GCS upload, multipart, download, delete, head, and presign dispatch. |
| `apps/sim/lib/uploads/utils/file-utils.ts` | manual | Retained org-logo key handling and added upstream archive detection and GCS serve-prefix parsing. |
| `apps/sim/app/api/files/authorization.ts` | manual | Retained fork org-logo authorization and switched chat storage resolution to the shared provider-aware config. |
| `apps/sim/app/api/files/multipart/route.ts` | manual | Retained fork Blob contexts and added upstream GCS multipart lifecycle support. |
| `apps/sim/app/api/files/parse/route.ts` | manual | Retained fork parsing behavior and unioned provider-aware execution-file URL detection for S3, Blob, and GCS. |
| `apps/sim/app/api/files/presigned/route.ts` | manual | Retained org-logo support and zip validation while using getServeStoragePrefix for returned URLs. |
| `apps/sim/app/api/files/presigned/batch/route.ts` | manual | Used getServeStoragePrefix instead of the fork's hard-coded S3 path. |
| `apps/sim/app/api/files/serve/[...path]/route.ts` | manual | Preserved the entire fork agent-generated-images auth block and execution/deployed-chat branches; added the gcs prefix alongside s3 and blob. |
| `apps/sim/app/api/files/upload/route.ts` | manual | Unioned mothership-only zip acceptance with the fork's Image Fusion, execution, and org-logo upload behavior. |

Union cluster resolved and staged. Focused Biome validation passes; broader type-check/test gates are blocked by unrelated unresolved clusters and a missing @next/env dependency.

## Cluster auth-oauth-credentials

| File | Resolution | Notes |
| --- | --- | --- |
| `apps/sim/lib/auth/auth.ts` | manual | Kept Arena trusted origins and cross-subdomain cookies, added upstream trustedProxies, and wrapped the guarded adapter without duplicating advanced options. |
| `apps/sim/app/api/auth/oauth/utils.ts` | manual | Retained upstream Slack chain coalescing and version guards while threading the fork's five refreshOAuthToken arguments and account_tokens writes. |
| `apps/sim/lib/oauth/terminal-errors.ts` | manual | Unioned custom_app_not_configured and token_revoked terminal errors. |
| `apps/sim/lib/credentials/connect-draft.ts` | manual | Adopted upstream reconnect fields and display-name deduplication/auto-numbering. |
| `apps/sim/lib/credentials/access.test.ts` | manual | Kept fork billed-account membership coverage and upstream credential actor access coverage on the shared DB mock. |
| `apps/sim/blocks/blocks/zoom.ts` | manual | Kept fork Zoom credential wording and functionality while taking upstream's service-account me caveat. |
| `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/credential-selector/credential-selector.tsx` | manual | Adopted service-account/any picker behavior and re-applied fork admin-gated Unipile/HubSpot options, reconnect, and additional connect targets. |

All seven paths were manually union-resolved; no new merge-policy prefix was needed because the existing unionPaths entries already cover these files.

## Cluster providers-models-envkeys

| File | Resolution | Notes |
| --- | --- | --- |
| `apps/sim/providers/models.ts` | manual | Unioned every fork model entry with upstream Kimi, Gemini 3.6 Flash, Gemini 3.5 Flash-Lite, and sunset metadata; retained fork hosted providers and restored the two fork-only Bedrock entries with sunset metadata. |
| `apps/sim/providers/models.test.ts` | manual | Kept upstream catalog and sunset coverage while retaining fork coverage for hosted gaps and fork providers. |
| `apps/sim/providers/utils.ts` | manual | Kept the fork SambaNova/OpenRouter hosted-gate TSDoc and eligibility, adding only the upstream Kimi branch. |
| `apps/sim/providers/utils.test.ts` | manual | Retained fork date-suffixed hosted-model coverage alongside upstream versioned-model coverage. |
| `apps/sim/lib/core/config/env.ts` | manual | Kept the single existing fork XAI key declarations and added only KIMI_API_KEY_1/2/3. |
| `apps/sim/lib/core/config/api-keys.ts` | manual | Kept the single existing fork xAI guard and branch, adding only the Kimi rotation branch. |

Policy proposals:

- `unionPaths` `apps/sim/providers/models.ts` — Keep fork model entries and hosted providers while taking upstream Kimi, Gemini additions, and sunset metadata.

Resolved the union dedupe hazard by retaining existing fork xAI symbols and adding only genuinely new Kimi symbols.

## Cluster deploy-state-machine

| File | Resolution | Notes |
| --- | --- | --- |
| `apps/sim/lib/workflows/orchestration/chat-deploy.ts` | manual | Adopted upstream deployment-attempt gating and active-state handling; retained the fork's chat/app fields and forwarded workflowName, requestId, request, and actorId to performFullDeploy. |
| `apps/sim/lib/workflows/schedules/deploy.ts` | theirs | Took upstream deployment-operation-aware schedule upsert and version-scoped cleanup logic. |
| `apps/sim/lib/workflows/schedules/deploy.test.ts` | theirs | Took upstream schedule deployment-operation and conflict-upsert coverage. |
| `apps/sim/lib/workflows/persistence/utils.ts` | manual | Unioned the fork's migrateBlockTypes import with upstream isDynamicHandleSubblock; both existing call sites are retained. |
| `apps/sim/lib/api/contracts/workflows.test.ts` | manual | Kept the fork's nullable block-boolean normalization test and upstream forkSyncExcluded contract coverage. |
| `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/components/deploy-modal/deploy-modal.tsx` | manual | Repointed sync and flush imports to the relocated store and retained both upstream undeploy error feedback and fork telemetry. |
| `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/components/deploy-modal/components/chat/chat.tsx` | manual | Retained fork session-email validation/prefill behavior and combined it with upstream permission-gated auth options. |
| `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/hooks/use-deployment.ts` | manual | Repointed imports to the relocated sync-local-draft store while preserving the pre-deploy flush call. |
| `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/hooks/sync-local-draft.ts` | deleted | Upstream relocated this module to stores/workflows/sync-local-draft.ts. |
| `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/hooks/sync-local-draft.test.ts` | deleted | Upstream relocated this test to stores/workflows/sync-local-draft.test.ts. |
| `apps/sim/stores/workflows/sync-local-draft.ts` | manual | Kept upstream bounded/refetching draft synchronization and ported the fork's flushMergedLocalDraftToServer provider/model preservation helper. |
| `apps/sim/stores/workflows/sync-local-draft.test.ts` | manual | Kept upstream synchronization race coverage and ported the fork's flush persistence and no-op cases. |

Focused Biome validation passes. App Vitest could not start because @next/env is absent in the checkout; app type-check is blocked by unrelated unresolved merge markers in other clusters.

## Cluster tools-executor

| File | Resolution | Notes |
| --- | --- | --- |
| `apps/sim/tools/index.ts` | manual | Unioned fork allowHttp, responseData-aware transforms, dynamic hosted provider resolution, error-safe hosted billing, and in-process direct dispatch with upstream proxyUrl, response.body, abort-signal forwarding, and Copilot-only _serviceCost. |
| `apps/sim/tools/index.test.ts` | manual | Kept fork billing-failure coverage and reset helpers, retained upstream hosted-cost assertions, and used the shared stateful env/env-flags mocks so setEnv and setEnvFlags remain effective. |
| `apps/sim/executor/execution/types.ts` | manual | Kept both fork ExecutionActor observability and upstream CustomPiiPattern imports. |
| `apps/sim/executor/handlers/workflow/workflow-handler.ts` | manual | Unioned fork ExecutionMetadata with upstream START_BLOCK_METADATA_FIELD and StartBlockRunMetadata imports. |

The image generator was already resolved by the locked checkoutOurs directive and was intentionally left untouched. Biome passes for all four files; focused Vitest startup is blocked by the missing @next/env dependency, and full type-check output is blocked by unrelated unresolved clusters.

