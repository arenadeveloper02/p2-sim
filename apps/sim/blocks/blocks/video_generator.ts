import { VideoIcon } from '@/components/icons'
import { AuthMode, type BlockConfig, IntegrationType, type SubBlockConfig } from '@/blocks/types'
import { normalizeFileInput, parseOptionalBooleanInput } from '@/blocks/utils'
import type { VideoBlockResponse } from '@/tools/video/types'

const FALAI_PREVIOUS_MODEL_OPTIONS = [
  { label: 'Google Veo 3.1', id: 'veo-3.1' },
  { label: 'OpenAI Sora 2', id: 'sora-2' },
  { label: 'Kling 2.5 Turbo Pro', id: 'kling-2.5-turbo-pro' },
  { label: 'Kling 2.1 Pro', id: 'kling-2.1-pro' },
  { label: 'MiniMax Hailuo 2.3 Pro', id: 'minimax-hailuo-2.3-pro' },
  { label: 'MiniMax Hailuo 2.3 Standard', id: 'minimax-hailuo-2.3-standard' },
  { label: 'WAN 2.1', id: 'wan-2.1' },
  { label: 'LTXV 0.9.8', id: 'ltxv-0.9.8' },
]

const FALAI_LATEST_MODEL_OPTIONS = [
  { label: 'MiniMax H3 (Latest)', id: 'minimax-h3' },
  { label: 'Google Veo 3.1', id: 'veo-3.1' },
  { label: 'Google Veo 3.1 Fast', id: 'veo-3.1-fast' },
  { label: 'OpenAI Sora 2', id: 'sora-2' },
  { label: 'OpenAI Sora 2 Pro', id: 'sora-2-pro' },
  { label: 'ByteDance Seedance 2.0', id: 'seedance-2.0' },
  { label: 'ByteDance Seedance 2.0 Fast', id: 'seedance-2.0-fast' },
  { label: 'Kling 3.0 Pro', id: 'kling-v3-pro' },
  { label: 'Kling 3.0 4K', id: 'kling-v3-4k' },
  { label: 'Kling O3 Pro', id: 'kling-o3-pro' },
  { label: 'Kling O3 4K', id: 'kling-o3-4k' },
  { label: 'MiniMax Hailuo 2.3 Pro', id: 'minimax-hailuo-2.3-pro' },
  { label: 'MiniMax Hailuo 2.3 Standard', id: 'minimax-hailuo-2.3-standard' },
  { label: 'WAN 2.2 A14B Turbo', id: 'wan-2.2-a14b-turbo' },
  { label: 'LTX 2.3', id: 'ltx-2.3' },
  { label: 'LTX 2.3 Fast', id: 'ltx-2.3-fast' },
]

const FALAI_VEO_MODELS = ['veo-3.1', 'veo-3.1-fast']
const FALAI_SORA_MODELS = ['sora-2', 'sora-2-pro']
const FALAI_SEEDANCE_STANDARD_MODELS = ['seedance-2.0']
const FALAI_SEEDANCE_FAST_MODELS = ['seedance-2.0-fast']
const FALAI_SEEDANCE_MODELS = [...FALAI_SEEDANCE_STANDARD_MODELS, ...FALAI_SEEDANCE_FAST_MODELS]
const FALAI_KLING_LATEST_MODELS = ['kling-v3-pro', 'kling-v3-4k', 'kling-o3-pro', 'kling-o3-4k']
const FALAI_KLING_LEGACY_MODELS = ['kling-2.5-turbo-pro', 'kling-2.1-pro']
const FALAI_MINIMAX_STANDARD_MODELS = ['minimax-hailuo-2.3-standard', 'minimax-hailuo-02-standard']
const FALAI_MINIMAX_PRO_MODELS = ['minimax-hailuo-2.3-pro', 'minimax-hailuo-02-pro']
const FALAI_MINIMAX_H3_MODELS = ['minimax-h3']
const FALAI_WAN_MODELS = ['wan-2.2-a14b-turbo']
const FALAI_LTX_MODELS = ['ltx-2.3', 'ltx-2.3-fast']
const FALAI_AUDIO_DEFAULT_ON_MODELS = [
  ...FALAI_VEO_MODELS,
  ...FALAI_SEEDANCE_MODELS,
  'kling-v3-pro',
  'kling-v3-4k',
  ...FALAI_LTX_MODELS,
]
const FALAI_AUDIO_DEFAULT_OFF_MODELS = ['kling-o3-pro', 'kling-o3-4k']

const withFalAIModelOptions = (
  subBlocks: SubBlockConfig[],
  options: SubBlockConfig['options']
): SubBlockConfig[] =>
  subBlocks.map((subBlock) => {
    const condition = subBlock.condition
    if (
      subBlock.id === 'model' &&
      typeof condition === 'object' &&
      condition?.field === 'provider' &&
      condition.value === 'falai'
    ) {
      return { ...subBlock, options }
    }

    return subBlock
  })

