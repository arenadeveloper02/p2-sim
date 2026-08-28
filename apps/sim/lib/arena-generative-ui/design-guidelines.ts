/**
 * Global visual-composition contract for every generated app. Catalog types
 * only; tokens stay on ARENA DESIGN SYSTEM; design intent picks density/tone;
 * loading/error/retry stay on UX.
 */

/** Catalog-grounded page composition. Absorbed from professional-layout.ts. */
export const ARENA_GENERATIVE_UI_LAYOUT_PROMPT = [
  'LAYOUT',
  'Use a consistent Page → Section container and alignment. Prefer simple layouts over nested chrome. The host caps PageHeader subtitles and Form width; you choose Section width and grouping.',
  'container — Every page is Page → Section → PageHeader, then the task. Do not put Table, Form, or Repeat as a direct child of Page.',
  'measure — Readable content uses Section width "narrow" (host max-w-2xl). Do not set maxWidth unless the brief names an exact cap. Never let prose run the full 1280px. Constrain forms and reading-heavy content to a comfortable width.',
  'wide — Dashboards, Table, Repeat collections, Sparkline: Section width "wide" (up to 1280px). width "full" only when the brief spans the viewport. Not for forms or long DataText. Use full-width layouts only when the content benefits from them.',
  'forms — Multi-field Form: Section "narrow", left-aligned. SearchField hero may sit on a wide Section. Do not run a form the full 1280px.',
  'columns — At most two primary content columns (Columns main+sidebar, or Grid columns 2 for form fields). Grid columns 3 only for a Repeat card collection. Do not use three peer chrome columns.',
  'toolbar — Related filters and secondary actions share one Toolbar above Table/Repeat. Do not scatter Filter, Chip, or Select through the page.',
  'primary — One primary action: PageHeader trailing child, or SubmitButton / SearchField at the end of its task group. Do not put a second prominent Button above the task.',
  'rhythm — gap "lg" between groups on Stack / Grid / Columns. Align related content to shared edges. Use whitespace to separate conceptual groups. Prefer spacing tokens over arbitrary px.',
  'chrome — PageHeader then the task. Do not stack extra display titles, Stat rows, or Alerts above the primary task.',
  'region — One dominant content region per viewport (the Form, the Table/Repeat, or the DataText). A Columns sidebar is supporting, not a second main.',
].join('\n')

/** Catalog-grounded visual weight. Absorbed from visual-hierarchy.ts. */
export const ARENA_GENERATIVE_UI_HIERARCHY_PROMPT = [
  'VISUAL HIERARCHY',
  'Each page has one clear primary purpose. Hierarchy is page purpose → primary content → primary action → supporting information → secondary actions. Use typography, spacing, size, and position — not fills or borders. The host paints Button variants and muted metadata; you pick variant and what sits at each level.',
  'L1 purpose — PageHeader title (or EntityHeader) is the page purpose / primary task. Do not add a second display Heading that restates it.',
  'L2 primary — One SubmitButton, SearchField, or Button variant "primary", or the key Stat / DataText result. Do not put a second filled CTA in the same Section.',
  'L3 supporting — Form fields, Table, Repeat, Card body: the work of the page. Not chrome.',
  'L4 secondary — Toolbar, Filter, Chip, Back / Cancel, KeyValue labels, captions. variant "secondary" or "ghost".',
  'L5 optional — Rarely used or advanced controls go in Drawer, Modal, or after the task (showWhen). Do not put them beside the primary CTA.',
  'primary — Only one primary action dominates a local Section. SubmitButton and SearchField already count. Do not add variant "primary" beside them. Primary actions must have stronger visual emphasis than secondary actions. Do not make every element visually prominent.',
  'secondary — Ordinary actions are "secondary"; Back / Cancel / dismiss are "ghost"; outline + pill is the brand-bordered secondary. Do not paint emphasis with a colour prop.',
  'destructive — variant "destructive" for delete / disconnect. It must never visually compete with the primary. Confirm is host.',
  'metadata — Kicker, KeyValue keys, timestamps, captions stay muted. Do not promote metadata with Heading or Stat. Metadata should be visually quieter than primary content.',
].join('\n')

/**
 * Strong global Design Guidelines. Applied to every generate. Not an LLM stage.
 */
