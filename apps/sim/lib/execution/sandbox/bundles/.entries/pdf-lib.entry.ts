// Isolate-side polyfills must execute BEFORE any other import (process/browser
// captures setTimeout at module-init time). Keep this as the first import.
import '/Users/utcarsh.s/Documents/Projects/p2-sim/apps/sim/lib/execution/sandbox/bundles/_polyfills.ts'
import { Buffer as __BufferPolyfill } from 'buffer'
import * as __processPolyfill from 'process/browser'
if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = __BufferPolyfill
if (typeof globalThis.process === 'undefined') globalThis.process = __processPolyfill

import * as mod from 'pdf-lib'
globalThis.__bundles = globalThis.__bundles || {}
globalThis.__bundles['pdf-lib'] = mod
