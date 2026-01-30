import { addComment } from './add_comment'
import { createTask } from './create_task'
import { getMeetings } from './get_meetings'
import { saveSummary } from './save_summary'
import { searchTask } from './search_task'

export const arenaCreateTask = createTask
export const arenaSearchTask = searchTask
export const arenaSaveSummary = saveSummary
export const arenaAddComment = addComment
export const arenaGetMeetings = getMeetings
