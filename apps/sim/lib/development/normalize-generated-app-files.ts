import { createLogger } from '@sim/logger'

const logger = createLogger('NormalizeGeneratedApp')

export interface GeneratedAppFile {
  path: string
  content: string
}

/** Latest stable releases aligned with the Sim monorepo (Next 16 + React 19). */
export const PINNED_NEXT_VERSION = '^15.3.3'
export const PINNED_REACT_VERSION = '^19.0.0'

const PINNED_DEV_DEPENDENCIES: Record<string, string> = {
  typescript: '^5.8.3',
  '@types/node': '^22.13.10',
  '@types/react': '^19.0.0',
  '@types/react-dom': '^19.0.0',
  tailwindcss: '^3.4.17',
  postcss: '^8.5.3',
  autoprefixer: '^10.4.21',
  eslint: '^9.28.0',
  'eslint-config-next': PINNED_NEXT_VERSION,
}

const PINNED_DEPENDENCIES: Record<string, string> = {
  next: PINNED_NEXT_VERSION,
  react: PINNED_REACT_VERSION,
  'react-dom': PINNED_REACT_VERSION,
}

/** Overrides LLM-picked versions that break npm install with React 19. Applied when the dep is present. */
const REACT19_COMPAT_DEPENDENCY_OVERRIDES: Record<string, string> = {
  'lucide-react': '^0.479.0',
}

/** Added to package.json when source files import the package but the LLM omitted it from dependencies. */
const AUTO_ADD_DEPENDENCIES: Record<string, string> = {
  'lucide-react': '^0.479.0',
  recharts: '^2.15.3',
  openai: '^4.91.1',
}

const AUTH_PACKAGE_DEPENDENCIES: Record<string, string> = {
  jsonwebtoken: '^9.0.2',
}

const AUTH_PACKAGE_DEV_DEPENDENCIES: Record<string, string> = {
  '@types/jsonwebtoken': '^9.0.9',
}

export const GENERATED_APP_DEPENDENCY_GUIDANCE = `package.json MUST pin these exact versions:
- "next": "${PINNED_NEXT_VERSION}"
- "react": "${PINNED_REACT_VERSION}"
- "react-dom": "${PINNED_REACT_VERSION}"
- devDependencies: typescript ^5.8, @types/node ^22, @types/react ^19, @types/react-dom ^19, tailwindcss ^3.4.17, postcss ^8, autoprefixer ^10, eslint ^9, eslint-config-next ${PINNED_NEXT_VERSION}
- When using lucide-react, pin "lucide-react": "^0.479.0" or newer (React 19 compatible) — never ^0.395.x
- If ANY file imports from lucide-react, recharts, or openai, package.json dependencies MUST include that package — missing deps cause TS2307 at typecheck
Use Tailwind CSS v3 only (tailwind.config.ts + postcss.config.mjs with tailwindcss and autoprefixer). Do NOT use Tailwind v4-only setup.
next.config.ts MUST NOT include an eslint property (removed in Next.js 16 — builds no longer run ESLint from next.config)`

export const GENERATED_APP_TYPESCRIPT_GUIDANCE = `TypeScript and Next.js structure (zero errors required):
- Use strict TypeScript: strict true in tsconfig.json, no @ts-ignore, no implicit any, no unused variables
- Every identifier in a file must be declared or imported — NEVER use a type, interface, or variable name without defining it in the same file or importing it (e.g. TS2304 "Cannot find name 'UserData'" means add \`import type { UserData } from '@/lib/types'\` or define the interface locally)
- Every React component props interface must be explicit (e.g. interface HeroProps { title: string }) and every type in that interface must be imported or defined in the file
- NEVER type Client component props or \`.map()\` callback parameters as \`unknown\` or \`unknown[]\` when those values are used in JSX, React \`key={...}\`, object indexes (\`obj[field]\`), or computed property names (\`{ [field]: value }\`) — TypeScript rejects unknown for Key, ReactNode, index types (TS2322/TS2538/TS2464)
- Define concrete DTOs in lib/types.ts (e.g. AgentField { key: string; label: string; value: string }, AgentExecution { id: string; status: string; output: Record<string, string> }) and import them in AgentClient and similar components — never \`fields: unknown[]\` or \`agent: unknown\`
- Server pages fetch data; Client components receive it via props. If app/foo/page.tsx renders <FooClient data={data} />, components/FooClient.tsx MUST declare interface FooClientProps { data: DataType } and use ({ data }: FooClientProps) — NEVER () with no parameters when the page passes props
- Share domain types in lib/types.ts only — pages and Client components import types with \`import type { UserData, CategoryData } from '@/lib/types'\`
- lib/types.ts MUST export every shared type (UserData, CategoryData, TaskWithRelations, etc.) with \`export interface\` or \`export type\`
- When pages import TaskWithRelations but the model is Task, export \`export type TaskWithRelations = Task\` in lib/types.ts — same for MemberData/Member, TaskWithOwners/Task, Status/TaskStatus, Priority/TaskPriority
- lib/actions.ts exports server actions (functions) only — import runtime values with \`import { getCategories } from '@/lib/actions'\`; do NOT import types from @/lib/actions unless that file explicitly re-exports them with \`export type { CategoryData } from '@/lib/types'\`
- Name interactive Client components with a Client suffix (DashboardClient, AnalyticsClient, SettingsClient) and add "use client" at the top
- CRITICAL: Every named Client component MUST contain complete, real UI code — JSX with actual elements, logic, and state. NEVER write a stub like \`export default function DashboardClient() { return <div>DashboardClient</div> }\` — this renders as literal text and is a broken app
- Use Next.js 16 App Router only: app/layout.tsx (root layout with html/body), app/page.tsx, app/globals.css, and app/<route>/page.tsx for pages
- Do NOT mix app/ and src/app/ — use app/ at project root only; path alias "@/*" maps to "./*" in tsconfig paths
- Default to Server Components; add "use client" only for hooks, browser APIs, or event handlers
- Use next/link for internal navigation, next/image for images, export const metadata in layout/page where appropriate
- All imports must resolve; no missing modules; prefer named exports for components under components/
- lib/crypto.ts: export encrypt, decrypt, maskKey, encryptApiKey, decryptApiKey when any file imports them from @/lib/crypto
- lib/agents.ts: every AgentInfo object MUST include all required fields from lib/types.ts (especially id when AgentInfo requires it)
- Date helpers (formatDate, formatRelativeTime, etc.): parameter type string | Date when used with Prisma DateTime values
- Code MUST pass "npm install && npm run build" with zero TypeScript errors and zero Next.js compile errors`

export const GENERATED_APP_ZERO_ERRORS_GUIDANCE = `Zero-defect bar (MANDATORY — generate, edit, and repair):
- Output MUST have zero syntax errors, zero TypeScript semantic errors, and zero Next.js compile/prerender failures — validation rejects the app otherwise
- Arena Copilot runs automated gates before GitHub push: structure checks on all files, then npm install + prisma generate + next build (E2B when configured) or local tsc --noEmit
- Aren Copilot does NOT post-process your source files to fix imports, exports, types, auth/crypto helpers, Client prop interfaces, split imports, or next/document usage — output correct TypeScript in the JSON response
- Never submit stubs, placeholders, split imports, dangling @/ imports, or pages that import components missing from files[]
- Syntax: valid TS/TSX; closed JSX tags; complete \`import ... from '...'\` statements; \`return (\` or \`return <\` on one line; "use client" as the first line when hooks/events are used
- Semantics: strict types (no any, no @ts-ignore); page and Client prop names match exactly; every type from @/lib/types; server actions from @/lib/actions; Prisma queries use schema field names
- Next.js App Router: only app/layout.tsx renders <html> and <body>; NEVER import Html/Head/Main/NextScript from next/document in app/**; app/not-found.tsx and app/error.tsx use plain <div>/<main> markup
- Self-check before responding: trace every import to an exported symbol; every page import has a components/*.tsx file in files[]; edited files stay consistent with importers and lib/types.ts
- Edits must leave the full repo buildable — update page AND component together when props change; return lib/actions.ts and lib/types.ts when schema changes`

export const GENERATED_APP_VALIDATION_GUIDANCE = `Pre-build validation requirements:
- package.json has scripts: dev, build, start, lint
- app/layout.tsx exists and exports metadata; app/page.tsx and app/globals.css exist (globals.css imported only in layout)
- Every @/ import must resolve to a generated file — no placeholder imports like @/components/ui/... unless those files are generated
- Structure validation fails when a page imports @/components/X but components/X.tsx is missing from the output — generate every imported component with full JSX
- Client components rendered with props must declare matching props interfaces
- "use client" must be the first statement in files that use hooks, event handlers, useState, useEffect, or onClick; server modules (lib/actions.ts, lib/prisma.ts) must not use it
- No browser APIs in Server Components; no Prisma/database imports in Client Components
- No unused imports, missing exports, duplicate default exports, or bare type names without import type
- Types must be imported from the module that exports them — lib/types.ts for interfaces; never import a type from lib/actions.ts unless actions re-exports it
- JSX: return (\` or \`return <\` on one line — never \`return\` newline then \`<\`; all tags closed; "use client" first line in Client files
- App Router document shell: only app/layout.tsx uses \`<html>\` and \`<body>\`; app/not-found.tsx and app/error.tsx use plain \`<main>\`/\`<div>\` — never next/document or PascalCase \`<Html>\`
- Include Prisma files and dependencies only when requiresDatabase is true; static apps must not include prisma/ or @prisma/client
- Include tailwind.config.ts and package.json scripts.build
- NEVER use localStorage.setItem or sessionStorage.setItem to store app data — when requiresDatabase is true use Prisma server actions; when requiresDatabase is false keep state in-memory with useState only for UI interactions, never for cross-session persistence
- Final code must pass structure validation AND pre-deploy compile validation (next build in E2B, or tsc --noEmit locally) with zero errors`

