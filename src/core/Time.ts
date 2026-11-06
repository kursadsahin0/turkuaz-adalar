import { GAME_CONFIG } from '../config/GameConfig.ts'

/**
 * Frame clock plus a fixed-step accumulator. Rendering is frame-rate
 * independent while simulation runs at a stable 60 Hz.
 */
export class Time {
  readonly fixedDelta: number

  delta = 0
  elapsed = 0
  frame = 0
  fps = 60

  private readonly maxFrameDelta: number
  private readonly maxFixedSteps: number
  private lastTimestamp = 0
  private accumulator = 0
  private fpsElapsed = 0
  private fpsFrames = 0
  private started = false

  constructor() {
    this.fixedDelta = GAME_CONFIG.timing.fixedDelta
    this.maxFrameDelta = GAME_CONFIG.timing.maxFrameDelta
    this.maxFixedSteps = GAME_CONFIG.timing.maxFixedSteps
  }

  update(timestampMs: number): void {
    if (!this.started) {
      this.started = true
      this.lastTimestamp = timestampMs
      this.delta = 0
      return
    }

    const rawDelta = Math.max(0, (timestampMs - this.lastTimestamp) / 1000)
    this.lastTimestamp = timestampMs
    this.delta = Math.min(rawDelta, this.maxFrameDelta)
    this.elapsed += this.delta
    this.frame += 1
    this.accumulator += this.delta

    this.fpsElapsed += this.delta
    this.fpsFrames += 1
    if (this.fpsElapsed >= 0.5) {
      this.fps = this.fpsFrames / this.fpsElapsed
      this.fpsElapsed = 0
      this.fpsFrames = 0
    }
  }

  /** Returns how many fixed simulation steps should run this frame. */
  consumeFixedSteps(): number {
    let steps = 0
    while (this.accumulator >= this.fixedDelta && steps < this.maxFixedSteps) {
      this.accumulator -= this.fixedDelta
      steps += 1
    }

    // A long stall (tab switch, screenshot, GC pause) must not cause a spiral
    // of death. Drop the backlog rather than catching up indefinitely.
    if (this.accumulator > this.fixedDelta * this.maxFixedSteps) {
      this.accumulator = 0
    }

    return steps
  }

  resetAccumulator(): void {
    this.accumulator = 0
    this.delta = 0
  }

  reset(): void {
    this.started = false
    this.lastTimestamp = 0
    this.resetAccumulator()
    this.elapsed = 0
    this.frame = 0
    this.fpsElapsed = 0
    this.fpsFrames = 0
  }
}
