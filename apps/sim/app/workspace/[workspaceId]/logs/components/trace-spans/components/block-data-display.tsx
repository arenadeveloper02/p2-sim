import { highlight, languages } from 'prismjs'
import 'prismjs/components/prism-json'
import { transformBlockData } from '@/app/workspace/[workspaceId]/logs/components/trace-spans/utils'
import '@/components/emcn/components/code/code.css'

export function BlockDataDisplay({
  data,
  blockType,
  isInput = false,
  isError = false,
}: {
  data: unknown
  blockType?: string
  isInput?: boolean
  isError?: boolean
}) {
  if (!data) return null

  const transformedData = transformBlockData(data, blockType || 'unknown', isInput)
  const dataToDisplay = transformedData || data

  // Format the data as JSON string
  const jsonString = JSON.stringify(dataToDisplay, null, 2)

  if (isError && typeof data === 'object' && data !== null && 'error' in data) {
    const errorData = data as { error: string; [key: string]: unknown }
    return (
      <div className='space-y-2 text-xs'>
        <div className='rounded border border-[var(--text-error)]/20 bg-[var(--text-error)]/10 p-2'>
          <div className='mb-1 font-medium text-[var(--text-error)]'>Error</div>
          <div className='text-[var(--text-error)]'>{errorData.error}</div>
        </div>
        {transformedData &&
          Object.keys(transformedData).filter((key) => key !== 'error' && key !== 'success')
            .length > 0 && (
            <div className='code-editor-theme rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] p-2 dark:bg-[#1F1F1F]'>
              <pre
                className='w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all font-mono text-[11px] text-[var(--text-primary)] leading-[16px] dark:text-[#eeeeee]'
                dangerouslySetInnerHTML={{
                  __html: highlight(
                    JSON.stringify(
                      Object.fromEntries(
                        Object.entries(transformedData).filter(
                          ([key]) => key !== 'error' && key !== 'success'
                        )
                      ),
                      null,
                      2
                    ),
                    languages.json,
                    'json'
                  ),
                }}
              />
            </div>
          )}
      </div>
    )
  }

  return (
    <div className='code-editor-theme overflow-hidden rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] p-2 dark:bg-[#1F1F1F]'>
      <pre
        className='w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all font-mono text-[11px] text-[var(--text-primary)] leading-[16px] dark:text-[#eeeeee]'
        dangerouslySetInnerHTML={{
          __html: highlight(jsonString, languages.json, 'json'),
        }}
      />
    </div>
  )
}
