/**
 * Sim-aligned design tokens for Arena Development generated apps.
 * Light (white) is the default; `.dark` activates when `?theme=dark`.
 */
export const SIM_TOKENS_CSS_PATH = 'app/sim-tokens.css' as const

export const SIM_TOKENS_CSS = `/* Sim UI tokens for Arena iframe apps. Do not hand-edit. */
:root,
.light {
  --bg: #fefefe;
  --surface-1: #fbfbfb;
  --surface-2: #ffffff;
  --surface-3: #f7f7f7;
  --surface-4: #f5f5f5;
  --surface-5: #f3f3f3;
  --surface-6: #e5e5e5;
  --surface-7: #d9d9d9;
  --surface-hover: #f2f2f2;
  --surface-active: #ececec;

  --text-primary: #1a1a1a;
  --text-secondary: #525252;
  --text-tertiary: #5c5c5c;
  --text-muted: #7a7a7a;
  --text-subtle: #8c8c8c;
  --text-body: #434343;
  --text-icon: #5a5a5a;
  --text-inverse: #ffffff;
  --text-error: #ef4444;

  --border: #d8d8d8;
  --border-1: var(--border);

  --brand-400: #1a73e8;
  --brand-500: #1a73e8;
  --brand-secondary: #488fed;
  --brand-accent: #33c482;
  --primary-hover: #155cba;
  --selection: #1a5cf6;
  --warning: #ea580c;

  --white: #ffffff;
}

.dark {
  --bg: #1b1b1b;
  --surface-1: #1e1e1e;
  --surface-2: #232323;
  --surface-3: #242424;
  --surface-4: #292929;
  --surface-5: #363636;
  --surface-6: #454545;
  --surface-7: #505050;
  --surface-hover: #262626;
  --surface-active: #2c2c2c;

  --text-primary: #e6e6e6;
  --text-secondary: #cccccc;
  --text-tertiary: #b3b3b3;
  --text-muted: #6e6e6e;
  --text-subtle: #7d7d7d;
  --text-body: #c1c1c1;
  --text-icon: #969696;
  --text-inverse: #1b1b1b;
  --text-error: #ef4444;

  --border: #444444;
  --border-1: var(--border);

  --brand-400: #4b83f7;
  --brand-500: #4b83f7;
  --brand-secondary: #33b4ff;
  --brand-accent: #33c482;
  --primary-hover: #3b6fd4;
  --selection: #4b83f7;
  --warning: #ff6600;

  --white: #ffffff;
}

html,
body {
  background-color: var(--bg);
  color: var(--text-body);
}
` as const
