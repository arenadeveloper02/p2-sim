import { convertFigmaTool } from './convert_figma'
import { createFigmaTool } from './create_figma'
import { deleteCommentTool } from './delete_comment'
import { getCommentsTool } from './get_comments'
import { getFileTool } from './get_file'
import { getFileImagesTool } from './get_file_images'
import { getFileNodesTool } from './get_file_nodes'
import { getProjectFilesTool } from './get_project_files'
import { getTeamProjectsTool } from './get_team_projects'
import { postCommentTool } from './post_comment'

export const figmaCreateTool = createFigmaTool
export const figmaConvertTool = convertFigmaTool
export const figmaGetCommentsTool = getCommentsTool
export const figmaPostCommentTool = postCommentTool
export const figmaDeleteCommentTool = deleteCommentTool
export const figmaGetTeamProjectsTool = getTeamProjectsTool
export const figmaGetFileTool = getFileTool
export const figmaGetFileNodesTool = getFileNodesTool
export const figmaGetFileImagesTool = getFileImagesTool
export const figmaGetProjectFilesTool = getProjectFilesTool