export const VideoGeneratorBlock: BlockConfig<VideoBlockResponse> = {
  type: 'video_generator',
  name: 'Video Generator (Legacy)',
  description: 'Generate videos from text using AI',
  hideFromToolbar: true,
  sunset: { status: 'legacy', replacedBy: 'video_generator_v3' },
  authMode: AuthMode.ApiKey,
  longDescription:
    'Generate high-quality videos from text prompts via hosted Fal.ai. Supports multiple models (including Veo, Sora, Kling, MiniMax, WAN, and LTX), aspect ratios, resolutions, prompt optimization, and native audio controls.',
  docsLink: 'https://docs.sim.ai/integrations/video-generator',
  category: 'blocks',
  integrationType: IntegrationType.AI,
  bgColor: '#181C1E',
  icon: VideoIcon,
  canvasPresentation: {
    defaultTitle: 'Video Generator',
    sentences: {
      default: [
        { text: 'Generate a video from', field: 'prompt', core: true },
        { text: ', using', field: 'model' },
      ],
    },
  },

  subBlocks: [
    // Provider selection
    {
      id: 'provider',
      title: 'Provider',
      type: 'dropdown',
      options: [
        // { label: 'Runway Gen-4', id: 'runway' },
        // { label: 'Google Veo 3', id: 'veo' },
        // { label: 'Luma Dream Machine', id: 'luma' },
        // { label: 'MiniMax Hailuo', id: 'minimax' },
        { label: 'Fal.ai (Multi-Model)', id: 'falai' },
      ],
      value: () => 'falai',
      required: true,
    },

    // Note: Runway Gen-4 only supports Gen-4 Turbo for image-to-video (no model selection needed)

    // Google Veo model selection
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      condition: { field: 'provider', value: 'veo' },
      options: [
        { label: 'Veo 3', id: 'veo-3' },
        { label: 'Veo 3 Fast', id: 'veo-3-fast' },
        { label: 'Veo 3.1', id: 'veo-3.1' },
      ],
      value: () => 'veo-3',
      dependsOn: ['provider'],
      required: false,
    },

    // Luma model selection
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      condition: { field: 'provider', value: 'luma' },
      options: [{ label: 'Ray 2', id: 'ray-2' }],
      value: () => 'ray-2',
      dependsOn: ['provider'],
      required: false,
    },

    // MiniMax model and endpoint selection
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      condition: { field: 'provider', value: 'minimax' },
      options: [
        { label: 'Hailuo 2.3', id: 'hailuo-2.3' },
        { label: 'Hailuo-02', id: 'hailuo-02' },
      ],
      value: () => 'hailuo-2.3',
      dependsOn: ['provider'],
      required: false,
    },

    {
      id: 'endpoint',
      title: 'Quality Endpoint',
      type: 'dropdown',
      condition: { field: 'provider', value: 'minimax' },
      options: [
        { label: 'Pro', id: 'pro' },
        { label: 'Standard', id: 'standard' },
      ],
      value: () => 'standard',
      dependsOn: ['provider'],
      required: false,
    },

    // Fal.ai model selection
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      condition: { field: 'provider', value: 'falai' },
      options: FALAI_PREVIOUS_MODEL_OPTIONS,
      value: () => 'veo-3.1',
      dependsOn: ['provider'],
      required: true,
    },

    // Prompt input (required)
    {
      id: 'prompt',
      title: 'Prompt',
      type: 'long-input',
      placeholder: 'Describe the video you want to generate...',
      required: true,
    },

    // Duration selection - Runway (5 or 10 seconds)
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: { field: 'provider', value: 'runway' },
      options: [
        { label: '5', id: '5' },
        { label: '10', id: '10' },
      ],
      value: () => '5',
      dependsOn: ['provider'],
      required: false,
    },

    // Duration selection - Veo (4, 6, or 8 seconds)
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: { field: 'provider', value: 'veo' },
      options: [
        { label: '4', id: '4' },
        { label: '6', id: '6' },
        { label: '8', id: '8' },
      ],
      value: () => '8',
      dependsOn: ['provider'],
      required: false,
    },

    // Duration selection - Luma (5 or 9 seconds)
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: { field: 'provider', value: 'luma' },
      options: [
        { label: '5', id: '5' },
        { label: '9', id: '9' },
      ],
      value: () => '5',
      dependsOn: ['provider'],
      required: false,
    },

    // Duration selection - MiniMax (6 or 10 seconds)
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: { field: 'provider', value: 'minimax' },
      options: [
        { label: '6', id: '6' },
        { label: '10', id: '10' },
      ],
      value: () => '6',
      dependsOn: ['provider'],
      required: false,
    },

    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_MINIMAX_H3_MODELS },
      },
      options: [
        { label: '5', id: '5' },
        { label: '6', id: '6' },
        { label: '7', id: '7' },
        { label: '8', id: '8' },
        { label: '9', id: '9' },
        { label: '10', id: '10' },
        { label: '11', id: '11' },
        { label: '12', id: '12' },
        { label: '13', id: '13' },
        { label: '14', id: '14' },
        { label: '15', id: '15' },
      ],
      value: () => '5',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_VEO_MODELS },
      },
      options: [
        { label: '4', id: '4' },
        { label: '6', id: '6' },
        { label: '8', id: '8' },
      ],
      value: () => '8',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_SORA_MODELS },
      },
      options: [
        { label: '4', id: '4' },
        { label: '8', id: '8' },
        { label: '12', id: '12' },
        { label: '16', id: '16' },
        { label: '20', id: '20' },
      ],
      value: () => '4',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_SEEDANCE_MODELS },
      },
      options: [
        { label: '4', id: '4' },
        { label: '5', id: '5' },
        { label: '6', id: '6' },
        { label: '7', id: '7' },
        { label: '8', id: '8' },
        { label: '9', id: '9' },
        { label: '10', id: '10' },
        { label: '11', id: '11' },
        { label: '12', id: '12' },
        { label: '13', id: '13' },
        { label: '14', id: '14' },
        { label: '15', id: '15' },
      ],
      value: () => '5',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_KLING_LATEST_MODELS },
      },
      options: [
        { label: '3', id: '3' },
        { label: '4', id: '4' },
        { label: '5', id: '5' },
        { label: '6', id: '6' },
        { label: '7', id: '7' },
        { label: '8', id: '8' },
        { label: '9', id: '9' },
        { label: '10', id: '10' },
        { label: '11', id: '11' },
        { label: '12', id: '12' },
        { label: '13', id: '13' },
        { label: '14', id: '14' },
        { label: '15', id: '15' },
      ],
      value: () => '5',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_KLING_LEGACY_MODELS },
      },
      options: [
        { label: '5', id: '5' },
        { label: '8', id: '8' },
        { label: '10', id: '10' },
      ],
      value: () => '5',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_MINIMAX_STANDARD_MODELS },
      },
      options: [
        { label: '6', id: '6' },
        { label: '10', id: '10' },
      ],
      value: () => '6',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'ltx-2.3' },
      },
      options: [
        { label: '6', id: '6' },
        { label: '8', id: '8' },
        { label: '10', id: '10' },
      ],
      value: () => '6',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'ltx-2.3-fast' },
      },
      options: [
        { label: '6', id: '6' },
        { label: '8', id: '8' },
        { label: '10', id: '10' },
        { label: '12', id: '12' },
        { label: '14', id: '14' },
        { label: '16', id: '16' },
        { label: '18', id: '18' },
        { label: '20', id: '20' },
      ],
      value: () => '6',
      dependsOn: ['model'],
      required: false,
    },

    // Aspect ratio selection - Veo (only 16:9 and 9:16)
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      condition: { field: 'provider', value: 'veo' },
      options: [
        { label: '16:9', id: '16:9' },
        { label: '9:16', id: '9:16' },
      ],
      value: () => '16:9',
      dependsOn: ['provider'],
      required: false,
    },

    // Aspect ratio selection - Runway (includes 1:1)
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      condition: { field: 'provider', value: 'runway' },
      options: [
        { label: '16:9', id: '16:9' },
        { label: '9:16', id: '9:16' },
        { label: '1:1', id: '1:1' },
      ],
      value: () => '16:9',
      dependsOn: ['provider'],
      required: false,
    },

    // Aspect ratio selection - Luma (includes 1:1)
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      condition: { field: 'provider', value: 'luma' },
      options: [
        { label: '16:9', id: '16:9' },
        { label: '9:16', id: '9:16' },
        { label: '1:1', id: '1:1' },
      ],
      value: () => '16:9',
      dependsOn: ['provider'],
      required: false,
    },

    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_MINIMAX_H3_MODELS },
      },
      options: [
        { label: '21:9', id: '21:9' },
        { label: '16:9', id: '16:9' },
        { label: '4:3', id: '4:3' },
        { label: '1:1', id: '1:1' },
        { label: '3:4', id: '3:4' },
        { label: '9:16', id: '9:16' },
      ],
      value: () => '16:9',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: {
          field: 'model',
          value: [...FALAI_VEO_MODELS, ...FALAI_SORA_MODELS, ...FALAI_LTX_MODELS],
        },
      },
      options: [
        { label: '16:9', id: '16:9' },
        { label: '9:16', id: '9:16' },
      ],
      value: () => '16:9',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_SEEDANCE_MODELS },
      },
      options: [
        { label: 'Auto', id: 'auto' },
        { label: '21:9', id: '21:9' },
        { label: '16:9', id: '16:9' },
        { label: '4:3', id: '4:3' },
        { label: '1:1', id: '1:1' },
        { label: '3:4', id: '3:4' },
        { label: '9:16', id: '9:16' },
      ],
      value: () => 'auto',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: [...FALAI_KLING_LATEST_MODELS, ...FALAI_WAN_MODELS] },
      },
      options: [
        { label: '16:9', id: '16:9' },
        { label: '9:16', id: '9:16' },
        { label: '1:1', id: '1:1' },
      ],
      value: () => '16:9',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_KLING_LEGACY_MODELS },
      },
      options: [
        { label: '16:9', id: '16:9' },
        { label: '9:16', id: '9:16' },
      ],
      value: () => '16:9',
      dependsOn: ['model'],
      required: false,
    },

    // Note: MiniMax aspect ratio is fixed at 16:9 (not configurable)

    // Note: Runway Gen-4 Turbo outputs at 720p natively (no resolution selector needed)

    // Resolution selection - Veo
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: { field: 'provider', value: 'veo' },
      options: [
        { label: '720p', id: '720p' },
        { label: '1080p', id: '1080p' },
      ],
      value: () => '1080p',
      dependsOn: ['provider'],
      required: false,
    },

    // Resolution selection - Luma
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: { field: 'provider', value: 'luma' },
      options: [
        { label: '540p', id: '540p' },
        { label: '720p', id: '720p' },
        { label: '1080p', id: '1080p' },
      ],
      value: () => '1080p',
      dependsOn: ['provider'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_MINIMAX_H3_MODELS },
      },
      options: [
        { label: '480P', id: '480P' },
        { label: '768P', id: '768P' },
        { label: '2K', id: '2K' },
        { label: '4K', id: '4K' },
      ],
      value: () => '768P',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_VEO_MODELS },
      },
      options: [
        { label: '720p', id: '720p' },
        { label: '1080p', id: '1080p' },
        { label: '4K', id: '4k' },
      ],
      value: () => '1080p',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'sora-2' },
      },
      options: [{ label: '720p', id: '720p' }],
      value: () => '720p',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'sora-2-pro' },
      },
      options: [
        { label: '720p', id: '720p' },
        { label: '1080p', id: '1080p' },
        { label: 'True 1080p', id: 'true_1080p' },
      ],
      value: () => '1080p',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_SEEDANCE_STANDARD_MODELS },
      },
      options: [
        { label: '480p', id: '480p' },
        { label: '720p', id: '720p' },
        { label: '1080p', id: '1080p' },
      ],
      value: () => '720p',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_SEEDANCE_FAST_MODELS },
      },
      options: [
        { label: '480p', id: '480p' },
        { label: '720p', id: '720p' },
      ],
      value: () => '720p',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_WAN_MODELS },
      },
      options: [
        { label: '480p', id: '480p' },
        { label: '580p', id: '580p' },
        { label: '720p', id: '720p' },
      ],
      value: () => '720p',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_LTX_MODELS },
      },
      options: [
        { label: '1080p', id: '1080p' },
        { label: '1440p', id: '1440p' },
        { label: '2160p', id: '2160p' },
      ],
      value: () => '1080p',
      dependsOn: ['model'],
      required: false,
    },

    // Note: MiniMax resolution is fixed per endpoint (Pro=1080p for 6s, Standard=768p)

    // Runway-specific: Visual reference (REQUIRED for Gen-4)
    {
      id: 'visualReference',
      title: 'Reference Image',
      type: 'file-upload',
      condition: { field: 'provider', value: 'runway' },
      placeholder: 'Upload reference image',
      mode: 'basic',
      multiple: false,
      dependsOn: ['provider'],
      required: true,
      acceptedTypes: '.jpg,.jpeg,.png,.webp',
    },

    // Luma-specific: Camera controls
    {
      id: 'cameraControl',
      title: 'Camera Controls',
      type: 'long-input',
      condition: { field: 'provider', value: 'luma' },
      placeholder: 'JSON: [{ "key": "pan_right" }, { "key": "zoom_in" }]',
      dependsOn: ['provider'],
      required: false,
    },

    // MiniMax-specific: Prompt optimizer
    {
      id: 'promptOptimizer',
      title: 'Prompt Optimizer',
      type: 'switch',
      condition: { field: 'provider', value: 'minimax' },
      dependsOn: ['provider'],
    },
    {
      id: 'promptOptimizer',
      title: 'Prompt Optimizer',
      type: 'switch',
      defaultValue: true,
      condition: {
        field: 'provider',
        value: 'falai',
        and: {
          field: 'model',
          value: [...FALAI_MINIMAX_PRO_MODELS, ...FALAI_MINIMAX_STANDARD_MODELS],
        },
      },
      dependsOn: ['model'],
    },
    {
      id: 'generateAudio',
      title: 'Generate Audio',
      type: 'switch',
      defaultValue: true,
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_AUDIO_DEFAULT_ON_MODELS },
      },
      dependsOn: ['model'],
    },
    {
      id: 'generateAudio',
      title: 'Generate Audio',
      type: 'switch',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_AUDIO_DEFAULT_OFF_MODELS },
      },
      dependsOn: ['model'],
    },

    // API Key — hidden on hosted Sim; Fal.ai key is injected from env / BYOK
    {
      id: 'apiKey',
      title: 'API Key',
      type: 'short-input',
      placeholder: 'Enter your Fal.ai API key',
      password: true,
      required: true,
      hideWhenHosted: true,
    },
  ],

  tools: {
    access: [
      // 'video_runway',
      // 'video_veo',
      // 'video_luma',
      // 'video_minimax',
      'video_falai',
    ],
    config: {
      tool: (params) => {
        // Select tool based on provider
        switch (params.provider) {
          // case 'runway':
          //   return 'video_runway'
          // case 'veo':
          //   return 'video_veo'
          // case 'luma':
          //   return 'video_luma'
          // case 'minimax':
          //   return 'video_minimax'
          case 'falai':
            return 'video_falai'
          default:
            return 'video_falai'
        }
      },
      params: (params) => ({
        provider: params.provider,
        apiKey: params.apiKey,
        model: params.model,
        endpoint: params.endpoint,
        prompt: params.prompt,
        duration: params.duration ? Number(params.duration) : undefined,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        visualReference: params.visualReference,
        consistencyMode: params.consistencyMode,
        stylePreset: params.stylePreset,
        promptOptimizer: parseOptionalBooleanInput(params.promptOptimizer),
        generateAudio: parseOptionalBooleanInput(params.generateAudio),
        cameraControl: params.cameraControl
          ? typeof params.cameraControl === 'string'
            ? JSON.parse(params.cameraControl)
            : params.cameraControl
          : undefined,
      }),
    },
  },

  inputs: {
    provider: {
      type: 'string',
      description: 'Video generation provider (falai)',
    },
    // apiKey: { type: 'string', description: 'Provider API key' },
    model: {
      type: 'string',
      description: 'Fal.ai model',
    },
    endpoint: {
      type: 'string',
      description: 'Quality endpoint for MiniMax (pro, standard)',
    },
    prompt: { type: 'string', description: 'Text prompt for video generation' },
    duration: { type: 'number', description: 'Video duration in seconds' },
    aspectRatio: {
      type: 'string',
      description: 'Aspect ratio for supported models',
    },
    resolution: {
      type: 'string',
      description: 'Video resolution for supported models',
    },
    visualReference: { type: 'json', description: 'Reference image for Runway (UserFile)' },
    consistencyMode: {
      type: 'string',
      description: 'Consistency mode for Runway (character, object, style, location)',
    },
    stylePreset: { type: 'string', description: 'Style preset for Runway' },
    promptOptimizer: {
      type: 'boolean',
      description: 'Enable prompt optimization for MiniMax (default: true)',
    },
    generateAudio: {
      type: 'boolean',
      description: 'Generate native audio when supported by the selected model',
    },
    cameraControl: {
      type: 'json',
      description: 'Camera controls for Luma (pan, zoom, tilt, truck, tracking)',
    },
  },

  outputs: {
    videoUrl: { type: 'string', description: 'Generated video URL' },
    videoFile: { type: 'file', description: 'Video file object with metadata' },
    duration: { type: 'number', description: 'Video duration in seconds' },
    width: { type: 'number', description: 'Video width in pixels' },
    height: { type: 'number', description: 'Video height in pixels' },
    provider: { type: 'string', description: 'Provider used' },
    model: { type: 'string', description: 'Model used' },
  },
}

