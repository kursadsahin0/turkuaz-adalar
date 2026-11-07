import { Capacitor } from '@capacitor/core'
import { Haptics as NativeHaptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

/** Named vibration patterns for the web Vibration API, in milliseconds. */
const PATTERNS = {
  crash: [45, 35, 90],
  shield: [35],
  dash: [12],
  powerup: [18],
  reward: [14, 40, 14],
  ui: [8],
} as const satisfies Record<string, readonly number[]>

export type HapticEvent = keyof typeof PATTERNS

/**
 * Game haptics. On Android and iOS this uses the native Taptic/vibration
 * engine through @capacitor/haptics (iOS has no web Vibration API at all);
 * in the browser it falls back to `navigator.vibrate`. Honours the player's
 * "Vibration" setting.
 */
export class Haptics {
  private enabled: boolean
  private readonly native: boolean
  private readonly web: boolean

  constructor(enabled: boolean) {
    this.enabled = enabled
    this.native = Capacitor.isNativePlatform()
    this.web =
      !this.native && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
  }

  get isSupported(): boolean {
    return this.native || this.web
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.stop()
    }
  }

  pulse(event: HapticEvent): void {
    if (!this.enabled) {
      return
    }
    if (this.native) {
      void this.nativePulse(event).catch(() => undefined)
      return
    }
    if (this.web) {
      try {
        navigator.vibrate([...PATTERNS[event]])
      } catch {
        // Some browsers throw before the first user gesture; vibration is optional.
      }
    }
  }

  stop(): void {
    if (this.web) {
      try {
        navigator.vibrate(0)
      } catch {
        // Ignored: see pulse().
      }
    }
  }

  private nativePulse(event: HapticEvent): Promise<void> {
    switch (event) {
      case 'crash':
        return NativeHaptics.notification({ type: NotificationType.Error })
      case 'reward':
        return NativeHaptics.notification({ type: NotificationType.Success })
      case 'shield':
        return NativeHaptics.impact({ style: ImpactStyle.Heavy })
      case 'powerup':
        return NativeHaptics.impact({ style: ImpactStyle.Medium })
      case 'dash':
      case 'ui':
        return NativeHaptics.impact({ style: ImpactStyle.Light })
    }
  }
}
