import { defineCatalog } from '@json-render/core'
import { schema as reactSchema } from '@json-render/react/schema'
import { z } from 'zod'

/**
 * Interactive webpage catalog for Arena Generative UI (multi-page + CTA actions).
 */
export const arenaGenerativeUiCatalog = defineCatalog(reactSchema, {
  components: {
    Page: {
      props: z.object({
        title: z.string().nullable(),
        backgroundColor: z.string().nullable(),
      }),
      slots: ['default'],
      description: 'Root page wrapper. Always use as the root element for each page Spec.',
    },
    Section: {
      props: z.object({
        padding: z.string().nullable(),
        backgroundColor: z.string().nullable(),
        maxWidth: z.string().nullable(),
      }),
      slots: ['default'],
      description: 'Content section with optional padding and background',
    },
    Stack: {
      props: z.object({
        direction: z.enum(['vertical', 'horizontal']).nullable(),
        gap: z.string().nullable(),
        align: z.enum(['start', 'center', 'end', 'stretch']).nullable(),
      }),
      slots: ['default'],
      description:
        'Flex stack for vertical or horizontal layout. Prefer vertical; this UI is iframe-narrow.',
    },
    Card: {
      props: z.object({
        title: z.string().nullable(),
        padding: z.string().nullable(),
        backgroundColor: z.string().nullable(),
      }),
      slots: ['default'],
      description: 'Card container with optional title',
    },
    Heading: {
      props: z.object({
        text: z.string(),
        level: z.enum(['h1', 'h2', 'h3', 'h4']).nullable(),
        color: z.string().nullable(),
      }),
      description: 'Heading text',
    },
    Text: {
      props: z.object({
        text: z.string(),
        color: z.string().nullable(),
        size: z.string().nullable(),
      }),
      description: 'Paragraph text. Markdown is rendered (emphasis, lists, links).',
    },
    DataText: {
      props: z.object({
        statePath: z.string(),
        fallback: z.string().nullable(),
        color: z.string().nullable(),
        size: z.string().nullable(),
      }),
      description:
        'Displays a host-state value at a dotted path (e.g. content or output.content). Markdown is rendered. For stream: true CTAs, bind statePath to content on the page or section that shows the result.',
    },
    Alert: {
      props: z.object({
        text: z.string(),
        tone: z.enum(['info', 'success', 'warning', 'error']).nullable(),
      }),
      description: 'Inline status message. Markdown is rendered.',
    },
    Spinner: {
      props: z.object({
        label: z.string().nullable(),
      }),
      description: 'Loading indicator shown while an API action is in flight',
    },
    ProgressSteps: {
      props: z.object({
        steps: z.string(),
        durationMs: z.union([z.number(), z.string()]).nullable().optional(),
      }),
      description:
        'Optional. Newline-separated step labels shown while a CTA is pending. Ticks complete over durationMs (default 150000). Include only when the user asked for stepped progress; put it on the page that shows the streaming result.',
    },
    Form: {
      props: z.object({
        actionId: z.string().nullable(),
      }),
      slots: ['default'],
      description:
        'Form wrapper. actionId must match a manifest actions key that calls a declared API.',
    },
    TextInput: {
      props: z.object({
        name: z.string(),
        label: z.string().nullable(),
        placeholder: z.string().nullable(),
        required: z.boolean().nullable(),
      }),
      description: 'Single-line form field; name is used for API input mapping',
    },
    TextArea: {
      props: z.object({
        name: z.string(),
        label: z.string().nullable(),
        placeholder: z.string().nullable(),
        required: z.boolean().nullable(),
      }),
      description: 'Multi-line form field',
    },
    Select: {
      props: z.object({
        name: z.string(),
        label: z.string().nullable(),
        options: z.string(),
        required: z.boolean().nullable(),
      }),
      description: 'Dropdown; options is a comma-separated list of labels',
    },
    SubmitButton: {
      props: z.object({
        label: z.string(),
        actionId: z.string().nullable(),
      }),
      description: 'Submits the nearest Form or runs actionId via run_api',
    },
    Button: {
      props: z.object({
        label: z.string(),
        href: z.string().nullable(),
        navigateTo: z.string().nullable(),
        actionId: z.string().nullable(),
        backgroundColor: z.string().nullable(),
        color: z.string().nullable(),
      }),
      description:
        'Button. Prefer navigateTo for in-app pages, actionId for APIs, href only for true outbound links.',
    },
    NavLink: {
      props: z.object({
        label: z.string(),
        to: z.string(),
      }),
      description: 'In-app navigation link. `to` must be a page path in the manifest.',
    },
    Link: {
      props: z.object({
        label: z.string(),
        href: z.string(),
        color: z.string().nullable(),
      }),
      description: 'Outbound hyperlink (leaves the app)',
    },
    Image: {
      props: z.object({
        src: z.string(),
        alt: z.string().nullable(),
        width: z.string().nullable(),
        height: z.string().nullable(),
      }),
      description: 'Content image only. Do not use for logos, wordmarks, or app branding.',
    },
    Divider: {
      props: z.object({
        color: z.string().nullable(),
      }),
      description: 'Horizontal rule',
    },
    List: {
      props: z.object({
        ordered: z.boolean().nullable(),
      }),
      slots: ['default'],
      description: 'List container; children should be ListItem',
    },
    ListItem: {
      props: z.object({
        text: z.string(),
      }),
      description: 'List item text. Markdown is rendered.',
    },
  },
  actions: {
    navigate: {
      params: z.object({
        to: z.string(),
      }),
      description: 'Navigate to another page path in this app (no API call)',
    },
    run_api: {
      params: z.object({
        actionId: z.string(),
      }),
      description: 'Call a declared CTA action (workflow or HTTP) via the host proxy',
    },
    set_state: {
      params: z.object({
        values: z.record(z.string(), z.unknown()),
      }),
      description: 'Merge values into host state',
    },
  },
})