export const VideoGeneratorV2Block: BlockConfig<VideoBlockResponse> = {
  ...VideoGeneratorBlock,
  type: 'video_generator_v2',
  name: 'Video Generator',
  hideFromToolbar: true,
  sunset: { status: 'legacy', replacedBy: 'video_generator_v3' },
  subBlocks: [
    {
      id: 'provider',
      title: 'Provider',
      type: 'dropdown',
      options: [
        // { label: 'Runway Gen-4', id: 'runway' },
        // { label: 'Google Veo 3', id: 'veo' },
        // { label: 'Luma Dream Machine', id: 'luma' },
        // { label: 'MiniMax Hailuo', id: 'minimax' },
        { label: 'Fal.ai (Multi-Model)', id: 'falai' },
      ],
      commandSearchable: true,
      value: () => 'falai',
      required: true,
    },
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      condition: { field: 'provider', value: 'veo' },
      options: [
        { label: 'Veo 3', id: 'veo-3' },
        { label: 'Veo 3 Fast', id: 'veo-3-fast' },
        { label: 'Veo 3.1', id: 'veo-3.1' },
      ],
      value: () => 'veo-3',
      dependsOn: ['provider'],
      required: false,
    },
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      condition: { field: 'provider', value: 'luma' },
      options: [{ label: 'Ray 2', id: 'ray-2' }],
      value: () => 'ray-2',
      dependsOn: ['provider'],
      required: false,
    },
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      condition: { field: 'provider', value: 'minimax' },
      options: [
        { label: 'Hailuo 2.3', id: 'hailuo-2.3' },
        { label: 'Hailuo-02', id: 'hailuo-02' },
      ],
      value: () => 'hailuo-2.3',
      dependsOn: ['provider'],
      required: false,
    },
    {
      id: 'endpoint',
      title: 'Quality Endpoint',
      type: 'dropdown',
      condition: { field: 'provider', value: 'minimax' },
      options: [
        { label: 'Pro', id: 'pro' },
        { label: 'Standard', id: 'standard' },
      ],
      value: () => 'standard',
      dependsOn: ['provider'],
      required: false,
    },
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      condition: { field: 'provider', value: 'falai' },
      options: FALAI_PREVIOUS_MODEL_OPTIONS,
      value: () => 'veo-3.1',
      dependsOn: ['provider'],
      required: true,
    },
    {
      id: 'prompt',
      title: 'Prompt',
      type: 'long-input',
      placeholder: 'Describe the video you want to generate...',
      required: true,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: { field: 'provider', value: 'runway' },
      options: [
        { label: '5', id: '5' },
        { label: '10', id: '10' },
      ],
      value: () => '5',
      dependsOn: ['provider'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: { field: 'provider', value: 'veo' },
      options: [
        { label: '4', id: '4' },
        { label: '6', id: '6' },
        { label: '8', id: '8' },
      ],
      value: () => '8',
      dependsOn: ['provider'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: { field: 'provider', value: 'luma' },
      options: [
        { label: '5', id: '5' },
        { label: '9', id: '9' },
      ],
      value: () => '5',
      dependsOn: ['provider'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: { field: 'provider', value: 'minimax' },
      options: [
        { label: '6', id: '6' },
        { label: '10', id: '10' },
      ],
      value: () => '6',
      dependsOn: ['provider'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_MINIMAX_H3_MODELS },
      },
      options: [
        { label: '5', id: '5' },
        { label: '6', id: '6' },
        { label: '7', id: '7' },
        { label: '8', id: '8' },
        { label: '9', id: '9' },
        { label: '10', id: '10' },
        { label: '11', id: '11' },
        { label: '12', id: '12' },
        { label: '13', id: '13' },
        { label: '14', id: '14' },
        { label: '15', id: '15' },
      ],
      value: () => '5',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_VEO_MODELS },
      },
      options: [
        { label: '4', id: '4' },
        { label: '6', id: '6' },
        { label: '8', id: '8' },
      ],
      value: () => '8',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_SORA_MODELS },
      },
      options: [
        { label: '4', id: '4' },
        { label: '8', id: '8' },
        { label: '12', id: '12' },
        { label: '16', id: '16' },
        { label: '20', id: '20' },
      ],
      value: () => '4',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_SEEDANCE_MODELS },
      },
      options: [
        { label: '4', id: '4' },
        { label: '5', id: '5' },
        { label: '6', id: '6' },
        { label: '7', id: '7' },
        { label: '8', id: '8' },
        { label: '9', id: '9' },
        { label: '10', id: '10' },
        { label: '11', id: '11' },
        { label: '12', id: '12' },
        { label: '13', id: '13' },
        { label: '14', id: '14' },
        { label: '15', id: '15' },
      ],
      value: () => '5',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_KLING_LATEST_MODELS },
      },
      options: [
        { label: '3', id: '3' },
        { label: '4', id: '4' },
        { label: '5', id: '5' },
        { label: '6', id: '6' },
        { label: '7', id: '7' },
        { label: '8', id: '8' },
        { label: '9', id: '9' },
        { label: '10', id: '10' },
        { label: '11', id: '11' },
        { label: '12', id: '12' },
        { label: '13', id: '13' },
        { label: '14', id: '14' },
        { label: '15', id: '15' },
      ],
      value: () => '5',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_KLING_LEGACY_MODELS },
      },
      options: [
        { label: '5', id: '5' },
        { label: '8', id: '8' },
        { label: '10', id: '10' },
      ],
      value: () => '5',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_MINIMAX_STANDARD_MODELS },
      },
      options: [
        { label: '6', id: '6' },
        { label: '10', id: '10' },
      ],
      value: () => '6',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'ltx-2.3' },
      },
      options: [
        { label: '6', id: '6' },
        { label: '8', id: '8' },
        { label: '10', id: '10' },
      ],
      value: () => '6',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'duration',
      title: 'Duration (seconds)',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'ltx-2.3-fast' },
      },
      options: [
        { label: '6', id: '6' },
        { label: '8', id: '8' },
        { label: '10', id: '10' },
        { label: '12', id: '12' },
        { label: '14', id: '14' },
        { label: '16', id: '16' },
        { label: '18', id: '18' },
        { label: '20', id: '20' },
      ],
      value: () => '6',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      condition: { field: 'provider', value: 'veo' },
      options: [
        { label: '16:9', id: '16:9' },
        { label: '9:16', id: '9:16' },
      ],
      value: () => '16:9',
      dependsOn: ['provider'],
      required: false,
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_MINIMAX_H3_MODELS },
      },
      options: [
        { label: '21:9', id: '21:9' },
        { label: '16:9', id: '16:9' },
        { label: '4:3', id: '4:3' },
        { label: '1:1', id: '1:1' },
        { label: '3:4', id: '3:4' },
        { label: '9:16', id: '9:16' },
      ],
      value: () => '16:9',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      condition: { field: 'provider', value: 'runway' },
      options: [
        { label: '16:9', id: '16:9' },
        { label: '9:16', id: '9:16' },
        { label: '1:1', id: '1:1' },
      ],
      value: () => '16:9',
      dependsOn: ['provider'],
      required: false,
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      condition: { field: 'provider', value: 'luma' },
      options: [
        { label: '16:9', id: '16:9' },
        { label: '9:16', id: '9:16' },
        { label: '1:1', id: '1:1' },
      ],
      value: () => '16:9',
      dependsOn: ['provider'],
      required: false,
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: {
          field: 'model',
          value: [...FALAI_VEO_MODELS, ...FALAI_SORA_MODELS, ...FALAI_LTX_MODELS],
        },
      },
      options: [
        { label: '16:9', id: '16:9' },
        { label: '9:16', id: '9:16' },
      ],
      value: () => '16:9',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_SEEDANCE_MODELS },
      },
      options: [
        { label: 'Auto', id: 'auto' },
        { label: '21:9', id: '21:9' },
        { label: '16:9', id: '16:9' },
        { label: '4:3', id: '4:3' },
        { label: '1:1', id: '1:1' },
        { label: '3:4', id: '3:4' },
        { label: '9:16', id: '9:16' },
      ],
      value: () => 'auto',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: [...FALAI_KLING_LATEST_MODELS, ...FALAI_WAN_MODELS] },
      },
      options: [
        { label: '16:9', id: '16:9' },
        { label: '9:16', id: '9:16' },
        { label: '1:1', id: '1:1' },
      ],
      value: () => '16:9',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_KLING_LEGACY_MODELS },
      },
      options: [
        { label: '16:9', id: '16:9' },
        { label: '9:16', id: '9:16' },
      ],
      value: () => '16:9',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: { field: 'provider', value: 'veo' },
      options: [
        { label: '720p', id: '720p' },
        { label: '1080p', id: '1080p' },
      ],
      value: () => '1080p',
      dependsOn: ['provider'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: { field: 'provider', value: 'luma' },
      options: [
        { label: '540p', id: '540p' },
        { label: '720p', id: '720p' },
        { label: '1080p', id: '1080p' },
      ],
      value: () => '1080p',
      dependsOn: ['provider'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_MINIMAX_H3_MODELS },
      },
      options: [
        { label: '480P', id: '480P' },
        { label: '768P', id: '768P' },
        { label: '2K', id: '2K' },
        { label: '4K', id: '4K' },
      ],
      value: () => '768P',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_VEO_MODELS },
      },
      options: [
        { label: '720p', id: '720p' },
        { label: '1080p', id: '1080p' },
        { label: '4K', id: '4k' },
      ],
      value: () => '1080p',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'sora-2' },
      },
      options: [{ label: '720p', id: '720p' }],
      value: () => '720p',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'sora-2-pro' },
      },
      options: [
        { label: '720p', id: '720p' },
        { label: '1080p', id: '1080p' },
        { label: 'True 1080p', id: 'true_1080p' },
      ],
      value: () => '1080p',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_SEEDANCE_STANDARD_MODELS },
      },
      options: [
        { label: '480p', id: '480p' },
        { label: '720p', id: '720p' },
        { label: '1080p', id: '1080p' },
      ],
      value: () => '720p',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_SEEDANCE_FAST_MODELS },
      },
      options: [
        { label: '480p', id: '480p' },
        { label: '720p', id: '720p' },
      ],
      value: () => '720p',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_WAN_MODELS },
      },
      options: [
        { label: '480p', id: '480p' },
        { label: '580p', id: '580p' },
        { label: '720p', id: '720p' },
      ],
      value: () => '720p',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_LTX_MODELS },
      },
      options: [
        { label: '1080p', id: '1080p' },
        { label: '1440p', id: '1440p' },
        { label: '2160p', id: '2160p' },
      ],
      value: () => '1080p',
      dependsOn: ['model'],
      required: false,
    },
    {
      id: 'visualReferenceUpload',
      title: 'Reference Image',
      type: 'file-upload',
      canonicalParamId: 'visualReference',
      condition: { field: 'provider', value: 'runway' },
      placeholder: 'Upload reference image',
      mode: 'basic',
      multiple: false,
      dependsOn: ['provider'],
      required: true,
      acceptedTypes: '.jpg,.jpeg,.png,.webp',
    },
    {
      id: 'visualReferenceInput',
      title: 'Reference Image',
      type: 'short-input',
      canonicalParamId: 'visualReference',
      condition: { field: 'provider', value: 'runway' },
      placeholder: 'Reference image from previous blocks',
      mode: 'advanced',
      dependsOn: ['provider'],
      required: true,
    },
    {
      id: 'cameraControl',
      title: 'Camera Controls',
      type: 'long-input',
      condition: { field: 'provider', value: 'luma' },
      placeholder: 'JSON: [{ "key": "pan_right" }, { "key": "zoom_in" }]',
      dependsOn: ['provider'],
      required: false,
    },
    {
      id: 'promptOptimizer',
      title: 'Prompt Optimizer',
      type: 'switch',
      condition: { field: 'provider', value: 'minimax' },
      dependsOn: ['provider'],
    },
    {
      id: 'promptOptimizer',
      title: 'Prompt Optimizer',
      type: 'switch',
      defaultValue: true,
      condition: {
        field: 'provider',
        value: 'falai',
        and: {
          field: 'model',
          value: [...FALAI_MINIMAX_PRO_MODELS, ...FALAI_MINIMAX_STANDARD_MODELS],
        },
      },
      dependsOn: ['model'],
    },
    {
      id: 'generateAudio',
      title: 'Generate Audio',
      type: 'switch',
      defaultValue: true,
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_AUDIO_DEFAULT_ON_MODELS },
      },
      dependsOn: ['model'],
    },
    {
      id: 'generateAudio',
      title: 'Generate Audio',
      type: 'switch',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: FALAI_AUDIO_DEFAULT_OFF_MODELS },
      },
      dependsOn: ['model'],
    },
    // API Key — hidden on hosted Sim; Fal.ai key is injected from env / BYOK
    {
      id: 'apiKey',
      title: 'API Key',
      type: 'short-input',
      placeholder: 'Enter your Fal.ai API key',
      password: true,
      required: true,
      hideWhenHosted: true,
    },
  ],
  tools: {
    access: [
      // 'video_runway',
      // 'video_veo',
      // 'video_luma',
      // 'video_minimax',
      'video_falai',
    ],
    config: {
      tool: (params) => {
        switch (params.provider) {
          // case 'runway':
          //   return 'video_runway'
          // case 'veo':
          //   return 'video_veo'
          // case 'luma':
          //   return 'video_luma'
          // case 'minimax':
          //   return 'video_minimax'
          case 'falai':
            return 'video_falai'
          default:
            return 'video_falai'
        }
      },
      params: (params) => ({
        provider: params.provider,
        apiKey: params.apiKey,
        model: params.model,
        endpoint: params.endpoint,
        prompt: params.prompt,
        duration: params.duration ? Number(params.duration) : undefined,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        visualReference: normalizeFileInput(params.visualReference, { single: true }),
        consistencyMode: params.consistencyMode,
        stylePreset: params.stylePreset,
        promptOptimizer: parseOptionalBooleanInput(params.promptOptimizer),
        generateAudio: parseOptionalBooleanInput(params.generateAudio),
        cameraControl: params.cameraControl
          ? typeof params.cameraControl === 'string'
            ? JSON.parse(params.cameraControl)
            : params.cameraControl
          : undefined,
      }),
    },
  },
  inputs: {
    provider: {
      type: 'string',
      description: 'Video generation provider (falai)',
    },
    // apiKey: { type: 'string', description: 'Provider API key' },
    model: {
      type: 'string',
      description: 'Fal.ai model',
    },
    endpoint: {
      type: 'string',
      description: 'Quality endpoint for MiniMax (pro, standard)',
    },
    prompt: { type: 'string', description: 'Text prompt for video generation' },
    duration: { type: 'number', description: 'Video duration in seconds' },
    aspectRatio: {
      type: 'string',
      description: 'Aspect ratio for supported models',
    },
    resolution: {
      type: 'string',
      description: 'Video resolution for supported models',
    },
    visualReference: { type: 'json', description: 'Reference image for Runway (UserFile)' },
    consistencyMode: {
      type: 'string',
      description: 'Consistency mode for Runway (character, object, style, location)',
    },
    stylePreset: { type: 'string', description: 'Style preset for Runway' },
    promptOptimizer: {
      type: 'boolean',
      description: 'Enable prompt optimization for MiniMax (default: true)',
    },
    generateAudio: {
      type: 'boolean',
      description: 'Generate native audio when supported by the selected model',
    },
    cameraControl: {
      type: 'json',
      description: 'Camera controls for Luma (pan, zoom, tilt, truck, tracking)',
    },
  },
}

