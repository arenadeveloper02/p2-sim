/**
 * Page-composition heuristics for the spec LLM. Catalog types only; Section
 * width and Form measure are host-enforced. Mechanical JSON stays in
 * catalog-rules.
 */

export const ARENA_GENERATIVE_UI_LAYOUT_PROMPT = [
  'PROFESSIONAL LAYOUT',
  'Compose the page after picking catalog types. The host caps PageHeader subtitles and Form width; you choose Section width and grouping.',
  'container — Every page is Page → Section → PageHeader, then the task. Do not put Table, Form, or Repeat as a direct child of Page.',
  'measure — Readable content uses Section width "narrow" (host max-w-2xl). Do not set maxWidth unless the brief names an exact cap. Never let prose run the full 1280px.',
  'wide — Dashboards, Table, Repeat collections, Sparkline: Section width "wide" (up to 1280px). width "full" only when the brief spans the viewport. Not for forms or long DataText.',
  'forms — Multi-field Form: Section "narrow", left-aligned. SearchField hero may sit on a wide Section. Do not run a form the full 1280px.',
  'columns — At most two primary content columns (Columns main+sidebar, or Grid columns 2 for form fields). Grid columns 3 only for a Repeat card collection. Do not use three peer chrome columns.',
  'toolbar — Related filters and secondary actions share one Toolbar above Table/Repeat. Do not scatter Filter, Chip, or Select through the page.',
  'primary — One primary action: PageHeader trailing child, or SubmitButton / SearchField at the end of its task group. Do not put a second prominent Button above the task.',
  'rhythm — 24px gaps between groups (gap "24px" on Stack / Section). Do not mix size words (md, lg).',
  'chrome — PageHeader then the task. Do not stack extra display titles, Stat rows, or Alerts above the primary task.',
  'region — One dominant content region per viewport (the Form, the Table/Repeat, or the DataText). A Columns sidebar is supporting, not a second main.',
].join('\n')
