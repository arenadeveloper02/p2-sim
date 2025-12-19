import { trackMp } from '@/utilities/mixPanelTrigger'

//Events for External Deployed Chat agents

export const deployedNewChatEvent = (props: any) => {
  trackMp('Selected AI Agents Chat window', `Click 'New Chat'_AI Agent`, {
    ...props,
  })
}

export const deployedChatPromptSentEvent = (props: any) => {
  trackMp('Selected AI Agents Chat window', `Prompt Sent_AI Agent`, {
    ...props,
  })
}

export const deployedChatThreadSelectedEvent = (props: any) => {
  trackMp('Selected AI Agents Chat window', `History_AI Agent`, {
    ...props,
  })
}

export const deployedChatExitEvent = (props: any) => {
  trackMp('Selected AI Agents Chat window', `Exit Agent_AI Agent`, {
    ...props,
  })
}

export const changeWorkspaceEvent = (props: any) => {
  trackMp('Manage Agents LP', `Select Workspace_Manage Agents`, {
    ...props,
  })
}

export const inviteWorkspaceEvent = (props: any) => {
  trackMp('Invite Workspace Pop-up(Manage Agents LP)', `Workspace Invite Sent_Manage Agents`, {
    ...props,
  })
}

export const selectWorkflowEvent = (props: any) => {
  trackMp('Manage Agents LP', `Select Workflow_Manage Agents`, {
    ...props,
  })
}

export const importWorkflowEvent = (props: any) => {
  trackMp('Manage Agents LP', `Import Workflow_Manage Agents`, {
    ...props,
  })
}

export const createWorkflowEvent = (props: any) => {
  trackMp('Manage Agents LP', `Create Workflow_Manage Agents`, {
    ...props,
  })
}

export const selectTriggerEvent = (props: any) => {
  trackMp('Manage Agents LP', `Select Trigger_Manage Agents`, {
    ...props,
  })
}

export const selectBlockEvent = (props: any) => {
  trackMp('Manage Agents LP', `Select Blocks_Manage Agents`, {
    ...props,
  })
}

export const workflowTabSwitchEvent = (props: any) => {
  trackMp('Manage Agents LP', `Manage Agents_Workflow Tabs Switch`, {
    ...props,
  })
}

export const copilotNewChatEvent = (props: any) => {
  trackMp('Manage Agents LP', `Open New Chat_Copilot Tab-Workflow`, {
    ...props,
  })
}

export const copilotPromptSentEvent = (props: any) => {
  trackMp('Manage Agents LP', `Prompt Sent_Copilot Tab-Workflow`, {
    ...props,
  })
}

export const workflowClickMoreOptionsEvent = (props: any) => {
  trackMp('Manage Agents LP', `Click More Option_Workflow`, {
    ...props,
  })
}

export const openWorkflowChatEvent = (props: any) => {
  trackMp('Manage Agents LP', `Open Chat_Workflow`, {
    ...props,
  })
}

export const workflowChatAddInputEvent = (props: any) => {
  trackMp('Manage Agents LP', `Workflow_Chat-Add Input`, {
    ...props,
  })
}

export const workflowChatSelectOutputEvent = (props: any) => {
  trackMp('Manage Agents LP', `Workflow_Chat-Select Output`, {
    ...props,
  })
}

export const workflowChatMsgSentEvent = (props: any): Promise<void> => {
  return trackMp('Manage Agents LP', `Message Sent_Workflow-Chat`, {
    ...props,
  })
}

export const workflowDeployCTAEvent = (props: any): Promise<void> => {
  return trackMp('Manage Agents LP', `Click Deploy CTA`, {
    ...props,
  })
}

export const workflowDeployEvent = (props: any): Promise<void> => {
  return trackMp('Deploy Worflow Pop-up', `Deploy Workflow`, {
    ...props,
  })
}

export const workflowDeployTabSwitchEvent = (props: any): Promise<void> => {
  return trackMp('Deploy Worflow Pop-up', `Deploy Workflow tabs Switch`, {
    ...props,
  })
}

export const deleteDeployedWorkflowCTAEvent = (props: any): Promise<void> => {
  return trackMp('Deploy Worflow Pop-up', `Delete Deployed Worklow CTA`, {
    ...props,
  })
}

export const undeployDeployedWorkflowCTAEvent = (props: any): Promise<void> => {
  return trackMp('Deploy Worflow Pop-up', `Undeploy CTA`, {
    ...props,
  })
}

export const workflowTestCTAEvent = (props: any): Promise<void> => {
  return trackMp('Manage Agents LP', `Click Test CTA`, {
    ...props,
  })
}

export const workflowRunCTAEvent = (props: any): Promise<void> => {
  return trackMp('Manage Agents LP', `Click Run CTA`, {
    ...props,
  })
}

export const openLogsPageEvent = (props: any): Promise<void> => {
  return trackMp('Logs', `Open Logs_Manage Agents`, {
    ...props,
  })
}

export const logsPageTabSwitchEvent = (props: any): Promise<void> => {
  return trackMp('Logs', `Switch Tabs-Logs_Manage Agents`, {
    ...props,
  })
}

export const logsPageSearchEvent = (props: any): Promise<void> => {
  return trackMp('Logs', `Search Logs_Manage agents`, {
    ...props,
  })
}

export const logsRefreshEvent = (props: any): Promise<void> => {
  return trackMp('Logs', `Click refresh-Logs_Manage Agents`, {
    ...props,
  })
}

export const logsFilterDropDown = (props: any): Promise<void> => {
  return trackMp('Logs', `Click filter dropdown-Logs_Manage Agents`, {
    ...props,
  })
}

export const openTemplatesPageEvent = (props: any): Promise<void> => {
  return trackMp('Templates', `Open templates_Manage Agents`, {
    ...props,
  })
}

export const useTemplateEvent = (props: any): Promise<void> => {
  return trackMp('Templates', `Use template_Manage Agents`, {
    ...props,
  })
}

export const openKnowledgeBasePageEvent = (props: any): Promise<void> => {
  return trackMp('Knowledge Base', `Open knowledge base_Manage Agents`, {
    ...props,
  })
}

export const openSettingsPageEvent = (props: any): Promise<void> => {
  return trackMp('Settings', `Open settings_Manage Agents`, {
    ...props,
  })
}

export const settingsPageTabSwitchEvent = (props: any): Promise<void> => {
  return trackMp('Settings', `Tabs switch-Settings_Manage Agents`, {
    ...props,
  })
}
