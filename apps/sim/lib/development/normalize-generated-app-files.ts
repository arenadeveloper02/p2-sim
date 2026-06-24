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

export const GENERATED_APP_DEPENDENCY_GUIDANCE = `package.json MUST pin these exact versions:
- "next": "${PINNED_NEXT_VERSION}"
- "react": "${PINNED_REACT_VERSION}"
- "react-dom": "${PINNED_REACT_VERSION}"
- devDependencies: typescript ^5.8, @types/node ^22, @types/react ^19, @types/react-dom ^19, tailwindcss ^3.4.17, postcss ^8, autoprefixer ^10, eslint ^9, eslint-config-next ${PINNED_NEXT_VERSION}
Use Tailwind CSS v3 only (tailwind.config.ts + postcss.config.mjs with tailwindcss and autoprefixer). Do NOT use Tailwind v4-only setup.
next.config.ts MUST NOT include an eslint property (removed in Next.js 16 — builds no longer run ESLint from next.config)`

export const GENERATED_APP_TYPESCRIPT_GUIDANCE = `TypeScript and Next.js structure (zero errors required):
- Use strict TypeScript: strict true in tsconfig.json, no @ts-ignore, no implicit any, no unused variables
- Every identifier in a file must be declared or imported — NEVER use a type, interface, or variable name without defining it in the same file or importing it (e.g. TS2304 "Cannot find name 'UserData'" means add \`import type { UserData } from '@/lib/types'\` or define the interface locally)
- Every React component props interface must be explicit (e.g. interface HeroProps { title: string }) and every type in that interface must be imported or defined in the file
- Server pages fetch data; Client components receive it via props. If app/foo/page.tsx renders <FooClient data={data} />, components/FooClient.tsx MUST declare interface FooClientProps { data: DataType } and use ({ data }: FooClientProps) — NEVER () with no parameters when the page passes props
- Share domain types in lib/types.ts only — pages and Client components import types with \`import type { UserData, CategoryData } from '@/lib/types'\`
- lib/types.ts MUST export every shared type (UserData, CategoryData, TaskWithRelations, etc.) with \`export interface\` or \`export type\`
- lib/actions.ts exports server actions (functions) only — import runtime values with \`import { getCategories } from '@/lib/actions'\`; do NOT import types from @/lib/actions unless that file explicitly re-exports them with \`export type { CategoryData } from '@/lib/types'\`
- Name interactive Client components with a Client suffix (DashboardClient, AnalyticsClient, SettingsClient) and add "use client" at the top
- CRITICAL: Every named Client component MUST contain complete, real UI code — JSX with actual elements, logic, and state. NEVER write a stub like \`export default function DashboardClient() { return <div>DashboardClient</div> }\` — this renders as literal text and is a broken app
- Use Next.js 16 App Router only: app/layout.tsx (root layout with html/body), app/page.tsx, app/globals.css, and app/<route>/page.tsx for pages
- Do NOT mix app/ and src/app/ — use app/ at project root only; path alias "@/*" maps to "./*" in tsconfig paths
- Default to Server Components; add "use client" only for hooks, browser APIs, or event handlers
- Use next/link for internal navigation, next/image for images, export const metadata in layout/page where appropriate
- All imports must resolve; no missing modules; prefer named exports for components under components/
- Code MUST pass "npm install && npm run build" with zero TypeScript errors and zero Next.js compile errors`

export const GENERATED_APP_VALIDATION_GUIDANCE = `Pre-build validation requirements:
- package.json has scripts: dev, build, start, lint
- app/layout.tsx exists and exports metadata; app/page.tsx and app/globals.css exist (globals.css imported only in layout)
- Every @/ import must resolve to a generated file — no placeholder imports like @/components/ui/... unless those files are generated
- Client components rendered with props must declare matching props interfaces
- "use client" must be the first statement in files that use hooks, event handlers, useState, useEffect, or onClick; server modules (lib/actions.ts, lib/prisma.ts) must not use it
- No browser APIs in Server Components; no Prisma/database imports in Client Components
- No unused imports, missing exports, duplicate default exports, or bare type names without import type
- Types must be imported from the module that exports them — lib/types.ts for interfaces; never import a type from lib/actions.ts unless actions re-exports it
- JSX: return (\` or \`return <\` on one line — never \`return\` newline then \`<\`; all tags closed; "use client" first line in Client files
- Include Prisma files and dependencies only when requiresDatabase is true; static apps must not include prisma/ or @prisma/client
- Include tailwind.config.ts and package.json scripts.build
- NEVER use localStorage.setItem or sessionStorage.setItem to store app data — when requiresDatabase is true use Prisma server actions; when requiresDatabase is false keep state in-memory with useState only for UI interactions, never for cross-session persistence
- Final code must pass: npm install && npm run build`

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
   - include/select keys MUST match exact relation names in prisma/schema.prisma — use \`user\` not \`assignee\` or \`creator\` unless those fields exist on the model
   - lib/actions.ts field access MUST match the schema: Task.userId + Task.user, not assigneeId/assignee/creatorId/creator unless defined in schema
   - lib/types.ts TaskData (and other DTOs) MUST stay aligned with schema + actions — same field names on every edit
   - Do NOT reference scalar fields absent from the model (e.g. User.avatar, Category.icon) unless you add them to schema.prisma first
   - Aggregate types like DashboardStats are NOT database rows — do not add a required \`id\` field unless the return object includes one`

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
- EVERY @/ import must resolve to a generated file with a matching export of the correct kind (default, named, or type)
- shadcn/ui components under components/ui/ MUST use named exports matching imports: \`export function Button\` when imported as \`import { Button } from '@/components/ui/button'\`
- Before finishing, verify each file: every import has a corresponding export in the target file; every exported symbol used elsewhere is imported correctly
- Each import statement must be complete: \`import { Foo, Bar } from 'package';\` — NEVER close with \`} from 'lucide-react';\` and then list more symbols (BarChart, Pie, etc.) without a new \`import {\` line (causes TS1109 Expression expected)
- When using both lucide-react and recharts (or any two packages), write TWO separate import blocks — one per package`