export const GENERATED_APP_COMMON_FAILURES_GUIDANCE = `Common generation failures — avoid ALL of these (structure validation will reject the app):
1. localStorage / sessionStorage persistence (database apps):
   - NEVER use localStorage.setItem or sessionStorage.setItem in ANY file — especially AppShell, LoginClient, RegisterClient, ForgotPasswordClient, DashboardClient, TasksClient, UsersClient, CategoriesClient, SettingsClient, ProfileClient
   - Auth: fetch('/api/auth/me') + cookies/server session — NOT localStorage.getItem('user') or setItem('token', ...)
   - Login/register: POST to app/api/auth routes — do not stash user JSON in browser storage
   - Dark mode / sidebar: useState + document.documentElement.classList only — never persist theme to localStorage
2. Split / broken imports (TS1109 Expression expected) — affects pages, components, lib/, and config files:
   - EVERY package needs its own complete block: \`import { A, B } from 'package';\`
   - WRONG: close lucide-react then list recharts symbols without \`import {\`
   - WRONG: close recharts then list lucide symbols without \`import {\`
   - lucide-react icons and recharts components MUST be two separate import statements
   - After any \`} from 'module';\` the next line must be \`const\`, \`export\`, \`function\`, or a new \`import\` — NEVER bare symbol names like \`BarChart,\` or \`CheckCircle,\`
3. Types vs actions imports (TS2459):
   - Import types from @/lib/types only — never \`import type { X } from '@/lib/actions'\` unless actions re-exports the type
4. lib/auth exports (TS2305):
   - Every API route importing from @/lib/auth must match exports in lib/auth.ts — export signToken, verifyToken, getAuthUser, and JwtPayload together
   - If you add app/api/*/route.ts files, update lib/auth.ts in the same edit so imports resolve
5. Config / server files stay simple:
   - next.config.ts, tailwind.config.ts, lib/prisma.ts: minimal imports then const/export — no split import blocks
   - lib/prisma.ts: only \`import { PrismaClient } from '@prisma/client'\` plus singleton export
6. Prisma schema drift (TS2353 / TS2339 / TS2551 in lib/actions.ts):
   - Read prisma/schema.prisma FIRST — use the exact relation and scalar field names defined there
   - include/select keys MUST match schema relation names exactly (never mix assignee vs user vs creator unless all three exist on the model)
   - lib/actions.ts Prisma queries and DTO mapping MUST use the same names as schema.prisma (include keys AND t.field access AND returned object keys)
   - lib/types.ts interfaces MUST match what lib/actions.ts returns — update all three files together on every schema change
   - Do NOT reference scalar fields absent from the model (e.g. User.avatar) unless defined in schema.prisma
   - Aggregate types like DashboardStats are NOT database rows — do not add a required \`id\` field unless the return object includes one
7. package.json auth deps (TS2307 Cannot find module 'jsonwebtoken'):
   - When lib/auth.ts imports jsonwebtoken, package.json MUST include jsonwebtoken in dependencies and @types/jsonwebtoken in devDependencies
8. Missing component files ("Missing file for import @/components/X" in structure validation):
   - Every page/layout that imports @/components/Foo MUST have components/Foo.tsx in files[] with complete UI — generate the component, do not delete the import
   - app/layout.tsx → Navbar, Footer; app/login/page.tsx → LoginClient; shared ServicePageClient across service routes — one components/ServicePageClient.tsx file
   - Fix by ADDING the missing components/*.tsx files in the same JSON response — never submit pages that reference components you did not generate
9. Page ↔ Client prop name drift (TS2322 IntrinsicAttributes & XxxClientProps):
   - Server page and Client component MUST use identical prop names — if page passes \`categories={data}\`, interface CategoriesClientProps MUST declare \`categories\`, NOT \`initialCategories\`
   - Generate the Client component and its \`interface XxxClientProps\` BEFORE writing the page that renders it
   - WRONG: page \`<TasksClient tasks={tasks} currentUser={user} />\` + component \`interface TasksClientProps { initialTasks: ... }\`
   - RIGHT: same names on both sides; update page AND component together in one response
10. Auth session vs database user (TS2739 JwtPayload missing UserData fields):
   - getAuthUser() returns JwtPayload: \`{ id, name, email, role }\` — use \`user.id\`, NEVER \`user.userId\`
   - Profile/settings pages needing full UserData MUST call a server action (e.g. getUserById(auth.id)) and pass that result — do NOT pass JwtPayload where UserData is expected
11. Missing server actions (TS2305 has no exported member):
   - Every \`import { getFoo } from '@/lib/actions'\` MUST match an \`export async function getFoo\` in lib/actions.ts
   - When a page needs getRecentTasks, getDashboardStats, etc., ADD the function to lib/actions.ts in the same response — never import actions that do not exist
12. next/document in App Router (next build prerender error on /404 — #1 repair failure if ignored):
   - NEVER import \`Html\`, \`Head\`, \`Main\`, or \`NextScript\` from \`next/document\` — Pages Router \`pages/_document\` only; this repo is App Router
   - NEVER use PascalCase \`<Html>\`, \`<Head>\`, \`<Main>\`, or \`<NextScript>\` JSX tags anywhere — even without an import (structure validation and next build both fail)
   - ONLY app/layout.tsx renders the document shell with lowercase \`<html>\` and \`<body>\` — nowhere else
   - app/not-found.tsx (prerendered as /404) and app/error.tsx: plain \`<main>\` or \`<div>\` only — NO \`<html>\`, NO \`<body>\`, NO next/document
   - WRONG: \`import { Html } from 'next/document'\` or \`return <Html><body>404</body></Html>\` in app/not-found.tsx
   - RIGHT: see GENERATED_APP_APP_ROUTER_DOCUMENT_GUIDANCE canonical templates — replace the entire file on repair, do not patch imports only
13. lib/crypto exports (TS2305 has no exported member 'maskKey'):
   - lib/crypto.ts is the ONLY crypto module — export EVERY symbol imported from @/lib/crypto in the same response
   - Common exports: encrypt, decrypt, encryptApiKey, decryptApiKey, maskKey (redacts API keys for display)
   - WRONG: app/api/settings/apikey/route.ts imports maskKey but lib/crypto.ts only exports encrypt/decrypt
   - RIGHT: lib/crypto.ts includes \`export function maskKey(value: string): string { ... }\` before any route imports it
14. Agent catalog types (TS2741 Property 'id' is missing in type 'AgentInfo'):
   - If lib/types.ts defines \`interface AgentInfo { id: string; slug: string; ... }\`, EVERY entry in lib/agents.ts MUST include id
   - Use the same string for id and slug when they match: \`{ id: 'keyword-research', slug: 'keyword-research', name: '...', ... }\`
   - WRONG: \`{ slug: 'keyword-research', name: '...', description: '...', route: '...' }\` without id
15. Date/time helpers (TS2345 Date not assignable to string):
   - Helpers named formatDate, formatTime, formatRelativeTime, formatTimeAgo, timeAgo, formatTimestamp MUST accept \`string | Date\` when components pass Prisma DateTime fields
   - Inside the helper: \`const d = value instanceof Date ? value : new Date(value)\` — never type the param as string only when callers pass Date
16. Client props completeness (TS2322 / missing prop on XxxClientProps):
   - EVERY prop the server page passes in JSX MUST appear in the Client's Props interface — including executions, hasApiKey, stats, items, etc.
   - When a page adds a new prop, update components/XxxClient.tsx interface AND destructuring in the same response — do not rely on post-processing
17. unknown in Client components (TS2322 / TS2538 / TS2464 in components/*Client.tsx — common in AgentClient):
   - WRONG: \`interface AgentClientProps { agent: unknown; fields: unknown[] }\` then \`fields.map((field) => <div key={field.key}>{field.label}</div>)\` — field is unknown, so field.key fails Key/ReactNode/index checks
   - RIGHT: define \`interface AgentField { key: string; label: string; value: string }\` in lib/types.ts, use \`fields: AgentField[]\`, import with \`import type { AgentField } from '@/lib/types'\`
   - Any value rendered in JSX (\`{item.name}\`), used as \`key={item.id}\`, indexed (\`output[key]\`), or in computed keys (\`{ [field.key]: field.value }\`) MUST have a concrete type with string/number/boolean fields — never \`unknown\`
   - For agent UIs: export AgentInfo, AgentField, AgentExecution (or similar) from lib/types.ts with \`id: string\`, \`name: string\`, \`status: string\`, and typed output maps — wire AgentClient props to those types`

