import { createPageTool } from '@/tools/sharepoint/create_page'
import { listSitesTool } from '@/tools/sharepoint/list_sites'
import { readPageTool } from '@/tools/sharepoint/read_page'
import { updateListItemTool } from '@/tools/sharepoint/update_list'
import { uploadFileTool } from '@/tools/sharepoint/upload_file'

export const sharepointCreatePageTool = createPageTool
export const sharepointListSitesTool = listSitesTool
export const sharepointReadPageTool = readPageTool
export const sharepointUpdateListItemTool = updateListItemTool
export const sharepointAddListItemTool = addListItemTool
export const sharepointUploadFileTool = uploadFileTool
