/**
 * Arena-local re-export of the shared conversation timeline.
 *
 * Canonical implementation lives at
 * `@/components/conversation-timeline/conversation-timeline` so arena `/chat/`
 * and mothership copilot share one component. Keeping this shim avoids
 * rewriting arena import paths and reduces merge conflict surface on upstream
 * pulls that touch `(interfaces)/chat`.
 */
export {
  ConversationTimeline,
  CONVERSATION_TIMELINE_MIN_TURNS,
  type ConversationTimelineMessage,
} from '@/components/conversation-timeline/conversation-timeline'