export const GENERATED_APP_IMPORT_GUIDANCE = `Imports and exports (critical — every import must resolve to an exported symbol):
- tsconfig paths MUST be "@/*": ["./*"] with app/ at project root (not src/app/)
- EVERY symbol in a file must be imported or defined in that file — no bare type names, no missing imports
- Canonical type location: lib/types.ts — ALL shared interfaces/types live here and are exported with \`export interface\` or \`export type\`
- Components and pages import types ONLY from lib/types.ts: \`import type { CategoryData, UserData } from '@/lib/types'\`
- lib/actions.ts imports types from lib/types.ts for its own use — that does NOT export them. Other files must NOT do \`import type { CategoryData } from '@/lib/actions'\` unless actions.ts contains \`export type { CategoryData } from '@/lib/types'\`
- TS2459 "declares X locally, but it is not exported" means you imported a type from the wrong module — change the import to lib/types.ts where the type is actually exported
- Runtime imports from actions: \`import { getCategories, createTask } from '@/lib/actions'\` (functions only, not types)
- Type-only imports: always \`import type { Foo } from '@/lib/types'\` — never mix type imports into value import lines without the \`type\` keyword
- Export/import pairing MUST match: default export → \`import Foo from '...'\`; named export → \`import { Foo } from '...'\`; exported type → \`import type { Foo } from '@/lib/types'\`
- If you add a type to lib/types.ts, export it and update every file that uses it to import from '@/lib/types'
- If you add a server action to lib/actions.ts, export it with \`export async function\` and import only the function name in pages/components
- lib/crypto.ts: export encrypt, decrypt, maskKey, encryptApiKey, decryptApiKey when any file imports them from @/lib/crypto
- lib/agents.ts: every AgentInfo entry must satisfy lib/types.ts — include id when AgentInfo requires it
- EVERY @/ import must resolve to a generated file with a matching export of the correct kind (default, named, or type)
- See COMPONENT FILES rules — missing components/ files are the most common validation failure
- shadcn/ui components under components/ui/ MUST use named exports matching imports: \`export function Button\` when imported as \`import { Button } from '@/components/ui/button'\`
- Before finishing, verify each file: every import has a corresponding export in the target file; every exported symbol used elsewhere is imported correctly
- Each import statement must be complete: \`import { Foo, Bar } from 'package';\` — NEVER close with \`} from 'lucide-react';\` and then list more symbols (BarChart, Pie, etc.) without a new \`import {\` line (causes TS1109 Expression expected)
- When using both lucide-react and recharts (or any two packages), write TWO separate import blocks — one per package`

export const GENERATED_APP_COMPONENT_FILES_GUIDANCE = `Component files (CRITICAL — pages import components that MUST exist in files[]):

Generation order (follow every time):
1. List every route/page you will create and every @/components/* name each file will import
2. Add components/<Name>.tsx to files[] for EACH import — full UI, not a stub
3. Then write app/**/page.tsx and app/layout.tsx that import those components

Hard rules:
- NEVER emit \`import Navbar from '@/components/Navbar'\` unless components/Navbar.tsx is in files[] with complete JSX
- app/layout.tsx importing Navbar/Footer/AppShell → generate components/Navbar.tsx, components/Footer.tsx, etc. in the same response
- Interactive routes: thin app/<route>/page.tsx (server) + components/<Name>Client.tsx with "use client" (forms, useState, onClick)
- Reuse one component across routes (e.g. ServicePageClient for grooming and veterinary) → ONE file components/ServicePageClient.tsx
- Export style must match imports: default export if page uses \`import Foo from '@/components/Foo'\`; named export if \`import { Foo } from '@/components/Foo'\`
- Layout chrome (nav, footer, shell) are real components — never skip them to save files

Multi-page / marketing sites:
- A site with login, register, profile, services, store, contact needs ~8–15 component files — budget for them
- Reuse generic components (PageHero, ServicePageClient, Section) instead of unique missing imports per page
- If you cannot fit every component within the file limit, reduce the number of routes — never leave imports dangling

Self-check before submitting JSON:
- Scan every file for @/ imports
- For each @/components/X, confirm components/X.tsx (or .ts) exists in files[]
- For each @/lib/* import, confirm that lib file exists
- If validation would say "Missing file for import @/components/X", ADD components/X.tsx — do not remove the import`

export const GENERATED_APP_PAGE_CLIENT_CONTRACT_GUIDANCE = `Page ↔ Client contract (CRITICAL — prevents TS2322 / TS2305 / TS2739):

Generation order (strict):
1. lib/types.ts — all DTOs (UserData, TaskData, CategoryData, DashboardStats, etc.)
2. lib/actions.ts — export every get*/create*/update* function pages will import
3. components/<Name>Client.tsx — declare \`interface <Name>ClientProps { ... }\` FIRST, then the component destructuring those exact field names
4. app/**/page.tsx — thin server pages that fetch via actions and pass props using the SAME names as step 3

Hard rules:
- Prop names on the page JSX MUST exactly match fields in the Client's Props interface (categories not initialCategories, tasks not initialTasks, user not currentUser unless both sides use currentUser)
- Include EVERY prop the page passes — if the page renders \`<DashboardClient executions={executions} hasApiKey={hasApiKey} />\`, DashboardClientProps MUST declare executions AND hasApiKey with correct types
- NEVER use \`unknown\` or \`unknown[]\` for props that are rendered in JSX or iterated with \`.map()\` — import concrete types from lib/types.ts (AgentField, AgentExecution, TaskData, etc.) with string ids for keys and string labels/values for display
- AgentClient / agent pages: lib/types.ts MUST export field and execution shapes BEFORE writing components/AgentClient.tsx — props like \`agent\`, \`fields\`, \`executions\` use those interfaces, not unknown
- When adding or renaming a prop, update the page AND the Client component in the same response
- getAuthUser() returns JwtPayload { id, name, email, role } — for profile pages needing UserData, call getUserById(auth.id) from lib/actions.ts and pass that
- AppShell/layout: if AppShellProps requires \`user\`, the layout MUST pass \`user={await getAuthUser()}\` (or fetched UserData)
- Never import a function from @/lib/actions unless you also export it from lib/actions.ts in the same batch
- Prisma enum fields (TaskStatus, Priority): type props and useState as the enum union from lib/types.ts, not bare string`

export const GENERATED_APP_JSX_GUIDANCE = `JSX and TSX syntax (zero TS1005 / TS17008 errors):
- TS1005 "'>' expected" almost always means broken JSX or a line break before JSX — fix the syntax, do not leave the file half-edited
- When returning JSX, use \`return (\` on the SAME line as the opening tag, or put the opening \`<\` immediately after \`return\` — NEVER put a newline between \`return\` and \`<\` (ASI makes TypeScript parse \`<\` as less-than, causing TS1005)
- Every JSX tag must be properly closed: \`<div>...</div>\`, \`<input />\`, \`<Component />\` — no stray \`<\` or half-written tags
- "use client" MUST be the very first line of Client component files (before imports), exactly: \`"use client"\` with double quotes
- Each \`import\` / \`import type\` must be a complete statement on one or valid multi-line form ending with \`from '...'\` — never leave \`import type { UserData }\` without a \`from '@/lib/types'\` clause
- TS1109 "Expression expected" after imports often means a split import: specifiers listed after \`} from 'other-package';\` without \`import {\` — fix by adding a separate import block per package
- Props interfaces belong OUTSIDE the component function — define \`interface SettingsClientProps { ... }\` then \`export default function SettingsClient({ user }: SettingsClientProps) { return ( <div>...</div> ) }\`
- In .tsx files, wrap multiline JSX in parentheses: \`return (\n  <div>...</div>\n)\`
- Do not use TypeScript generics with a bare \`<T>\` at the start of a line in .tsx without a trailing comma (\`<T,>\`) — prefer explicit prop interfaces instead of inline generic components
- App Router: NEVER import from \`next/document\` in app/** — no \`Html\`, \`Head\`, \`Main\`, or \`NextScript\`; only app/layout.tsx renders \`<html>\` and \`<body>\`; app/not-found.tsx uses a simple \`<div>\` or \`<main>\` layout`

export const GENERATED_APP_APP_ROUTER_DOCUMENT_GUIDANCE = `App Router document shell (CRITICAL — next build fails prerendering /404 if violated):
- App Router ONLY — \`next/document\` (\`Html\`, \`Head\`, \`Main\`, \`NextScript\`) is forbidden in every file (app/**, components/**, lib/**)
- FORBIDDEN: \`import { Html, Head, Main, NextScript } from 'next/document'\`; PascalCase JSX \`<Html>\`, \`<Head>\`, \`<Main>\`, \`<NextScript>\` — including tags without an import line
- ONLY app/layout.tsx may render \`<html lang="en">\` and \`<body>\` (lowercase native elements + next/font + Tailwind)
- app/not-found.tsx is prerendered as /404 — it MUST NOT import next/document and MUST NOT wrap content in \`<html>\`, \`<body>\`, or \`<Html>\`
- app/error.tsx and any component imported by not-found/error routes must follow the same rule
- Build errors "Html should not be imported outside of pages/_document" and "Error occurred prerendering page \\"/404\\"" mean rewrite app/not-found.tsx entirely (and fix any shared component still using Html/Head/Main/NextScript) — partial import removal is not enough

Canonical app/not-found.tsx (use this structure; customize copy/classes only):
export default function NotFound() {
  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center px-4">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">The page you requested does not exist.</p>
    </main>
  )
}

Canonical app/error.tsx ("use client" MUST be first line; plain markup only — no html/body shell):
"use client"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center px-4">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <button type="button" className="mt-4 rounded px-4 py-2" onClick={() => reset()}>
        Try again
      </button>
    </main>
  )
}`

