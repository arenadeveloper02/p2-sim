/** Ideogram API base URL. */
export const IDEOGRAM_API_BASE = 'https://api.ideogram.ai'

/** Supported Ideogram tool operations. */
export const IDEOGRAM_OPERATIONS = [
  'generate_v4',
  'generate_v4_async',
  'poll_generation',
  'remix_v4',
  'magic_prompt_v4',
  'describe_v4',
  'generate_v3',
  'generate_transparent_v3',
  'inpaint_v3',
  'remix_v3',
  'reframe_v3',
  'replace_background_v3',
  'remove_background',
  'layerize_text',
  'edit',
  'upscale',
  'describe',
] as const

export type IdeogramOperation = (typeof IDEOGRAM_OPERATIONS)[number]

/** Maps tool operation IDs to Ideogram HTTP paths. */
export const IDEOGRAM_OPERATION_PATHS: Record<
  IdeogramOperation,
  { method: 'GET' | 'POST'; path: string }
> = {
  generate_v4: { method: 'POST', path: '/v1/ideogram-v4/generate' },
  generate_v4_async: { method: 'POST', path: '/v1/ideogram-v4/async/generate' },
  poll_generation: { method: 'GET', path: '/v1/generations/{generation_id}' },
  remix_v4: { method: 'POST', path: '/v1/ideogram-v4/remix' },
  magic_prompt_v4: { method: 'POST', path: '/v1/ideogram-v4/magic-prompt' },
  describe_v4: { method: 'POST', path: '/v1/ideogram-v4/describe' },
  generate_v3: { method: 'POST', path: '/v1/ideogram-v3/generate' },
  generate_transparent_v3: { method: 'POST', path: '/v1/ideogram-v3/generate-transparent' },
  inpaint_v3: { method: 'POST', path: '/v1/ideogram-v3/inpaint' },
  remix_v3: { method: 'POST', path: '/v1/ideogram-v3/remix' },
  reframe_v3: { method: 'POST', path: '/v1/ideogram-v3/reframe' },
  replace_background_v3: { method: 'POST', path: '/v1/ideogram-v3/replace-background' },
  remove_background: { method: 'POST', path: '/v1/remove-background' },
  layerize_text: { method: 'POST', path: '/v1/ideogram-v3/layerize-text' },
  edit: { method: 'POST', path: '/v1/edit' },
  upscale: { method: 'POST', path: '/upscale' },
  describe: { method: 'POST', path: '/describe' },
}

export const RESOLUTION_V4_OPTIONS = [
  '2048x2048',
  '1440x2880',
  '2880x1440',
  '1664x2496',
  '2496x1664',
  '1792x2240',
  '2240x1792',
  '1440x2560',
  '2560x1440',
  '1600x2560',
  '2560x1600',
  '1728x2304',
  '2304x1728',
  '1296x3168',
  '3168x1296',
  '1152x2944',
  '2944x1152',
  '1248x3328',
  '3328x1248',
  '1280x3072',
  '3072x1280',
  '1024x3072',
  '3072x1024',
] as const

export const RENDERING_SPEED_OPTIONS = ['FLASH', 'TURBO', 'DEFAULT', 'QUALITY'] as const

export const MAGIC_PROMPT_OPTIONS = ['AUTO', 'ON', 'OFF'] as const

export const ASPECT_RATIO_V4_OPTIONS = [
  'AUTO',
  '1x4',
  '1x3',
  '1x2',
  '9x16',
  '10x16',
  '2x3',
  '3x4',
  '4x5',
  '1x1',
  '5x4',
  '4x3',
  '3x2',
  '16x10',
  '16x9',
  '2x1',
  '3x1',
  '4x1',
] as const

export const ASPECT_RATIO_V3_OPTIONS = [
  '1x3',
  '3x1',
  '1x2',
  '2x1',
  '9x16',
  '16x9',
  '10x16',
  '16x10',
  '2x3',
  '3x2',
  '3x4',
  '4x3',
  '4x5',
  '5x4',
  '1x1',
] as const

export const STYLE_TYPE_V3_OPTIONS = [
  'AUTO',
  'GENERAL',
  'REALISTIC',
  'DESIGN',
  'FICTION',
] as const

export const UPSCALE_FACTOR_OPTIONS = ['X1', 'X2', 'X4'] as const

export const DESCRIBE_MODEL_VERSION_OPTIONS = ['V_2', 'V_3', 'V_4'] as const
