# Arena Development Block Design

**Date:** 2026-07-23  
**Status:** Approved for planning  
**Related:** Existing Development block (`apps/sim/blocks/blocks/development.ts`) and generator (`apps/sim/lib/development/`)

## Summary

Add an **Arena Development** block that mirrors Development (generate/edit Next.js apps → GitHub → Vercel) and always produces **iframe-embeddable** apps that:

1. Read `emailId` from the iframe URL query string (`?emailId=...`).
2. Deny access with “do not have access” when `emailId` is missing or empty.
3. Expose `emailId` to every page and SSR path via cookie + React Context.
4. Include a **Branch Guidelines** section in Arena system prompts (placeholder until final text is provided).

## Decisions (locked)

| Topic | Choice |
| --- | --- |
| `emailId` source | Query string on iframe `src` (e.g. `/?emailId=user@x.com`) |
| Propagation | Middleware cookie + React Context (SSR + client) |
| Embed policy | `Content-Security-Policy: frame-ancestors *` (any parent) |
| Architecture | Shared Development engine + `arenaMode: true` |
| Branch guidelines | Hardcoded prompt placeholder; replace text later |
| Injection strategy | Deterministic Arena scaffold + Arena prompt mandates |

## Non-goals

- Changing behavior of the existing Development block when `arenaMode` is false.
- Requiring `emailId` at Sim workflow/block execution time (it is supplied by the iframe parent at visit time).
- `postMessage`-based email passing (query string only for v1).
- Parent-origin allowlists (open embed for v1).

## Architecture

```
Arena Development block
  → arena_development_generate_app / arena_development_edit_app
  → shared generate/edit API + pipeline with arenaMode: true
  → LLM generation (Arena prompt append) + merge Arena scaffold files
  → GitHub push + Vercel deploy (unchanged)
```

Development tools/block continue to call the same pipeline with `arenaMode: false` / omitted.

### Components

1. **Block** — `apps/sim/blocks/blocks/arena-development.ts`  
   Same subBlocks/outputs as Development; wires Arena tools.

2. **Tools** — `arena_development_generate_app`, `arena_development_edit_app`  
   Same params as Development tools; body includes `arenaMode: true`. Prefer reusing existing `/api/tools/development/generate` and `/edit` with the flag (or thin Arena routes that set the flag and delegate).

3. **Generator / normalizer** — when `arenaMode`:
   - Append Arena mandates + Branch Guidelines to system prompts (generate + edit).
   - Merge/ensure Arena scaffold files after generation and on edit.

4. **Arena scaffold** (deterministic files in the generated app), e.g.:
   - `middleware.ts` — read `emailId` from search params; empty → access-denied response; else set cookie.
   - `lib/arena-email.ts` — cookie name, `getArenaEmailId()` for SSR.
   - `components/arena-email-provider.tsx` — React Context + `useArenaEmailId()`.
   - Root layout wiring for the provider.
   - Headers / `next.config` (or middleware headers) for `frame-ancestors *` and no blocking `X-Frame-Options`.
   - Access-denied UI copy: exact phrase **do not have access**.

5. **Branch guidelines constant** — single exported string with TBD placeholder; Arena prompts append it verbatim.

## Data flow

### Iframe parent (runtime)

```html
<iframe src="https://<deployed-app>/?emailId=user@example.com"></iframe>
```

1. Request hits Next middleware with `emailId` query param.
2. If missing/empty → respond with “do not have access”.
3. If present → set cookie `arena_email_id` with `Path=/; Secure; SameSite=None` (cross-origin iframe requirement).
4. Root layout provides React Context from cookie / initial value.
5. Client: `useArenaEmailId()`; Server: `getArenaEmailId()` from cookies.

Internal client navigations keep access via the cookie even if the query string is dropped.

### Sim (generation time)

Block run does not need `emailId`. Arena mode only ensures the scaffold and prompts are present in the published app.

## Error handling

| Case | Behavior |
| --- | --- |
| Empty/missing `emailId` in deployed app | Show “do not have access” |
| Generate/edit/deploy failures | Same as Development |
| Edit strips Arena files | Re-apply scaffold in normalizer when `arenaMode` |

## Prompt design

Arena-only appendices:

1. **Arena mandates** — preserve emailId middleware/context/headers; use `emailId` for user-scoped behavior where relevant; do not remove iframe/email wiring.
2. **Branch Guidelines** — from constant:

```text
## Branch Guidelines
<!-- TBD: replace with Arena branch guidelines -->
```

When final guidelines text is provided, update only that constant.

## Testing

- Unit: Arena scaffold merge/ensure idempotent; prompts include Branch Guidelines + Arena mandates only when `arenaMode`.
- Regression: Development path unchanged when `arenaMode` is false/omitted.
- Manual: deploy Arena app, load in iframe with and without `?emailId=`.

## Open follow-ups (not blocking plan)

- Paste final Branch Guidelines text into the constant.
- Optional later: env override for guidelines or frame-ancestors allowlist.