export const GENERATED_APP_STYLING_GUIDANCE = `Fonts and CSS:
- NEVER use @import url('https://fonts.googleapis.com/...') or any external font CDN URL in .css files
- NEVER add <link rel="stylesheet" href="https://fonts.googleapis.com/..."> in layout or components
- Load fonts ONLY with next/font/google in app/layout.tsx (e.g. Inter from 'next/font/google'), export const inter = Inter({ subsets: ['latin'] }), apply inter.className on <body>
- Reference the font via Tailwind (font-sans on body) or CSS variables from next/font — not remote @import`

export const GENERATED_APP_AUTH_GUIDANCE = `Authentication and session (database apps — no browser storage):
- NEVER call localStorage.setItem or sessionStorage.setItem for user, token, session, or app data
- Load auth state with fetch('/api/auth/me') in Client layout/shell components; logout via fetch('/api/auth/logout', { method: 'POST' })
- Store credentials and sessions server-side (Prisma User model + cookies) — not in browser storage
- Dark mode and sidebar UI state: useState only — toggle document.documentElement.classList, do not write theme to localStorage
- lib/auth.ts is the ONLY auth module — it MUST export every symbol imported elsewhere: JwtPayload, signToken, verifyToken, getAuthUser
- lib/crypto.ts is the ONLY crypto module — it MUST export every symbol imported elsewhere: encrypt, decrypt, maskKey, encryptApiKey, decryptApiKey (TS2305 on maskKey means you imported it without exporting it from lib/crypto.ts)
- API routes MUST import auth helpers from @/lib/auth — if a route uses verifyToken or getAuthUser, lib/auth.ts MUST export that exact function (TS2305 means you added an import without exporting it from lib/auth.ts)
- Prefer getAuthUser() in API routes/pages; use verifyToken(token) only when reading a raw token string
- When lib/auth.ts imports jsonwebtoken, package.json MUST list jsonwebtoken in dependencies and @types/jsonwebtoken in devDependencies`

export const GENERATED_APP_PRISMA_ALIGNMENT_GUIDANCE = `Prisma schema ↔ actions ↔ types alignment (YOU must get this right — no post-processing fixes broken code):
- prisma/schema.prisma is the source of truth for Prisma field names
- Before writing lib/actions.ts, read every model field in schema.prisma — relations AND scalar FK columns
- include/select MUST use exact relation names from schema (if Task has \`assignee User?\` use include: { assignee: true }, NOT user; if Task has \`user User\` use user, NOT assignee)
- After prisma queries, access included relations with the SAME name: t.assignee when include has assignee, t.user when include has user — never mix
- Map to DTOs using lib/types.ts field names; if types say assigneeId/assignee, read t.assigneeId and t.assignee from Prisma results
- When schema uses assigneeId + assignee + creatorId + creator, do NOT use userId/user anywhere in actions or types
- When schema uses userId + user only, do NOT use assigneeId/assignee/creatorId/creator
- If you change prisma/schema.prisma, ALWAYS return updated lib/actions.ts AND lib/types.ts in the same response with matching field names
- Every scalar you read (u.avatar, c.icon, t.assigneeId) must exist on that model in schema.prisma
- DashboardStats and other aggregates: no spurious id field; shape must match the return object in getDashboardStats()`

export const GENERATED_APP_REFERENCE_PDF_GUIDANCE = `Reference design PDF provided (mockup, wireframe, or design spec):
- The attached PDF is the visual source of truth — read every page before generating code
- Match layout, color palette, typography, spacing, borders, shadows, component hierarchy, and visible copy exactly
- Extract theme tokens from the PDF: primary/secondary/accent colors, background, surface, text, muted text, border radius, and font families — define them in app/globals.css as CSS variables and wire through tailwind.config.ts (extend colors, fontFamily, borderRadius)
- For multi-page PDFs, implement each main screen shown — navigation, hero, cards, tables, forms, sidebars, charts, footers, and modals
- Use visible text from the PDF for headings, labels, button text, nav items, placeholders, and empty states where appropriate
- Do NOT substitute a generic Tailwind default theme when a PDF reference exists — the deployed app should look like the PDF
- If the PDF shows a dashboard or multi-page app, implement the corresponding routes and functional UI — wire data through Prisma when persistence is required`

/** @deprecated Use GENERATED_APP_REFERENCE_PDF_GUIDANCE */
export const GENERATED_APP_REFERENCE_IMAGE_GUIDANCE = GENERATED_APP_REFERENCE_PDF_GUIDANCE

export const GENERATED_APP_NEON_DATABASE_GUIDANCE = `Neon Postgres + Prisma (YOU generate all database files — Arena does not inject or patch schema/models):
- Generate prisma/schema.prisma with domain-specific models matching the app (User, Task, Category, etc.) — never rely on a generic Record placeholder
- Datasource block MUST be exactly:
  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }
  Do NOT add directUrl, DATABASE_URL_UNPOOLED, or DIRECT_URL — Vercel Neon injects DATABASE_URL only
- Generate lib/prisma.ts with the PrismaClient singleton (globalForPrisma pattern for dev hot reload)
- Generate .env.example with a single DATABASE_URL= placeholder (no UNPOOLED/DIRECT_URL lines)
- package.json must include @prisma/client (dependencies) and prisma (devDependencies); build script runs prisma generate && prisma db push before next build
- NEVER seed or pre-populate the database with dummy, demo, fake, sample, or placeholder data — no prisma/seed.ts, no db/seed.sql, no INSERT scripts, and no createMany/insert loops in lib/actions.ts or startup code unless the user explicitly asks for seed data
- Empty tables on first deploy are correct — real data comes from user signup, forms, and in-app CRUD only
- Server pages that import @/lib/actions or @/lib/prisma at module scope MUST include: export const dynamic = 'force-dynamic'
- lib/actions.ts queries MUST use exact field/relation names from your schema; lib/types.ts DTOs MUST match actions output
- On edit: read existing prisma/schema.prisma before changing models; return schema + lib/actions.ts + lib/types.ts together when models change`

export const GENERATED_APP_DATABASE_GUIDANCE = `Database (always required for Development block apps):
- ALWAYS set requiresDatabase to true — every generated app uses Neon Postgres + Prisma, even for marketing or portfolio sites
- NEVER use localStorage.setItem, sessionStorage.setItem, or browser storage to persist app data, users, sessions, or tokens — use Prisma server actions or app/api routes
- Auth and session state MUST use server-side storage (database + httpOnly cookies) and client fetch (e.g. fetch('/api/auth/me')) — NEVER localStorage.setItem('user', ...) or sessionStorage for login state
- AppShell, layout, and auth providers MUST load the current user via fetch('/api/auth/me') or server props — not from localStorage.getItem
- UI-only state (sidebar open, dark mode toggle) MUST use useState and document.documentElement.classList — do NOT persist theme or layout prefs to localStorage
- NEVER use localStorage, sessionStorage, or in-memory state to store app data between page loads — use Prisma server actions or API routes
- ALWAYS include:
  - prisma/schema.prisma with at least one model matching the app domain
  - lib/prisma.ts exporting a PrismaClient singleton (globalForPrisma pattern for dev hot reload)
  - package.json dependencies: @prisma/client; devDependencies: prisma
  - .env.example with DATABASE_URL placeholder only (no real credentials)
  - prisma/schema.prisma datasource MUST use only url = env("DATABASE_URL") — do NOT add directUrl (Vercel Neon injects DATABASE_URL on connect)
  - Server Actions or app/api routes that use prisma — never import prisma in client components
  - At least one Prisma model, even for simple sites (e.g. ContactSubmission, SiteSetting, or PageContent)
- On Vercel + Neon, DATABASE_URL is injected when the database is connected to the project — reference process.env only in server code
- package.json build script should run prisma generate and prisma db push before next build when using Prisma
- NEVER add dummy/demo/fake/sample rows to the database — schema + empty tables only; no seed files unless the user explicitly requests seed data
- ${GENERATED_APP_NEON_DATABASE_GUIDANCE}
- ${GENERATED_APP_PRISMA_ALIGNMENT_GUIDANCE}`

