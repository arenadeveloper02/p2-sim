/**
 * Combined summary of the Arena Design System (former DS_* JSON tokens).
 * Used as Arena Design Guidelines in generate/edit system prompts.
 */
export const ARENA_DESIGN_GUIDELINES = `## Arena Design Guidelines (combined DS tokens — follow exactly)

Source: Arena Design System. Default scale mode = **MD**. Prefer CSS vars from \`app/arena-ds-tokens.css\` (\`--ds-*\`) when present; otherwise use the values below. Bind UI to **semantic** tokens — never invent hex/spacing outside this system. Font: **Poppins** via \`next/font/google\` (weights 400/500/600/700).

### Color primitives (stops 900→50; stop 600 = base)
- white \`#FFFFFF\` · black \`#000000\` · transparent
- Grey: 900 \`#2C2D33\` … 600 \`#6D717F\` … 50 \`#F7F8F9\`
- Blue (Primary): 900 \`#0A2E5D\` · **600 \`#1A73E8\`** · 50 \`#F3F8FE\`
- Pink: 600 \`#F8528F\` · Purple: 600 \`#B364D7\` · Sea Blue: 600 \`#00A7D6\` · Yellow: 600 \`#DFC612\` · Green: 600 \`#3BC884\`
- Status Success: 600 \`#3BC884\` · Warning: 600 \`#FB8145\` · Error: 600 \`#F31A1A\`

### Semantic color (always use these roles)
- Brand: default=blue/600, hover=blue/700, pressed=blue/800, surface=blue/50
- Text: primary=grey/900, secondary=grey/700, tertiary=grey/500, disabled=grey/300, inverse/on-brand=white, link=blue/600, link-hover=blue/700, placeholder=grey/400, Success=success/700, Info=blue/700, Warning=warning/700, Error=error/700
- Icon: default=grey/700, subtle=grey/500, brand=blue/600, disabled=grey/300, Success=green/700, Info=blue/700, Warning=warning/700, Error=error/700
- Surface: page/raised=white, subtle=grey/50, inverse=grey/900, overlay=grey/900@72%
- Border: default=grey/200, strong=grey/400, subtle=grey/50, focus=blue/600, error=error/600, disabled=grey/300
- Focus ring: blue/600@30%
- Interactive: default=blue/600, hover=blue/700, pressed=blue/800, disabled=grey/300, selected=blue/50, on-interactive=white, destructive=error/600
- Status success/warning/error/info: default=*-600, surface=*-50, text=*-800, border=*-300 (info uses blue)
- Graphic palettes: pink/purple/sea-blue/yellow/green → default=*-600, light=*-300, surface=*-50

### Typography (MD default · family Poppins)
- heading: SemiBold 32px / 40px lh
- body: Regular 16px / 24px lh
- label: Medium 12px / 16px lh · letter-spacing 0.25px
- caption: Regular 12px / 16px lh · letter-spacing 0.4px
- Scale modes XSM→XLG: heading 20→48px, body 12→20px. Primitive sizes: heading display 48 / xlg 40 / lg 32 / md 24 / sm 20 / xsm 16; body xlg 20 … xsm 12.

### Spacing & radius (MD)
- Component spacing: 2xs 4 · xs 8 · sm 12 · md 16 · lg 24 · xl 32
- Layout spacing: sm 24 · md 32 · lg 48 · xl 64 · 2xl 80 · 3xl 96 · 4xl 128
- Radius: none 0 · xs 4 · sm 8 · md 12 · lg 16 · xl 28 · pill 80 · full 9999

### Component scale (MD default for buttons/inputs/chips)
- height 40 · padding-x 16 · padding-y 8 · gap 8 · icon 20 · font 16/24 Medium · border 1 · radius 12 · elevation card shadow
- Preview: XSM 24px · SM 32px · MD 40px · LG 48px · XLG 56px

### Elevation (grey/900 based)
- XSM none · SM \`0 1px 2px rgba(44,45,51,.08)\` · MD \`0 2px 8px rgba(44,45,51,.10)\` · LG \`0 4px 16px rgba(44,45,51,.12)\` · XLG \`0 8px 32px rgba(44,45,51,.16)\`

### Motion
- Duration: instant 0 · fast 100ms · normal 200ms · slow 300ms · slower 500ms
- Easing: standard \`cubic-bezier(0.4,0,0.2,1)\` · decelerate \`(0,0,0.2,1)\` · accelerate \`(0.4,0,1,1)\` · sharp \`(0.4,0,0.6,1)\`
- Recipes: hover=fast+standard · dropdown=normal+decelerate · modal enter=slow+decelerate · modal exit=normal+accelerate

### Opacity
- disabled 0.38 · medium 0.60 · overlay 0.72 · full 1.0

### Responsive layout
- Breakpoints: 375(4col) · 428(4) · 768(8) · 1024(12) · 1280(12) · 1440(12) · 1728(12) · 1920(12)
- Gutters 16→48px, margins 20→200px as viewport grows. Desktop container max-width ~928→1520px.

### Charts / DataViz
- Series 1–8: blue/600, warning/600, purple/600, sea-blue/600, yellow/600, pink/600, green/600, grey/600
- Structural: axis=grey/400, grid=grey/200, label=grey/700, bg=white, tooltip bg=grey/900 text=white, positive=success/600, negative=error/600

### Hard rules
- Style with \`var(--ds-…)\` from \`app/arena-ds-tokens.css\` (imported in \`app/globals.css\`); do not delete or empty that file.
- No generic purple-indigo AI themes, no Inter-as-brand, no random hex outside this palette.
- Default interactive chrome: brand blue \`#1A73E8\`, grey text hierarchy, white surfaces, Poppins.`
