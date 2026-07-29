import {
  createIdeogramProxyTool,
  ideogramImageFileParam,
  ideogramImageUrlParam,
} from '@/tools/ideogram/create-tool'
import type { IdeogramDescribeParams, IdeogramDescribeResponse } from '@/tools/ideogram/types'

export const ideogramDescribeTool = createIdeogramProxyTool<
  IdeogramDescribeParams,
  IdeogramDescribeResponse
>({
  id: 'ideogram_describe',
  name: 'Ideogram Describe',
  description: 'Generate text descriptions for an image with Ideogram',
  operation: 'describe',
  params: {
    image: ideogramImageFileParam,
    imageUrl: ideogramImageUrlParam,
    describeModelVersion: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Describe model version: V_2, V_3, or V_4 (default V_3)',
    },
  },
  body: (params) => ({
    image: params.image,
    imageUrl: params.imageUrl,
    describeModelVersion: params.describeModelVersion,
  }),
  transformOutput: (data) => ({
    descriptions: Array.isArray(data.descriptions) ? data.descriptions : [],
  }),
  outputs: {
    descriptions: {
      type: 'array',
      description: 'Generated descriptions for the image',
      items: {
        type: 'object',
        description: 'Description entry',
        properties: {
          text: { type: 'string', description: 'Description text', optional: true },
        },
      },
    },
  },
})