export const GENERATED_APP_DATABASE_EDIT_GUIDANCE = `Database edits (existing Neon Postgres — additive only):
- NEVER provision, replace, or reset the database connection — the app already has DATABASE_URL on Vercel
- When editing prisma/schema.prisma: preserve every existing model and field unless the user explicitly asks to remove or rename them
- ADD new models, fields, relations, and enums for new features; use optional fields (?) or defaults when extending existing models
- Do NOT drop tables, rename models in breaking ways, or replace the datasource block — prisma db push on deploy only adds schema changes
- Keep lib/prisma.ts and the existing DATABASE_URL / .env.example pattern unchanged unless fixing a bug
- New features must read/write through the same Prisma client against the existing database — never switch to localStorage or a new database
- NEVER insert dummy, demo, fake, or sample data into the database on edit — preserve existing user data; only add seed data when the user explicitly asks
- ${GENERATED_APP_NEON_DATABASE_GUIDANCE}
- ${GENERATED_APP_PRISMA_ALIGNMENT_GUIDANCE}
- MANDATORY on schema edits: return prisma/schema.prisma + lib/actions.ts + lib/types.ts together whenever any model/field/relation changes
- Read the provided lib/actions.ts and lib/types.ts in context before editing — extend their patterns, do not invent conflicting field names`

export const GENERATED_APP_DATABASE_FILE_PATHS = [
  'prisma/schema.prisma',
  'lib/prisma.ts',
] as const

const PINNED_PRISMA_VERSION = '^6.9.0'

export const GENERATED_APP_REPO_SUMMARY_PATH = 'REPO_SUMMARY.md' as const

export interface NormalizeGeneratedAppFilesOptions {
  requiresDatabase?: boolean
  appName?: string
  description?: string
  features?: string[]
  repoName?: string
  /** Latest user generate/edit request — recorded in REPO_SUMMARY.md. */
  latestUserRequest?: string
  /** Neon project id — recorded in REPO_SUMMARY.md for edit-time connection reuse. */
  neonProjectId?: string
}

export const GENERATED_APP_REPO_SUMMARY_GUIDANCE = `REPO_SUMMARY.md (required, auto-maintained):
- Living repository summary: purpose, features, tech stack, routes, API routes, Prisma models, components, and a complete file index
- Arena Development regenerates this file after generate and edit — do not omit it from new apps
- During edits, read REPO_SUMMARY.md first to understand architecture before changing code`

export const GENERATED_APP_README_GUIDANCE = `README.md (required):
- Include a clear project title, 1–2 sentence description, feature list, tech stack, local setup steps, and deploy notes
- Document \`npm install\`, \`npm run dev\`, and \`.env.example\` / DATABASE_URL when the app uses Prisma
- Keep it concise and accurate — no placeholder lorem ipsum`

const GOOGLE_FONTS_IMPORT_PATTERN =
  /@import\s+url\s*\(\s*['"]https:\/\/fonts\.googleapis\.com[^'"]*['"]\s*\)\s*;?/gi

const GOOGLE_FONTS_LINK_PATTERN =
  /<link[^>]*href\s*=\s*['"]https:\/\/fonts\.googleapis\.com[^'"]*['"][^>]*>\s*/gi

/**
 * Removes Google Fonts CDN @import and <link> tags from generated source.
 */
export function stripExternalGoogleFontReferences(content: string): string {
  const stripped = content
    .replace(GOOGLE_FONTS_IMPORT_PATTERN, '')
    .replace(GOOGLE_FONTS_LINK_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')

  return stripped.endsWith('\n') || stripped.length === 0 ? stripped : `${stripped}\n`
}

const SPLIT_IMPORT_PATTERN =
  /import\s*\{([\s\S]*?)\}\s*from\s*(['"][^'"]+['"])\s*;\s*((?:[ \t]*[A-Za-z_$][\w$]*\s*,?\s*\n)+)\}\s*from\s*(['"][^'"]+['"])\s*;/

/** Orphan specifiers after a closed import, missing `import {` before the next `} from`. */
const ORPHAN_IMPORT_SPECIFIERS_PATTERN =
  /(\}\s*from\s*(['"][^'"]+['"])\s*;\s*\n)((?:[ \t]*[A-Za-z_$][\w$]*\s*,?\s*\n)+)(\}\s*from\s*(['"][^'"]+['"])\s*;)/

/** Orphan specifiers at line start before `} from` with no `import {`. */
const LEADING_ORPHAN_IMPORT_PATTERN =
  /^((?:[ \t]*[A-Za-z_$][\w$]*\s*,?\s*\n)+)(\}\s*from\s*(['"][^'"]+['"])\s*;)/m

/**
 * Repairs LLM-split imports where specifiers for a second package appear after the first import closes.
 */
export function reconcileSplitImportStatements(content: string): string {
  let result = content
  let previous = ''

  while (previous !== result) {
    previous = result

    result = result.replace(
      SPLIT_IMPORT_PATTERN,
      (_match, firstSpecifiers, firstModule, orphanSpecifiers, secondModule) => {
        const first = String(firstSpecifiers).trim()
        const second = String(orphanSpecifiers).trim().replace(/,\s*$/, '')
        return `import {\n${first}\n} from ${firstModule};\nimport {\n${second}\n} from ${secondModule};`
      }
    )

    result = result.replace(
      ORPHAN_IMPORT_SPECIFIERS_PATTERN,
      (_match, firstClose, _firstModule, orphanSpecifiers, secondClose) => {
        const second = String(orphanSpecifiers).trim().replace(/,\s*$/, '')
        return `${firstClose}import {\n${second}\n${secondClose}`
      }
    )

    result = result.replace(
      LEADING_ORPHAN_IMPORT_PATTERN,
      (_match, orphanSpecifiers, secondClose) => {
        const second = String(orphanSpecifiers).trim().replace(/,\s*$/, '')
        return `import {\n${second}\n${secondClose}`
      }
    )
  }

  return result.endsWith('\n') || result.length === 0 ? result : `${result}\n`
}

/** Detects orphan import specifiers between two \`} from 'module';\` closers. */
export function hasOrphanImportBlock(content: string): boolean {
  return /(\}\s*from\s*(['"][^'"]+['"])\s*;\s*\n)((?:[ \t]*[A-Za-z_$][\w$]*\s*,?\s*\n)+)(\}\s*from\s*(['"][^'"]+['"])\s*;)/.test(
    content
  )
}

function shouldSanitizeFontReferences(path: string): boolean {
  return (
    path.endsWith('.css') ||
    path.endsWith('.tsx') ||
    path.endsWith('.ts') ||
    path.endsWith('.jsx') ||
    path.endsWith('.js')
  )
}

/**
 * Pins package.json to current Next.js/React and compatible tooling.
 */
export function patchPackageJsonContent(
  content: string,
  options: NormalizeGeneratedAppFilesOptions & { usedPackages?: Iterable<string> } = {}
): string {
  try {
    const pkg = JSON.parse(content) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      scripts?: Record<string, string>
    }

    pkg.dependencies = { ...pkg.dependencies, ...PINNED_DEPENDENCIES }
    pkg.devDependencies = { ...pkg.devDependencies, ...PINNED_DEV_DEPENDENCIES }

    for (const [dep, version] of Object.entries(REACT19_COMPAT_DEPENDENCY_OVERRIDES)) {
      if (pkg.dependencies?.[dep]) {
        pkg.dependencies[dep] = version
      }
    }

    if (options.usedPackages) {
      for (const usedPackage of options.usedPackages) {
        const version = AUTO_ADD_DEPENDENCIES[usedPackage]
        if (version) {
          pkg.dependencies = { ...pkg.dependencies, [usedPackage]: version }
        }
      }
    }

    if (options.requiresDatabase) {
      pkg.dependencies = {
        ...pkg.dependencies,
        '@prisma/client': PINNED_PRISMA_VERSION,
        ...AUTH_PACKAGE_DEPENDENCIES,
      }
      pkg.devDependencies = {
        ...pkg.devDependencies,
        prisma: PINNED_PRISMA_VERSION,
        ...AUTH_PACKAGE_DEV_DEPENDENCIES,
      }
      const existingBuild = pkg.scripts?.build ?? 'next build'
      const { postinstall: _removedPostinstall, ...remainingScripts } = pkg.scripts ?? {}
      const defaultDbBuild =
        'prisma generate && prisma db push && (npx prisma db execute --file db/seed.sql --schema prisma/schema.prisma 2>/dev/null || true) && (npx prisma db seed 2>/dev/null || true)'
      pkg.scripts = {
        ...remainingScripts,
        build: existingBuild.includes('prisma')
          ? existingBuild
          : `${defaultDbBuild} && ${existingBuild}`,
      }
    }

    return `${JSON.stringify(pkg, null, 2)}\n`
  } catch {
    return content
  }
}

const NEXT_CONFIG_ESLINT_BLOCK_PATTERN = /\s*eslint:\s*\{[\s\S]*?\},?\n?/g

/**
 * Removes the deprecated eslint block from next.config (invalid on Next.js 16+ NextConfig).
 */
export function patchNextConfigContent(content: string): string {
  return content.replace(NEXT_CONFIG_ESLINT_BLOCK_PATTERN, '\n').replace(/\n{3,}/g, '\n\n')
}

/**
 * Aligns tsconfig with Next 16 + strict TypeScript and the chosen app directory layout.
 */
