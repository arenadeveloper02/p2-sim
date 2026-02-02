import { addComment } from '@/tools/arena/add_comment'
import { clientUpdatedTasks } from '@/tools/arena/client_updated_tasks'
import { createTask } from '@/tools/arena/create_task'
import { getMeetings } from '@/tools/arena/get_meetings'
import { projectSummary } from '@/tools/arena/project_summary'
import { saveSummary } from '@/tools/arena/save_summary'
import { searchTask } from '@/tools/arena/search_task'

export const arenaCreateTask = createTask
export const arenaClientUpdatedTasks = clientUpdatedTasks
export const arenaSearchTask = searchTask
export const arenaSaveSummary = saveSummary
export const arenaAddComment = addComment
export const arenaGetMeetings = getMeetings
export const arenaProjectSummary = projectSummary