import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REGRESSION_CONFIG } from '@/tests/regression/config'
import type { RegressionReport } from '@/tests/regression/types'

function gitRoot(): string {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim()
}

function escapeJsonForHtml(json: string): string {
  return json.replace(/</g, '\\u003c')
}

function buildReportHtml(report: RegressionReport): string {
  const embedded = escapeJsonForHtml(JSON.stringify(report))
  const date = report.meta.startedAt.slice(0, 10)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sim Regression — ${date}</title>
  <style>
    :root {
      --bg: #0f1117; --surface: #1a1d27; --text: #e5e7eb; --muted: #9ca3af;
      --pass: #22c55e; --fail: #ef4444; --flaky: #eab308; --skip: #6b7280; --border: #2d3348;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    h1, h2, h3 { margin: 0 0 8px; }
    .muted { color: var(--muted); font-size: 14px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 24px 0; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
    .card .value { font-size: 28px; font-weight: 700; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .badge-pass { background: color-mix(in srgb, var(--pass) 20%, transparent); color: var(--pass); }
    .badge-fail { background: color-mix(in srgb, var(--fail) 20%, transparent); color: var(--fail); }
    .badge-skip { background: color-mix(in srgb, var(--skip) 20%, transparent); color: var(--skip); }
    .banner { background: #3b1f1f; border: 1px solid #7f1d1d; color: #fecaca; padding: 12px 16px; border-radius: 8px; margin: 16px 0; }
    .controls { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0; }
    input, select { background: var(--surface); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 8px 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
    details { margin: 8px 0; background: var(--surface); border-radius: 8px; border: 1px solid var(--border); }
    summary { padding: 12px 16px; cursor: pointer; font-weight: 600; }
    .panel { padding: 0 16px 16px; }
    .error-box { font-family: ui-monospace, monospace; font-size: 12px; background: #111; padding: 12px; border-radius: 6px; white-space: pre-wrap; overflow-x: auto; }
    .section { margin-top: 32px; }
    button.copy { background: #2d3348; border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 12px; }
    a { color: #93c5fd; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Sim Regression Report</h1>
      <p class="muted" id="meta-line"></p>
      <p class="muted" id="policy-line"></p>
    </header>
    <div id="alert-banner"></div>
    <section class="summary" id="summary-cards"></section>
    <div class="controls">
      <input type="search" id="search" placeholder="Search failures, integrations, errors…" />
      <select id="status-filter">
        <option value="all">All statuses</option>
        <option value="fail">Failed only</option>
        <option value="skip">Skipped only</option>
        <option value="pass">Passed only</option>
      </select>
    </div>
    <section class="section" id="failures-section">
      <h2>Failed cases</h2>
      <div id="failures"></div>
    </section>
    <section class="section">
      <h2>All suites</h2>
      <div id="suites"></div>
    </section>
  </div>
  <script id="report-data" type="application/json">${embedded}</script>
  <script>
    const report = JSON.parse(document.getElementById('report-data').textContent);

    function badge(status) {
      return '<span class="badge badge-' + status + '">' + status.toUpperCase() + '</span>';
    }

    function renderMeta() {
      document.getElementById('meta-line').textContent =
        report.meta.environment + ' · ' + report.meta.appUrl + ' · ' +
        (report.meta.gitSha ? report.meta.gitSha.slice(0, 7) : 'local') + ' · ' +
        report.meta.startedAt;
      document.getElementById('policy-line').textContent =
        'Slack: ' + report.policy.slackChannelName + ' · Email: ' + report.policy.emailRecipient +
        ' · Excluded: ' + report.policy.excludedIntegrations.join(', ');
    }

    function renderSummary() {
      const trend = report.summary.vsYesterday;
      const cards = [
        ['Pass rate', report.summary.passRate + '%'],
        ['Passed', String(report.summary.passed)],
        ['Failed', String(report.summary.failed)],
        ['Skipped', String(report.summary.skipped)],
        ['Duration', Math.round(report.summary.durationMs / 1000) + 's'],
      ];
      if (trend) {
        cards.push(['vs yesterday', (trend.passRateDelta >= 0 ? '+' : '') + trend.passRateDelta + '%']);
      }
      document.getElementById('summary-cards').innerHTML = cards.map(function (entry) {
        return '<div class="card"><div class="muted">' + entry[0] + '</div><div class="value">' + entry[1] + '</div></div>';
      }).join('');
      if (report.summary.failed > 0) {
        document.getElementById('alert-banner').innerHTML =
          '<div class="banner">' + report.summary.failed + ' test(s) failed. Review the sections below for what, why, and how to reproduce.</div>';
      }
    }

    function casePanel(testCase) {
      const parts = [];
      parts.push('<details data-status="' + testCase.status + '" data-search="' +
        (testCase.id + ' ' + (testCase.what?.title || '') + ' ' + (testCase.why?.summary || '')).toLowerCase() + '">');
      parts.push('<summary>' + badge(testCase.status) + ' ' + testCase.id + ' · ' + (testCase.what?.title || testCase.id) + '</summary>');
      parts.push('<div class="panel">');
      if (testCase.skipReason) parts.push('<p class="muted">Skipped: ' + testCase.skipReason + '</p>');
      if (testCase.what) {
        parts.push('<h3>What failed</h3><p><strong>Expected:</strong> ' + testCase.what.expected + '</p><p><strong>Actual:</strong> ' + testCase.what.actual + '</p>');
      }
      if (testCase.why) {
        parts.push('<h3>Why</h3><p><strong>Category:</strong> ' + testCase.why.category + '</p><p>' + testCase.why.summary + '</p>');
        if (testCase.why.detail) parts.push('<div class="error-box">' + testCase.why.detail + '</div>');
      }
      if (testCase.reproduce) {
        parts.push('<h3>How to reproduce</h3><ol>' + testCase.reproduce.stepsUi.map(function (step) { return '<li>' + step + '</li>'; }).join('') + '</ol>');
        parts.push('<p><button class="copy" data-copy="' + testCase.reproduce.commandCli.replace(/"/g, '&quot;') + '">Copy CLI</button></p>');
        if (testCase.reproduce.commandApi) {
          parts.push('<div class="error-box">' + testCase.reproduce.commandApi + '</div>');
          parts.push('<p><button class="copy" data-copy="' + testCase.reproduce.commandApi.replace(/"/g, '&quot;') + '">Copy API</button></p>');
        }
      }
      if (testCase.artifacts?.simExecutionUrl) parts.push('<p><a href="' + testCase.artifacts.simExecutionUrl + '">Open Sim execution</a></p>');
      if (testCase.artifacts?.githubRunUrl) parts.push('<p><a href="' + testCase.artifacts.githubRunUrl + '">Open GitHub run</a></p>');
      if (testCase.artifacts?.logExcerpt) parts.push('<div class="error-box">' + testCase.artifacts.logExcerpt + '</div>');
      parts.push('</div></details>');
      return parts.join('');
    }

    function renderFailures() {
      const failed = report.suites.flatMap(function (suite) { return suite.cases; }).filter(function (c) { return c.status === 'fail'; });
      document.getElementById('failures').innerHTML = failed.length ? failed.map(casePanel).join('') : '<p class="muted">No failures 🎉</p>';
    }

    function renderSuites() {
      document.getElementById('suites').innerHTML = report.suites.map(function (suite) {
        return '<details><summary>' + suite.name + ' ' + badge(suite.status) + ' (' + suite.cases.length + ' cases)</summary><div class="panel">' +
          suite.cases.map(casePanel).join('') + '</div></details>';
      }).join('');
    }

    function wireFilters() {
      function apply() {
        const q = document.getElementById('search').value.toLowerCase();
        const status = document.getElementById('status-filter').value;
        document.querySelectorAll('details[data-status]').forEach(function (el) {
          const matchesStatus = status === 'all' || el.getAttribute('data-status') === status;
          const matchesSearch = !q || (el.getAttribute('data-search') || '').includes(q);
          el.style.display = matchesStatus && matchesSearch ? '' : 'none';
        });
      }
      document.getElementById('search').addEventListener('input', apply);
      document.getElementById('status-filter').addEventListener('change', apply);
      document.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.classList.contains('copy')) {
          const value = target.getAttribute('data-copy') || '';
          navigator.clipboard.writeText(value);
        }
      });
    }

    renderMeta();
    renderSummary();
    renderFailures();
    renderSuites();
    wireFilters();
  </script>
</body>
</html>`
}

export function generateRegressionHtml(reportPath: string, outputPath?: string): string {
  const root = gitRoot()
  const resolvedReportPath = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(root, reportPath)
  const report = JSON.parse(readFileSync(resolvedReportPath, 'utf-8')) as RegressionReport
  const date = report.meta.startedAt.slice(0, 10)
  const reportsDir = path.join(root, REGRESSION_CONFIG.reports.outputDir)
  mkdirSync(reportsDir, { recursive: true })
  const htmlPath =
    outputPath ??
    path.join(reportsDir, `regression-${date}.html`)
  const html = buildReportHtml(report)
  writeFileSync(htmlPath, html)
  return htmlPath
}

if (import.meta.main) {
  const input = process.argv[2] ?? 'apps/sim/tests/regression/reports/report.json'
  const output = process.argv[3]
  const htmlPath = generateRegressionHtml(input, output)
  process.stdout.write(`${htmlPath}\n`)
}
