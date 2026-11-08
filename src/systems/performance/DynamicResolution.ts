export interface DynamicResolutionOptions {
  /** The lowest pixel ratio it may drop to. */
  readonly min: number
  /** Step size when moving the pixel ratio up or down. */
  readonly step: number
  /** Average FPS below this, over `downWindow` seconds, lowers the ratio. */
  readonly downFps: number
  readonly downWindow: number
  /** Average FPS at or above this, over `upWindow` seconds, raises the ratio. */
  readonly upFps: number
  readonly upWindow: number
  /** Seconds to wait after a change before judging again. */
  readonly cooldown: number
}

const DEFAULTS: DynamicResolutionOptions = {
  min: 1,
  step: 0.25,
  downFps: 48,
  downWindow: 3,
  upFps: 57,
  upWindow: 6,
  cooldown: 4,
}

/**
 * Picks the sharpest pixel ratio a device can hold at a smooth frame rate.
 * Fed one FPS sample per second during runs: it steps the ratio down while
 * frames drop and back up while there is headroom, but never back up to a
 * ratio that already proved too slow, so the picture does not pump.
 */
export class DynamicResolution {
  private readonly options: DynamicResolutionOptions
  private ratio: number
  private max: number
  /** The lowest ratio that was too slow; the ratio stays below it. */
  private ceiling = Infinity
  private samples: number[] = []
  private cooldown = 0

  constructor(start: number, max: number, options: Partial<DynamicResolutionOptions> = {}) {
    this.options = { ...DEFAULTS, ...options }
    this.max = Math.max(this.options.min, max)
    this.ratio = this.clamp(start)
  }

  get current(): number {
    return this.ratio
  }

  /** True when the ratio cannot go lower: the next fix is a lower quality tier. */
  get atFloor(): boolean {
    return this.ratio <= this.options.min + 1e-6
  }

  /** New limits after a quality change or a resize; forgets earlier history. */
  reset(start: number, max: number): void {
    this.max = Math.max(this.options.min, max)
    this.ceiling = Infinity
    this.ratio = this.clamp(start)
    this.samples = []
    this.cooldown = this.options.cooldown
  }

  /** Adds a one-second FPS sample; returns the new ratio when it changes. */
  sample(fps: number): number | null {
    if (!Number.isFinite(fps) || fps <= 0) {
      return null
    }
    if (this.cooldown > 0) {
      this.cooldown -= 1
      return null
    }
    this.samples.push(fps)
    const keep = Math.max(this.options.downWindow, this.options.upWindow)
    if (this.samples.length > keep) {
      this.samples.shift()
    }

    const recent = this.average(this.options.downWindow)
    if (recent !== null && recent < this.options.downFps && !this.atFloor) {
      this.ceiling = Math.min(this.ceiling, this.ratio)
      return this.change(this.ratio - this.options.step)
    }

    const steady = this.average(this.options.upWindow)
    const next = this.ratio + this.options.step
    if (
      steady !== null &&
      steady >= this.options.upFps &&
      next <= this.max + 1e-6 &&
      next < this.ceiling - 1e-6
    ) {
      return this.change(next)
    }
    return null
  }

  private change(ratio: number): number | null {
    const next = this.clamp(ratio)
    if (Math.abs(next - this.ratio) < 1e-6) {
      return null
    }
    this.ratio = next
    this.samples = []
    this.cooldown = this.options.cooldown
    return next
  }

  private average(count: number): number | null {
    if (this.samples.length < count) {
      return null
    }
    const window = this.samples.slice(-count)
    return window.reduce((sum, value) => sum + value, 0) / window.length
  }

  private clamp(ratio: number): number {
    const stepped = Math.round(ratio / this.options.step) * this.options.step
    return Math.min(this.max, Math.max(this.options.min, stepped))
  }
}