export const ARENA_GENERATIVE_UI_OUTPUT_RULES = [
  'Output a single complete JSON object. Do NOT wrap it in markdown fences. Do NOT output JSONL patches.',
  'Shape: { "title": string, "content": string, "manifest": { "entryPath": string, "pages": { [path]: { "title", "path", "spec" } }, "actions": { [actionId]: { "apiKey", "inputMapping?", "onSuccess?", "onError?" } } } }',
  'manifest.pages MUST be an object keyed by kebab-case path, never an array. Example: { "home": { "path": "home", "title": "People", "spec": { ... } }, "person": { "path": "person", "title": "Profile", "spec": { ... } } }.',
  'Return one JSON object only. Do not emit a short summary object before the manifest.',
  'Each page spec is a json-render Spec: { "root": string, "elements": { [key]: { type, props, children } } }.',
  'Every page Spec root element must be type Page.',
  'Every element must include a children array (use [] for leaves).',
  'Only use component types from the catalog.',
  'Use NavLink.to or Button.navigateTo for in-app navigation. Never use href for another page in this app.',
  'CTA forms that call APIs must set Form.actionId or SubmitButton.actionId to a key in manifest.actions.',
  'Every manifest.actions[actionId].apiKey MUST be one of the declared API binding keys. Do not invent API keys.',
  'If no API bindings were declared, omit manifest.actions or leave it empty and use navigation only.',
  'onSuccess.navigate and NavLink.to / Button.navigateTo / navigate action `to` must be existing page paths.',
  'Every page must be reachable from entryPath via NavLink, navigateTo, navigate, or onSuccess.navigate.',
  'DataText, Text, Alert, and ListItem render markdown. Put API bodies on DataText (e.g. output.content); do not split markdown into Heading/List elements.',
  'Layout: Page → Section (padding 24px, maxWidth 640px) → one Card. Do not dump a bare Stack of text on the page.',
  'Typography: one Heading level h1 per page, then a short supporting Text. Never title a page "Page 1" or use lorem ipsum.',
  'Actions: one primary Button or NavLink per page. Forms have labeled fields, one SubmitButton, and an optional Back NavLink.',
  'Use catalog props (backgroundColor, padding, gap, maxWidth, color) so the layout is not the default grey dump.',
  'Iframe: this UI usually renders inside a narrow Arena iframe. Single column only. No left sidebar, no persistent page nav, no app chrome.',
  'Do not include a logo, wordmark, or decorative Image for branding. The host already provides chrome.',
  'Navigation is in-content: Back NavLink, one primary Button/NavLink, or submit-then-navigate. Never a left nav listing every page.',
] as const

/** Added to the generator prompt only when a declared binding has `stream: true`. */
export const ARENA_GENERATIVE_UI_STREAMING_OUTPUT_RULE =
  'If a declared API binding has stream: true, still infer a multi-page sitemap from the brief. Put DataText with statePath "content" in the section or page that shows that API body (often a results page). If the result is not on the form page, set onSuccess.navigate to that page and add a Back NavLink to the form. Include ProgressSteps only when the user asked for stepped progress; otherwise omit it.'