export const ARENA_GENERATIVE_UI_COMPOSITION_PROMPT = [
  'DESIGN GUIDELINES',
  'Apply to every generated UI. Compose catalog components into a coherent product. Do not invent hex, fonts, or CSS. Loading, empty, error, success, and retry chrome are UX — bind statePath; do not emit a second copy.',
  'VISUAL LANGUAGE',
  'Create a clean, modern, professional product UI. Prioritize clarity and hierarchy over decoration. Use visual restraint; avoid unnecessary gradients, shadows, borders, icons, and decorative elements. Every visual element must serve a functional or informational purpose. Maintain consistent visual language across the entire application.',
  ARENA_GENERATIVE_UI_LAYOUT_PROMPT,
  ARENA_GENERATIVE_UI_HIERARCHY_PROMPT,
  'TYPOGRAPHY',
  'Use a consistent type scale. PageHeader.title is visually distinct from section and Card headings. Body (Text, DataText) prioritizes readability. Supporting metadata has reduced emphasis. Avoid excessive font-size variation. Never use typography alone to communicate an important state (bind emptyText / host banner).',
  'COLOR',
  'Use semantic color roles, not arbitrary colours. variant "primary" is reserved for primary actions and important interactive elements. Success, warning, error, and informational meaning come from Alert tone or host chrome — do not invent accent hex. Avoid multiple accent colours without semantic purpose. Do not rely on color alone to communicate meaning. Do not set backgroundColor or a colour prop for branding; the host applies theme as CSS variables.',
  'SPACING',
  'Use a consistent spacing scale: gap "lg" between groups, density from manifest.theme (compact / comfortable / roomy). Tokens: none xs sm md lg xl 2xl on gap and padding. Use larger spacing between Sections than between elements inside a Section. Related elements group through proximity. Avoid both cramped layouts and excessive whitespace. Do not invent arbitrary px when a spacing token exists.',
  'CARDS',
  'Use Card to group independent pieces of information or actions, or as a Repeat item. variant "default" is the raised host surface; "muted" is bordered with no shadow. Do not wrap every Section in a Card. Do not place every component inside a Card. Avoid deeply nested cards (no Card-in-Card). Prefer one surface containing related content over multiple small cards. Use elevation/borders sparingly — the host already paints the Card surface.',
  'BUTTONS',
  'Use action-oriented labels. One primary button per action group whenever possible. Secondary actions use variant "secondary" or "ghost". Destructive actions use variant "destructive". Avoid multiple visually competing primary buttons. Icon-only Button needs an accessible label and is only for universally recognizable actions.',
  'FORMS',
  'Align labels and fields consistently. Group related fields. Use a logical reading order. Avoid unnecessary fields. Place SubmitButton where users finish the form. Pair short related fields in Grid columns 2; keep long free-text full width. Do not make every field full width by default. Multi-field Form stays Section "narrow". Visual only — pending, field errors, and submit disable are host.',
  'TABLES',
  'Optimize Table for scanning and comparison. Keep columns concise. Right-align numeric values where appropriate. Keep primary identifying information visually prominent. Use Repeat of Cards when each row has identity (avatar, action). Do not use Table for narrative entities.',
  'DATA VISUALIZATION',
  'Sparkline must communicate a meaningful relationship or trend. Never generate a decorative Sparkline without values or statePath. Include labels, units, and context when the brief names them. Avoid excessive visual decoration. Stat only from layoutPlan / outputSchema hostKeys.',
  'ICONS',
  'Use icons consistently. Icons reinforce meaning rather than replace important labels. Do not use decorative icons merely to fill space. Use the same icon for the same semantic action throughout the application.',
  'RESPONSIVE DESIGN',
  'Compose for a full page up to 1280px. Prefer fluid Grid / Columns / Stack, not fixed positioning. Grid and Columns collapse to one column in a narrow Arena iframe — do not design as a permanently narrow single column, and do not assume the iframe is 1280px. Do not set maxWidth unless the brief demands an exact cap. Keep primary actions accessible when columns stack. Avoid horizontal scrolling except for inherently wide Table. Never rely on hover to expose essential information or actions (the catalog has no hover-only chrome).',
  'CONTENT',
  'Design for realistic content lengths, not only short placeholder text. Handle long titles, descriptions, names, and numbers gracefully. Avoid awkward truncation of important information. Use meaningful labels rather than generic Submit, Click, or View.',
  'DENSITY',
  'Choose density from DESIGN INTENT / manifest.theme, not a second guess. Dashboards and operational tools may be denser (compact). Forms and workflows use more breathing room (comfortable). Reading-heavy content uses comfortable line length (Section "narrow") and spacing. Avoid unnecessarily dense interfaces.',
  'CONSISTENCY',
  'The same semantic concept must use the same visual treatment. Reuse existing catalog types instead of inventing visually similar variants. Maintain consistent spacing, typography, button hierarchy, and interaction patterns. Do not introduce a new visual pattern when an existing component can express the same concept.',
  'PROFESSIONALISM',
  'Prefer intentional simplicity over visual novelty. Avoid AI-generated UI patterns: excessive gradients, oversized display headings, excessive rounded cards, random icons, unnecessary glassmorphism, and decorative statistics. The interface should look like a coherent product designed by one design system, not a collection of individually generated components.',
].join('\n')
