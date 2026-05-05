import { addComment } from '@/tools/arena/add_comment'
import { addCommentTaskNumber } from '@/tools/arena/add_comment_task_number'
import { clientUpdatedTasks } from '@/tools/arena/client_updated_tasks'
import { conversationSummary } from '@/tools/arena/conversation_summary'
import {
  arenaCreateSubTaskFieldsTool,
  arenaCreateSubTaskTool,
  arenaCreateTaskFieldsTool,
  arenaCreateTaskMainTool,
} from '@/tools/arena/create_task'
import { getMeetings } from '@/tools/arena/get_meetings'
import { getMyOverdueTasks } from '@/tools/arena/get_my_overdue_tasks'
import { getMyTasks } from '@/tools/arena/get_my_tasks'
import { getToken } from '@/tools/arena/get_token'
import { projectSummary } from '@/tools/arena/project_summary'
import { saveSummary } from '@/tools/arena/save_summary'
import { searchTask } from '@/tools/arena/search_task'
import { searchTaskSimple } from '@/tools/arena/search_task_simple'

export const arenaCreateTask = arenaCreateTaskMainTool
export const arenaCreateTaskFields = arenaCreateTaskFieldsTool
export const arenaCreateSubTask = arenaCreateSubTaskTool
export const arenaCreateSubTaskFields = arenaCreateSubTaskFieldsTool
export const arenaClientUpdatedTasks = clientUpdatedTasks
export const arenaConversationSummary = conversationSummary
export const arenaSearchTask = searchTask
export const arenaSearchTaskSimple = searchTaskSimple
export const arenaSaveSummary = saveSummary
export const arenaAddComment = addComment
export const arenaAddCommentTaskNumber = addCommentTaskNumber
export const arenaGetMeetings = getMeetings
export const arenaGetMyTasks = getMyTasks
export const arenaGetMyOverdueTasks = getMyOverdueTasks
export const arenaGetToken = getToken
export const arenaProjectSummary = projectSummary
