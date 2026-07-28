# Arena Custom Development Notes

Living reference for **Arena-specific (P2 fork) changes** on top of upstream Sim. Use this when merging version branches, rebasing onto upstream, or onboarding agents so it is clear what exists only on this branch and must be preserved or re-applied.

**Keep this file updated** whenever custom blocks, UI, APIs, or infra are added or removed.

---

## Custom workflow blocks

Arena-only blocks are registered separately from upstream Sim blocks in `ARENA_CUSTOM_BLOCK_REGISTRY` inside `apps/sim/blocks/registry-maps.ts`. They are spread into `BLOCK_REGISTRY` at build time.

| Block type | Name | Summary | Source |
|------------|------|---------|--------|
| `arena` | Arena | Internal Arena task/project operations (create tasks, sub-tasks, comments, meetings, overdue tasks, etc.) | `apps/sim/blocks/blocks/arena.ts`, `apps/sim/tools/arena/` |
| `facebook_ads` | Facebook Ads | Natural-language Facebook Ads data queries | `apps/sim/blocks/blocks/facebook_ads.ts` |
| `figma` | Figma | Figma file interaction, design creation, code conversion | `apps/sim/blocks/blocks/figma.ts` |
| `google_ads_v1` | Google Ads V1 | AI-powered Google Ads queries with simplified GAQL generation | `apps/sim/blocks/blocks/google_ads_v1.ts` |
| `image_fusion` | Image Fusion | Fuse multiple images with Nano Banana Pro (Gemini image model) | `apps/sim/blocks/blocks/image_fusion.ts` |
| `p2_docs` | P2 Docs | Presentation template schemas, icons, and team data | `apps/sim/blocks/blocks/p2_docs.ts` |
| `semrush` | Semrush | SEO data from Semrush | `apps/sim/blocks/blocks/semrush.ts` |
| `spyfu` | SpyFu | SEO, PPC, competitor, keyword, ranking, and usage data | `apps/sim/blocks/blocks/spyfu.ts` |
| `unipile` | LinkedIn (Unipile) | LinkedIn company data and messaging via Unipile | `apps/sim/blocks/blocks/unipile.ts` |
| `presentation` | Presentation | Create presentations with customizable slides, tone, and verbosity | `apps/sim/blocks/blocks/presentation.ts` |

> **Note:** `presentation` may be commented out in `ARENA_CUSTOM_BLOCK_REGISTRY` depending on branch state — check `registry-maps.ts` before assuming it is active.

`unipile` also has a custom catalog meta entry in `ARENA_CUSTOM_BLOCK_META_REGISTRY`.

### Registry touchpoints

- Config registry: `apps/sim/blocks/registry-maps.ts` → `ARENA_CUSTOM_BLOCK_REGISTRY`
- Meta registry: `apps/sim/blocks/registry-maps.ts` → `ARENA_CUSTOM_BLOCK_META_REGISTRY`

When upstream changes `BLOCK_REGISTRY` / `BLOCK_META_REGISTRY` layout, re-verify Arena blocks are still merged in correctly.

---

## Image variations (multi-image generation)

Custom logic to generate **multiple image variations** from a single prompt (e.g. “give me three variations”) instead of always producing one image.

| Area | Location |
|------|----------|
| Count resolution (SLM + heuristics) | `apps/sim/lib/image-generation/resolve-image-count.server.ts` |
| Constants / limits | `apps/sim/lib/image-generation/constants.ts` |
| Conversation image catalog & reuse | `apps/sim/lib/chat/conversation-image-catalog.ts`, `apps/sim/lib/chat/use-generated-image-reuse.ts` |
| File upload: pick images from chat | `apps/sim/app/workspace/.../file-upload/conversation-image-picker.tsx` |
| Message image parsing tests | `apps/sim/app/workspace/.../chat-message/message-images.test.ts` |

---

## Deployed chat refactor

The public/deployed chat experience is a **custom Arena implementation**, not the upstream `ChatClient`.

| Area | Location |
|------|----------|
| Deployed chat page (uses Arena client) | `apps/sim/app/(interfaces)/chat/[identifier]/page.tsx` |
| Arena deployed chat UI | `apps/sim/app/(interfaces)/chat/[identifier]/ArenaDeployedChat.tsx` |
| Arena chat header | `apps/sim/app/(interfaces)/chat/components/header/arenaHeader.tsx` |
| Arena chat message rendering | `apps/sim/app/(interfaces)/chat/components/message/ArenaClientChatMessage.tsx` |
| Left nav / threads | `apps/sim/app/(interfaces)/chat/[identifier]/leftNavThread.tsx` |
| Feedback view | `apps/sim/app/(interfaces)/chat/[identifier]/FeedbackView.tsx` |
| Mixpanel events (deployed chat) | `apps/sim/app/arenaMixpanelEvents/mixpanelEvents.ts` |
| Loading agent (Arena branding) | `apps/sim/components/ui/loading-agent-arena.tsx` |

Upstream `chat.tsx` under the same route may still exist but is commented out in favor of `ArenaDeployedChat`.

---

## Settings nav — Enterprise items disabled

Arena intentionally hides two Enterprise settings entries that upstream still ships. Both are **commented out** in `allNavigationItems` (not deleted), so merges can reintroduce them by uncommenting.

| Nav item | Id | Why / notes |
|----------|-----|-------------|
| Workspace Forks | `forks` | Disabled — workspace forking not offered in Arena settings. |
| Custom blocks | `custom-blocks` | Disabled — publish-as-reusable-block flow not offered in Arena settings. |

**Source of truth:** `apps/sim/app/workspace/[workspaceId]/settings/navigation.ts`

When merging upstream, keep these two items commented out unless product explicitly re-enables them.

---

## Other Arena touchpoints (non-exhaustive)

Add rows here as more custom work lands.

| Feature | Location / notes |
|---------|------------------|
| Arena sub-block UI (client selector) | `apps/sim/app/workspace/.../sub-block/components/arena/` |
| Arena API routes | `apps/sim/app/api/tools/arena/` |
| Arena auth / session cookie domain | `apps/sim/lib/auth/session-cookie-domain.ts` |
| Arena utils (users list, etc.) | `apps/sim/lib/arena-utils/` |
| Figma design generator | `apps/sim/lib/figma-design-generator.ts` |
| Org whitelabeling / branding | `apps/sim/ee/whitelabeling/` |
| Sidebar brand header | `apps/sim/app/workspace/.../sidebar/components/sidebar-brand-header/` |
| Settings Enterprise nav (forks + custom-blocks off) | `apps/sim/app/workspace/.../settings/navigation.ts` |

---

## Merge / version-branch checklist

When pulling upstream Sim into an Arena branch:

1. **Blocks** — Confirm every entry in `ARENA_CUSTOM_BLOCK_REGISTRY` (and meta registry) is still present and spread into `BLOCK_REGISTRY`.
2. **Tools & API routes** — Arena tool folders (`tools/arena/`, `tools/p2_docs/`, etc.) and `app/api/tools/arena/` routes survive the merge.
3. **Deployed chat** — `page.tsx` still wires `ArenaDeployedChat`, not upstream `ChatClient`.
4. **Image variations** — `resolve-image-count.server.ts` and related image-generation paths are not overwritten by upstream single-image defaults.
5. **Settings Enterprise nav** — Keep `forks` and `custom-blocks` commented out in `settings/navigation.ts`.
6. **This file** — Update the tables above if anything was added, removed, or renamed during the merge.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-17 | Document Enterprise settings: `forks` and `custom-blocks` nav items disabled |
| 2026-07-02 | Initial notes: custom blocks registry, image variations, deployed chat refactor |
