import {
  createIdeogramProxyTool,
  ideogramImageFileParam,
  ideogramImageUrlParam,
} from '@/tools/ideogram/create-tool'
import type {
  IdeogramDescribeV4Params,
  IdeogramDescribeV4Response,
} from '@/tools/ideogram/types'

export const ideogramDescribeV4Tool = createIdeogramProxyTool<
  IdeogramDescribeV4Params,
  IdeogramDescribeV4Response
>({
  id: 'ideogram_describe_v4',
  name: 'Ideogram Describe 4.0',
  description: 'Describe an image as a structured Ideogram 4.0 JSON prompt',
  operation: 'describe_v4',
  params: {
    image: ideogramImageFileParam,
    imageUrl: ideogramImageUrlParam,
    includeBbox: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Include bounding boxes on elements (default true)',
    },
  },
  body: (params) => ({
    image: params.image,
    imageUrl: params.imageUrl,
    includeBbox: params.includeBbox,
  }),
  transformOutput: (data) => ({
    jsonPrompt: data.jsonPrompt ?? null,
  }),
  outputs: {
    jsonPrompt: {
      type: 'json',
      description: 'Structured V4 JSON prompt for generate_v4',
    },
  },
})