export const GENERATED_APP_JSX_GUIDANCE = `JSX and TSX syntax (zero TS1005 / TS17008 errors):
- TS1005 "'>' expected" almost always means broken JSX or a line break before JSX — fix the syntax, do not leave the file half-edited
- When returning JSX, use \`return (\` on the SAME line as the opening tag, or put the opening \`<\` immediately after \`return\` — NEVER put a newline between \`return\` and \`<\` (ASI makes TypeScript parse \`<\` as less-than, causing TS1005)
- Every JSX tag must be properly closed: \`<div>...</div>\`, \`<input />\`, \`<Component />\` — no stray \`<\` or half-written tags
- "use client" MUST be the very first line of Client component files (before imports), exactly: \`"use client"\` with double quotes
- Each \`import\` / \`import type\` must be a complete statement on one or valid multi-line form ending with \`from '...'\` — never leave \`import type { UserData }\` without a \`from '@/lib/types'\` clause
- TS1109 "Expression expected" after imports often means a split import: specifiers listed after \`} from 'other-package';\` without \`import {\` — fix by adding a separate import block per package
- Props interfaces belong OUTSIDE the component function — define \`interface SettingsClientProps { ... }\` then \`export default function SettingsClient({ user }: SettingsClientProps) { return ( <div>...</div> ) }\`
- In .tsx files, wrap multiline JSX in parentheses: \`return (\n  <div>...</div>\n)\`
- Do not use TypeScript generics with a bare \`<T>\` at the start of a line in .tsx without a trailing comma (\`<T,>\`) — prefer explicit prop interfaces instead of inline generic components`

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
- API routes MUST import auth helpers from @/lib/auth — if a route uses verifyToken or getAuthUser, lib/auth.ts MUST export that exact function (TS2305 means you added an import without exporting it from lib/auth.ts)
- Prefer getAuthUser() in API routes/pages; use verifyToken(token) only when reading a raw token string`

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
- Prisma include/select MUST use exact relation field names from schema.prisma (e.g. if Comment has \`user User @relation\`, use include: { user: true } — never invent aliases like author unless that field exists on the model)
- lib/actions.ts, lib/types.ts, and prisma/schema.prisma MUST agree on every edit: foreign keys (userId not assigneeId), relation includes (user not assignee/creator), and DTO shapes
- TS2353 on include means you invented a relation name — read schema.prisma and use the real field name
- TS2339 on t.assignee / t.creatorId means the Task model uses different names — align actions with schema, not the other way around during edits`

export const GENERATED_APP_DATABASE_EDIT_GUIDANCE = `Database edits (existing Neon Postgres — additive only):
- NEVER provision, replace, or reset the database connection — the app already has DATABASE_URL on Vercel
- When editing prisma/schema.prisma: preserve every existing model and field unless the user explicitly asks to remove or rename them
- ADD new models, fields, relations, and enums for new features; use optional fields (?) or defaults when extending existing models
- Do NOT drop tables, rename models in breaking ways, or replace the datasource block — prisma db push on deploy only adds schema changes
- Keep lib/prisma.ts and the existing DATABASE_URL / .env.example pattern unchanged unless fixing a bug
- New features must read/write through the same Prisma client against the existing database — never switch to localStorage or a new database`

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
}

export const GENERATED_APP_REPO_SUMMARY_GUIDANCE = `REPO_SUMMARY.md (required, auto-maintained):
- Living repository summary: purpose, features, tech stack, routes, API routes, Prisma models, components, and a complete file index
- Sim Development regenerates this file after generate and edit — do not omit it from new apps
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

function reconcileSplitImportsInFiles(files: GeneratedAppFile[]): GeneratedAppFile[] {
  return files.map((file) => {
    const path = normalizePath(file.path)
    if (!/\.(tsx|ts|jsx|js)$/.test(path)) {
      return file
    }

    const fixed = reconcileSplitImportStatements(file.content)
    if (fixed === file.content) {
      return file
    }

    logger.warn('Fixed split import statements in generated file', { path })
    return { ...file, content: fixed }
  })
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
  options: NormalizeGeneratedAppFilesOptions = {}
): string {
  try {
    const pkg = JSON.parse(content) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      scripts?: Record<string, string>
    }

    pkg.dependencies = { ...pkg.dependencies, ...PINNED_DEPENDENCIES }
    pkg.devDependencies = { ...pkg.devDependencies, ...PINNED_DEV_DEPENDENCIES }

    if (options.requiresDatabase) {
      pkg.dependencies = {
        ...pkg.dependencies,
        '@prisma/client': PINNED_PRISMA_VERSION,
      }
      pkg.devDependencies = {
        ...pkg.devDependencies,
        prisma: PINNED_PRISMA_VERSION,
      }
      const existingBuild = pkg.scripts?.build ?? 'next build'
      const { postinstall: _removedPostinstall, ...remainingScripts } = pkg.scripts ?? {}
      pkg.scripts = {
        ...remainingScripts,
        build: existingBuild.includes('prisma')
          ? existingBuild
          : `prisma generate && prisma db push && ${existingBuild}`,
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

function filePathToImportPath(filePath: string): string {
  return normalizePath(filePath).replace(/\.(tsx|ts|jsx|js)$/, '')
}

function isNamedExport(content: string, name: string): boolean {
  return (
    new RegExp(`export\\s+(?:function|const|class)\\s+${name}\\b`).test(content) ||
    new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(content)
  )
}

function hasDefaultExport(content: string, componentName: string): boolean {
  return (
    /export\s+default\s+/m.test(content) ||
    new RegExp(`export\\s+default\\s+function\\s+${componentName}\\b`).test(content)
  )
}

function collectComponentImportStyles(
  files: GeneratedAppFile[]
): { named: Map<string, Set<string>>; defaultImports: Set<string> } {
  const named = new Map<string, Set<string>>()
  const defaultImports = new Set<string>()

  for (const file of files) {
    for (const match of file.content.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"]@\/(components\/[^'"]+)['"]/g)) {
      const importPath = match[2]
      const names = parseImportNames(match[1] ?? '')
      const existing = named.get(importPath) ?? new Set<string>()
      for (const name of names) {
        existing.add(name)
      }
      named.set(importPath, existing)
    }

    for (const match of file.content.matchAll(
      /import\s+(\w+)\s+from\s+['"]@\/(components\/[^'"]+)['"]/g
    )) {
      if (match[0].includes('import type')) {
        continue
      }
      defaultImports.add(match[2])
    }
  }

  return { named, defaultImports }
}

/**
 * Aligns component default/named exports with how they are imported across the app.
 */
export function reconcileComponentExportStyles(files: GeneratedAppFile[]): GeneratedAppFile[] {
  const { named, defaultImports } = collectComponentImportStyles(files)
  const normalized = files.map((file) => ({ ...file, path: normalizePath(file.path) }))

  return normalized.map((file) => {
    const path = normalizePath(file.path)
    if (!path.startsWith('components/') || !/\.(tsx|ts)$/.test(path)) {
      return file
    }

    const importPath = filePathToImportPath(path)
    const namedExports = named.get(importPath) ?? new Set<string>()
    const needsDefault = defaultImports.has(importPath)

    if (namedExports.size === 0 && !needsDefault) {
      return file
    }

    const componentName = toComponentName(path)
    let content = file.content
    const additions: string[] = []

    content = content.replace(/export\s+default\s+function\s+([a-z]\w*)/g, `export default function ${componentName}`)

    for (const exportName of namedExports) {
      if (!isNamedExport(content, exportName)) {
        if (hasDefaultExport(content, componentName) && exportName === componentName) {
          additions.push(`export { ${exportName} }`)
        } else {
          additions.push(buildComponentExportStub(exportName, normalized))
        }
      }
    }

    if (needsDefault && !hasDefaultExport(content, componentName)) {
      if (isNamedExport(content, componentName)) {
        additions.push(`export default ${componentName}`)
      } else {
        additions.push(buildComponentExportStub(componentName, normalized, { asDefault: true }))
      }
    }

    if (additions.length === 0 && content === file.content) {
      return file
    }

    let result = content.trimEnd()
    if (additions.length > 0) {
      result = `${result}\n\n${additions.join('\n\n')}\n`
      if (additions.some((addition) => addition.includes('children: ReactNode'))) {
        result = ensureComponentTypeImports(result, { children: 'ReactNode' })
      }
    }

    if (
      !result.startsWith("'use client'") &&
      (path.includes('/ui/') || /Client$|Toast|Modal|Dropdown|Menu/i.test(componentName))
    ) {
      result = `'use client'\n\n${result}`
    }

    return { ...file, content: result }
  })
}

/**
 * Collects JSX prop names passed to a component across generated sources.
 */
export function collectJsxPropNamesForComponent(
  componentName: string,
  files: GeneratedAppFile[]
): string[] {
  const propNames = new Set<string>()
  const tagPattern = new RegExp(`<${componentName}([^>]*)(/?)>`, 'g')
  const closingTagPattern = new RegExp(`</${componentName}>`)
  const ignoredProps = new Set(['className', 'key', 'ref'])

  for (const file of files) {
    if (!/\.(tsx|jsx)$/.test(file.path)) {
      continue
    }

    for (const match of file.content.matchAll(tagPattern)) {
      const attrs = match[1] ?? ''
      const isSelfClosing = match[2] === '/'

      if (!isSelfClosing && closingTagPattern.test(file.content)) {
        propNames.add('children')
      }

      for (const propMatch of attrs.matchAll(/(\w+)(?:=|\s)/g)) {
        const propName = propMatch[1]
        if (propName && !ignoredProps.has(propName)) {
          propNames.add(propName)
        }
      }
    }
  }

  return [...propNames].sort()
}

function componentAcceptsProps(content: string, componentName: string): boolean {
  return (
    new RegExp(`export\\s+(?:default\\s+)?function\\s+${componentName}\\s*\\(\\s*\\{`, 'm').test(
      content
    ) ||
    new RegExp(`export\\s+(?:default\\s+)?function\\s+${componentName}\\s*\\([^)]+:`, 'm').test(
      content
    )
  )
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

function collectTypeImports(propTypes: Record<string, string>): string[] {
  const imports = new Set<string>()
  for (const typeName of Object.values(propTypes)) {
    if (typeName === 'unknown' || REACT_BUILTIN_TYPES.has(typeName)) {
      continue
    }
    const baseType = typeName.replace(/\[\]$/, '').trim()
    if (/^[A-Z]\w*$/.test(baseType)) {
      imports.add(baseType)
    }
  }
  return [...imports].sort()
}

function parseNamedImportBinding(imports: string): string[] {
  return imports
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^type\s+/, '').trim())
}

function contentAlreadyImportsReactType(content: string, typeName: string): boolean {
  return (
    new RegExp(
      `import\\s+type\\s*\\{[^}]*\\b${typeName}\\b[^}]*\\}\\s*from\\s+['"]react['"]`
    ).test(content) ||
    new RegExp(`import\\s*\\{[^}]*\\b${typeName}\\b[^}]*\\}\\s*from\\s+['"]react['"]`).test(
      content
    ) ||
    new RegExp(`import\\s+React[^;]*\\b${typeName}\\b`).test(content)
  )
}

