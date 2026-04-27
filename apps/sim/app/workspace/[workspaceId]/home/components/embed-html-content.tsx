'use client'

import { useCallback, useRef, useState } from 'react'

interface EmbedHtmlContentProps {
  html: string
}

export function EmbedHtmlContent() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState(900)

  const syncIframeHeight = useCallback(() => {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!doc) return
    const nextHeight = Math.max(
      doc.documentElement?.scrollHeight ?? 0,
      doc.body?.scrollHeight ?? 0,
      900
    )
    setIframeHeight(nextHeight)
  }, [])

  const handleIframeLoad = useCallback(() => {
    syncIframeHeight()

    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!doc) return

    const resizeObserver = new ResizeObserver(() => syncIframeHeight())
    resizeObserver.observe(doc.documentElement)
    if (doc.body) resizeObserver.observe(doc.body)

    iframe.dataset.resizeObserverAttached = 'true'
    ;(iframe as HTMLIFrameElement & { _resizeObserver?: ResizeObserver })._resizeObserver =
      resizeObserver
  }, [syncIframeHeight])

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Arena AI — VIMI CEO View</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      /* Primitive palette */
      --grey-50:  #F7F8F9; --grey-200: #E2E3E5; --grey-300: #C5C6CC;
      --grey-400: #A7AAB2; --grey-500: #8A8D99; --grey-600: #6D717F;
      --grey-700: #575A66; --grey-800: #41444C; --grey-900: #2C2D33;
      --blue-50:  #F3F8FE; --blue-100: #D1E3FA; --blue-200: #D1E3FA;
      --blue-500: #488FED; --blue-600: #1A73E8; --blue-700: #155CBA; --blue-800: #10458B;

      /* Semantic tokens — exact values from Figma */
      --color-status-info-surface:   #F3F8FE;   /* var(--color/status/info/surface) */
      --color-status-info-text:      #10458B;   /* var(--color/status/info/text) = blue/800 */
      --color-heading-darker:        #2C2D33;   /* var(--color/text/heading-darker) */
      --color-body-darker:           #2C2D33;   /* var(--color/text/body-darker) */
      --color-grey-700-frame:        #41444C;   /* var(--color/grey/700) in this frame = our grey/800 */
      --color-icon-subtle:           #8A8D99;   /* var(--color/icon/subtle) */
      --color-surface-page:          #FFFFFF;   /* var(--color/surface/page) */
      --color-blue-100:              #D1E3FA;   /* var(--color/blue/100) — chat bar border */

      /* Metric card backgrounds */
      --color-red-50:    #FFF3F3;   /* var(--color/red/50) */
      --color-orange-50: #FFF9F5;   /* var(--color/orange/50) */
      --color-green-50:  #F5FCF9;   /* var(--color/graphic/green/green-50) */
      --color-blue-50:   #F3F8FE;   /* var(--color/primary/primary-50) */
      --color-yellow-50: #FDFCF3;   /* var(--color/graphic/yellow/yellow-50) */

      /* Metric chip label text colors */
      --color-red-600:    #C21515;  /* var(--color/red/600) */
      --color-orange-600: #C96737;  /* var(--color/orange/600) */
      --color-green-600:  #2FA06A;  /* var(--color/graphic/green/green-600) */
      --color-blue-500:   #1A73E8;  /* var(--color/primary/primary-500) */
      --color-yellow-600: #B29E0E;  /* var(--color/graphic/yellow/yellow-600) */

      /* Status chips (for highlight cards) */
      --status-error-surface:   #FFF3F3; --status-error-border:   #FAA3A3; --status-error-text:   #921010;
      --status-warning-surface: #FFF9F5; --status-warning-border: #FDCDB5; --status-warning-text: #974D29;
      --status-success-surface: #F5FCF9; --status-success-border: #B1E9CE; --status-success-text: #23784F;

      /* Border & surface */
      --border-default:  #E2E3E5;
      --border-strong:   #A7AAB2;
      --surface-subtle:  #F7F8F9;
      --surface-overlay: rgba(44,45,51,0.72);

      /* Elevation (tokens/elevation) */
      --elevation-sm:  0px 1px 2px rgba(44,45,51,0.08);
      --elevation-md:  0px 2px 8px rgba(44,45,51,0.10);
      --elevation-lg:  0px 4px 16px rgba(44,45,51,0.12);
      --elevation-xl:  0px 8px 32px rgba(44,45,51,0.16);

      /* Radius (tokens/radius) */
      --radius-small:  4px;   /* var(--radius/small) */
      --radius-medium: 8px;   /* var(--radius/medium) */
      --radius-large:  16px;  /* card containers */
      --radius-pill:   9999px;

      /* Spacing */
      --sp-2:4px; --sp-3:8px; --sp-4:12px; --sp-5:16px;
      --sp-6:20px; --sp-7:24px; --sp-8:32px;

      /* Motion */
      --dur-fast: 100ms; --dur-normal: 200ms;
      --ease-std: cubic-bezier(0.4,0,0.2,1);
      --ease-dec: cubic-bezier(0,0,0.2,1);
    }

    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Poppins', system-ui, sans-serif;
      background: #F3F4F8;
      color: var(--color-body-darker);
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }

    .root-layout { display: flex; min-height: 100vh; }

    /* ============================================================
       SIDE NAVIGATION — 52px collapsed
       ============================================================ */
    .sidenav {
      width: 52px; min-height: 100vh; background: #F3F4F8;
      display: flex; flex-direction: column; align-items: center;
      padding: 14px 0 12px; position: fixed; left:0; top:0; bottom:0; z-index:100;
    }
    .sidenav-logo { display:flex; flex-direction:column; align-items:center; gap:2px; margin-bottom:20px; flex-shrink:0; }
    .sidenav-items { display:flex; flex-direction:column; gap:0; flex:1; width:100%; align-items:center; }
    .sidenav-item {
      width:40px; height:36px; border-radius:var(--radius-medium); border:none;
      background:transparent; display:flex; align-items:center; justify-content:center;
      cursor:pointer; color:var(--color-icon-subtle); position:relative;
      transition: background var(--dur-fast) var(--ease-std), color var(--dur-fast) var(--ease-std);
    }
    .sidenav-item:hover { background:rgba(44,45,51,0.06); color:var(--grey-800); }
    .sidenav-item.active { background:var(--color-status-info-surface); color:var(--blue-600); }
    .sidenav-item .nav-tip {
      position:absolute; left:calc(100% + 10px); top:50%; transform:translateY(-50%);
      background:var(--grey-900); color:#fff; font-size:12px; font-weight:500;
      padding:5px 10px; border-radius:var(--radius-small); white-space:nowrap;
      opacity:0; visibility:hidden; pointer-events:none; z-index:200;
      transition: opacity var(--dur-normal) var(--ease-dec);
    }
    .sidenav-item .nav-tip::before {
      content:''; position:absolute; right:100%; top:50%; transform:translateY(-50%);
      border:5px solid transparent; border-right-color:var(--grey-900);
    }
    .sidenav-item:hover .nav-tip { opacity:1; visibility:visible; }
    .sidenav-bottom { display:flex; flex-direction:column; align-items:center; gap:8px; width:100%; }
    .sidenav-add {
      width:28px; height:28px; border-radius:var(--radius-pill); border:1.5px solid var(--border-strong);
      background:transparent; display:flex; align-items:center; justify-content:center;
      cursor:pointer; color:var(--color-icon-subtle);
      transition: border-color var(--dur-fast) var(--ease-std), color var(--dur-fast) var(--ease-std);
    }
    .sidenav-add:hover { border-color:var(--blue-600); color:var(--blue-600); }
    .sidenav-notif {
      position:relative; width:28px; height:28px; display:flex; align-items:center;
      justify-content:center; cursor:pointer; color:var(--color-icon-subtle); border-radius:var(--radius-medium);
    }
    .sidenav-notif:hover { color:var(--grey-800); }
    .sidenav-badge {
      position:absolute; top:2px; right:1px; min-width:14px; height:14px;
      background:var(--blue-600); border-radius:var(--radius-pill); color:#fff;
      font-size:9px; font-weight:700; display:flex; align-items:center; justify-content:center;
      padding:0 3px; border:1.5px solid #F3F4F8;
    }
    .sidenav-avatar {
      width:28px; height:28px; border-radius:var(--radius-pill); background:var(--blue-500);
      color:#fff; font-size:10px; font-weight:600; display:flex; align-items:center;
      justify-content:center; cursor:pointer; font-family:inherit;
      transition: opacity var(--dur-fast) var(--ease-std);
    }
    .sidenav-avatar:hover { opacity:0.85; }

    /* ============================================================
       MAIN CONTENT
       ============================================================ */
    .main-content { flex:1; min-width:0; display:flex; flex-direction:column; }

    /* ── Chat topbar (Figma: 800px centered, rgba bg, blue/100 border, radius/small) ── */
    .chat-topbar {
      display:flex; align-items:center; justify-content:center;
      padding:12px 24px 0;
      background:#F3F4F8;
    }
    .chat-bar {
      display:flex; align-items:center; gap:16px;
      width:100%; max-width:800px; height:56px;
      background:rgba(255,255,255,0.92);
      border:1px solid var(--color-blue-100);    /* color/blue/100 */
      border-radius:var(--radius-small);          /* radius/small = 4px */
      padding:8px 16px;
      box-shadow:var(--elevation-sm);
    }
    .chat-avatar-wrap { width:40px; height:40px; border-radius:50%; overflow:hidden; flex-shrink:0; }
    .chat-avatar-wrap img { width:100%; height:100%; object-fit:cover; display:block; }
    .chat-placeholder {
      font-size:16px;          /* body/medium */
      font-weight:400;         /* Regular */
      line-height:24px;
      color:var(--color-icon-subtle);   /* color/icon/subtle */
      margin:0; flex:1;
    }

    /* ── App wrapper ── */
    .app { max-width:1312px; margin:0 auto; padding:16px 24px 24px; width:100%; }

    /* ── Meta badges (right-aligned, no title) ── */
    .meta-row { display:flex; justify-content:flex-end; gap:8px; margin-bottom:16px; }
    .control {
      background:var(--color-surface-page); border:1px solid var(--border-default);
      color:var(--color-icon-subtle); border-radius:var(--radius-pill);
      padding:6px 14px; font-size:13px; font-family:inherit; box-shadow:var(--elevation-sm);
    }

    /* ── Hero grid (800px left + 484px right, 32px gap) ── */
    .hero { display:grid; grid-template-columns:1fr 484px; gap:32px; margin-bottom:20px; }

    /* ── Card container (no section shadow — elevation on inner cards only) ── */
    .card {
      background:#FFFFFF; border:1px solid var(--border-default);
      border-radius:var(--radius-large);
      backdrop-filter:blur(2px); -webkit-backdrop-filter:blur(2px);
    }

    /* ── Hero main (left Gauge: p-24, gap-16 flex col) ── */
    .hero-main {
      padding:24px;
      display:flex; flex-direction:column; gap:16px;
      position:relative; overflow:hidden;
    }
    .hero-main::after {
      content:""; position:absolute; top:-50px; right:-50px; width:280px; height:280px;
      background:radial-gradient(circle, rgba(26,115,232,0.05), transparent 68%); pointer-events:none;
    }

    /* Eyebrow badge — status/info/surface bg, status/info/text color, radius/small, Regular 14px */
    .eyebrow {
      display:inline-flex; align-items:center; gap:12px;
      height:32px; padding:4px 8px;
      border-radius:var(--radius-small);            /* 4px */
      background:var(--color-status-info-surface);  /* #F3F8FE */
      color:var(--color-status-info-text);           /* #10458B = blue/800 */
      font-size:14px; font-weight:400; line-height:21px;
      align-self:flex-start;
    }
    .eyebrow-avatar { width:32px; height:32px; border-radius:50%; overflow:hidden; flex-shrink:0; }
    .eyebrow-avatar img { width:100%; height:100%; object-fit:cover; display:block; }

    /* Hero heading — Poppins Bold 20px, color/grey/700 (#41444c), tracking -0.4px */
    .hero-main h2 {
      margin:0; font-size:20px; font-weight:700; line-height:28px;
      color:var(--color-grey-700-frame);   /* #41444C */
      letter-spacing:-0.4px;
    }

    /* Hero description — Regular 16px, heading-darker, tracking -0.32px */
    .hero-main > .hero-desc {
      margin:0; font-size:16px; font-weight:400; line-height:24px;
      color:var(--color-heading-darker);   /* #2C2D33 */
      letter-spacing:-0.32px;
    }

    /* ── Hero metrics grid (gap 16px, two rows × 3 cols) ── */
    .hero-metrics {
      display:flex; flex-direction:column; gap:16px;
    }
    .hero-metrics-row { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; }

    /* ── Metric card (colored bg, radius/medium 8px, p-16, gap-8) ── */
    .metric {
      border-radius:var(--radius-medium);   /* 8px */
      padding:16px;
      display:flex; flex-direction:column; gap:8px;
    }
    .metric.red    { background:var(--color-red-50); }
    .metric.green  { background:var(--color-green-50); }
    .metric.blue   { background:var(--color-blue-50); }
    .metric.orange { background:var(--color-orange-50); }
    .metric.yellow { background:var(--color-yellow-50); }

    /* Metric label chip (white bg, radius/small, Label/small: Medium 12px/18px) */
    .metric-chip {
      display:inline-flex; align-items:center;
      background:var(--color-surface-page);   /* white */
      border-radius:var(--radius-small);       /* 4px */
      padding:4px 8px;
      font-size:12px; font-weight:500; line-height:18px;   /* Label/small */
      letter-spacing:0; align-self:flex-start;
    }
    .metric-chip.red    { color:var(--color-red-600); }
    .metric-chip.green  { color:var(--color-green-600); }
    .metric-chip.blue   { color:var(--color-blue-500); }
    .metric-chip.orange { color:var(--color-orange-600); }
    .metric-chip.yellow { color:var(--color-yellow-600); }

    /* Metric value — Heading/small: SemiBold 16px/21px */
    .metric .value {
      margin:0; font-size:16px; font-weight:600; line-height:21px;
      color:var(--grey-900); letter-spacing:0;
    }
    /* Metric sub — Body/small: Regular 14px/21px */
    .metric .sub {
      margin:0; font-size:14px; font-weight:400; line-height:21px;
      color:var(--color-body-darker); letter-spacing:0;
    }

    /* ── Hero priority panel (right Gauge: p-24, gap-16, flex col) ── */
    .hero-priority {
      padding:24px; display:flex; flex-direction:column; gap:16px;
    }

    /* Priority cards (colored bg, radius/medium 8px, px-16 py-8, gap-8) */
    .priority-card {
      display:flex; gap:8px; align-items:flex-start;
      padding:8px 16px;
      border-radius:var(--radius-medium);   /* 8px */
      transition: box-shadow var(--dur-fast) var(--ease-std);
    }
    .priority-card:hover { box-shadow:var(--elevation-md); }
    .priority-card.red    { background:var(--color-red-50); }
    .priority-card.orange { background:var(--color-orange-50); }
    .priority-card.green  { background:var(--color-green-50); }
    .priority-card.blue   { background:var(--color-blue-50); }

    .priority-icon { width:40px; height:40px; flex-shrink:0; }
    .priority-icon img { width:100%; height:100%; object-fit:contain; display:block; }

    .priority-text { flex:1; min-width:0; display:flex; flex-direction:column; gap:8px; }
    /* Priority title — SemiBold 14px/21px */
    .priority-text h4 {
      margin:0; font-size:14px; font-weight:600; line-height:21px;
      color:var(--grey-900); letter-spacing:0;
    }
    /* Priority body — Regular 14px/21px, body-darker */
    .priority-text p {
      margin:0; font-size:14px; font-weight:400; line-height:21px;
      color:var(--color-body-darker); letter-spacing:0;
    }

    /* ── Main layout grid ── */
    .layout { display:grid; grid-template-columns:1fr 484px; gap:32px; }
    .left, .right { display:grid; gap:20px; align-content:start; }

    /* ── Section header ── */
    .section-header {
      display:flex; justify-content:space-between; align-items:center;
      padding:20px 20px 0;
    }
    .section-header h3 { margin:0; font-size:16px; font-weight:600; color:var(--grey-900); }
    .section-header .meta { color:var(--color-icon-subtle); font-size:12px; }

    /* ── Section body (grey tray) ── */
    .section-body {
      padding:16px 20px 20px;
      background:var(--surface-subtle);   /* #F7F8F9 */
      border-radius:0 0 calc(var(--radius-large) - 1px) calc(var(--radius-large) - 1px);
    }
    .grid-2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }

    /* ── Highlight cards ── */
    .highlight {
      background:#FFFFFF; border:1px solid var(--border-default);
      border-radius:var(--radius-medium);  /* 8px — matches radius/medium */
      padding:16px; box-shadow:var(--elevation-sm);
      position:relative; overflow:hidden;
      transition: box-shadow var(--dur-normal) var(--ease-std), transform var(--dur-fast) var(--ease-std);
    }
    .highlight::before {
      content:""; position:absolute; top:0; left:0; width:180px; height:160px;
      background:radial-gradient(ellipse at top left, rgba(26,115,232,0.06), transparent 70%);
      pointer-events:none;
    }
    .highlight:has(.chip-danger)::before  { background:radial-gradient(ellipse at top left, rgba(243,26,26,0.06), transparent 70%); }
    .highlight:has(.chip-danger)          { border-color:rgba(243,26,26,0.14); }
    .highlight:has(.chip-warn)::before    { background:radial-gradient(ellipse at top left, rgba(251,129,69,0.08), transparent 70%); }
    .highlight:has(.chip-warn)            { border-color:rgba(251,129,69,0.18); }
    .highlight:has(.chip-success)::before { background:radial-gradient(ellipse at top left, rgba(59,200,132,0.07), transparent 70%); }
    .highlight:has(.chip-success)         { border-color:rgba(59,200,132,0.15); }
    .highlight:hover { box-shadow:var(--elevation-lg); transform:translateY(-2px); }

    .top-row { display:flex; justify-content:space-between; align-items:start; gap:12px; margin-bottom:8px; }
    /* Highlight title — Body/small mapped to Bold for prominence */
    .highlight h4 {
      margin:0; font-size:14px; font-weight:700; line-height:1.4;
      color:var(--color-heading-darker); letter-spacing:-0.01em;
    }
    .highlight p { margin:8px 0 0; color:var(--color-icon-subtle); font-size:13px; line-height:1.6; }

    /* ── Score badge (pill) ── */
    .score {
      position:relative; display:inline-flex; align-items:center;
      background:var(--surface-subtle); border:1px solid var(--border-default);
      border-radius:var(--radius-pill); padding:3px 8px;
      color:var(--color-icon-subtle); font-size:11px; font-weight:500;
      white-space:nowrap; cursor:help; flex-shrink:0;
    }
    .score .tooltip {
      position:absolute; top:calc(100% + 10px); right:0; width:260px;
      padding:12px; border-radius:var(--radius-medium);
      background:var(--grey-900); border:1px solid rgba(255,255,255,0.08);
      box-shadow:var(--elevation-xl); color:#fff; font-size:12px; line-height:1.55;
      white-space:normal; opacity:0; visibility:hidden; transform:translateY(4px);
      transition: opacity var(--dur-normal) var(--ease-dec), transform var(--dur-normal) var(--ease-dec), visibility var(--dur-normal);
      z-index:20;
    }
    .score:hover .tooltip, .score:focus-within .tooltip { opacity:1; visibility:visible; transform:translateY(0); }
    .tooltip strong { display:block; margin-bottom:6px; color:#E2E3E5; font-size:12px; }

    /* ── Chips — single-line, no-wrap ── */
    .chips { display:flex; gap:8px; flex-wrap:nowrap; overflow-x:auto; margin-top:12px; scrollbar-width:none; }
    .chips::-webkit-scrollbar { display:none; }
    .chip {
      display:inline-flex; align-items:center; gap:4px; padding:4px 8px;
      border-radius:var(--radius-pill); font-size:11px; font-weight:500; line-height:18px;
      background:var(--color-blue-50); border:1px solid var(--color-blue-100); color:var(--blue-700);
      flex-shrink:0; white-space:nowrap;
    }
    .chip-danger  { background:var(--status-error-surface);   border-color:var(--status-error-border);   color:var(--status-error-text); }
    .chip-warn    { background:var(--status-warning-surface); border-color:var(--status-warning-border); color:var(--status-warning-text); }
    .chip-success { background:var(--status-success-surface); border-color:var(--status-success-border); color:var(--status-success-text); }

    /* ── Buttons ── */
    .btn-row { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
    .btn {
      border:0; cursor:pointer; border-radius:var(--radius-medium); padding:8px 16px;
      font-size:13px; font-weight:600; font-family:inherit; white-space:nowrap;
      transition: background var(--dur-fast) var(--ease-std), box-shadow var(--dur-fast) var(--ease-std), transform var(--dur-fast) var(--ease-std);
    }
    .btn:hover { transform:translateY(-1px); }
    .btn-primary { background:var(--blue-600); color:#fff; }
    .btn-primary:hover { background:var(--blue-700); box-shadow:var(--elevation-md); }
    .btn-secondary { background:var(--color-surface-page); color:var(--grey-900); border:1px solid var(--border-default); }
    .btn-secondary:hover { background:var(--surface-subtle); }

    /* ── List + Mini cards ── */
    .list { display:grid; gap:12px; }
    .mini {
      background:#FFFFFF; border:1px solid var(--border-default);
      border-radius:var(--radius-medium); padding:16px; box-shadow:var(--elevation-sm);
    }
    .mini-row { display:flex; align-items:flex-start; gap:12px; }
    /* Source icons — 40×40, radius/medium, matching Figma frame icons */
    .source-icon {
      width:40px; height:40px; border-radius:var(--radius-medium); flex-shrink:0;
      display:flex; align-items:center; justify-content:center;
      font-size:14px; font-weight:700; font-family:inherit;
    }
    .source-icon.gmail    { background:#FEE2E2; color:var(--color-red-600); }
    .source-icon.calendar { background:#EEF2FF; color:#4F46E5; }
    .source-icon.db       { background:#EEF2FF; color:#4F46E5; }
    .source-icon.biz      { background:var(--color-orange-50); color:var(--color-orange-600); }
    /* Mini typography — Body/small */
    .mini h4 { margin:0 0 4px; font-size:13px; font-weight:600; color:var(--color-heading-darker); }
    .mini p  { margin:0; font-size:13px; font-weight:400; color:var(--color-icon-subtle); line-height:1.55; }
    .mini:hover { box-shadow:var(--elevation-md); transform:translateY(-1px); }
    .mini { transition: box-shadow var(--dur-fast) var(--ease-std), transform var(--dur-fast) var(--ease-std); }

    /* ── Actions — text left, stacked CTAs right ── */
    .action {
      display:flex; justify-content:space-between; align-items:flex-start; gap:16px;
      background:#FFFFFF; border:1px solid var(--border-default);
      border-radius:var(--radius-medium); padding:16px 20px;
      box-shadow:var(--elevation-sm);
      transition: box-shadow var(--dur-fast) var(--ease-std), transform var(--dur-fast) var(--ease-std);
    }
    .action:hover { box-shadow:var(--elevation-md); transform:translateY(-1px); }
    .action > div:first-child { flex:1; min-width:0; }
    .action h4 { margin:0 0 4px; font-size:14px; font-weight:600; color:var(--color-heading-darker); }
    .action p  { margin:0; font-size:12px; font-weight:400; color:var(--color-icon-subtle); }
    /* Action CTA group: primary on top, secondary below, right-aligned */
    .action .btn-row { flex-direction:column; gap:8px; min-width:130px; margin-top:0; flex-shrink:0; }
    .action .btn { width:100%; text-align:center; justify-content:center; }

    /* ── Evidence toggle ── */
    .evidence-link {
      margin-top:12px; display:inline-flex; align-items:center; gap:8px;
      color:var(--blue-600); font-size:13px; font-weight:500; cursor:pointer; text-decoration:none;
    }
    .evidence-link:hover { color:var(--blue-700); }
    .evidence { display:none; margin-top:12px; padding:12px; border-radius:var(--radius-small); background:var(--surface-subtle); border:1px solid var(--border-default); }
    .evidence.open { display:block; }
    .evidence ul { margin:0; padding-left:18px; color:var(--color-icon-subtle); font-size:13px; line-height:1.7; }

    /* ── Metric card hover ── */
    .metric { transition: box-shadow var(--dur-fast) var(--ease-std), transform var(--dur-fast) var(--ease-std); cursor:default; }
    .metric:hover { box-shadow:var(--elevation-md); transform:translateY(-1px); }

    /* ── Priority card hover (already has hover) ── */
    .priority-card { cursor:default; }

    /* ── KPI strip — HIGH=red, MEDIUM=orange, POSITIVE=green ── */
    .kpi-strip { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
    .kpi {
      border-radius:var(--radius-medium); padding:14px 16px; box-shadow:var(--elevation-sm);
      border:1px solid transparent;
      transition: box-shadow var(--dur-fast) var(--ease-std), transform var(--dur-fast) var(--ease-std);
    }
    .kpi:hover { box-shadow:var(--elevation-md); transform:translateY(-1px); }
    /* Default */
    .kpi { background:#FFFFFF; border-color:var(--border-default); }
    /* HIGH — red */
    .kpi.kpi-high    { background:var(--color-red-50);    border-color:rgba(194,21,21,0.12); }
    .kpi.kpi-high    .k-label { color:var(--color-red-600); }
    /* MEDIUM — orange */
    .kpi.kpi-medium  { background:var(--color-orange-50); border-color:rgba(201,103,55,0.12); }
    .kpi.kpi-medium  .k-label { color:var(--color-orange-600); }
    /* POSITIVE — green */
    .kpi.kpi-positive{ background:var(--color-green-50);  border-color:rgba(47,160,106,0.12); }
    .kpi.kpi-positive .k-label { color:var(--color-green-600); }

    .kpi .k-label { font-size:10px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:8px; }
    .kpi .k-value { font-size:18px; font-weight:700; color:var(--color-heading-darker); }
    .bar { height:8px; border-radius:var(--radius-pill); background:rgba(44,45,51,0.08); overflow:hidden; margin-top:10px; }
    .bar > span { display:block; height:100%; border-radius:inherit; }
    .kpi.kpi-high    .bar > span { background:linear-gradient(90deg,#F31A1A,#C21515); }
    .kpi.kpi-medium  .bar > span { background:linear-gradient(90deg,#FB8145,#C96737); }
    .kpi.kpi-positive .bar > span { background:linear-gradient(90deg,#3BC884,#2FA06A); }

    /* ── Modal ── */
    .modal-backdrop { position:fixed; inset:0; background:var(--surface-overlay); display:none; align-items:center; justify-content:center; padding:20px; z-index:50; }
    .modal-backdrop.show { display:flex; }
    .modal { width:min(840px,100%); background:#FFFFFF; border:1px solid var(--border-default); border-radius:var(--radius-large); box-shadow:var(--elevation-xl); overflow:hidden; }
    .modal-header { display:flex; justify-content:space-between; align-items:center; padding:20px; border-bottom:1px solid var(--border-default); }
    .modal-header h3 { margin:0; font-size:18px; font-weight:600; color:var(--color-heading-darker); }
    .close { background:var(--surface-subtle); color:var(--color-icon-subtle); border:1px solid var(--border-default); border-radius:var(--radius-medium); padding:8px 14px; font-family:inherit; font-size:13px; font-weight:500; cursor:pointer; }
    .close:hover { background:var(--border-default); }
    .modal-body { padding:20px; display:grid; gap:20px; }
    .split { display:grid; grid-template-columns:1.1fr 0.9fr; gap:16px; }

    /* ── Responsive ── */
    @media (max-width:1180px) { .hero,.layout,.split { grid-template-columns:1fr; } .grid-2 { grid-template-columns:1fr; } }
    @media (max-width:760px)  {
      .sidenav { display:none; } .main-content { margin-left:0 !important; }
      .hero-metrics-row,.kpi-strip { grid-template-columns:1fr; }
      .action { flex-direction:column; align-items:stretch; }
    }
  </style>
</head>
<body>
  <div class="root-layout">
    <!-- ══ MAIN CONTENT ══ -->
    <main class="main-content">

      <!-- Chat topbar: centered 800px, rgba bg, blue/100 border, radius/small -->
      <div class="app">
        <!-- Hero: left Gauge 800px + right Gauge 484px -->
        <section class="hero">

          <!-- Left: briefing + 6 metric cards -->
          <div class="card hero-main">
            <!-- Eyebrow: status/info/surface bg, status/info/text color, radius/small, Regular 14px -->
            <div class="eyebrow">
              <div class="eyebrow-avatar">
                <img src="https://www.figma.com/api/mcp/asset/b800262c-87f3-4863-a6a3-70fd9c8b7ecb" alt="">
              </div>
              Arena AI Executive Briefing
            </div>
            <!-- Heading: Bold 20px, color/grey/700 #41444c, tracking -0.4px -->
            <h2>Two accounts need intervention this week, while one growth opportunity is strengthening.</h2>
            <!-- Description: Regular 16px, heading-darker, tracking -0.32px -->
            <p class="hero-desc">Delivery risk is increasing on two strategic accounts due to unresolved blockers and upcoming client-facing commitments. At the same time, one account shows expansion potential and overall margin mix is improving in paid media and marketing automation.</p>
            <!-- Metrics: 2 rows × 3 cols, gap 16px, each card colored -->
            <div class="hero-metrics">
              <div class="hero-metrics-row">
                <!-- Card: red/50 bg, red/600 label, SemiBold 16px value, Regular 14px sub -->
                <div class="metric red">
                  <span class="metric-chip red">PROJECTED REVENUE AT RISK</span>
                  <div class="value">$184K</div>
                  <div class="sub">Across 2 strategic accounts</div>
                </div>
                <!-- Card: green/50 bg, green/600 label -->
                <div class="metric green">
                  <span class="metric-chip green">PIPELINE UPSIDE IN MOTION</span>
                  <div class="value">$96K</div>
                  <div class="sub">Upsell / expansion potential</div>
                </div>
                <!-- Card: primary/50 bg, primary/500 label -->
                <div class="metric blue">
                  <span class="metric-chip blue">GROSS MARGIN OUTLOOK</span>
                  <div class="value">+2.4%</div>
                  <div class="sub">Service mix improving</div>
                </div>
              </div>
              <div class="hero-metrics-row">
                <!-- Card: orange/50 bg, orange/600 label -->
                <div class="metric orange">
                  <span class="metric-chip orange">ACCOUNTS AT ELEVATED RISK</span>
                  <div class="value">2</div>
                  <div class="sub">1 needs action today</div>
                </div>
                <!-- Card: green/50 bg, green/600 label -->
                <div class="metric green">
                  <span class="metric-chip green">EXPANSION-READY ACCOUNTS</span>
                  <div class="value">1</div>
                  <div class="sub">High-confidence signal</div>
                </div>
                <!-- Card: yellow/50 bg, yellow/600 label -->
                <div class="metric yellow">
                  <span class="metric-chip yellow">RENEWAL-SENSITIVE ACCOUNT</span>
                  <div class="value">$184K</div>
                  <div class="sub">Needs monitoring this month</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: 4 priority cards (p-24 container, gap-16) -->
          <div class="card hero-priority">
            <!-- Card 1: red/50, reminder icon, SemiBold 14px title, Regular 14px body -->
            <div class="priority-card red">
              <div class="priority-icon">
                <img src="https://www.figma.com/api/mcp/asset/b5bc7622-a112-4672-8632-813a0c2b7aa0" alt="1">
              </div>
              <div class="priority-text">
                <h4>Most Important Now</h4>
                <p>Client confidence may dip if recovery ownership is not clear before tomorrow's review.</p>
              </div>
            </div>
            <!-- Card 2: orange/50 -->
            <div class="priority-card orange">
              <div class="priority-icon">
                <img src="https://www.figma.com/api/mcp/asset/ee2b67d9-e22b-41f3-b0ca-0894d669b4ad" alt="2">
              </div>
              <div class="priority-text">
                <h4>Largest Downside Risk</h4>
                <p>Delivery slippage on a strategic account could affect renewal conversations next month.</p>
              </div>
            </div>
            <!-- Card 3: green/50 -->
            <div class="priority-card green">
              <div class="priority-icon">
                <img src="https://www.figma.com/api/mcp/asset/2b5ecc6f-b737-44e3-b215-949925c50532" alt="3">
              </div>
              <div class="priority-text">
                <h4>Best Near-Term Upside</h4>
                <p>Stakeholder engagement signals suggest a budget expansion discussion is now more likely to land.</p>
              </div>
            </div>
            <!-- Card 4: primary/50 -->
            <div class="priority-card blue">
              <div class="priority-icon">
                <img src="https://www.figma.com/api/mcp/asset/cf5c77d2-0025-4e9e-9651-9738ce23b6da" alt="4">
              </div>
              <div class="priority-text">
                <h4>Commercial Positive</h4>
                <p>Paid media and MA are helping improve gross margin mix, offsetting pressure from web delivery delays.</p>
              </div>
            </div>
          </div>
        </section>

        <!-- Main layout -->
        <div class="layout">
          <div class="left">

            <section class="card">
              <div class="section-header"><h3>Immediate Attention</h3><div class="meta">High Impact · Today / this week</div></div>
              <div class="section-body grid-2">
                <article class="highlight">
                  <div class="top-row"><div><h4>Strategic account at risk ahead of tomorrow's client review</h4></div><div class="score" tabindex="0">Confidence 0.90<div class="tooltip"><strong>Why confidence is high</strong>Seen across Gmail, Zoom, and the PM system. The issue is recent, unresolved, and tied to a client-facing review happening tomorrow.</div></div></div>
                  <p>Unresolved delivery blockers, recent negative tone in client communication, and a high-visibility review meeting tomorrow create near-term risk to client confidence and revenue.</p>
                  <div class="chips"><span class="chip chip-danger">Immediate</span><span class="chip">Client Health</span><span class="chip">Revenue Risk</span><span class="chip">Email + Zoom + PM DB</span></div>
                  <div class="btn-row"><button class="btn btn-primary" onclick="openModal('risk1')">View Breakdown</button><button class="btn btn-secondary">Review Owners</button></div>
                </article>
                <article class="highlight">
                  <div class="top-row"><div><h4>Delivery slippage may affect next month's renewal discussion</h4></div><div class="score" tabindex="0">Confidence 0.84<div class="tooltip"><strong>Why confidence is high</strong>Multiple recent updates point to the same delivery pattern, milestone dates have shifted, and the account is commercially sensitive.</div></div></div>
                  <p>A recurring blocker pattern has delayed key milestones across the account. While not yet escalated by the client, the trend is worsening and raises commercial sensitivity.</p>
                  <div class="chips"><span class="chip chip-danger">This week</span><span class="chip">Renewal Sensitivity</span><span class="chip">Trend: Worsening</span></div>
                  <div class="btn-row"><button class="btn btn-primary" onclick="openModal('risk2')">View Breakdown</button><button class="btn btn-secondary">Escalate Internally</button></div>
                </article>
              </div>
            </section>

            <section class="card">
              <div class="section-header"><h3>Upcoming</h3><div class="meta">Next 3–5 days</div></div>
              <div class="section-body grid-2">
                <article class="highlight">
                  <div class="top-row"><div><h4>Executive sponsor sync tomorrow, 11:00 AM</h4></div><div class="score" tabindex="0">Confidence 0.88<div class="tooltip"><strong>Why confidence is high</strong>The calendar event is confirmed, linked delivery issues are still open, and the meeting has executive visibility.</div></div></div>
                  <p>Use this as a narrative reset point: current delivery recovery plan exists but ownership clarity should be tightened before the meeting.</p>
                  <div class="chips"><span class="chip chip-warn">Due in 1 day</span><span class="chip">Executive Visibility</span><span class="chip">Risk: High</span></div>
                </article>
                <article class="highlight">
                  <div class="top-row"><div><h4>Budget expansion signal on Delta account</h4></div><div class="score" tabindex="0">Confidence 0.79<div class="tooltip"><strong>Why confidence is medium-high</strong>Positive stakeholder language, recent performance lift, and repeated growth signals support the expansion opportunity.</div></div></div>
                  <p>Recent meeting language and strong performance indicators suggest a favorable opening for an upsell conversation this week.</p>
                  <div class="chips"><span class="chip chip-success">Opportunity</span><span class="chip">Growth Signal</span><span class="chip">Client Sentiment Positive</span></div>
                </article>
              </div>
            </section>

            <section class="card">
              <div class="section-header"><h3>Opportunities &amp; Positives</h3><div class="meta">Commercial upside and healthy signals</div></div>
              <div class="section-body grid-2">
                <article class="highlight">
                  <div class="top-row"><div><h4>Delta account shows strong upsell readiness</h4></div><div class="score" tabindex="0">Confidence 0.83<div class="tooltip"><strong>Why confidence is high</strong>Opportunity signals are visible across recent meetings, client sentiment, and performance outcomes.</div></div></div>
                  <p>Positive stakeholder language, recent campaign performance lift, and stronger engagement suggest an expansion conversation can be opened this week.</p>
                  <div class="chips"><span class="chip chip-success">Upside</span><span class="chip">Pipeline +$96K</span><span class="chip">Client Sentiment Strong</span></div>
                </article>
                <article class="highlight">
                  <div class="top-row"><div><h4>Paid media and MA service lines are improving margin mix</h4></div><div class="score" tabindex="0">Confidence 0.76<div class="tooltip"><strong>Why confidence is medium-high</strong>Margin improvement is supported by recent service-line mix and account performance.</div></div></div>
                  <p>Recent account mix and performance indicate healthier contribution margins in PPC and marketing automation, helping offset delivery pressure elsewhere.</p>
                  <div class="chips"><span class="chip chip-success">Positive</span><span class="chip">Margin +2.4%</span><span class="chip">Service Mix Improving</span></div>
                </article>
              </div>
            </section>

            <section class="card">
              <div class="section-header"><h3>Recommended Actions</h3><div class="meta">Action-first, executive-appropriate</div></div>
              <div class="section-body list">
                <div class="action"><div><h4>Request a recovery owner confirmation before tomorrow's client review</h4><p>Type: Manual · Linked to client confidence risk · Confidence 0.90</p></div><div class="btn-row"><button class="btn btn-primary">Approve</button><button class="btn btn-secondary">Edit</button></div></div>
                <div class="action"><div><h4>Review the at-risk account narrative and escalation path</h4><p>Type: Suggestion · Prepare a concise leadership-ready update for stakeholders · Confidence 0.85</p></div><div class="btn-row"><button class="btn btn-primary">Generate Brief</button><button class="btn btn-secondary">Dismiss</button></div></div>
                <div class="action"><div><h4>Open an expansion conversation on the Delta account this week</h4><p>Type: Suggestion · Opportunity signal backed by strong stakeholder engagement · Confidence 0.78</p></div><div class="btn-row"><button class="btn btn-primary">Draft Outreach</button><button class="btn btn-secondary">Schedule Review</button></div></div>
              </div>
            </section>

          </div>

          <aside class="right">

            <section class="card">
              <div class="section-header"><h3>Arena AI Rationale</h3></div>
              <div class="section-body list">
                <div class="mini"><h4>Commercial positive</h4><p>Paid media and MA are helping improve gross margin mix, offsetting pressure from web-delivery delays.</p></div>
                <div class="mini"><h4>Why these surfaced</h4><p>Signals were ranked by impact, recency, continuity, client sensitivity, upcoming commitments, business metrics, and CEO persona weighting.</p></div>
                <div class="mini"><h4>What was suppressed</h4><p>Low-level execution chatter, non-client-facing internal updates, and weak-confidence issues that do not change executive decisions.</p></div>
                <div class="mini"><h4>Confidence policy</h4><p>Insights below 0.60 are suppressed. Actions below 0.70 are shown only as suggestions, not direct execution paths.</p></div>
              </div>
            </section>

            <section class="card">
              <div class="section-header"><h3>Source &amp; Business Summary</h3></div>
              <div class="section-body list">
                <div class="mini">
                  <div class="mini-row">
                    <!-- Gmail icon: red/pink bg, bold M -->
                    <div class="source-icon gmail" style="font-size:16px;font-family:'Poppins',sans-serif;">M</div>
                    <div><h4>Gmail</h4><p>Client thread tone weakened in the last 2 messages on one strategic account.</p></div>
                  </div>
                </div>
                <div class="mini">
                  <div class="mini-row">
                    <!-- Calendar icon: indigo/blue bg, calendar grid SVG -->
                    <div class="source-icon calendar">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="15" x2="8" y2="15"/><line x1="12" y1="15" x2="12" y2="15"/><line x1="16" y1="15" x2="16" y2="15"/></svg>
                    </div>
                    <div><h4>Calendar + Zoom</h4><p>Three executive-sensitive meetings in the next 5 days. One has unresolved risk tied to delivery status.</p></div>
                  </div>
                </div>
                <div class="mini">
                  <div class="mini-row">
                    <!-- Database icon: indigo/blue bg, stacked cylinder SVG -->
                    <div class="source-icon db">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v4c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 9v6c0 1.66 4.03 3 9 3s9-1.34 9-3V9"/></svg>
                    </div>
                    <div><h4>Project DB</h4><p>One blocked milestone and two unresolved dependencies remain open on the highest-risk account.</p></div>
                  </div>
                </div>
                <div class="mini">
                  <div class="mini-row">
                    <!-- Bar chart icon: orange bg, ascending bars SVG -->
                    <div class="source-icon biz">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="6" width="4" height="15" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>
                    </div>
                    <div><h4>Business Metrics Layer</h4><p>Revenue at risk, pipeline upside, gross margin trend, and service-line contribution are incorporated into ranking and summary.</p></div>
                  </div>
                </div>
              </div>
            </section>

            <section class="card">
              <div class="section-header"><h3>Ongoing Watchlist</h3><div class="meta">Persistent trends worth monitoring</div></div>
              <div class="section-body list">
                <article class="highlight">
                  <div class="top-row"><div><h4>Campaign efficiency trending downward across one major account for 5 days</h4></div><div class="score" tabindex="0">Confidence 0.68<div class="tooltip"><strong>Why confidence is moderate</strong>The trend is sustained over several days, but the root cause is not fully confirmed and client impact is still indirect.</div></div></div>
                  <p>The issue is not yet urgent at CEO level, but it could affect stakeholder perception if the trend continues into next week.</p>
                  <div class="chips"><span class="chip">Trend: Worsening</span><span class="chip">Watchlist</span><span class="chip">Commercial Impact Possible</span></div>
                  <a class="evidence-link" onclick="toggleEvidence('e1')">Show evidence bundle</a>
                  <div class="evidence" id="e1">
                    <ul><li>Performance decline sustained for 5 days.</li><li>Internal discussion suggests audience fatigue, but no final root cause confirmed.</li><li>No explicit client concern raised yet.</li></ul>
                  </div>
                </article>
              </div>
            </section>

            <section class="card">
              <div class="section-header"><h3>CEO Quick View</h3></div>
              <div class="section-body">
                <div class="kpi-strip">
                  <div class="kpi kpi-high"><div class="k-label">Client Health Risk</div><div class="k-value">HIGH</div><div class="bar"><span style="width:82%"></span></div></div>
                  <div class="kpi kpi-medium"><div class="k-label">Delivery Stability</div><div class="k-value">MEDIUM</div><div class="bar"><span style="width:58%"></span></div></div>
                  <div class="kpi kpi-positive"><div class="k-label">Growth Upside</div><div class="k-value">POSITIVE</div><div class="bar"><span style="width:67%"></span></div></div>
                </div>
              </div>
            </section>

          </aside>
        </div>
      </div>
    </main>
  </div>

  <!-- ══ MODALS — interactions unchanged ══ -->
  <div class="modal-backdrop" id="modal-risk1">
    <div class="modal">
      <div class="modal-header"><h3>Breakdown — Strategic Account Risk</h3><button class="close" onclick="closeModal('risk1')">Close</button></div>
      <div class="modal-body">
        <div class="split">
          <div class="mini"><h4>Executive summary</h4><p>The account is at risk because delivery blockers have remained unresolved while the client-facing review is imminent. Recent communication suggests trust may be weakening.</p></div>
          <div class="mini"><h4>Recommended CEO response</h4><p>Confirm a visible recovery owner, review the narrative before the meeting, and ensure the team presents a credible plan with dates.</p></div>
        </div>
        <div class="kpi-strip">
          <div class="kpi"><div class="k-label">Confidence</div><div class="k-value">0.90</div></div>
          <div class="kpi"><div class="k-label">Time sensitivity</div><div class="k-value">Immediate</div></div>
          <div class="kpi"><div class="k-label">Revenue exposure</div><div class="k-value">Medium–High</div></div>
        </div>
        <div class="mini"><h4>Supporting evidence</h4><p>• Gmail thread tone shifted negative in the last 2 messages.<br>• Zoom summary flagged timeline concern from client stakeholder.<br>• PM DB still shows a blocked dependency against this week's milestone.</p></div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop" id="modal-risk2">
    <div class="modal">
      <div class="modal-header"><h3>Breakdown — Renewal Sensitivity Risk</h3><button class="close" onclick="closeModal('risk2')">Close</button></div>
      <div class="modal-body">
        <div class="mini"><h4>Strategic interpretation</h4><p>This is not yet a crisis, but repeated delivery slippage could undermine renewal confidence if the pattern continues into next month.</p></div>
        <div class="mini"><h4>Supporting evidence</h4><p>• The same blocker pattern appears across multiple recent updates.<br>• Key milestone dates have shifted twice.<br>• No explicit client escalation yet, but continuity of delay increases commercial sensitivity.</p></div>
      </div>
    </div>
  </div>

  <script>
    function openModal(id) { document.getElementById('modal-' + id).classList.add('show'); }
    function closeModal(id) { document.getElementById('modal-' + id).classList.remove('show'); }
    function toggleEvidence(id) { document.getElementById(id).classList.toggle('open'); }
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('show'));
    });
  </script>
</body>
</html>
`

  return (
    <div className='mx-auto w-full px-4 pb-8 sm:px-6 lg:px-10'>
      <iframe
        ref={iframeRef}
        title='Embedded HTML content'
        srcDoc={html}
        sandbox='allow-same-origin'
        onLoad={handleIframeLoad}
        style={{ height: `${iframeHeight}px` }}
        className='w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)]'
      />
    </div>
  )
}
