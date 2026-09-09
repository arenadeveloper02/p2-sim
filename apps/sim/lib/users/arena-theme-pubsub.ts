/**
 * Arena theme pub/sub.
 *
 * Broadcasts theme updates from the cron-authenticated arena settings PATCH
 * so open browser sessions can apply `sim-theme` without a page refresh.
 */

import { createPubSubChannel, type PubSubChannel } from '@/lib/events/pubsub'

export interface ArenaThemeChangedEvent {
  userId: string
  emailId: string
  theme: 'system' | 'light' | 'dark'
}

interface ArenaThemePubSubAdapter {
  publishThemeChanged(event: ArenaThemeChangedEvent): void
  onThemeChanged(handler: (event: ArenaThemeChangedEvent) => void): () => void
  dispose(): void
}

type ArenaThemePubSubGlobal = typeof globalThis & {
  _arenaThemeChannel?: PubSubChannel<ArenaThemeChangedEvent> | null
}

const g = globalThis as ArenaThemePubSubGlobal

if (!('_arenaThemeChannel' in g)) {
  g._arenaThemeChannel =
    typeof window !== 'undefined'
      ? null
      : createPubSubChannel<ArenaThemeChangedEvent>({
          channel: 'arena:theme_changed',
          label: 'arena-theme',
        })
}

const channel = g._arenaThemeChannel

export const arenaThemePubSub: ArenaThemePubSubAdapter | null =
  typeof window !== 'undefined' || !channel
    ? null
    : {
        publishThemeChanged: (event) => channel.publish(event),
        onThemeChanged: (handler) => channel.subscribe(handler),
        dispose: () => channel.dispose(),
      }