function ensureReactTypeImport(content: string, typeName: string): string {
  if (contentAlreadyImportsReactType(content, typeName)) {
    return content
  }

  const existingTypeImport = content.match(
    /^import\s+type\s*\{([^}]*)\}\s*from\s*['"]react['"]/m
  )
  if (existingTypeImport) {
    const names = parseNamedImportBinding(existingTypeImport[1])
    if (!names.includes(typeName)) {
      names.push(typeName)
      return content.replace(
        /^import\s+type\s*\{[^}]*\}\s*from\s*['"]react['"]/m,
        `import type { ${names.sort().join(', ')} } from 'react'`
      )
    }
    return content
  }

  const importLine = `import type { ${typeName} } from 'react'\n`
  if (content.startsWith("'use client'")) {
    return content.replace(/^('use client'\n\n)/m, `$1${importLine}\n`)
  }
  if (content.startsWith("'use client'\n") && !content.startsWith("'use client'\n\n")) {
    return content.replace(/^('use client'\n)/m, `$1${importLine}\n`)
  }
  return `${importLine}\n${content}`
}

function contentAlreadyImportsActionsType(content: string, typeName: string): boolean {
  return new RegExp(
    `import\\s+type\\s*\\{[^}]*\\b${typeName}\\b[^}]*\\}\\s*from\\s+['"]@/lib/actions['"]`
  ).test(content)
}