// ---------------------------------------------------------------------------
// Story Mode (V3 only)
//
// Adds a "Story Mode" option to the provider dropdown. In that mode the block
// renders a previously generated storyboard (image-to-video per scene +
// FFmpeg stitch via the storyboard_render tool) instead of text-to-video.
// V1/V2 definitions are untouched; the default provider stays 'falai', so
// existing workflows keep their exact current behavior.
// ---------------------------------------------------------------------------

const STORYBOARD_PROVIDER_ID = 'storyboard'

const STORYBOARD_MODE_SUBBLOCKS: SubBlockConfig[] = [
  {
    id: 'conversationId',
    title: 'Conversation ID',
    type: 'short-input',
    condition: { field: 'provider', value: STORYBOARD_PROVIDER_ID },
    value: () => '<start.conversationId>',
    placeholder: '<start.conversationId>',
    description:
      'Finds the storyboard saved for this chat. Optional — falls back to the latest storyboard for this workflow.',
  },
  {
    id: 'sceneOrder',
    title: 'Scene Order',
    type: 'short-input',
    condition: { field: 'provider', value: STORYBOARD_PROVIDER_ID },
    placeholder: '3,1,2 — leave empty to keep the original order',
    description: 'The order the user chose for the storyboard scenes',
  },
  {
    id: 'sceneNumber',
    title: 'Single Scene (Clip Mode)',
    type: 'short-input',
    condition: { field: 'provider', value: STORYBOARD_PROVIDER_ID },
    placeholder: '3 — leave empty to render all scenes',
    description:
      "Render only this one scene's clip for approval. The storyboard is not marked as rendered.",
  },
  {
    id: 'sourceImageUrl',
    title: 'Source Image Override',
    type: 'short-input',
    condition: { field: 'provider', value: STORYBOARD_PROVIDER_ID },
    placeholder: "https://… — e.g. a previous clip's lastFrameUrl",
    description:
      "Generate the clip from this image instead of the scene's storyboard still. Used for frame chaining.",
  },
  {
    id: 'chainFrames',
    title: 'Chain Frames',
    type: 'switch',
    condition: { field: 'provider', value: STORYBOARD_PROVIDER_ID },
    description:
      "Full render: start each clip from the previous clip's last frame so the video is one continuous piece (slower — clips render one after another)",
  },
  {
    id: 'clipUrls',
    title: 'Clip URLs (Concat Mode)',
    type: 'long-input',
    condition: { field: 'provider', value: STORYBOARD_PROVIDER_ID },
    placeholder: 'https://…/clip1.mp4, https://…/clip2.mp4 — leave empty to generate clips',
    description:
      'Already-generated clips to join in this exact order. When set, nothing is generated — the clips are only stitched.',
  },
  {
    id: 'storyVideoModel',
    title: 'Video Model',
    type: 'dropdown',
    condition: { field: 'provider', value: STORYBOARD_PROVIDER_ID },
    options: [
      { label: 'MiniMax H3 (Latest, Native Audio)', id: 'minimax-h3' },
      { label: 'Google Veo 3.1 Fast', id: 'veo-3.1-fast' },
      { label: 'Google Veo 3.1', id: 'veo-3.1' },
      { label: 'ByteDance Seedance 2.0', id: 'seedance-2.0' },
      { label: 'ByteDance Seedance 2.0 Fast', id: 'seedance-2.0-fast' },
      { label: 'Kling 3.0 Pro', id: 'kling-v3-pro' },
    ],
    value: () => 'veo-3.1-fast',
    description: 'Image-to-video model used for each scene clip',
  },
  {
    id: 'targetDuration',
    title: 'Total Length (seconds)',
    type: 'short-input',
    condition: { field: 'provider', value: STORYBOARD_PROVIDER_ID },
    placeholder: '30 — leave empty to use seconds per scene',
    description:
      'Total length of the finished video. Per-scene seconds are derived from this and snapped to what the model supports.',
  },
  {
    id: 'clipDuration',
    title: 'Seconds per Scene',
    type: 'dropdown',
    condition: { field: 'provider', value: STORYBOARD_PROVIDER_ID },
    options: [
      { label: '4', id: '4' },
      { label: '6', id: '6' },
      { label: '8', id: '8' },
    ],
    value: () => '4',
  },
  {
    id: 'storyResolution',
    title: 'Resolution',
    type: 'dropdown',
    condition: { field: 'provider', value: STORYBOARD_PROVIDER_ID },
    options: [
      { label: '720p', id: '720p' },
      { label: '1080p', id: '1080p' },
    ],
    value: () => '720p',
  },
  {
    id: 'storyAudio',
    title: 'Generate Audio',
    type: 'switch',
    condition: { field: 'provider', value: STORYBOARD_PROVIDER_ID },
    description: 'Native audio for each scene clip (increases cost)',
  },
  {
    id: 'audioUrl',
    title: 'Narration Audio URL (Concat Mode)',
    type: 'short-input',
    condition: { field: 'provider', value: STORYBOARD_PROVIDER_ID },
    placeholder: 'https://… — e.g. the TTS publicAudioUrl',
    description: 'Mixed over the joined video when using Clip URLs',
  },
  {
    id: 'transition',
    title: 'Clip Transition (Concat Mode)',
    type: 'dropdown',
    condition: { field: 'provider', value: STORYBOARD_PROVIDER_ID },
    options: [
      { label: 'None (hard cut)', id: 'none' },
      { label: 'Fade', id: 'fade' },
      { label: 'Dissolve', id: 'dissolve' },
    ],
    value: () => 'none',
    description:
      'Crossfade between clips when using Clip URLs. Shortens the total by (clips - 1) x transition seconds.',
  },
  {
    id: 'transitionDuration',
    title: 'Transition Seconds (Concat Mode)',
    type: 'short-input',
    condition: { field: 'provider', value: STORYBOARD_PROVIDER_ID },
    placeholder: '0.4',
    description: 'Seconds per crossfade. Ignored when the transition is None.',
  },
  {
    id: 'audioMode',
    title: 'Narration Mix',
    type: 'dropdown',
    condition: { field: 'provider', value: STORYBOARD_PROVIDER_ID },
    options: [
      { label: 'Duck clip audio under narration', id: 'duck' },
      { label: 'Narration only (replace clip audio)', id: 'replace' },
    ],
    value: () => 'duck',
  },
]

