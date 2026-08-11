import { VideoIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { StoryboardGenerateResponse } from '@/tools/storyboard/generate'

export const StoryboardBlock: BlockConfig<StoryboardGenerateResponse> = {
  type: 'storyboard',
  name: 'Storyboard',
  description: 'Turn a video idea into scenes with preview images',
  longDescription:
    'Splits a video idea into ordered scenes and generates one preview image per scene. The images are shown in chat so the user can review them and reply with the order they want before the video is generated.',
  category: 'tools',
  bgColor: '#7C3AED',
  icon: VideoIcon,

  subBlocks: [
    {
      id: 'topic',
      title: 'Video Idea',
      type: 'long-input',
      layout: 'full',
      required: true,
      placeholder: 'A short ad for a new electric bike, shot at sunrise in a city',
      description: 'The idea to turn into a storyboard',
    },
    {
      id: 'sceneCount',
      title: 'Number of Scenes',
      type: 'slider',
      layout: 'half',
      min: 1,
      max: 10,
      step: 1,
      value: () => '4',
      description: 'How many scenes to plan and illustrate',
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      layout: 'half',
      options: [
        { label: '16:9 (Landscape)', id: '16:9' },
        { label: '9:16 (Portrait)', id: '9:16' },
        { label: '1:1 (Square)', id: '1:1' },
      ],
      value: () => '16:9',
    },
    {
      id: 'stylePrompt',
      title: 'Visual Style',
      type: 'long-input',
      layout: 'full',
      placeholder: 'Cinematic, warm lighting, shallow depth of field',
      description: 'Applied to every scene so the storyboard looks consistent',
    },
    {
      id: 'conversationId',
      title: 'Conversation ID',
      type: 'short-input',
      layout: 'full',
      placeholder: '<start.conversationId>',
      value: () => '<start.conversationId>',
      description:
        'Used to recall this storyboard when the video is rendered. Leave as the default unless you know why you are changing it.',
    },
    {
      id: 'imageProvider',
      title: 'Image Provider',
      type: 'dropdown',
      layout: 'half',
      mode: 'advanced',
      options: [{ label: 'Fal.ai', id: 'falai' }],
      value: () => 'falai',
      description: 'Scene preview images are generated with Fal.ai',
    },
    {
      id: 'imageModel',
      title: 'Image Model',
      type: 'dropdown',
      layout: 'half',
      mode: 'advanced',
      options: [
        { label: 'Nano Banana 2', id: 'nano-banana-2' },
        { label: 'Nano Banana Pro', id: 'nano-banana-pro' },
        { label: 'Flux 2 Pro', id: 'flux-2-pro' },
      ],
      value: () => 'nano-banana-2',
      description: 'Fal.ai model used for each scene image',
    },
    {
      id: 'planningProvider',
      title: 'Planning Provider',
      type: 'dropdown',
      layout: 'half',
      mode: 'advanced',
      options: [
        { label: 'Anthropic', id: 'anthropic' },
        { label: 'OpenAI', id: 'openai' },
      ],
      value: () => 'anthropic',
      description: 'Text model that only splits the idea into scenes (not used for images)',
    },
    {
      id: 'planningModel',
      title: 'Planning Model',
      type: 'short-input',
      layout: 'half',
      mode: 'advanced',
      placeholder: 'claude-sonnet-5',
      value: () => 'claude-sonnet-5',
      description: 'Text model used only to split the idea into scenes',
    },
  ],

  tools: {
    access: ['storyboard_generate'],
    config: {
      tool: () => 'storyboard_generate',
      params: (params) => ({
        topic: params.topic,
        sceneCount: params.sceneCount,
        stylePrompt: params.stylePrompt,
        conversationId: params.conversationId,
        aspectRatio: params.aspectRatio,
        imageProvider: params.imageProvider,
        imageModel: params.imageModel,
        planningProvider: params.planningProvider,
        planningModel: params.planningModel,
      }),
    },
  },

  inputs: {
    topic: { type: 'string', description: 'The video idea to turn into a storyboard' },
    sceneCount: { type: 'number', description: 'How many scenes to generate (1-10)' },
    stylePrompt: { type: 'string', description: 'Overall visual style for every scene' },
    conversationId: { type: 'string', description: 'Conversation the storyboard belongs to' },
    aspectRatio: { type: 'string', description: 'Aspect ratio of the scene images' },
    imageProvider: { type: 'string', description: 'Image generation provider' },
    imageModel: { type: 'string', description: 'Image model override' },
    planningProvider: { type: 'string', description: 'Provider used for scene planning' },
    planningModel: { type: 'string', description: 'Model used for scene planning' },
  },

  outputs: {
    images: { type: 'array', description: 'Scene preview image URLs, in order' },
    content: { type: 'string', description: 'Scene list and reorder instructions for chat' },
    scenes: { type: 'json', description: 'Ordered scenes: index, description, prompt, imageUrl' },
    storyboardId: { type: 'string', description: 'Identifier of the saved storyboard' },
    conversationId: { type: 'string', description: 'Conversation the storyboard belongs to' },
    topic: { type: 'string', description: 'The video idea used' },
    sceneCount: { type: 'number', description: 'Number of scenes generated' },
  },
}
