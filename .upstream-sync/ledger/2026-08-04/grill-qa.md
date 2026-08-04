# Grill Q&A — 2026-08-04

## 2026-08-04 · PR #679

**Q** (2026-08-04T10:05:34Z, utcarshsrivastava-collab): ## Upstream sync 2026-08-04 — grill complete, **2 questions** blocking the merge

Range `e2fecc86..1b9e0f25` — **518 commits**, v0.7.29 → v0.7.55.
Measured with `git merge-tree`: **249 conflicted files** (235 content, 7 modify/delete, 7 add/add).
Fork changed 1531 files since baseline, upstream 4903, **428 overlap**.

Full analysis: `.upstream-sync/ledger/2026-08-04/run.md` → `## Grill analysis`.

Good news first: **`forkFirst` held perfectly — upstream touched zero of its 42 prefixes.** All the
work is in `manualReview` paths.

---

# Questions

Both are on the **Arena deployed chat** (`apps/sim/app/(interfaces)/chat/**` — 51 fork-modified
files vs 21 upstream). One reply covers both.

## Q1 — Keep or drop Arena deployed-chat **voice mode**?

Upstream #6215 + #6218 **removed voice from the deployed chat** (keeping workspace dictation), deleting
`voice-interface/` (+ its particles canvas), `input/voice-input.tsx`, `hooks/use-audio-streaming.ts`,
`hooks/queries/voice-settings.ts`, `api/proxy/tts/stream/route.ts` + its contract, and the anonymous
`chatId` branch of `api/speech/token`.

**Why it blocks:** the fork's **fork-only** `ArenaDeployedChat.tsx` imports `VoiceInterface` and
`useAudioStreaming` and renders `<VoiceInterface>` as live code; `chat.tsx` imports the deleted
`voice-settings` hook. Either way this fails `bun run check` until decided, and the child agents
can't resolve `input.tsx` / `chat.tsx` / `hooks/index.ts` / `use-chat-streaming.ts` / `constants.ts`
without the answer.

- **A — Drop voice, follow upstream (recommended).** Also removes an **unauthenticated TTS/STT relay
  that spends the platform ElevenLabs key** — upstream's stated reason for deleting it. (Upstream
  added metering/throttling to that relay in #6212, then deleted the whole path two commits later.)
  Cost: Arena clients lose voice-first chat and spoken responses.
- **B — Keep voice as fork-owned.** Restore the six deleted modules, keep `api/proxy/tts/stream` in
  its **metered/throttled #6212 form**, keep the anonymous `chatId` path in `api/speech/token`. Adds
  these paths to `forkFirst` and to permanent fork maintenance.

**→ A or B?** If B, please confirm you accept an unauthenticated platform-key-spending relay on the
public chat endpoint.

## Q2 — Confirm the resolution stance for `(interfaces)/chat/**` + `api/chat/**`

Assumed default — **"fork-first on presentation, upstream-first on auth / security / route contracts"**:

- **Fork wins:** the whole Arena chat product (`ArenaDeployedChat`, `DeployedChatLanding`,
  `FeedbackView`, `leftNavThread`, golden-queries / knowledge-results modals, ECharts renderer,
  feedback box, welcome CTAs, `arena-tokens.css`, `utils/*`, and the fork's
  `api/chat/{agents,agentsList,feedback,history,all-history,threads,memory-api}` routes) **and** its
  edits to the shared shell (`header`, `input`, `message`, `message-container`, `markdown-renderer`,
  `loading-state`, `constants`).