function ensureActionsTypeImports(content: string, typeNames: string[]): string {
  const missing = typeNames.filter((typeName) => !contentAlreadyImportsActionsType(content, typeName))
  if (missing.length === 0) {
    return content
  }

  const existingMatch = content.match(
    /import\s+type\s*\{([^}]*)\}\s*from\s+['"]@\/lib\/actions['"]/
  )
  if (existingMatch) {
    const existing = existingMatch[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    const merged = [...new Set([...existing, ...missing])].sort()
    return content.replace(
      /import\s+type\s*\{[^}]*\}\s*from\s+['"]@\/lib\/actions['"]/,
      `import type { ${merged.join(', ')} } from '@/lib/actions'`
    )
  }

  const importLine = `import type { ${missing.join(', ')} } from '@/lib/actions'\n`
  if (content.startsWith("'use client'")) {
    return content.replace(/^('use client'\n\n)/m, `$1${importLine}\n`)
  }
  return `${importLine}\n${content}`
}

function ensureComponentTypeImports(content: string, propTypes: Record<string, string>): string {
  let result = content

  if (Object.values(propTypes).includes('ReactNode')) {
    result = ensureReactTypeImport(result, 'ReactNode')
  }

  const actionTypes = collectTypeImports(propTypes)
  if (actionTypes.length > 0) {
    result = ensureActionsTypeImports(result, actionTypes)
  }

  return result
}

function buildComponentTypeImportLines(propTypes: Record<string, string>): string {
  const lines: string[] = []
  const actionTypes = collectTypeImports(propTypes)

  if (Object.values(propTypes).includes('ReactNode')) {
    lines.push("import type { ReactNode } from 'react'")
  }
  if (actionTypes.length > 0) {
    lines.push(`import type { ${actionTypes.join(', ')} } from '@/lib/actions'`)
  }

  return lines.length > 0 ? `${lines.join('\n')}\n\n` : ''
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

function sanitizeGeneratedComponentFiles(files: GeneratedAppFile[]): GeneratedAppFile[] {
  return files.map((file) => {
    const path = normalizePath(file.path)
    if (!path.startsWith('components/') || !path.endsWith('.tsx')) {
      return file
    }

    const sanitized = sanitizeComponentFileImports(file.content)
    return sanitized === file.content ? file : { ...file, content: sanitized }
  })
}

function formatComponentPropsInterface(
  componentName: string,
  propTypes: Record<string, string>
): string {
  return `interface ${componentName}Props {\n${Object.entries(propTypes)
    .map(([prop, type]) => `  ${prop}: ${type}`)
    .join('\n')}\n}\n\n`
}

function formatComponentPropsSignature(
  componentName: string,
  propTypes: Record<string, string>,
  renderChildren: boolean
): string {
  const destructure = Object.keys(propTypes)
    .map((prop) => (prop === 'children' && renderChildren ? prop : `${prop}: _${prop}`))
    .join(', ')

  return `({ ${destructure} }: ${componentName}Props)`
}

function shouldRenderChildrenInBody(content: string, propTypes: Record<string, string>): boolean {
  if (!propTypes.children) {
    return false
  }

  return (
    /return\s+null/.test(content) ||
    /Auto-generated stub/.test(content) ||
    /<section className="py-8">/.test(content)
  )
}

function patchComponentReturnForChildren(content: string, renderChildren: boolean): string {
  if (!renderChildren) {
    return content
  }

  if (/return\s+null/.test(content)) {
    return content.replace(/return\s+null/, 'return <>{children}</>')
  }

  if (/<section className="py-8">[\s\S]*?<\/section>/.test(content)) {
    return content.replace(/<section className="py-8">[\s\S]*?<\/section>/, '<>{children}</>')
  }

  return content
}

function patchComponentToAcceptProps(
  content: string,
  componentName: string,
  propTypes: Record<string, string>
): string {
  if (componentAcceptsProps(content, componentName)) {
    return content
  }

  const propsTypeName = `${componentName}Props`
  const renderChildren = shouldRenderChildrenInBody(content, propTypes)
  const interfaceBlock = formatComponentPropsInterface(componentName, propTypes)
  const signature = formatComponentPropsSignature(componentName, propTypes, renderChildren)

  const funcPatterns = [
    new RegExp(`(export\\s+default\\s+function\\s+${componentName}\\s*)\\(\\s*\\)`, 'm'),
    new RegExp(`(export\\s+function\\s+${componentName}\\s*)\\(\\s*\\)`, 'm'),
  ]

  const funcPattern = funcPatterns.find((pattern) => pattern.test(content))
  if (!funcPattern) {
    return content
  }

  let result = content.replace(funcPattern, `$1${signature}`)
  if (!result.includes(`interface ${propsTypeName}`)) {
    result = result.replace(
      new RegExp(`(export\\s+(?:default\\s+)?function\\s+${componentName})`),
      `${interfaceBlock}$1`
    )
  }
  result = patchComponentReturnForChildren(result, renderChildren)
  result = ensureComponentTypeImports(result, propTypes)

  if (/Client$/i.test(componentName) && !result.includes("'use client'")) {
    result = `'use client'\n\n${result}`
  }

  return result
}

function buildComponentExportStub(
  exportName: string,
  files: GeneratedAppFile[],
  options: { asDefault?: boolean } = {}
): string {
  const propNames = collectJsxPropNamesForComponent(exportName, files)
  if (propNames.length === 0) {
    return options.asDefault
      ? `export default function ${exportName}() {\n  return null\n}`
      : `export function ${exportName}() {\n  return null\n}`
  }

  const propTypes = inferComponentPropTypes(exportName, propNames, files)
  const renderChildren = Boolean(propTypes.children)
  const interfaceBlock = formatComponentPropsInterface(exportName, propTypes)
  const signature = formatComponentPropsSignature(exportName, propTypes, renderChildren)
  const returnBody = renderChildren ? '  return <>{children}</>\n' : '  return null\n'
  const exportKeyword = options.asDefault ? 'export default function' : 'export function'

  return `${interfaceBlock}${exportKeyword} ${exportName}${signature} {\n${returnBody}}`
}

/**
 * Patches Client components so their props match how pages render them.
 */
export function reconcileClientComponentProps(files: GeneratedAppFile[]): GeneratedAppFile[] {
  const normalized = files.map((file) => ({ ...file, path: normalizePath(file.path) }))

  return normalized.map((file) => {
    if (!file.path.startsWith('components/') || !file.path.endsWith('.tsx')) {
      return file
    }

    const componentName = toComponentName(file.path)
    const propNames = collectJsxPropNamesForComponent(componentName, normalized)
    if (propNames.length === 0 || componentAcceptsProps(file.content, componentName)) {
      return file
    }

    const propTypes = inferComponentPropTypes(componentName, propNames, normalized)
    const patchedContent = sanitizeComponentFileImports(
      patchComponentToAcceptProps(file.content, componentName, propTypes)
    )
    if (patchedContent !== file.content) {
      return { ...file, content: patchedContent }
    }

    return file
  })
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

function createStubModuleFile(filePath: string, importPath: string): GeneratedAppFile {
  if (importPath === 'lib/actions' || filePath.endsWith('/actions.ts')) {
    return {
      path: filePath,
      content: `'use server'

/** Auto-generated stub so @/ imports resolve on Vercel. Replace with real server actions. */
export interface RecordItem {
  id: string
}

export async function listRecords(): Promise<RecordItem[]> {
  return []
}
`,
    }
  }

  return {
    path: filePath,
    content: `/** Auto-generated stub so @/ imports resolve on Vercel. */\nexport {}\n`,
  }
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

function parseImportNames(clause: string): string[] {
  return clause
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^type\s+/, ''))
}

function collectActionsImports(files: GeneratedAppFile[]): { types: Set<string>; values: Set<string> } {
  const types = new Set<string>()
  const values = new Set<string>()

  for (const file of files) {
    if (normalizePath(file.path) === 'lib/actions.ts') {
      continue
    }

    for (const match of file.content.matchAll(
      /import\s+type\s+\{([^}]+)\}\s+from\s+['"]@\/lib\/actions['"]/g
    )) {
      for (const name of parseImportNames(match[1] ?? '')) {
        types.add(name)
      }
    }

    for (const match of file.content.matchAll(
      /import\s+\{([^}]+)\}\s+from\s+['"]@\/lib\/actions['"]/g
    )) {
      if (match[0].includes('import type')) {
        continue
      }

      for (const part of (match[1] ?? '').split(',').map((entry) => entry.trim())) {
        if (!part) {
          continue
        }
        if (part.startsWith('type ')) {
          types.add(part.replace(/^type\s+/, ''))
        } else {
          values.add(part)
        }
      }
    }
  }

  return { types, values }
}

function collectAuthImports(files: GeneratedAppFile[]): { types: Set<string>; values: Set<string> } {
  const types = new Set<string>()
  const values = new Set<string>()

  for (const file of files) {
    if (normalizePath(file.path) === 'lib/auth.ts') {
      continue
    }

    for (const match of file.content.matchAll(
      /import\s+type\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/auth['"]/g
    )) {
      for (const name of parseImportNames(match[1] ?? '')) {
        types.add(name)
      }
    }

    for (const match of file.content.matchAll(
      /import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/auth['"]/g
    )) {
      if (match[0].includes('import type')) {
        continue
      }

      for (const part of (match[1] ?? '').split(',').map((entry) => entry.trim())) {
        if (!part) {
          continue
        }
        if (part.startsWith('type ')) {
          types.add(part.replace(/^type\s+/, ''))
        } else {
          values.add(part)
        }
      }
    }
  }

  return { types, values }
}

function isExportedInAuthModule(content: string, name: string): boolean {
  return (
    new RegExp(`export\\s+(?:async\\s+)?(?:function|const|interface|type|enum)\\s+${name}\\b`).test(
      content
    ) ||
    new RegExp(`export\\s+type\\s*\\{[^}]*\\b${name}\\b`).test(content) ||
    new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(content)
  )
}

export const DEFAULT_LIB_AUTH_CONTENT = `import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export async function getAuthUser(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  if (!token) return null;
  return verifyToken(token);
}
`

const AUTH_EXPORT_SNIPPETS: Record<string, string> = {
  JwtPayload: `export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}`,
  signToken: `export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}`,
  verifyToken: `export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}`,
  getAuthUser: `export async function getAuthUser(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  if (!token) return null;
  return verifyToken(token);
}`,
}

function ensureAuthJwtImports(content: string): string {
  if (content.includes("from 'jsonwebtoken'") || content.includes('from "jsonwebtoken"')) {
    return content
  }

  return `import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

${content.trimStart()}`
}

function patchPackageJsonForAuth(content: string): string {
  try {
    const pkg = JSON.parse(content) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    pkg.dependencies = {
      ...pkg.dependencies,
      jsonwebtoken: '^9.0.2',
    }
    pkg.devDependencies = {
      ...pkg.devDependencies,
      '@types/jsonwebtoken': '^9.0.9',
    }
    return `${JSON.stringify(pkg, null, 2)}\n`
  } catch {
    return content
  }
}

/**
 * Ensures lib/auth.ts exports every symbol imported from @/lib/auth across the app.
 */
export function reconcileAuthExports(
  files: GeneratedAppFile[],
  options: NormalizeGeneratedAppFilesOptions = {}
): GeneratedAppFile[] {
  if (!options.requiresDatabase) {
    return files
  }

  const { types, values } = collectAuthImports(files)
  const requiredNames = new Set([...types, ...values])
  if (requiredNames.size === 0) {
    return files
  }

  let updated = [...files]
  const authIndex = updated.findIndex((file) => normalizePath(file.path) === 'lib/auth.ts')

  if (authIndex < 0) {
    logger.warn('Added lib/auth.ts for imported auth helpers')
    updated = [...updated, { path: 'lib/auth.ts', content: DEFAULT_LIB_AUTH_CONTENT }]
  } else {
    const authFile = updated[authIndex]
    const additions: string[] = []

    for (const name of requiredNames) {
      if (!isExportedInAuthModule(authFile.content, name) && AUTH_EXPORT_SNIPPETS[name]) {
        additions.push(AUTH_EXPORT_SNIPPETS[name])
      }
    }

    if (additions.length > 0) {
      logger.warn('Added missing lib/auth exports for typecheck', { exports: [...requiredNames] })
      let content = ensureAuthJwtImports(authFile.content)
      content = `${content.trimEnd()}\n\n// Auto-added exports so @/lib/auth imports resolve during typecheck\n${additions.join('\n\n')}\n`
      updated[authIndex] = { ...authFile, content }
    }
  }

  const usesAuth = updated.some((file) => normalizePath(file.path) === 'lib/auth.ts')
  if (!usesAuth) {
    return updated
  }

  return updated.map((file) => {
    if (normalizePath(file.path) !== 'package.json') {
      return file
    }
    return { ...file, content: patchPackageJsonForAuth(file.content) }
  })
}

function collectTypesImportedInActions(content: string): Set<string> {
  const imported = new Set<string>()
  for (const match of content.matchAll(/import\s+type\s+\{([^}]+)\}\s+from\s+['"]@\/lib\/types['"]/g)) {
    for (const name of parseImportNames(match[1] ?? '')) {
      imported.add(name)
    }
  }
  return imported
}

function collectTypesReExportedFromActions(content: string): Set<string> {
  const reExported = new Set<string>()
  for (const match of content.matchAll(/export\s+type\s*\{([^}]+)\}/g)) {
    for (const name of parseImportNames(match[1] ?? '')) {
      reExported.add(name)
    }
  }
  return reExported
}

function isExportedInActions(content: string, name: string): boolean {
  return (
    new RegExp(`export\\s+(?:async\\s+)?(?:function|const|interface|type|enum)\\s+${name}\\b`).test(
      content
    ) ||
    new RegExp(`export\\s+type\\s*\\{[^}]*\\b${name}\\b`).test(content) ||
    new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(content) ||
    collectTypesImportedInActions(content).has(name)
  )
}

/**
 * Removes duplicate AnalyticsData-style interfaces when types are re-exported from lib/types.
 */
export function dedupeActionsTypeConflicts(files: GeneratedAppFile[]): GeneratedAppFile[] {
  const actionsIndex = files.findIndex((file) => normalizePath(file.path) === 'lib/actions.ts')
  if (actionsIndex < 0) {
    return files
  }

  const actionsFile = files[actionsIndex]
  const importedFromTypes = collectTypesImportedInActions(actionsFile.content)
  const reExportedFromTypes = collectTypesReExportedFromActions(actionsFile.content)
  const reservedTypeNames = new Set([...importedFromTypes, ...reExportedFromTypes])

  if (reservedTypeNames.size === 0) {
    return files
  }

  let content = actionsFile.content

  for (const typeName of reservedTypeNames) {
    content = content.replace(
      new RegExp(`\\nexport interface ${typeName} \\{[\\s\\S]*?\\n\\}`, 'g'),
      ''
    )
    content = content.replace(
      new RegExp(
        `\\n*// Auto-added exports so imports resolve during typecheck\\nexport interface ${typeName} \\{\\n  id: string\\n  \\[key: string\\]: unknown\\n\\}\\n?`,
        'g'
      ),
      '\n'
    )
  }

  content = content.replace(/\n*\/\/ Auto-added exports so imports resolve during typecheck\n*$/g, '')

  if (content === actionsFile.content) {
    return files
  }

  logger.warn('Removed duplicate lib/actions type exports that conflict with lib/types', {
    types: [...reservedTypeNames],
  })

  const updated = [...files]
  updated[actionsIndex] = { ...actionsFile, content }
  return updated
}

/**
 * Adds missing exports to lib/actions.ts so component imports typecheck.
 */
export function reconcileActionsTypeExports(files: GeneratedAppFile[]): GeneratedAppFile[] {
  const actionsIndex = files.findIndex((file) => normalizePath(file.path) === 'lib/actions.ts')
  if (actionsIndex < 0) {
    return files
  }

  const { types, values } = collectActionsImports(files)
  const actionsFile = files[actionsIndex]
  const additions: string[] = []

  for (const typeName of types) {
    if (!isExportedInActions(actionsFile.content, typeName)) {
      additions.push(
        `export interface ${typeName} {\n  id: string\n  [key: string]: unknown\n}`
      )
    }
  }

  for (const valueName of values) {
    if (!isExportedInActions(actionsFile.content, valueName)) {
      if (valueName.startsWith('get')) {
        additions.push(`export async function ${valueName}(): Promise<unknown[]> {\n  return []\n}`)
      } else if (valueName.startsWith('create') || valueName.startsWith('update')) {
        additions.push(
          `export async function ${valueName}(..._args: unknown[]): Promise<unknown> {\n  return {}\n}`
        )
      } else {
        additions.push(`export async function ${valueName}(..._args: unknown[]): Promise<void> {}`)
      }
    }
  }

  if (additions.length === 0) {
    return files
  }

  logger.warn('Added missing lib/actions exports for typecheck', {
    types: [...types],
    values: [...values],
  })

  const updated = [...files]
  updated[actionsIndex] = {
    ...actionsFile,
    content: `${actionsFile.content.trimEnd()}\n\n// Auto-added exports so imports resolve during typecheck\n${additions.join('\n\n')}\n`,
  }
  return updated
}

/** Maps commonly mismatched type import names to existing exports in lib/types.ts. */
const LIB_TYPES_ALIASES: Record<string, string> = {
  TaskWithRelations: 'Task',
  TaskWithOwners: 'Task',
  MemberData: 'Member',
  MemberType: 'Member',
}

function isExportedInTypesModule(content: string, name: string): boolean {
  return (
    new RegExp(`export\\s+(?:type|interface|enum|const)\\s+${name}\\b`).test(content) ||
    new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(content)
  )
}

function collectTypesImports(files: GeneratedAppFile[]): Set<string> {
  const types = new Set<string>()

  for (const file of files) {
    if (normalizePath(file.path) === 'lib/types.ts') {
      continue
    }

    for (const match of file.content.matchAll(
      /import\s+type\s+\{([^}]+)\}\s+from\s+['"]@\/lib\/types['"]/g
    )) {
      for (const name of parseImportNames(match[1] ?? '')) {
        types.add(name)
      }
    }

    for (const match of file.content.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"]@\/lib\/types['"]/g)) {
      if (match[0].includes('import type')) {
        continue
      }

      for (const part of (match[1] ?? '').split(',').map((entry) => entry.trim())) {
        if (!part) {
          continue
        }
        if (part.startsWith('type ')) {
          types.add(part.replace(/^type\s+/, ''))
        }
      }
    }
  }

  return types
}

const DEFAULT_TYPES_STUB = `/** Auto-generated types scaffold. Replace with domain-specific types. */
export interface RecordItem {
  id: string
  [key: string]: unknown
}
`

const LIB_TYPES_KNOWN_STUBS: Record<string, string> = {
  DashboardStats: `export interface DashboardStats {
  totalTasks: number
  completedTasks: number
  inProgressTasks: number
  overdueTasks: number
  totalUsers: number
  totalCategories: number
  recentTasks: TaskData[]
  tasksByStatus: { status: string; count: number }[]
  tasksByPriority: { priority: string; count: number }[]
}`,
}

/**
 * Adds missing exports to lib/types.ts so @/lib/types imports typecheck.
 */
export function reconcileTypesExports(files: GeneratedAppFile[]): GeneratedAppFile[] {
  const importedTypes = collectTypesImports(files)
  if (importedTypes.size === 0) {
    return files
  }

  let typesIndex = files.findIndex((file) => normalizePath(file.path) === 'lib/types.ts')
  const updated = [...files]

  if (typesIndex < 0) {
    updated.push({ path: 'lib/types.ts', content: DEFAULT_TYPES_STUB })
    typesIndex = updated.length - 1
  }

  const typesFile = updated[typesIndex]
  const additions: string[] = []

  for (const typeName of importedTypes) {
    if (isExportedInTypesModule(typesFile.content, typeName)) {
      continue
    }

    const aliasTarget = LIB_TYPES_ALIASES[typeName]
    if (aliasTarget && isExportedInTypesModule(typesFile.content, aliasTarget)) {
      additions.push(`export type ${typeName} = ${aliasTarget}`)
      continue
    }

    if (/^Status$/i.test(typeName) && isExportedInTypesModule(typesFile.content, 'TaskStatus')) {
      additions.push(`export type ${typeName} = TaskStatus`)
      continue
    }

    if (/^Priority$/i.test(typeName) && isExportedInTypesModule(typesFile.content, 'TaskPriority')) {
      additions.push(`export type ${typeName} = TaskPriority`)
      continue
    }

    if (LIB_TYPES_KNOWN_STUBS[typeName]) {
      additions.push(LIB_TYPES_KNOWN_STUBS[typeName])
      continue
    }

    additions.push(`export interface ${typeName} {\n  id: string\n  [key: string]: unknown\n}`)
  }

  let typesContent = typesFile.content
  for (const [typeName, stub] of Object.entries(LIB_TYPES_KNOWN_STUBS)) {
    const malformed = new RegExp(
      `export interface ${typeName} \\{\\s*id: string\\s*\\[key: string\\]: unknown\\s*\\}`,
      's'
    )
    if (malformed.test(typesContent)) {
      typesContent = typesContent.replace(malformed, stub)
    }
  }

  if (additions.length === 0 && typesContent === typesFile.content) {
    return updated
  }

  if (additions.length > 0) {
    logger.warn('Added missing lib/types exports for typecheck', {
      types: [...importedTypes],
    })
  }

  const suffix =
    additions.length > 0
      ? `\n\n// Auto-added exports so imports resolve during typecheck\n${additions.join('\n\n')}\n`
      : '\n'

  updated[typesIndex] = {
    ...typesFile,
    content: `${typesContent.trimEnd()}${suffix}`,
  }
  return updated
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
${routesSection}${databaseSection}
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

function createStubComponentFile(
  filePath: string,
  propNames: string[] = [],
  propTypes: Record<string, string> = {}
): GeneratedAppFile {
  const name = toComponentName(filePath)
  const isClient =
    /Client$/i.test(name) ||
    /\/ui\//.test(filePath) ||
    /form|modal|menu|dropdown|toggle|carousel|slider|tabs|toast/i.test(name) ||
    /Form|Modal|Menu|Dropdown|Toast/.test(name)

  const resolvedPropTypes =
    propNames.length > 0
      ? Object.fromEntries(
          propNames.map((prop) => [
            prop,
            propTypes[prop] && propTypes[prop] !== 'unknown' ? propTypes[prop] : prop === 'children' ? 'ReactNode' : 'unknown',
          ])
        )
      : {}
  const typeImportLine = buildComponentTypeImportLines(resolvedPropTypes)
  const renderChildren = Boolean(resolvedPropTypes.children)
  const propsInterface =
    propNames.length > 0 ? formatComponentPropsInterface(name, resolvedPropTypes) : ''
  const propsSignature =
    propNames.length > 0
      ? formatComponentPropsSignature(name, resolvedPropTypes, renderChildren)
      : '()'
  const returnBody = renderChildren
    ? '  return <>{children}</>\n'
    : `  return (
    <section className="py-8">
      <div className="mx-auto max-w-5xl px-4 text-sm text-slate-600">${name}</div>
    </section>
  )\n`

  const content = `${isClient ? "'use client'\n\n" : ''}${typeImportLine}/** Auto-generated stub so @/ imports resolve on Vercel. Replace with full UI when refining the app. */
${propsInterface}export function ${name}${propsSignature} {
${returnBody}}

export default ${name}
`

  return { path: filePath, content }
}

/**
 * Strips directUrl from Prisma schema so builds only require DATABASE_URL (set by Vercel Neon).
 */
export function patchPrismaSchemaContent(content: string): string {
  const patched = content
    .replace(/\n\s*directUrl\s*=\s*env\([^)]+\)/g, '')
    .replace(/\r\n\s*directUrl\s*=\s*env\([^)]+\)/g, '')

  return patched.endsWith('\n') || patched.length === 0 ? patched : `${patched}\n`
}

const DEFAULT_PRISMA_SCHEMA = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Record {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  title     String
  content   String?
}
`

const DEFAULT_PRISMA_CLIENT = `import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
`

function patchEnvExampleForDatabase(content: string): string {
  const stripped = content
    .replace(/^.*DATABASE_URL_UNPOOLED=.*\n?/gm, '')
    .replace(/^.*DIRECT_URL=.*\n?/gm, '')

  if (stripped.includes('DATABASE_URL')) {
    return stripped
  }

  const prefix = stripped.endsWith('\n') || stripped.length === 0 ? stripped : `${stripped}\n`
  return `${prefix}# Neon Postgres (set automatically on Vercel when the database is connected)
DATABASE_URL="postgresql://USER:PASSWORD@HOST/neondb?sslmode=require"
`
}

/**
 * Ensures Prisma scaffold files exist when the app requires a database.
 */
export function ensureDatabaseScaffold(
  files: GeneratedAppFile[],
  options: NormalizeGeneratedAppFilesOptions = {}
): GeneratedAppFile[] {
  if (!options.requiresDatabase) {
    return files
  }

  const normalized = files.map((file) => ({ ...file, path: normalizePath(file.path) }))
  const pathSet = new Set(normalized.map((file) => file.path))
  const additions: GeneratedAppFile[] = []

  for (const requiredPath of GENERATED_APP_DATABASE_FILE_PATHS) {
    if (!pathSet.has(requiredPath)) {
      additions.push({
        path: requiredPath,
        content: requiredPath.endsWith('schema.prisma')
          ? DEFAULT_PRISMA_SCHEMA
          : DEFAULT_PRISMA_CLIENT,
      })
      pathSet.add(requiredPath)
    }
  }

  const patched = normalized.map((file) => {
    if (file.path === '.env.example') {
      return { ...file, content: patchEnvExampleForDatabase(file.content) }
    }
    if (file.path === 'prisma/schema.prisma') {
      return { ...file, content: patchPrismaSchemaContent(file.content) }
    }
    return file
  })

  if (additions.length > 0) {
    logger.warn('Added Prisma scaffold files for database-enabled app', {
      paths: additions.map((file) => file.path),
    })
  }

  return additions.length > 0 ? [...patched, ...additions] : patched
}

/**
 * Ensures every @/ import in generated sources has a matching file (adds stubs if the model omitted them).
 */
export function reconcileMissingAliasImports(
  files: GeneratedAppFile[],
  useSrcDir = false
): GeneratedAppFile[] {
  const normalized = files.map((f) => ({ ...f, path: normalizePath(f.path) }))
  const pathSet = new Set(normalized.map((f) => f.path))
  const neededImports = new Set<string>()

  for (const file of normalized) {
    if (!/\.(tsx|ts|jsx|js|mjs|cjs)$/.test(file.path)) {
      continue
    }
    for (const importPath of collectAliasImportsFromSource(file.content)) {
      neededImports.add(importPath)
    }
  }

  const stubs: GeneratedAppFile[] = []

  for (const importPath of neededImports) {
    const candidates = resolveAliasToCandidatePaths(importPath, useSrcDir)
    if (candidates.some((candidate) => pathSet.has(candidate))) {
      continue
    }

    const stubPath = candidates[0]
    const stub = stubPath.endsWith('.ts')
      ? createStubModuleFile(stubPath, importPath)
      : (() => {
          const componentName = toComponentName(stubPath)
          const propNames = collectJsxPropNamesForComponent(componentName, normalized)
          const propTypes = inferComponentPropTypes(componentName, propNames, normalized)
          return createStubComponentFile(stubPath, propNames, propTypes)
        })()
    stubs.push(stub)
    pathSet.add(stubPath)
  }

  if (stubs.length > 0) {
    logger.warn('Added stub files for missing @/ imports', {
      paths: stubs.map((stub) => stub.path),
    })
  }

  return stubs.length > 0 ? [...normalized, ...stubs] : normalized
}

const PRISMA_SCALAR_TYPES = new Set([
  'String',
  'Int',
  'Float',
  'Boolean',
  'DateTime',
  'Json',
  'Bytes',
  'BigInt',
  'Decimal',
])

/** Common wrong relation aliases mapped to schema field names per model. */
const PRISMA_RELATION_ALIASES: Record<string, Record<string, string>> = {
  Comment: { author: 'user' },
  Task: { assignee: 'user', author: 'user' },
}

/** Relation names LLMs often invent that should be removed when absent from schema. */
const PRISMA_PHANTOM_RELATIONS = ['creator'] as const

/**
 * Parses scalar field names from a Prisma schema.
 */
export function parsePrismaModelScalars(schemaContent: string): Record<string, Set<string>> {
  const scalars: Record<string, Set<string>> = {}

  for (const block of schemaContent.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const modelName = block[1]
    const fields = new Set<string>()

    for (const line of block[2].split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) {
        continue
      }

      const match = trimmed.match(/^(\w+)\s+([A-Za-z][\w]*)(\[\])?(\s+|$|@)/)
      if (!match) {
        continue
      }

      const [, fieldName, typeName] = match
      if (PRISMA_SCALAR_TYPES.has(typeName)) {
        fields.add(fieldName)
      }
    }

    scalars[modelName] = fields
  }

  return scalars
}

function buildPrismaRelationRewriteRules(
  relations: Record<string, Set<string>>
): Array<{ wrong: string; correct: string | null }> {
  const rules: Array<{ wrong: string; correct: string | null }> = []
  const seen = new Set<string>()

  for (const [modelName, aliases] of Object.entries(PRISMA_RELATION_ALIASES)) {
    const modelRelations = relations[modelName]
    if (!modelRelations) {
      continue
    }

    for (const [wrong, correct] of Object.entries(aliases)) {
      if (!modelRelations.has(wrong) && modelRelations.has(correct) && !seen.has(wrong)) {
        rules.push({ wrong, correct })
        seen.add(wrong)
      }
    }
  }

  for (const phantom of PRISMA_PHANTOM_RELATIONS) {
    if (seen.has(phantom)) {
      continue
    }

    const existsOnAnyModel = Object.values(relations).some((modelRelations) => modelRelations.has(phantom))
    if (!existsOnAnyModel) {
      rules.push({ wrong: phantom, correct: null })
      seen.add(phantom)
    }
  }

  return rules
}

function fixPrismaIncludeClause(inner: string, rules: Array<{ wrong: string; correct: string | null }>): string {
  let result = inner

  for (const { wrong, correct } of rules) {
    if (correct) {
      result = result.replace(new RegExp(`\\b${wrong}\\s*:\\s*true`, 'g'), `${correct}: true`)
      continue
    }

    result = result.replace(new RegExp(`,?\\s*${wrong}\\s*:\\s*true\\s*,?`, 'g'), ',')
    result = result.replace(new RegExp(`\\{\\s*${wrong}\\s*:\\s*true\\s*,?`, 'g'), '{')
  }

  result = result.replace(/(user:\s*true\s*,\s*)+user:\s*true/g, 'user: true')
  result = result.replace(/,\s*,+/g, ',').replace(/,\s*$/g, '').replace(/^\s*,/g, '')
  return result
}

function reconcilePrismaSchemaDriftInContent(
  content: string,
  relations: Record<string, Set<string>>,
  scalars: Record<string, Set<string>>,
  relationRules: Array<{ wrong: string; correct: string | null }>
): string {
  let next = content

  next = next.replace(/include:\s*\{([^}]*)\}/g, (_match, inner: string) => {
    return `include: {${fixPrismaIncludeClause(inner, relationRules)}}`
  })

  const taskScalars = scalars.Task
  if (taskScalars) {
    if (!taskScalars.has('assigneeId') && taskScalars.has('userId')) {
      next = next.replaceAll('assigneeId', 'userId')
    }

    if (!taskScalars.has('creatorId')) {
      next = next.replace(/\s*creatorId:\s*t\.userId,?\n/g, '\n')
      next = next.replace(/\s*creatorId:\s*t\.creatorId,?\n/g, '\n')
    }
  }

  next = next.replaceAll('t.assignee', 't.user')
  next = next.replace(/\bassignee:\s*t\.user/g, 'user: t.user')
  next = next.replace(
    /\s*creator:\s*t\.creator\s*\?\s*\{[^}]+\}\s*:\s*null,?\n/g,
    '\n'
  )

  const userScalars = scalars.User
  if (userScalars && !userScalars.has('avatar')) {
    next = next.replace(/\s*avatar:\s*u\.avatar,?\n/g, '\n')
    next = next.replace(/,\s*avatar:\s*u\.avatar/g, '')
  }

  const categoryScalars = scalars.Category
  if (categoryScalars && !categoryScalars.has('icon')) {
    next = next.replace(/\s*icon:\s*c\.icon,?\n/g, '\n')
    next = next.replace(/,\s*icon:\s*c\.icon/g, '')
  }

  for (const { wrong, correct } of relationRules) {
    if (!correct) {
      continue
    }

    next = next.replaceAll(`.${wrong}.`, `.${correct}.`)
    next = next.replaceAll(`, ${wrong}: { id:`, `, ${correct}: { id:`)
  }

  return next
}

/**
 * Parses relation field names from a Prisma schema.
 */
export function parsePrismaModelRelations(schemaContent: string): Record<string, Set<string>> {
  const relations: Record<string, Set<string>> = {}

  for (const block of schemaContent.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const modelName = block[1]
    const fields = new Set<string>()

    for (const line of block[2].split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) {
        continue
      }

      const match = trimmed.match(/^(\w+)\s+([A-Za-z][\w]*)(\[\])?(\s+|$|@)/)
      if (!match) {
        continue
      }

      const [, fieldName, typeName] = match
      if (!PRISMA_SCALAR_TYPES.has(typeName)) {
        fields.add(fieldName)
      }
    }

    relations[modelName] = fields
  }

  return relations
}

/**
 * Fixes Prisma include/select blocks and action mappings that use invented relation or field names.
 */
export function reconcilePrismaRelationIncludes(files: GeneratedAppFile[]): GeneratedAppFile[] {
  const schema = files.find((file) => normalizePath(file.path) === 'prisma/schema.prisma')?.content
  if (!schema) {
    return files
  }

  const relations = parsePrismaModelRelations(schema)
  const scalars = parsePrismaModelScalars(schema)
  const relationRules = buildPrismaRelationRewriteRules(relations)

  if (relationRules.length === 0 && Object.keys(scalars).length === 0) {
    return files
  }

  return files.map((file) => {
    if (!/\.(ts|tsx)$/.test(file.path)) {
      return file
    }

    const content = reconcilePrismaSchemaDriftInContent(
      file.content,
      relations,
      scalars,
      relationRules
    )
    return content === file.content ? file : { ...file, content }
  })
}

/**
 * Normalizes generated files for reliable local and Vercel builds.
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

    if (options.requiresDatabase && path === 'prisma/schema.prisma') {
      return { ...file, content: patchPrismaSchemaContent(file.content) }
    }

    if (shouldSanitizeFontReferences(path)) {
      return { ...file, content: stripExternalGoogleFontReferences(file.content) }
    }

    return file
  })

  const withDatabase = ensureDatabaseScaffold(patched, options)
  const withImports = reconcileMissingAliasImports(withDatabase, useSrcDir)
  const withoutConflictingStubs = removeConflictingModuleStubs(withImports)
  const withActionExports = dedupeActionsTypeConflicts(
    reconcileActionsTypeExports(withoutConflictingStubs)
  )
  const withTypeExports = reconcileTypesExports(withActionExports)
  const withAuthExports = reconcileAuthExports(withTypeExports, options)
  const withNextEnv = ensureNextEnvFile(withAuthExports)
  const withClientProps = reconcileClientComponentProps(withNextEnv)
  const withExportStyles = reconcileComponentExportStyles(withClientProps)
  const withClientPropsAfterExports = reconcileClientComponentProps(withExportStyles)
  const withPrismaRelations = options.requiresDatabase
    ? reconcilePrismaRelationIncludes(withClientPropsAfterExports)
    : withClientPropsAfterExports
  const withDynamicPages = options.requiresDatabase
    ? ensureDatabasePagesAreDynamic(withPrismaRelations)
    : withPrismaRelations
  const withSanitizedImports = sanitizeGeneratedComponentFiles(withDynamicPages)
  const withReadme = ensureReadmeFile(withSanitizedImports, options)
  const withSummary = ensureRepoSummaryFile(withReadme, options)
  return reconcileSplitImportsInFiles(withSummary)
}
