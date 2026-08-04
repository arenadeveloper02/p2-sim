<!-- upstream-sync-question -->
# Open Questions — upstream sync 2026-08-04 (PR #679)

Range: `e2fecc86..1b9e0f25` — 518 upstream commits, v0.7.29 → v0.7.55.
Predicted conflicts: **249 files** (235 content, 7 modify/delete, 7 add/add).

Everything else is resolved from `merge-policy.json` / the codebase and recorded as **D1–D15** in
`.upstream-sync/ledger/2026-08-04/run.md` — including the DB migration renumber (fork `0258`–`0261`
→ `0282`–`0285`), the legacy-folder-table drop, HubSpot union, `models.ts` Azure union, the
`auth.ts` restructure, Exa's retired research endpoint, fork favicons, and the harness's own
`package.json` scripts. **Do not re-answer those.**

Both remaining questions are on the same surface — the **Arena deployed chat**
(`apps/sim/app/(interfaces)/chat/**`, 51 fork-modified files vs 21 upstream, `manualReview` in
policy) — so one reply covers both.

---

## Q1 — Keep or drop Arena deployed-chat **voice mode**? (blocking)

Upstream `78740c05` (#6215) + `83988c1e` (#6218) **removed voice from the deployed chat**, keeping
workspace dictation as a separate feature. Deleted upstream:

- `app/(interfaces)/chat/components/voice-interface/voice-interface.tsx` + `components/particles.tsx`
- `app/(interfaces)/chat/components/input/voice-input.tsx`
- `app/(interfaces)/chat/hooks/use-audio-streaming.ts`
- `hooks/queries/voice-settings.ts`
- `app/api/proxy/tts/stream/route.ts` + `lib/api/contracts/media/tts-stream.ts`
- the anonymous `chatId` branch of `app/api/speech/token` (+ `resolveDeployedChatCaller`)

**Why this blocks:** the fork's **fork-only** `ArenaDeployedChat.tsx` imports `VoiceInterface` and
`useAudioStreaming` and renders `<VoiceInterface>` as live code (line ~1598), and the fork's
`chat.tsx` imports the deleted `voice-settings` hook. Taking upstream's removal without a decision
fails `bun run check`; the child agents cannot resolve `input.tsx`, `chat.tsx`, `hooks/index.ts`,
`use-chat-streaming.ts` or `constants.ts` either way without knowing the answer.

**A — Drop voice, follow upstream** (recommended). Delete the voice stack and strip the voice wiring
out of `ArenaDeployedChat.tsx`, `chat.tsx`, `input.tsx`, `use-chat-streaming.ts`.
- Removes an **unauthenticated TTS/STT relay that spends the platform ElevenLabs key** — upstream's
  stated reason for deleting the `chatId` branch. Upstream had just added metering/throttling to
  that relay in `0bc4fb46` (#6212) and then removed the whole path two commits later.
- Cost: Arena clients lose voice-first chat and spoken responses.

**B — Keep voice, carry it as fork-owned.** Restore the six deleted modules under fork ownership,
keep `api/proxy/tts/stream` **in its metered/throttled `0bc4fb46` form** (not the pre-#6212
version), and keep the anonymous `chatId` path in `api/speech/token`. Adds these paths to `forkFirst`
and to the fork's permanent maintenance burden.

**Question: A or B?** If B, please confirm you accept keeping an unauthenticated
platform-key-spending relay on the public chat endpoint.

---

## Q2 — Confirm the resolution stance for `apps/sim/app/(interfaces)/chat/**` + `app/api/chat/**`

Assumed default (D15) — correct it if wrong:

> **Fork-first on presentation, upstream-first on auth / security / route contracts.**

- **Fork wins:** the whole Arena chat product (`ArenaDeployedChat`, `DeployedChatLanding`,
  `DeployedChatDescriptionModal`, `FeedbackView`, `leftNavThread`, `golden-queries-modal`,
  `knowledge-results-modal`, `chat-echarts-renderer`, `feedback-box`, `welcome-message-with-ctas`,
  `arena-tokens.css`, `utils/*`, and the fork's `api/chat/{agents,agentsList,feedback,history,
  all-history,threads,memory-api}` routes) **and** the fork's edits to the shared shell
  (`header.tsx`, `input.tsx`, `message.tsx`, `message-container.tsx`, `markdown-renderer.tsx`,
  `loading-state.tsx`, `constants.ts`).
- **Upstream wins** inside `api/chat/{route,utils,[identifier]/route,manage/[id]/route}.ts`:
  OTP `authType` re-check (`eb123330`), per-group chat-deploy auth modes (`7ee8f46a`), deployment
  passwords visible to admins (`13772565`), post-mutation deployment query invalidation
  (`b0491f11`), TTS relay metering (`0bc4fb46`).

**Question: confirm, or state a different split.** A bare "confirmed" is enough.

---

Reply on PR #679 with your answers, then comment `/upstream-sync resume`.