/**
 * Adds the Story Mode provider option and hides mode-agnostic fields (prompt,
 * apiKey) when it is selected. Provider/model-conditioned fields already hide
 * on their own because their conditions never match 'storyboard'.
 */
const withStoryboardMode = (subBlocks: SubBlockConfig[]): SubBlockConfig[] => [
  ...subBlocks.map((subBlock) => {
    if (subBlock.id === 'provider' && Array.isArray(subBlock.options)) {
      return {
        ...subBlock,
        options: [
          ...subBlock.options,
          { label: 'Story Mode (Storyboard)', id: STORYBOARD_PROVIDER_ID },
        ],
      }
    }
    if (!subBlock.condition) {
      return {
        ...subBlock,
        condition: { field: 'provider', value: STORYBOARD_PROVIDER_ID, not: true },
      }
    }
    return subBlock
  }),
  ...STORYBOARD_MODE_SUBBLOCKS,
]

export const VideoGeneratorV3Block: BlockConfig<VideoBlockResponse> = {
  ...VideoGeneratorV2Block,
  sunset: undefined,
  type: 'video_generator_v3',
  name: 'Video Generator',
  description: 'Generate videos from text using AI',
  longDescription:
    'Generate high-quality videos from text prompts via hosted Fal.ai. Supports multiple models (including Veo, Sora, Kling, MiniMax, Seedance, WAN, and LTX), aspect ratios, resolutions, prompt optimization, and native audio controls. Story Mode renders a previously generated storyboard into one stitched video in the scene order the user chose.',
  docsLink: 'https://docs.sim.ai/integrations/video_generator',
  category: 'blocks',
  integrationType: IntegrationType.AI,
  bgColor: '#181C1E',
  icon: VideoIcon,
  hideFromToolbar: false,
  subBlocks: withStoryboardMode(
    withFalAIModelOptions(VideoGeneratorV2Block.subBlocks, FALAI_LATEST_MODEL_OPTIONS)
  ),
  tools: {
    access: ['video_falai', 'storyboard_render'],
    config: {
      tool: (params) =>
        params.provider === STORYBOARD_PROVIDER_ID
          ? 'storyboard_render'
          : (VideoGeneratorV2Block.tools.config?.tool?.(params) ?? 'video_falai'),
      params: (params) => {
        if (params.provider !== STORYBOARD_PROVIDER_ID) {
          return VideoGeneratorV2Block.tools.config?.params?.(params) ?? params
        }

        const sceneNumber = params.sceneNumber ? Number(params.sceneNumber) : undefined
        const clipMode = Number.isFinite(sceneNumber) && (sceneNumber as number) > 0

        // Clip mode: only the params that render one scene. Stray order /
        // targetDuration / chainFrames / clipUrls from clipAgent must not
        // leak through — prompt text is not a constraint.
        if (clipMode) {
          return {
            conversationId: params.conversationId,
            sceneNumber,
            sourceImageUrl: params.sourceImageUrl,
            videoModel: params.storyVideoModel,
            clipDuration: params.clipDuration ? Number(params.clipDuration) : undefined,
            resolution: params.storyResolution,
            generateAudio: parseOptionalBooleanInput(params.storyAudio),
          }
        }

        const targetDuration = params.targetDuration ? Number(params.targetDuration) : undefined
        return {
          conversationId: params.conversationId,
          order: params.sceneOrder || params.order,
          sourceImageUrl: params.sourceImageUrl,
          chainFrames: parseOptionalBooleanInput(params.chainFrames),
          clipUrls: params.clipUrls,
          audioUrl: params.audioUrl,
          audioMode: params.audioMode,
          transition: params.transition,
          transitionDuration: params.transitionDuration
            ? Number(params.transitionDuration)
            : undefined,
          videoModel: params.storyVideoModel,
          targetDuration,
          // A pinned clipDuration: "4" must not cap a stitch whose plan
          // already set targetDuration. Clip-only length still applies when
          // no total length was given (UI dropdown / default).
          clipDuration: targetDuration
            ? undefined
            : params.clipDuration
              ? Number(params.clipDuration)
              : undefined,
          resolution: params.storyResolution,
          generateAudio: parseOptionalBooleanInput(params.storyAudio),
        }
      },
    },
  },
  inputs: {
    ...VideoGeneratorV2Block.inputs,
    conversationId: {
      type: 'string',
      description: 'Story Mode: conversation whose saved storyboard to render',
    },
    sceneOrder: { type: 'string', description: 'Story Mode: scene order, e.g. "3,1,2"' },
    sceneNumber: {
      type: 'number',
      description: "Story Mode: render only this one scene's clip (1-based)",
    },
    sourceImageUrl: {
      type: 'string',
      description:
        "Story Mode: generate the clip from this image (e.g. a previous clip's lastFrameUrl) instead of the storyboard still",
    },
    chainFrames: {
      type: 'boolean',
      description:
        "Story Mode: chain each clip off the previous clip's last frame for a continuous video",
    },
    clipUrls: {
      type: 'string',
      description:
        'Story Mode concat: URLs of already-generated clips to join in order (JSON array or comma-separated). Skips generation entirely.',
    },
    audioUrl: {
      type: 'string',
      description: 'Story Mode concat: narration/music track to mix over the joined video',
    },
    audioMode: {
      type: 'string',
      description:
        'Story Mode concat: "duck" (default) mixes narration over clip audio, "replace" keeps narration only',
    },
    transition: {
      type: 'string',
      description:
        'Story Mode concat: transition between clips — "none" (default), "fade", or "dissolve"',
    },
    transitionDuration: {
      type: 'number',
      description: 'Story Mode concat: seconds per crossfade (default 0.4)',
    },
    storyVideoModel: { type: 'string', description: 'Story Mode: image-to-video model' },
    targetDuration: {
      type: 'number',
      description: 'Story Mode: total video length in seconds (overrides seconds per scene)',
    },
    clipDuration: { type: 'number', description: 'Story Mode: seconds per scene clip' },
    storyResolution: { type: 'string', description: 'Story Mode: clip resolution' },
    storyAudio: { type: 'boolean', description: 'Story Mode: generate native audio per clip' },
  },
  outputs: {
    ...VideoGeneratorV2Block.outputs,
    content: { type: 'string', description: 'Story Mode: confirmation text with video link' },
    storyboardId: { type: 'string', description: 'Story Mode: storyboard that was rendered' },
    clipCount: { type: 'number', description: 'Story Mode: number of stitched clips' },
    publicVideoUrl: {
      type: 'string',
      description: 'Story Mode: publicly fetchable URL of the final video (no Sim session needed)',
    },
    falUrls: {
      type: 'array',
      description: 'Story Mode: public Fal CDN URL per clip, in rendered order',
    },
    lastFrameUrls: {
      type: 'array',
      description:
        "Story Mode: image URL of each clip's last frame, in rendered order (for frame chaining)",
    },
  },
}
