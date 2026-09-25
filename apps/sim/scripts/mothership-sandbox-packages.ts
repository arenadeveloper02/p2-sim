/**
 * Package contract for the Arena Copilot / Mothership E2B shell image.
 *
 * Distinct from the Function base (`function-sandbox-packages.ts`): this image is
 * Python + shell oriented for `function_execute` / `run_code` under the
 * mothership sandbox profile. Rebuild with
 * `build-mothership-e2b-template.ts` under a stable alias so
 * `MOTHERSHIP_E2B_TEMPLATE_ID` does not change between package updates.
 */

/** Stable E2B template name written to `MOTHERSHIP_E2B_TEMPLATE_ID`. */
export const MOTHERSHIP_E2B_DEFAULT_TEMPLATE_NAME = 'sim-mothership'

/** Maintained E2B base when `--base-template` is omitted. */
export const MOTHERSHIP_E2B_DEFAULT_BASE_TEMPLATE = 'code-interpreter-v1'

export const MOTHERSHIP_SANDBOX_CPU_COUNT = 2
export const MOTHERSHIP_SANDBOX_MEMORY_MB = 4 * 1024

/** Puppeteer launch config path baked into the image for headless `mmdc`. */
export const MOTHERSHIP_MERMAID_PUPPETEER_CONFIG_PATH = '/usr/local/etc/mermaid-puppeteer.json'

/**
 * Lean apt surface for shell pipelines plus Chromium runtime libs required by
 * Puppeteer / `@mermaid-js/mermaid-cli`.
 */
export const MOTHERSHIP_APT_PACKAGES = [
  'bash',
  'ca-certificates',
  'coreutils',
  'curl',
  'fonts-liberation',
  'fonts-noto-color-emoji',
  'git',
  'jq',
  'libasound2',
  'libatk-bridge2.0-0',
  'libatk1.0-0',
  'libcups2',
  'libdbus-1-3',
  'libdrm2',
  'libgbm1',
  'libgtk-3-0',
  'libnspr4',
  'libnss3',
  'libx11-xcb1',
  'libxcomposite1',
  'libxdamage1',
  'libxfixes3',
  'libxkbcommon0',
  'libxrandr2',
  'procps',
  'ripgrep',
  'sqlite3',
  'tar',
  'unzip',
  'wget',
  'xdg-utils',
  'zip',
] as const

/**
 * Extra PyPI pins layered on E2B's code-interpreter base.
 * Add packages here (or pass `--pip name==version` at build time).
 */
export const MOTHERSHIP_E2B_PYTHON_PACKAGE_CONTRACT = [
  { package: 'SQLAlchemy', version: '2.0.51', importName: 'sqlalchemy' },
  { package: 'beautifulsoup4', version: '4.13.4', importName: 'bs4' },
  { package: 'lxml', version: '5.4.0', importName: 'lxml' },
  { package: 'openpyxl', version: '3.1.5', importName: 'openpyxl' },
  { package: 'python-docx', version: '1.1.2', importName: 'docx' },
  { package: 'PyYAML', version: '6.0.2', importName: 'yaml' },
  { package: 'requests', version: '2.32.4', importName: 'requests' },
  { package: 'tomlkit', version: '0.15.0', importName: 'tomlkit' },
  { package: 'xmltodict', version: '1.0.4', importName: 'xmltodict' },
] as const

export const MOTHERSHIP_E2B_PYTHON_PACKAGES = MOTHERSHIP_E2B_PYTHON_PACKAGE_CONTRACT.map(
  ({ package: packageName, version }) => `${packageName}==${version}`
)

/**
 * Global npm CLIs for Mothership shell/python agents.
 * `@mermaid-js/mermaid-cli` provides `mmdc` (Puppeteer downloads Chromium).
 */
export const MOTHERSHIP_NPM_CLI_PACKAGE_CONTRACT = [
  { package: '@mermaid-js/mermaid-cli', version: '11.12.0' },
] as const

export const MOTHERSHIP_NPM_CLI_PACKAGES = MOTHERSHIP_NPM_CLI_PACKAGE_CONTRACT.map(
  ({ package: packageName, version }) => `${packageName}@${version}`
)

export const MOTHERSHIP_REQUIRED_COMMANDS = [
  'bash',
  'curl',
  'git',
  'jq',
  'mmdc',
  'node',
  'npm',
  'python3',
  'rg',
  'sqlite3',
  'tar',
  'unzip',
  'wget',
  'zip',
] as const

export const MOTHERSHIP_COMMANDS_ASSERT = `for command in ${MOTHERSHIP_REQUIRED_COMMANDS.join(' ')}; do command -v "$command" >/dev/null || exit 1; done`

export const MOTHERSHIP_PYTHON_IMPORTS_ASSERT = `python3 -c 'import importlib, importlib.metadata as metadata; packages = ${JSON.stringify(
  MOTHERSHIP_E2B_PYTHON_PACKAGE_CONTRACT.map(({ package: distribution, importName, version }) => ({
    distribution,
    importName,
    version,
  }))
)}; assert all(metadata.version(item["distribution"]) == item["version"] and importlib.import_module(item["importName"]) for item in packages)'`

/**
 * Writes the Puppeteer no-sandbox config and wraps `mmdc` so Copilot can call
 * `mmdc` without remembering `--puppeteerConfigFile` (required in E2B).
 */
export const MOTHERSHIP_MERMAID_SETUP = [
  `mkdir -p /usr/local/etc`,
  `printf '%s\\n' '{"args":["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"]}' > ${MOTHERSHIP_MERMAID_PUPPETEER_CONFIG_PATH}`,
  `MMDC_BIN="$(command -v mmdc)"`,
  `test -n "$MMDC_BIN"`,
  `mv "$MMDC_BIN" "\${MMDC_BIN}.real"`,
  `printf '%s\\n' '#!/bin/bash' "exec \\"\${MMDC_BIN}.real\\" --puppeteerConfigFile ${MOTHERSHIP_MERMAID_PUPPETEER_CONFIG_PATH} \\"\\$@\\"" > "$MMDC_BIN"`,
  `chmod +x "$MMDC_BIN"`,
].join(' && ')

/** Smoke-renders a tiny diagram so a broken Chromium install fails the build. */
export const MOTHERSHIP_MERMAID_SMOKE_ASSERT = [
  `printf '%s\\n' 'graph TD; A-->B;' > /tmp/sim-mothership-mermaid.mmd`,
  `mmdc -i /tmp/sim-mothership-mermaid.mmd -o /tmp/sim-mothership-mermaid.png -b white`,
  `test -s /tmp/sim-mothership-mermaid.png`,
].join(' && ')

/**
 * Merges contract pins with CLI `--pip` extras. Later entries win on the same
 * distribution name (case-insensitive).
 */
export function mergeMothershipPipPackages(
  extras: readonly string[],
  contract: readonly string[] = MOTHERSHIP_E2B_PYTHON_PACKAGES
): string[] {
  const byName = new Map<string, string>()
  for (const spec of [...contract, ...extras]) {
    const trimmed = spec.trim()
    if (!trimmed) continue
    const name = trimmed
      .split(/[=<>!~]/, 1)[0]
      ?.trim()
      .toLowerCase()
    if (!name) continue
    byName.set(name, trimmed)
  }
  return [...byName.values()]
}
