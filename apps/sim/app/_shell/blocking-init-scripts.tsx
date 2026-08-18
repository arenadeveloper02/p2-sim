'use client'

import { useRef } from 'react'
import { useServerInsertedHTML } from 'next/navigation'
import '@/app/_shell/suppress-react19-script-warning'

const THEME_INIT_SCRIPT = `
  (function () {
    try {
      var theme = localStorage.getItem('sim-theme');
      if (!theme || theme === 'system') {
        localStorage.setItem('sim-theme', 'light');
        theme = 'light';
      }
      document.documentElement.classList.remove('light', 'dark');
      if (theme === 'light' || theme === 'dark') {
        document.documentElement.classList.add(theme);
      } else {
        document.documentElement.classList.add('light');
      }
    } catch (e) {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add('light');
    }
  })();
`

function workspaceLayoutScript(isChatEnabled: boolean): string {
  return `
    (function () {
      var collapsedSidebarWidth = 51;
      try {
        if (window.simDesktop && /Mac/i.test(navigator.userAgent)) {
          document.documentElement.setAttribute('data-sim-desktop-title-bar', 'inset');
          collapsedSidebarWidth = 0;
        }
      } catch (e) {}

      try {
        var path = window.location.pathname;
        if (path.indexOf('/workspace/') === -1) {
          return;
        }
      } catch (e) {
        return;
      }

      var defaultSidebarWidth = 248;
      try {
        var cookieMatch = document.cookie.match(/(?:^|;\\s*)sidebar_collapsed=([^;]*)/);
        var hasCookie = cookieMatch !== null;
        var collapsed = cookieMatch !== null && cookieMatch[1] === '1';

        var state = null;
        try {
          var stored = localStorage.getItem('sidebar-state');
          state = stored ? JSON.parse(stored).state : null;
        } catch (e) {}

        if (!hasCookie && state && typeof state.isCollapsed === 'boolean') {
          collapsed = state.isCollapsed;
          document.cookie = 'sidebar_collapsed=' + (collapsed ? '1' : '0') + '; path=/; max-age=31536000; samesite=lax';
        }

        var width = state && state.sidebarWidth;
        var maxSidebarWidth = Math.max(248, window.innerWidth * 0.3);
        var expandedWidth =
          typeof width === 'number' && isFinite(width)
            ? Math.min(Math.max(width, 248), maxSidebarWidth)
            : defaultSidebarWidth;
        document.documentElement.style.setProperty(
          '--sidebar-expanded-width',
          expandedWidth + 'px'
        );
        document.documentElement.style.setProperty(
          '--sidebar-width',
          (collapsed ? collapsedSidebarWidth : expandedWidth) + 'px'
        );
      } catch (e) {
        document.documentElement.style.setProperty('--sidebar-width', defaultSidebarWidth + 'px');
        document.documentElement.style.setProperty('--sidebar-expanded-width', defaultSidebarWidth + 'px');
      }

      try {
        var panelStored = localStorage.getItem('panel-state');
        if (panelStored) {
          var panelParsed = JSON.parse(panelStored);
          var panelState = panelParsed && panelParsed.state;
          var panelWidth = panelState && panelState.panelWidth;
          var maxPanelWidth = window.innerWidth * 0.4;

          if (panelWidth >= 290 && panelWidth <= maxPanelWidth) {
            document.documentElement.style.setProperty('--panel-width', panelWidth + 'px');
          } else if (panelWidth > maxPanelWidth) {
            document.documentElement.style.setProperty('--panel-width', maxPanelWidth + 'px');
          }

          var activeTab = panelState && panelState.activeTab;
          if (activeTab === 'copilot' && !${isChatEnabled}) {
            activeTab = 'toolbar';
          }
          if (activeTab) {
            document.documentElement.setAttribute('data-panel-active-tab', activeTab);
          }
        }
      } catch (e) {}

      try {
        var editorStored = localStorage.getItem('panel-editor-state');
        if (editorStored) {
          var editorParsed = JSON.parse(editorStored);
          var editorState = editorParsed && editorParsed.state;
          var connectionsHeight = editorState && editorState.connectionsHeight;
          if (connectionsHeight !== undefined && connectionsHeight >= 30 && connectionsHeight <= 300) {
            document.documentElement.style.setProperty(
              '--editor-connections-height',
              connectionsHeight + 'px'
            );
          }
        }
      } catch (e) {}

      try {
        var terminalStored = localStorage.getItem('terminal-state');
        if (terminalStored) {
          var terminalParsed = JSON.parse(terminalStored);
          var terminalState = terminalParsed && terminalParsed.state;
          var terminalHeight = terminalState && terminalState.terminalHeight;
          var maxTerminalHeight = window.innerHeight * 0.7;

          if (terminalHeight >= 30 && terminalHeight <= maxTerminalHeight) {
            document.documentElement.style.setProperty('--terminal-height', terminalHeight + 'px');
          } else if (terminalHeight > maxTerminalHeight) {
            document.documentElement.style.setProperty('--terminal-height', maxTerminalHeight + 'px');
          }
        }
      } catch (e) {}
    })();
  `
}

interface BlockingInitScriptsProps {
  isChatEnabled: boolean
}

/**
 * Injects FOUC and workspace-layout scripts into the SSR HTML stream so they
 * are not `<script>` hosts in the React tree. React 19 warns (and Next's overlay
 * points at RootLayout) when those tags are rendered as components.
 */
export function BlockingInitScripts({ isChatEnabled }: BlockingInitScriptsProps) {
  const inserted = useRef(false)

  useServerInsertedHTML(() => {
    if (inserted.current) return null
    inserted.current = true
    return (
      <>
        <script id='theme-initialization' dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script
          id='workspace-layout-dimensions'
          dangerouslySetInnerHTML={{ __html: workspaceLayoutScript(isChatEnabled) }}
        />
      </>
    )
  })

  return null
}
