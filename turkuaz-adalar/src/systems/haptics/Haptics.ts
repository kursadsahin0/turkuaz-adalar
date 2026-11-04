/** Named vibration patterns, in milliseconds (vibrate / pause / vibrate ...). */
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
 * Thin wrapper over the Vibration API. Android WebViews (Capacitor) and
 * mobile Chrome support it; iOS Safari and desktops silently ignore it.
 * Honours the player's "Vibration" setting.
 */
export class Haptics {
  private enabled: boolean
  private readonly supported: boolean

  constructor(enabled: boolean) {
    this.enabled = enabled
    this.supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
  }

  get isSupported(): boolean {
    return this.supported
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.stop()
    }
  }

  pulse(event: HapticEvent): void {
    if (!this.enabled || !this.supported) {
      return
    }
    try {
      navigator.vibrate([...PATTERNS[event]])
    } catch {
      // Some browsers throw before the first user gesture; vibration is optional.
    }
  }

  stop(): void {
    if (this.supported) {
      try {
        navigator.vibrate(0)
      } catch {
        // Ignored: see pulse().
      }
    }
  }
}
