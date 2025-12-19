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