- **Upstream wins** inside `api/chat/{route,utils,[identifier]/route,manage/[id]/route}.ts`: OTP
  `authType` re-check (#5600), per-group chat-deploy auth modes (#5818), deployment passwords for
  admins (#6177), post-mutation deployment invalidation (#6223), TTS relay metering (#6212).

**→ Confirm, or state a different split.** A bare "confirmed" is enough.

---

# Already resolved — no answer needed (D1–D15 in the ledger)

| # | Decision |
|---|---|
| **D1** | Migration collision: both sides added `0258`–`0261`. Renumber **fork's four → `0282`–`0285`** (upstream ends at `0281`), rebuild `_journal.json` (262 + 281 → 285 entries), regenerate snapshots. `packages/db/schema.ts` = union. |
| **D2** | Upstream drops `workflow_folder` / `workspace_file_folders` (#6051). Only **one fork-only consumer breaks**: `lib/workflows/default-user-workflows/service.ts` → port to the generic `folder` table with `resourceType: 'workflow'`. No fork-first option; the table ceases to exist. |
| **D3** | Exa `/research/v1` returns **HTTP 410** — `exa_research` is already broken in prod. Take upstream's refresh (#6074), which auto-routes saved `exa_research` workflows to the new Agent op **and preserves the `research[0].text` output shape**. Re-apply the fork's `exaHosting` + `__costDollars` onto upstream's files; fix the fork-only `tools/exa-hosting.test.ts`. |
| **D4** | HubSpot = **union**. Both sides expanded additively and disjointly; the two files the fork edited (`list_contacts`, `list_associations`) upstream never touched. Conflicts only in `index.ts` / `types.ts` / `blocks/blocks/hubspot.ts`. Note the `hubspot` OAuth provider in `auth.ts` is **byte-identical** to upstream's — not a fork customization, just relocated to `lib/auth/connectors/providers.ts`. |
| **D5** | `lib/auth/`: take upstream's restructure + better-auth 1.6.23 + org session policies, then re-apply **every** Arena block (`ARENA_V3_OAUTH_CALLBACK_ORIGINS`, dev embed origins, `BETTER_AUTH_COOKIE_DOMAIN` cross-subdomain cookies, Arena hub trusted origin, Microsoft endpoint/tenant helpers). |
| **D6** | `providers/models.ts`: **union**. Keep all `azure/*` + `azure-anthropic/*` families and the fork-retained legacy models; take all upstream models + the sunset-tier and prompt-caching fields. **Do not** tag fork legacy models with sunset tiers (would show amber/red warnings on Arena canvases). |
| **D7** | Registries: union. Fork keeps arena, arena-development, chart_generator, cost, development, facebook_ads, figma, google_ads_v1, image_fusion, p2_docs, presentation, semrush, spyfu, unipile. Upstream lands 12 new integrations + the `webhook` and `Sim`→`Sim Chat` renames. |
| **D8** | The 7 `apps/sim/public/**` conflicts are Sim wordmark vs Arena marks → **keep fork's**. |
| **D9** | `bunfig.toml`: fork side is unchanged from baseline so upstream's `minimumReleaseAge = 604800` supply-chain gate lands with **no conflict**. If install then fails on a young fork dep, add it to `minimumReleaseAgeExcludes` — do **not** revert the gate to `0`. |
| **D10** | `ci.yml` (fork +237 / upstream +597): upstream base, re-apply the fork's EC2/GHCR deploy jobs. |
| **D11** | Root `package.json`: union — **must preserve `upstream-sync` (this harness), `check:credentials`, `check:secrets`, `vendor-pricing:*`, `repair:workflow-room-redis-keys`**. Drop `dev:full:minimal-registry` (upstream removed the minimal-registry hatch, #6163). |
| **D12** | `sync-local-draft.ts` was **moved**, not deleted (→ `apps/sim/stores/workflows/`). Port the fork's `flushMergedLocalDraftToServer` (fixes deploy silently clearing image-generator provider/model) + its tests + 3 call sites. `base-card.tsx` was **replaced** by the shared `Resource`/`resource-tile` primitives (#6202) — re-attach the fork's `clickKnowledgeBaseEvent` Mixpanel tracking there (the only one of 16 Arena Mixpanel call sites upstream deleted). |
| **D13** | The fork deleted two upstream tests that upstream then modified (`home/hooks/use-chat.test.ts`, `stream/turn-model-serialize.test.ts`) → restore upstream's and adapt. |
| **D14** | `apps/sim/local-copilot/` (77 fork-only files) produces **no conflicts but will fail type-check** — it imports deep upstream copilot internals that moved. Known break: `LOAD_USER_SKILL_TOOL_NAME` from the deleted `@/lib/mothership/skills` (skills moved to `lib/skills/` + `lib/workflows/skills/`). Treat as a post-merge repair cluster. |

**New CI gates this PR must satisfy** — `regenerateAfterMerge` needs to grow beyond `mship:generate`
to also run `tool-metadata:generate`, `mship-tools:generate`, `skills:sync`,
`agent-stream-docs:generate`; plus `check:tool-registry-boundary`, `check:migrations`,
`check:api-validation:strict` now gate on fork-added tools/blocks/migrations.

Also filed in `extensibility-notes.md`: **`merge-policy.json` is missing ~30 fork-owned paths**
(most notably `apps/sim/local-copilot/`, `app/api/local-copilot/`, `public/favicon/**`,
`public/icon.svg`, and 8 fork blocks / 8 fork hooks / 6 fork lib dirs), with recommendations to move
the Azure model catalog and the Arena auth-origin logic into fork-owned sidecars — those two files
alone account for the largest conflicts in the repo.

---

Reply here with **Q1: A or B** and **Q2: confirmed (or your split)**, then comment
`/upstream-sync resume`.

## 2026-08-04 · PR #679

**Q** (2026-08-04T10:06:01.970Z, upstream-sync[bot]): Grill open questions must be answered before merge starts.
_Context: .upstream-sync/ledger/2026-08-04/open-questions.md_

