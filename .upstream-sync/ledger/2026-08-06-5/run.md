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

- **db-schema-migrations** `packages/db/` (`union`): area-level (files assigned after merge) — packages/db/schema.ts union (workflowQueries + CustomPiiPattern). THEN the non-conflicted work: renumber upstream's 0261-0265 SQL to 0265-0269, rewrite meta/_journal.json to a single monotonic idx sequence (it auto-merges into duplicate 261-264), rename upstream's meta/0261-0265_snapshot.json to match. Never run drizzle-kit generate. Read .agents/skills/db-migrate/SKILL.md before touching migrations.
- **copilot-generated-catalog** `apps/sim/lib/copilot/generated/` (`union`): area-level (files assigned after merge) — Also owns lib/copilot/tools/server/router.ts and lib/copilot/tools/descriptions.ts. Restore the 7 deleted exports (Superagent, Research, UserMemory, MoveFile, MoveFileFolder, RenameFile, RenameFileFolder) and their tool-schemas-v1 keys; keep upstream's ShareFile (parameter named `action`) and Search; add queryUserTableServerTool. The GFM sentence must end up on Superagent.task, NOT on share_file.action.
- **copilot-chat-mothership** `apps/sim/app/workspace/[workspaceId]/home/` (`union`): area-level (files assigned after merge) — Also lib/copilot/chat/{payload,workspace-context}.ts and lib/copilot/request/handlers/run.ts. Mothership v0.8 (#5410) vs the fork's chart tag and Arena additions — parallel additions, union the shared union types and tag arrays. Keep the two fork-deleted test files deleted.
- **billing-usage-tests** `apps/sim/lib/billing/` (`theirs`): area-level (files assigned after merge) — Plus lib/logs/execution/logger.test.ts, lib/execution/preprocessing.test.ts, app/api/copilot/api-keys/validate/route.test.ts, app/api/billing/update-cost/route.test.ts, lib/core/rate-limiter/hosted-key/**. Take upstream's shared-mock rewrites, then re-apply the fork's assertions for checkMothershipUsageLimits / checkSelfHostedMothershipUsageLimits (run 4 Q2=A) and ExecutionActor. Keep the fork's hosted-key-rate-limiter.ts superset (--ours).
- **uploads-storage-gcs** `apps/sim/lib/uploads/` (`union`): area-level (files assigned after merge) — Plus app/api/files/** (7 files). Take GCS (#5728), zip (#5788), getServeStoragePrefix. Keep S3_AGENT_GENERATED_IMAGES_CONFIG, the agent-generated-images serve auth block, and Azure Blob. BLOB_CONFIG must be defined exactly once.
- **auth-oauth-credentials** `apps/sim/lib/auth/` (`union`): area-level (files assigned after merge) — Plus app/api/auth/oauth/utils.ts, lib/oauth/terminal-errors.ts, lib/credentials/**, blocks/blocks/zoom.ts and the credential-selector. HARD INVARIANTS: crossSubDomainCookies + ARENA_V3_OAUTH_CALLBACK_ORIGINS + arenaHubTrustedOrigin survive; the 5-arg refreshOAuthToken and the account_tokens write branch survive inside upstream's Slack chain coalescing.
- **providers-models-envkeys** `apps/sim/providers/` (`union`): area-level (files assigned after merge) — Plus lib/core/config/{env,api-keys}.ts. providers/models.ts is the largest conflict (1945 lines / 11 hunks): union the fork's model entries with upstream's Kimi (#5716), Gemini 3.6 Flash + 3.5 Flash-Lite (#5812) and the legacy/deprecated sunset tiers (#5805). DEDUPE HAZARD: add only KIMI_* keys and the kimi branch — the fork already has XAI_API_KEY_1..3 and the xai branch. Keep SambaNova + OpenRouter in the hosted gate.
- **deploy-state-machine** `apps/sim/lib/workflows/` (`theirs`): area-level (files assigned after merge) — Plus the deploy panel components and stores/workflows/sync-local-draft.ts. Adopt #5680/#5841. Handle the sync-local-draft RELOCATION: delete the old deploy/hooks path, port flushMergedLocalDraftToServer into stores/workflows/sync-local-draft.ts, repoint deploy-modal.tsx and use-deployment.ts, port the fork's test cases.
- **tools-executor** `apps/sim/tools/` (`union`): area-level (files assigned after merge) — tools/index.ts (4 hunks: keep allowHttp + add proxyUrl; keep the responseData json/text wrapper + add body: response.body; take directExecution(params, signal) and the copilot-only _serviceCost), tools/index.test.ts, and executor/execution/types.ts + executor/handlers/workflow/workflow-handler.ts. Keep tools/image/generate.ts fork-first (multi-provider hosted keys).
- **branding-workspace-ui** `apps/sim/components/emails/` (`union`): area-level (files assigned after merge) — Plus (landing)/layout.tsx (--ours), sidebar.tsx, lib/posthog/events.ts, lib/core/security/csp.test.ts, lib/core/utils.test.ts, app/api/workspaces/route.ts, hooks/queries/workspace.ts, lib/workspaces/policy{,.test}.ts, knowledge document.tsx, sub-block.tsx, tool-input.tsx, use-panel-resize.ts. Skip the Slack Community menu item; keep the email social-links suppression; re-apply the invite suppression and the zoom-admin cache.
- **ci-manifests** `.github/workflows/` (`ours`): area-level (files assigned after merge) — ci.yml is --ours (GHCR + ubuntu-latest + fork migrate wiring). apps/sim/package.json unions with upstream's sharp 0.35.3. bun.lock is REGENERATED, never hand-merged. Note for the human: set repo variable CI_PROVIDER=github unless Blacksmith is installed — the auto-merged test-build.yml defaults to Blacksmith when it is unset.

Predicted merge: 83 conflicted files (git merge-tree tree 09435b33, 79 content / 4 modify-delete / 0 add-add / 0 renames) from a 226-file overlap over 149 commits. All 83 self-resolved from merge-policy + ledger + measurement; zero open questions, so the harness gate is clear. The two highest-risk items in this slice are NOT in the conflict list: packages/db/migrations/meta/_journal.json auto-merges into duplicate idx 261-264, and lib/copilot/generated/* auto-merges into a tree that keeps the fork's GFM sentence (so the standing verify-only grep passes) while deleting 7 catalog exports the fork still routes and grafting that sentence onto share_file. merge-policy.json was updated this run: .github/workflows/{ci,images,upstream-sync}.yml + apps/sim/local-copilot/ added to forkFirst; 15 new unionPaths; 6 new manualReview; a new dedupeOnUnion list for the duplicate-identifier union hazard; packageJson.sharedDependencyVersions = theirs for security bumps.