export function patchTsconfigContent(content: string, useSrcDir: boolean): string {
  try {
    const tsconfig = JSON.parse(content) as {
      compilerOptions?: Record<string, unknown>
      include?: string[]
      exclude?: string[]
    }

    tsconfig.compilerOptions = {
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      plugins: [{ name: 'next' }],
      ...tsconfig.compilerOptions,
      paths: {
        '@/*': [useSrcDir ? './src/*' : './*'],
      },
    }

    tsconfig.include = tsconfig.include ?? [
      'next-env.d.ts',
      '**/*.ts',
      '**/*.tsx',
      '.next/types/**/*.ts',
    ]
    const defaultExclude = ['node_modules', 'tailwind.config.ts', 'postcss.config.mjs']
    tsconfig.exclude = [...new Set([...(tsconfig.exclude ?? []), ...defaultExclude])]

    return `${JSON.stringify(tsconfig, null, 2)}\n`
  } catch {
    return content
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function projectUsesSrcAppDir(files: GeneratedAppFile[]): boolean {
  return files.some((file) => normalizePath(file.path).startsWith('src/app/'))
}

const ALIAS_IMPORT_PATTERNS = [
  /from\s+['"]@\/([^'"]+)['"]/g,
  /import\s*\(\s*['"]@\/([^'"]+)['"]\s*\)/g,
  /import\s+['"]@\/([^'"]+)['"]/g,
]

function isComponentAliasPath(importPath: string): boolean {
  return (
    importPath.startsWith('components/') ||
    /^components\//.test(importPath) ||
    importPath.split('/').pop()?.match(/^[A-Z]/) !== null
  )
}

function resolveAliasToCandidatePaths(importPath: string, useSrcDir: boolean): string[] {
  const prefix = useSrcDir ? 'src/' : ''
  const base = `${prefix}${importPath.replace(/\/$/, '')}`
  const componentCandidates = [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]
  const moduleCandidates = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]

  if (
    importPath.startsWith('lib/') ||
    importPath.startsWith('hooks/') ||
    importPath.startsWith('utils/') ||
    importPath.startsWith('types/')
  ) {
    return moduleCandidates
  }

  return isComponentAliasPath(importPath) ? componentCandidates : moduleCandidates
}

function collectAliasImportsFromSource(content: string): string[] {
  const imports: string[] = []
  for (const pattern of ALIAS_IMPORT_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) {
        imports.push(match[1])
      }
    }
  }
  return imports
}

function toComponentName(filePath: string): string {
  const base = filePath.split('/').pop() ?? 'Component'
  const withoutExt = base.replace(/\.(tsx|ts|jsx|js)$/, '') || 'Component'
  return withoutExt
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/**
 * Collects external npm package names imported across generated source files.
 */
export function collectUsedNpmPackageNames(files: GeneratedAppFile[]): Set<string> {
  const packages = new Set<string>()
  const patterns = [/from\s+['"]([^'"]+)['"]/g, /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g]

  for (const file of files) {
    if (!/\.(tsx|ts|jsx|js|mjs|cjs)$/.test(file.path)) {
      continue
    }

    for (const pattern of patterns) {
      for (const match of file.content.matchAll(pattern)) {
        const spec = match[1]
        if (!spec || spec.startsWith('.') || spec.startsWith('@/')) {
          continue
        }

        const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
        packages.add(pkg)
      }
    }
  }

  return packages
}

/**
 * Returns field names declared on a component's Props interface, if present.
 */
export function extractComponentPropsInterfaceFields(
  content: string,
  componentName: string
): string[] {
  const propsTypeName = `${componentName}Props`
  const interfacePattern = new RegExp(`interface\\s+${propsTypeName}\\s*\\{([^}]*)\\}`, 's')
  const interfaceMatch = interfacePattern.exec(content)
  if (!interfaceMatch?.[1]) {
    return []
  }

  const fields: string[] = []
  for (const line of interfaceMatch[1].split('\n')) {
    const fieldMatch = /^\s*(\w+)(\?)?:/.exec(line)
    if (fieldMatch?.[1]) {
      fields.push(fieldMatch[1])
    }
  }

  return fields
}

/**
 * Collects attribute strings from opening JSX tags, skipping `>` inside strings or braces.
 */
function collectOpeningTagAttributeStrings(
  content: string,
  componentName: string
): Array<{ attrs: string; selfClosing: boolean }> {
  const attributeStrings: Array<{ attrs: string; selfClosing: boolean }> = []
  const tagStart = new RegExp(`<${componentName}(?=[\\s/>])`, 'g')

  for (const match of content.matchAll(tagStart)) {
    const startIndex = (match.index ?? 0) + match[0].length
    let index = startIndex
    let braceDepth = 0
    let inString: '"' | "'" | null = null
    let escaped = false

    while (index < content.length) {
      const char = content[index]

      if (inString) {
        if (escaped) {
          escaped = false
          index += 1
          continue
        }
        if (char === '\\') {
          escaped = true
          index += 1
          continue
        }
        if (char === inString) {
          inString = null
        }
        index += 1
        continue
      }

      if (char === '"' || char === "'") {
        inString = char
        index += 1
        continue
      }

      if (char === '{') {
        braceDepth += 1
        index += 1
        continue
      }

      if (char === '}') {
        braceDepth = Math.max(0, braceDepth - 1)
        index += 1
        continue
      }

      if (char === '>' && braceDepth === 0) {
        const rawAttrs = content.slice(startIndex, index)
        attributeStrings.push({
          attrs: rawAttrs.replace(/\/\s*$/, ''),
          selfClosing: /\/\s*$/.test(rawAttrs),
        })
        break
      }

      index += 1
    }
  }

  return attributeStrings
}

/**
 * Extracts JSX attribute names from an opening tag's attribute string.
 * Ignores words inside quoted values and braced expressions so message copy
 * like message="Are you sure..." is not mistaken for boolean props.
 */
export function extractJsxAttributeNames(attrs: string): string[] {
  const names: string[] = []
  let index = 0

  const skipWhitespace = (): void => {
    while (index < attrs.length && /\s/.test(attrs[index] ?? '')) {
      index += 1
    }
  }

  const skipQuoted = (quote: '"' | "'"): void => {
    index += 1
    while (index < attrs.length) {
      const char = attrs[index]
      if (char === '\\') {
        index += 2
        continue
      }
      if (char === quote) {
        index += 1
        return
      }
      index += 1
    }
  }

  const skipBracedExpression = (): void => {
    let depth = 0
    while (index < attrs.length) {
      const char = attrs[index]
      if (char === '{') {
        depth += 1
      } else if (char === '}') {
        depth -= 1
        index += 1
        if (depth === 0) {
          return
        }
        continue
      } else if (char === '"' || char === "'") {
        skipQuoted(char)
        continue
      }
      index += 1
    }
  }

  while (index < attrs.length) {
    skipWhitespace()
    if (index >= attrs.length) {
      break
    }

    if (attrs[index] === '{') {
      skipBracedExpression()
      continue
    }

    const nameMatch = /^[\w$]+/.exec(attrs.slice(index))
    if (!nameMatch) {
      index += 1
      continue
    }

    const name = nameMatch[0]
    index += name.length

    if (index < attrs.length && attrs[index] === '=') {
      index += 1
      skipWhitespace()
      const valueStart = attrs[index]
      if (valueStart === '"') {
        skipQuoted('"')
      } else if (valueStart === "'") {
        skipQuoted("'")
      } else if (valueStart === '{') {
        skipBracedExpression()
      }
      names.push(name)
      continue
    }

    names.push(name)
  }

  return names
}

export function collectJsxPropNamesForComponent(
  componentName: string,
  files: GeneratedAppFile[]
): string[] {
  const propNames = new Set<string>()
  const closingTagPattern = new RegExp(`</${componentName}>`)
  const ignoredProps = new Set(['className', 'key', 'ref'])

  for (const file of files) {
    if (!/\.(tsx|jsx)$/.test(file.path)) {
      continue
    }

    const openingTags = collectOpeningTagAttributeStrings(file.content, componentName)
    const hasClosingTag = closingTagPattern.test(file.content)

    for (const { attrs, selfClosing } of openingTags) {
      if (!selfClosing && hasClosingTag) {
        propNames.add('children')
      }

      for (const propName of extractJsxAttributeNames(attrs)) {
        if (!ignoredProps.has(propName)) {
          propNames.add(propName)
        }
      }
    }
  }

  return [...propNames].sort()
}

/**
 * Infers prop types for a component by matching page data fetching to lib/actions return types.
 */
export function inferComponentPropTypes(
  componentName: string,
  propNames: string[],
  files: GeneratedAppFile[]
): Record<string, string> {
  const types: Record<string, string> = {}
  const actionsContent = files.find((file) => file.path === 'lib/actions.ts')?.content ?? ''

  for (const file of files) {
    if (!/\.tsx$/.test(file.path) || !file.content.includes(`<${componentName}`)) {
      continue
    }

    for (const propName of propNames) {
      if (types[propName]) {
        continue
      }

      const usagePattern = new RegExp(
        `const\\s+(\\w+)\\s*=\\s*await\\s+(get\\w+)\\(\\)[\\s\\S]*?<${componentName}[\\s\\S]*?${propName}=\\{\\1\\}`,
        'm'
      )
      const usageMatch = usagePattern.exec(file.content)
      if (!usageMatch) {
        continue
      }

      const getterName = usageMatch[2]
      const returnTypePattern = new RegExp(
        `export\\s+async\\s+function\\s+${getterName}\\s*\\([^)]*\\)\\s*:\\s*Promise<([^>]+)>`
      )
      const returnTypeMatch = returnTypePattern.exec(actionsContent)
      if (returnTypeMatch?.[1]) {
        types[propName] = returnTypeMatch[1].trim()
      }
    }
  }

  for (const propName of propNames) {
    if (types[propName]) {
      continue
    }
    types[propName] = propName === 'children' ? 'ReactNode' : 'unknown'
  }

  return types
}

const REACT_BUILTIN_TYPES = new Set([
  'ReactNode',
  'ReactElement',
  'ComponentProps',
  'HTMLAttributes',
  'CSSProperties',
])

function parseNamedImportBinding(imports: string): string[] {
  return imports
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^type\s+/, '').trim())
}

