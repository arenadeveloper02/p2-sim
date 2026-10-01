/**
 * Upper bound for how many images the Image Generator block may request in one run
 * based on the finalized prompt.
 */
export const MAX_IMAGES_TO_GENERATE = 5

/**
 * Max wait for a single provider image-generation HTTP request.
 * Keep in sync with `image_generate` / wrapper tool timeouts and route `maxDuration` headroom.
 */
export const IMAGE_GENERATION_PROVIDER_TIMEOUT_MS = 600_000
