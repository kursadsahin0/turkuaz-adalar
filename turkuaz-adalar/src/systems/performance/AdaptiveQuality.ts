export type RenderQuality = 'low' | 'medium' | 'high'

const LADDER: readonly RenderQuality[] = ['high', 'medium', 'low']

export interface AdaptiveQualityOptions {
  /** Average FPS below this, over `windowSeconds`, triggers a step down. */
  readonly minFps: number
  readonly windowSeconds: number
  /** Wait after a change before judging again (new settings need to settle). */
  readonly cooldownSeconds: number
}

const DEFAULTS: AdaptiveQualityOptions = { minFps: 42, windowSeconds: 4, cooldownSeconds: 8 }

/**
 * "Auto" graphics quality. Fed one FPS sample per second during runs, it steps
 * quality down when a device cannot keep up. It never steps back up, so the
 * picture does not flicker between levels.
 */
export class AdaptiveQuality {
  private readonly options: AdaptiveQualityOptions
  private level: RenderQuality
  private samples: number[] = []
  private cooldown = 0
  private enabled: boolean

  constructor(
    start: RenderQuality,
    enabled: boolean,
    options: Partial<AdaptiveQualityOptions> = {},
  ) {
    this.level = start
    this.enabled = enabled
    this.options = { ...DEFAULTS, ...options }
  }

  get current(): RenderQuality {
    return this.level
  }

  setEnabled(enabled: boolean, start?: RenderQuality): void {
    this.enabled = enabled
    if (start) {
      this.level = start
    }
    this.samples = []
    this.cooldown = this.options.cooldownSeconds
  }

  /**
   * Adds a one-second FPS sample. Returns the new level when quality should
   * drop, otherwise null.
   */
  sample(fps: number): RenderQuality | null {
    if (!this.enabled || !Number.isFinite(fps) || fps <= 0) {
      return null
    }
    if (this.cooldown > 0) {
      this.cooldown -= 1
      return null
    }
    this.samples.push(fps)
    if (this.samples.length > this.options.windowSeconds) {
      this.samples.shift()
    }
    if (this.samples.length < this.options.windowSeconds) {
      return null
    }
    const average = this.samples.reduce((sum, value) => sum + value, 0) / this.samples.length
    const index = LADDER.indexOf(this.level)
    if (average >= this.options.minFps || index >= LADDER.length - 1) {
      return null
    }
    this.level = LADDER[index + 1]
    this.samples = []
    this.cooldown = this.options.cooldownSeconds
    return this.level
  }
}