function dedupeDuplicateImportLines(content: string): string {
  const seen = new Set<string>()
  const lines = content.split('\n')
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^import\s+(type\s+)?\{/.test(trimmed)) {
      const normalized = trimmed.replace(/from\s+["']/g, "from '").replace(/["']\s*;?\s*$/, "'")
      if (seen.has(normalized)) {
        continue
      }
      seen.add(normalized)
    }
    result.push(line)
  }

  return result.join('\n')
}

/**
 * Collapses duplicate ReactNode imports and removes React built-ins from @/lib/actions imports.
 */
export function sanitizeComponentFileImports(content: string): string {
  let result = dedupeDuplicateImportLines(content)

  result = result.replace(
    /^import\s+type\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/actions['"]\s*;?\s*$/gm,
    (_match, imports: string) => {
      const names = parseNamedImportBinding(imports).filter((name) => !REACT_BUILTIN_TYPES.has(name))
      if (names.length === 0) {
        return ''
      }
      return `import type { ${names.join(', ')} } from '@/lib/actions'`
    }
  )

  const lines = result.split('\n')
  const mergedReactTypes = new Set<string>()
  const passthroughLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    const reactTypeImport = trimmed.match(/^import\s+type\s*\{([^}]*)\}\s*from\s*['"]react['"]/)
    if (reactTypeImport) {
      for (const name of parseNamedImportBinding(reactTypeImport[1])) {
        mergedReactTypes.add(name)
      }
      continue
    }
    passthroughLines.push(line)
  }

  if (mergedReactTypes.size === 0) {
    return result.replace(/\n{3,}/g, '\n\n').trimEnd()
  }

  const mergedImport = `import type { ${[...mergedReactTypes].sort().join(', ')} } from 'react'`
  const output: string[] = []
  let mergedInserted = false

  for (let index = 0; index < passthroughLines.length; index += 1) {
    const line = passthroughLines[index]
    const trimmed = line.trim()

    if (!mergedInserted && trimmed && !trimmed.startsWith('import ') && trimmed !== "'use client'") {
      output.push(mergedImport)
      mergedInserted = true
    }

    output.push(line)

    if (!mergedInserted && trimmed === "'use client'") {
      const nextLine = passthroughLines[index + 1]?.trim() ?? ''
      if (nextLine && !nextLine.startsWith('import ')) {
        output.push('')
        output.push(mergedImport)
        mergedInserted = true
      }
    }
  }

  if (!mergedInserted) {
    if (output[0]?.trim() === "'use client'") {
      output.splice(1, 0, '', mergedImport)
    } else {
      output.unshift(mergedImport)
    }
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

/**
 * Marks database-backed pages as dynamic so builds do not require live DB at compile time.
 */
export function ensureDatabasePagesAreDynamic(files: GeneratedAppFile[]): GeneratedAppFile[] {
  const dynamicExport = "export const dynamic = 'force-dynamic'\n"

  return files.map((file) => {
    const path = normalizePath(file.path)
    if (path !== 'app/page.tsx' && !/^app\/[^/]+\/page\.tsx$/.test(path)) {
      return file
    }
    if (file.content.includes('export const dynamic')) {
      return file
    }
    if (
      !file.content.includes("@/lib/actions") &&
      !file.content.includes("from '@/lib/prisma'") &&
      !file.content.includes('from "@/lib/prisma"')
    ) {
      return file
    }

    const importEnd = file.content.lastIndexOf('\nimport ')
    const metadataIdx = file.content.indexOf('export const metadata')
    const insertAt =
      metadataIdx >= 0 ? metadataIdx : importEnd >= 0 ? file.content.indexOf('\n', importEnd) + 1 : 0

    return {
      ...file,
      content: `${file.content.slice(0, insertAt)}${dynamicExport}${file.content.slice(insertAt)}`,
    }
  })
}

const DEFAULT_NEXT_ENV_DTS = `/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
`

function isAutoGeneratedStubContent(content: string): boolean {
  return content.includes('Auto-generated stub so @/ imports resolve')
}

/**
 * Removes erroneous TSX stubs under lib/ that shadow real .ts modules.
 */
export function removeConflictingModuleStubs(files: GeneratedAppFile[]): GeneratedAppFile[] {
  const normalized = files.map((file) => ({ ...file, path: normalizePath(file.path) }))
  const pathSet = new Set(normalized.map((file) => file.path))

  return normalized.filter((file) => {
    if (!/^lib\/[^/]+\.tsx$/.test(file.path) || !isAutoGeneratedStubContent(file.content)) {
      return true
    }

    const tsPath = file.path.replace(/\.tsx$/, '.ts')
    if (pathSet.has(tsPath)) {
      logger.warn('Removed conflicting lib TSX stub', { tsxPath: file.path, tsPath })
      return false
    }

    logger.warn('Removed invalid lib TSX stub (lib modules must be .ts)', { path: file.path })
    return false
  })
}

function readPackageName(files: GeneratedAppFile[]): string | undefined {
  const packageFile = files.find((file) => normalizePath(file.path) === 'package.json')
  if (!packageFile) {
    return undefined
  }

  try {
    const pkg = JSON.parse(packageFile.content) as { name?: string }
    return pkg.name?.trim() || undefined
  } catch {
    return undefined
  }
}

function pagePathToRoute(pagePath: string): string | undefined {
  const path = normalizePath(pagePath)
  if (path === 'app/page.tsx') {
    return '/'
  }

  const match = path.match(/^app\/(.+)\/page\.tsx$/)
  if (!match?.[1]) {
    return undefined
  }

  const routeSegments = match[1]
    .split('/')
    .map((segment) => (segment.startsWith('[') && segment.endsWith(']') ? `:${segment.slice(1, -1)}` : segment))
    .join('/')

  return `/${routeSegments}`
}

function collectAppRoutes(files: GeneratedAppFile[]): string[] {
  const routes = new Set<string>()

  for (const file of files) {
    const route = pagePathToRoute(file.path)
    if (route) {
      routes.add(route)
    }
  }

  return [...routes].sort()
}

function collectAppRouteEntries(
  files: GeneratedAppFile[]
): Array<{ route: string; file: string }> {
  const entries: Array<{ route: string; file: string }> = []

  for (const file of files) {
    const path = normalizePath(file.path)
    const route = pagePathToRoute(path)
    if (route) {
      entries.push({ route, file: path })
    }
  }

  return entries.sort((left, right) => left.route.localeCompare(right.route))
}

function extractPrismaModels(files: GeneratedAppFile[]): string[] {
  const schemaFile = files.find((file) => normalizePath(file.path) === 'prisma/schema.prisma')
  if (!schemaFile) {
    return []
  }

  return [...schemaFile.content.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1])
}

function groupFilePaths(paths: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {
    'App pages': [],
    'API routes': [],
    Components: [],
    Libraries: [],
    Config: [],
    Other: [],
  }

  for (const path of paths) {
    if (path.startsWith('app/api/')) {
      groups['API routes'].push(path)
    } else if (path.startsWith('app/')) {
      groups['App pages'].push(path)
    } else if (path.startsWith('components/')) {
      groups.Components.push(path)
    } else if (path.startsWith('lib/') || path.startsWith('prisma/')) {
      groups.Libraries.push(path)
    } else if (
      path.endsWith('.json') ||
      path.endsWith('.ts') ||
      path.endsWith('.mjs') ||
      path === '.env.example' ||
      path === '.gitignore'
    ) {
      groups.Config.push(path)
    } else {
      groups.Other.push(path)
    }
  }

  for (const key of Object.keys(groups)) {
    groups[key].sort()
  }

  return groups
}

function isMinimalReadme(content: string): boolean {
  const trimmed = content.trim()
  if (trimmed.length < 120) {
    return true
  }

  return /^#\s+.+\n*$/.test(trimmed) && !trimmed.includes('##')
}

/**
 * Builds a standard README for generated Next.js apps.
 */
export function buildReadmeContent(
  files: GeneratedAppFile[],
  options: NormalizeGeneratedAppFilesOptions = {}
): string {
  const appName =
    options.appName?.trim() ||
    options.repoName?.trim() ||
    readPackageName(files)?.replace(/-/g, ' ') ||
    'Generated App'
  const description =
    options.description?.trim() ||
    `${appName} — a Next.js app generated with Sim Development.`
  const features =
    options.features && options.features.length > 0
      ? options.features
      : ['Responsive UI with Tailwind CSS', 'Next.js App Router pages and components']
  const routes = collectAppRoutes(files)

  const techStack = [
    `Next.js ${PINNED_NEXT_VERSION} (App Router)`,
    `React ${PINNED_REACT_VERSION}`,
    'Tailwind CSS v3',
    'TypeScript',
  ]
  if (options.requiresDatabase) {
    techStack.push('Prisma + PostgreSQL (Neon on Vercel)')
  }

  const routesSection =
    routes.length > 0
      ? `\n## Routes\n\n${routes.map((route) => `- \`${route}\``).join('\n')}\n`
      : ''

  const databaseSection = options.requiresDatabase
    ? `\n## Database\n\n1. Copy \`.env.example\` to \`.env\` for local development\n2. Set \`DATABASE_URL\` to your Postgres connection string\n3. Run \`npx prisma db push\` before \`npm run dev\` if tables are missing\n\nOn Vercel, \`DATABASE_URL\` is injected when Neon is connected to the project.\n`
    : ''

  return `# ${appName}

${description}

## Features

${features.map((feature) => `- ${feature}`).join('\n')}

## Tech Stack

${techStack.map((item) => `- ${item}`).join('\n')}
${routesSection}
## Getting Started

\`\`\`bash
npm install
cp .env.example .env
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000).
${databaseSection}
## Scripts

- \`npm run dev\` — start the development server
- \`npm run build\` — production build (runs Prisma generate/push when configured)
- \`npm run start\` — run the production server locally

## Deploy

This project is intended for deployment on [Vercel](https://vercel.com). Connect the GitHub repository and deploy the \`main\` branch.
`
}

