export type PanelTab = 'console' | 'variables' | 'chat' | 'copilot'

export interface PanelStore {
  isOpen: boolean
  activeTab: PanelTab
  panelWidth: number
  togglePanel: () => void
  setActiveTab: (tab: PanelTab) => void
  setPanelWidth: (width: number) => void
  setFullScreen: (fullScreen: boolean) => void
  isFullScreen: boolean
  parentTemplateId: string
  setParentTemplateId: (parentTemplateId: string) => void
  openCopilotPanel: () => void
}