/**
 * Ensures README.md exists with useful project documentation.
 */
export function ensureReadmeFile(
  files: GeneratedAppFile[],
  options: NormalizeGeneratedAppFilesOptions = {}
): GeneratedAppFile[] {
  const readmeContent = buildReadmeContent(files, options)
  const readmeIndex = files.findIndex((file) => normalizePath(file.path) === 'README.md')

  if (readmeIndex < 0) {
    logger.warn('Added README.md for generated app')
    return [...files, { path: 'README.md', content: readmeContent }]
  }

  if (isMinimalReadme(files[readmeIndex].content)) {
    logger.warn('Replaced minimal README.md with scaffolded documentation')
    const updated = [...files]
    updated[readmeIndex] = { ...files[readmeIndex], content: readmeContent }
    return updated
  }

  return files
}

/**
 * Builds a living repository summary used as the primary edit reference.
 */
export function buildRepoSummaryContent(
  files: GeneratedAppFile[],
  options: NormalizeGeneratedAppFilesOptions = {}
): string {
  const appName =
    options.appName?.trim() ||
    options.repoName?.trim() ||
    readPackageName(files)?.replace(/-/g, ' ') ||
    'Generated App'
  const description =
    options.description?.trim() ||
    `${appName} — a Next.js app generated with Sim Development.`
  const features =
    options.features && options.features.length > 0
      ? options.features
      : ['Responsive UI with Tailwind CSS', 'Next.js App Router pages and components']
  const routeEntries = collectAppRouteEntries(files)
  const prismaModels = extractPrismaModels(files)
  const paths = files.map((file) => normalizePath(file.path)).sort()
  const groupedPaths = groupFilePaths(paths)
  const updatedAt = new Date().toISOString()

  const techStack = [
    `Next.js ${PINNED_NEXT_VERSION} (App Router)`,
    `React ${PINNED_REACT_VERSION}`,
    'Tailwind CSS v3',
    'TypeScript',
  ]
  if (options.requiresDatabase) {
    techStack.push('Prisma + PostgreSQL (Neon on Vercel)')
  }

  const infrastructureSection =
    options.neonProjectId?.trim() || options.requiresDatabase
      ? `\n## Infrastructure\n\n${
          options.neonProjectId?.trim()
            ? `- **Neon project ID:** \`${options.neonProjectId.trim()}\` — managed by Sim Development; do not delete or replace\n`
            : ''
        }- **DATABASE_URL:** set on Vercel when Neon is connected — do not commit real credentials\n`
      : ''

  const routesSection =
    routeEntries.length > 0
      ? `\n## Routes & Pages\n\n${routeEntries.map((entry) => `- \`${entry.route}\` — \`${entry.file}\``).join('\n')}\n`
      : ''

  const databaseSection =
    options.requiresDatabase && prismaModels.length > 0
      ? `\n## Database Models\n\n${prismaModels.map((model) => `- \`${model}\``).join('\n')}\n`
      : options.requiresDatabase
        ? '\n## Database\n\n- Prisma + PostgreSQL (`DATABASE_URL`)\n'
        : ''

  const inventorySections = Object.entries(groupedPaths)
    .filter(([, groupPaths]) => groupPaths.length > 0)
    .map(([label, groupPaths]) => `### ${label}\n\n${groupPaths.map((path) => `- \`${path}\``).join('\n')}`)
    .join('\n\n')

  const latestChangeSection = options.latestUserRequest?.trim()
    ? `\n## Latest Change\n\n- **Updated at:** ${updatedAt}\n- **Request:** ${options.latestUserRequest.trim()}\n`
    : ''

  return `# Repository Summary: ${appName}

> Auto-maintained by Sim Development. Last updated: ${updatedAt}.

## Overview

${description}

**Repository:** \`${options.repoName ?? readPackageName(files) ?? 'unknown'}\`  
**File count:** ${paths.length}

## Features

${features.map((feature) => `- ${feature}`).join('\n')}

## Tech Stack

${techStack.map((item) => `- ${item}`).join('\n')}
${infrastructureSection}${routesSection}${databaseSection}
## File Inventory

${inventorySections}

## Complete File Index

${paths.map((path) => `- \`${path}\``).join('\n')}
${latestChangeSection}`
}

/**
 * Ensures REPO_SUMMARY.md exists and reflects the current repository state.
 */
export function ensureRepoSummaryFile(
  files: GeneratedAppFile[],
  options: NormalizeGeneratedAppFilesOptions = {}
): GeneratedAppFile[] {
  const summaryContent = buildRepoSummaryContent(files, options)
  const summaryIndex = files.findIndex(
    (file) => normalizePath(file.path) === GENERATED_APP_REPO_SUMMARY_PATH
  )

  if (summaryIndex < 0) {
    logger.warn('Added REPO_SUMMARY.md for generated app')
    return [...files, { path: GENERATED_APP_REPO_SUMMARY_PATH, content: summaryContent }]
  }

  const updated = [...files]
  updated[summaryIndex] = { ...files[summaryIndex], content: summaryContent }
  return updated
}

/**
 * Ensures next-env.d.ts exists so JSX and Next.js types resolve during tsc.
 */
export function ensureNextEnvFile(files: GeneratedAppFile[]): GeneratedAppFile[] {
  const hasNextEnv = files.some((file) => normalizePath(file.path) === 'next-env.d.ts')
  if (hasNextEnv) {
    return files
  }

  return [...files, { path: 'next-env.d.ts', content: DEFAULT_NEXT_ENV_DTS }]
}

/**
 * Normalizes generated files for reliable local and Vercel builds.
 * Only config pinning, scaffolding (README, REPO_SUMMARY, next-env.d.ts), and package.json deps run here.
 * Import/export correctness, types, auth, Client props, and JSX must come from the LLM system prompt.
 */
export function normalizeGeneratedAppFiles(
  files: GeneratedAppFile[],
  options: NormalizeGeneratedAppFilesOptions = {}
): GeneratedAppFile[] {
  const useSrcDir = projectUsesSrcAppDir(files)

  const patched = files.map((file) => {
    const path = normalizePath(file.path)

    if (path === 'package.json' || path.endsWith('/package.json')) {
      return { ...file, content: patchPackageJsonContent(file.content, options) }
    }

    if (path === 'next.config.ts' || path === 'next.config.mjs' || path === 'next.config.js') {
      return { ...file, content: patchNextConfigContent(file.content) }
    }

    if (path === 'tsconfig.json' || path.endsWith('/tsconfig.json')) {
      return { ...file, content: patchTsconfigContent(file.content, useSrcDir) }
    }

    if (shouldSanitizeFontReferences(path)) {
      return { ...file, content: stripExternalGoogleFontReferences(file.content) }
    }

    return file
  })

  const withNextEnv = ensureNextEnvFile(patched)
  const withReadme = ensureReadmeFile(withNextEnv, options)
  const withRepoSummary = ensureRepoSummaryFile(withReadme, options)
  const usedPackages = collectUsedNpmPackageNames(withRepoSummary)

  return withRepoSummary.map((file) => {
    if (normalizePath(file.path) !== 'package.json') {
      return file
    }

    return {
      ...file,
      content: patchPackageJsonContent(file.content, { ...options, usedPackages }),
    }
  })
}
